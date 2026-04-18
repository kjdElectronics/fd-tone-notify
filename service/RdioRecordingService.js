const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const config = require('config');
const log = require('../util/logger');
const { NotificationParams } = require('../obj/NotificationParams');
const { WavToMp3Service } = require('./WavToMp3Service');
const { sendPostRecordingNotifications } = require('../notifiers');

const DEFAULT_WINDOW_TIMEOUT_SEC = 80;
const DEFAULT_EARLY_SEND_AFTER_SEC = 45;
const DEFAULT_EARLY_SEND_MIN_AUDIO_SEC = 15;

const STITCH_SAMPLE_RATE = 44100;
const STITCH_CHANNELS = 1;
const SILENCE_INPUT_SPEC = `anullsrc=r=${STITCH_SAMPLE_RATE}:cl=mono`;

const UNIX_MS_THRESHOLD = 1e12; // Values below this are treated as epoch seconds, above as epoch ms.

/**
 * Resolve window/timeout thresholds from config. Direct property access is used
 * (rather than config.get/has) so that node-config's immutability freeze is not
 * triggered at load time — the test suite relies on stubbing sibling keys.
 */
function getRdioRecordingConfig() {
    const recording = (config && config.recording) || {};
    const rdio = recording.rdio || {};
    return {
        windowTimeoutSec: rdio.windowTimeoutSec || DEFAULT_WINDOW_TIMEOUT_SEC,
        earlySendAfterSec: rdio.earlySendAfterSec || DEFAULT_EARLY_SEND_AFTER_SEC,
        earlySendMinAudioSec: rdio.earlySendMinAudioSec || DEFAULT_EARLY_SEND_MIN_AUDIO_SEC,
    };
}

/**
 * Parse an Rdio Scanner dateTime field into a Date.
 *
 * Rdio Scanner clients (SDRTrunk etc.) send dateTime as one of:
 *   - ISO-8601 string ("2024-01-01T00:00:00Z")
 *   - Numeric epoch seconds (1704067200)
 *   - Numeric string epoch seconds ("1704067200")
 *
 * Numeric values are disambiguated by magnitude: values under 1e12 are seconds,
 * otherwise milliseconds. Invalid inputs fall back to "now" so the pipeline
 * continues instead of inserting NaN into the silence-gap math.
 */
function parseRdioDateTime(dateTime) {
    if (dateTime == null) return new Date();
    if (dateTime instanceof Date) return dateTime;

    if (typeof dateTime === 'number') {
        return new Date(dateTime < UNIX_MS_THRESHOLD ? dateTime * 1000 : dateTime);
    }

    const asString = String(dateTime);
    if (/^\d+(\.\d+)?$/.test(asString)) {
        const n = Number(asString);
        return new Date(n < UNIX_MS_THRESHOLD ? n * 1000 : n);
    }

    const parsed = new Date(asString);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Probe a WAV file for its duration (seconds). Resolves 0 on any failure so the
 * caller can proceed — 0 duration only affects silence-gap computation, not
 * correctness.
 */
function probeWavDuration(wavPath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(wavPath, (err, data) => {
            if (err || !data || !data.format || data.format.duration == null) return resolve(0);
            resolve(Number(data.format.duration));
        });
    });
}

/**
 * Accumulates Rdio Scanner calls that belong to the same talkgroup following a
 * tone detection, stitches them into a single MP3 recording with silence gaps
 * matching real-world timing, and fires post-recording notifications.
 *
 * A "window" is opened on the first tone detection for a talkgroup and closed
 * either early (at earlySendAfterSec, if enough audio has been gathered) or at
 * the hard windowTimeoutSec limit. Additional calls on the same talkgroup —
 * whether they trigger tones or not — are appended via captureCall until the
 * window closes.
 */
class RdioRecordingService {
    constructor({
        stagingDir,
        recordingDirectory,
        postRecordingNotifier,
        mp3Converter,
        ffmpegFactory,
        probeDuration,
    } = {}) {
        this._windowsByTalkgroup = new Map();
        this._stagingDir = stagingDir || path.join(os.tmpdir(), 'rdio-staging');
        this._recordingDirectoryOverride = recordingDirectory;
        this._postRecordingNotifier = postRecordingNotifier || sendPostRecordingNotifications;
        this._mp3Converter = mp3Converter || WavToMp3Service.convertWavToMp3.bind(WavToMp3Service);
        this._ffmpegFactory = ffmpegFactory || (() => ffmpeg());
        this._probeDuration = probeDuration || probeWavDuration;
        this._ensureDirectory(this._stagingDir);
    }

    /**
     * Resolved lazily so that node-config is not accessed at module-load time
     * (see getRdioRecordingConfig for the rationale).
     */
    get recordingDirectory() {
        if (this._recordingDirectoryOverride) return this._recordingDirectoryOverride;
        return (config.recording && config.recording.directory) || './recordings';
    }

    hasActiveWindow(talkgroupLabel) {
        return this._windowsByTalkgroup.has(this._normalizeTalkgroupKey(talkgroupLabel));
    }

    /**
     * Called when a tone detection fires from an Rdio Scanner call. Opens a
     * new recording window for the talkgroup if none is active, otherwise
     * appends to the existing window.
     */
    async onToneDetected({ wavFilePath, dateTime, talkgroupLabel, detectionData }) {
        const talkgroupKey = this._normalizeTalkgroupKey(talkgroupLabel);
        if (!talkgroupKey) {
            log.warning(`RdioRecordingService: onToneDetected called with empty talkgroupLabel; ignoring`);
            return;
        }

        const stagedCall = await this._stageAndProbeCall(wavFilePath, dateTime);
        if (!stagedCall) return;

        let window = this._windowsByTalkgroup.get(talkgroupKey);
        if (!window) {
            window = this._openWindow({ talkgroupKey, detectionData, firstCall: stagedCall });
        } else {
            window.calls.push(stagedCall);
        }
        this._tryFinalizeIfThresholdsMet(window);
    }

    /**
     * Called for subsequent same-talkgroup calls (that may or may not contain
     * tones) while a recording window is open. Returns true if the call was
     * accepted into an active window.
     */
    async captureCall({ wavFilePath, dateTime, talkgroupLabel }) {
        const talkgroupKey = this._normalizeTalkgroupKey(talkgroupLabel);
        const window = this._windowsByTalkgroup.get(talkgroupKey);
        if (!window) return false;

        const stagedCall = await this._stageAndProbeCall(wavFilePath, dateTime);
        if (!stagedCall) return false;

        window.calls.push(stagedCall);
        this._tryFinalizeIfThresholdsMet(window);
        return true;
    }

    /**
     * Release all open windows without finalizing — for shutdown / test cleanup.
     */
    dispose() {
        for (const window of this._windowsByTalkgroup.values()) {
            this._clearWindowTimers(window);
            for (const call of window.calls) this._safeUnlink(call.stagedPath);
        }
        this._windowsByTalkgroup.clear();
    }

    _normalizeTalkgroupKey(talkgroupLabel) {
        if (talkgroupLabel == null) return '';
        return String(talkgroupLabel).trim().toLowerCase();
    }

    _openWindow({ talkgroupKey, detectionData, firstCall }) {
        const rdioConfig = getRdioRecordingConfig();
        const { notificationParams, detectorName } = this._buildNotificationParams(detectionData);

        const window = {
            talkgroupKey,
            detectorName,
            notificationParams,
            calls: [firstCall],
            openedAt: Date.now(),
            earlyTimer: null,
            hardTimer: null,
            isFinalizing: false,
        };

        // Hard timeout: always fires, guarantees we ship a recording even if no
        // additional calls arrive or audio stays below the early-send minimum.
        window.hardTimer = setTimeout(
            () => this._finalize(talkgroupKey),
            rdioConfig.windowTimeoutSec * 1000
        );

        // Early timer: fires at earlySendAfterSec and finalizes only if enough
        // audio has been collected. Gives a faster turnaround for active windows.
        window.earlyTimer = setTimeout(
            () => this._earlyTimerFired(talkgroupKey),
            rdioConfig.earlySendAfterSec * 1000
        );

        this._windowsByTalkgroup.set(talkgroupKey, window);
        log.info(`RdioRecordingService: opened recording window for talkgroup="${talkgroupKey}" detector="${detectorName}"`);
        return window;
    }

    _buildNotificationParams(detectionData) {
        const timestamp = detectionData && detectionData.detectedAt
            ? new Date(detectionData.detectedAt).getTime()
            : Date.now();
        const detectorName = (detectionData && detectionData.detector && detectionData.detector.name) || 'unknown';
        const finalMp3Path = path.join(this.recordingDirectory, `${timestamp}-${detectorName}.mp3`);

        const notificationParams = new NotificationParams({
            uuid: detectionData && detectionData.uuid,
            detector: detectionData && detectionData.detector,
            timestamp,
            matchAverages: (detectionData && detectionData.matchAverages) || [],
            notifications: (detectionData && detectionData.notifications) || {},
            filename: finalMp3Path,
            message: detectionData && detectionData.message,
            attachFile: true,
        });
        return { notificationParams, detectorName };
    }

    /**
     * Copy the call's WAV into the staging directory (so the controller is free
     * to clean up the original) and probe its duration, which is needed to
     * compute silence gaps between stitched calls.
     */
    async _stageAndProbeCall(wavFilePath, dateTime) {
        try {
            this._ensureDirectory(this._stagingDir);
            const stagedPath = path.join(this._stagingDir, `${uuidv4()}.wav`);
            fs.copyFileSync(wavFilePath, stagedPath);
            const duration = await this._probeDuration(stagedPath);
            return {
                stagedPath,
                dateTime: parseRdioDateTime(dateTime),
                duration: duration || 0,
            };
        } catch (err) {
            log.error(`RdioRecordingService: failed to stage wav ${wavFilePath}: ${err.message}`);
            return null;
        }
    }

    /**
     * Called after each call submission. Finalize immediately if both:
     *   - Wall-clock elapsed since window opened >= earlySendAfterSec
     *   - Cumulative audio duration >= earlySendMinAudioSec
     *
     * If audio is still below the threshold, the hard timer will eventually
     * close the window regardless.
     */
    _tryFinalizeIfThresholdsMet(window) {
        const rdioConfig = getRdioRecordingConfig();
        const elapsedSec = (Date.now() - window.openedAt) / 1000;
        if (elapsedSec < rdioConfig.earlySendAfterSec) return;

        const totalAudioSec = this._sumCallDurations(window);
        if (totalAudioSec >= rdioConfig.earlySendMinAudioSec) {
            this._finalize(window.talkgroupKey);
        }
    }

    /**
     * Early-timer callback: at earlySendAfterSec, finalize only if enough audio
     * has accumulated. Otherwise let the hard timer take over.
     */
    _earlyTimerFired(talkgroupKey) {
        const window = this._windowsByTalkgroup.get(talkgroupKey);
        if (!window) return;

        const rdioConfig = getRdioRecordingConfig();
        const totalAudioSec = this._sumCallDurations(window);
        if (totalAudioSec >= rdioConfig.earlySendMinAudioSec) this._finalize(talkgroupKey);
    }

    _sumCallDurations(window) {
        return window.calls.reduce((sum, call) => sum + call.duration, 0);
    }

    /**
     * Close the window: stitch calls (if multiple), convert to MP3, fire
     * post-recording notifications, clean up staged files.
     */
    async _finalize(talkgroupKey) {
        const window = this._windowsByTalkgroup.get(talkgroupKey);
        if (!window || window.isFinalizing) return;
        window.isFinalizing = true;
        this._windowsByTalkgroup.delete(talkgroupKey);
        this._clearWindowTimers(window);

        const orderedCalls = [...window.calls].sort((a, b) => a.dateTime - b.dateTime);
        const { notificationParams, detectorName } = window;

        this._ensureDirectory(this.recordingDirectory);
        const baseName = `${notificationParams.timestamp}-${detectorName}`;
        const intermediateWavPath = path.join(this.recordingDirectory, `${baseName}.wav`);
        const finalMp3Path = path.join(this.recordingDirectory, `${baseName}.mp3`);

        let stitchedWavToCleanup = null;
        try {
            const { wavSourcePath, stitchedPath } = await this._resolveMp3SourceWav({
                orderedCalls,
                intermediateWavPath,
            });
            stitchedWavToCleanup = stitchedPath;

            await this._mp3Converter({ inputPath: wavSourcePath, outputPath: finalMp3Path });
            notificationParams.filename = finalMp3Path;
            log.info(`RdioRecordingService: finalized recording ${finalMp3Path} from ${orderedCalls.length} call(s) for talkgroup="${talkgroupKey}"`);
            await this._postRecordingNotifier(notificationParams);
        } catch (err) {
            log.error(`RdioRecordingService: finalize error for talkgroup="${talkgroupKey}": ${err.message}`);
        } finally {
            if (stitchedWavToCleanup) this._safeUnlink(stitchedWavToCleanup);
            orderedCalls.forEach(call => this._safeUnlink(call.stagedPath));
        }
    }

    /**
     * Decide what WAV to feed into the MP3 converter. Single-call windows use
     * the staged WAV directly. Multi-call windows produce an intermediate
     * stitched WAV; if stitching fails, fall back to the first call only so the
     * user still receives a recording plus notifications.
     */
    async _resolveMp3SourceWav({ orderedCalls, intermediateWavPath }) {
        if (orderedCalls.length === 1) {
            return { wavSourcePath: orderedCalls[0].stagedPath, stitchedPath: null };
        }
        try {
            await this._stitchCalls(orderedCalls, intermediateWavPath);
            return { wavSourcePath: intermediateWavPath, stitchedPath: intermediateWavPath };
        } catch (err) {
            log.error(`RdioRecordingService: stitch failed: ${err.message}. Falling back to first call only.`);
            return { wavSourcePath: orderedCalls[0].stagedPath, stitchedPath: null };
        }
    }

    /**
     * Stitch multiple calls into a single WAV with silence padding between
     * them, producing a recording that reflects real-world timing.
     *
     * FFmpeg filter-graph construction:
     *   - Inputs are added to the command in the order they will appear in the
     *     output: call 0, (optional silence, call 1), (optional silence, call 2)...
     *   - Each input gets a sequential index (0, 1, 2, ...). Silence inputs are
     *     `anullsrc` lavfi generators with `-t <gap>` to bound their duration.
     *   - The filter_complex concat filter joins the inputs in order, producing
     *     a single mono audio stream at the configured sample rate.
     *
     * Silence gap between adjacent calls is derived from the wall-clock delta
     * between their dateTime fields, minus the previous call's duration.
     * Negative values (overlapping calls) are clamped to zero.
     */
    _stitchCalls(orderedCalls, outputWavPath) {
        return new Promise((resolve, reject) => {
            const command = this._ffmpegFactory();
            const concatInputRefs = [];

            // First call — no preceding silence.
            command.input(orderedCalls[0].stagedPath);
            let ffmpegInputIndex = 0;
            concatInputRefs.push(`[${ffmpegInputIndex}:a]`);

            for (let i = 1; i < orderedCalls.length; i++) {
                const previousCall = orderedCalls[i - 1];
                const currentCall = orderedCalls[i];
                const wallClockGapSec = (currentCall.dateTime.getTime() - previousCall.dateTime.getTime()) / 1000;
                const silenceGapSec = Math.max(0, wallClockGapSec - previousCall.duration);

                if (silenceGapSec > 0) {
                    command
                        .input(SILENCE_INPUT_SPEC)
                        .inputOptions(['-f', 'lavfi', '-t', String(silenceGapSec)]);
                    ffmpegInputIndex++;
                    concatInputRefs.push(`[${ffmpegInputIndex}:a]`);
                }

                command.input(currentCall.stagedPath);
                ffmpegInputIndex++;
                concatInputRefs.push(`[${ffmpegInputIndex}:a]`);
            }

            const concatFilter = `${concatInputRefs.join('')}concat=n=${concatInputRefs.length}:v=0:a=1[out]`;
            command
                .complexFilter(concatFilter)
                .outputOptions(['-map', '[out]', '-ar', String(STITCH_SAMPLE_RATE), '-ac', String(STITCH_CHANNELS)])
                .on('error', (err) => reject(err))
                .on('end', () => resolve(outputWavPath))
                .save(outputWavPath);
        });
    }

    _clearWindowTimers(window) {
        if (window.earlyTimer) clearTimeout(window.earlyTimer);
        if (window.hardTimer) clearTimeout(window.hardTimer);
    }

    _ensureDirectory(dir) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
    }

    _safeUnlink(filePath) {
        try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    }
}

const rdioRecordingService = new RdioRecordingService();

module.exports = { RdioRecordingService, rdioRecordingService };
