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

function _resolveRdioConfig() {
    const rdio = (config && config.rdio) || {};
    return {
        windowTimeoutSec: rdio.recordingWindowTimeoutSec || DEFAULT_WINDOW_TIMEOUT_SEC,
        earlySendAfterSec: rdio.earlySendAfterSec || DEFAULT_EARLY_SEND_AFTER_SEC,
        earlySendMinAudioSec: rdio.earlySendMinAudioSec || DEFAULT_EARLY_SEND_MIN_AUDIO_SEC,
    };
}

function _parseDateTime(dateTime) {
    if (dateTime == null) return new Date();
    if (dateTime instanceof Date) return dateTime;
    if (typeof dateTime === 'number') {
        return new Date(dateTime < 1e12 ? dateTime * 1000 : dateTime);
    }
    const s = String(dateTime);
    if (/^\d+(\.\d+)?$/.test(s)) {
        const n = Number(s);
        return new Date(n < 1e12 ? n * 1000 : n);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
}

function _defaultProbeDuration(wavPath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(wavPath, (err, data) => {
            if (err || !data || !data.format || data.format.duration == null) return resolve(0);
            resolve(Number(data.format.duration));
        });
    });
}

class RdioRecordingService {
    constructor({
        stagingDir,
        recordingDirectory,
        notifier,
        mp3Converter,
        ffmpegFactory,
        probeDuration,
    } = {}) {
        this._windows = new Map();
        this._stagingDir = stagingDir || path.join(os.tmpdir(), 'rdio-staging');
        this._recordingDirectoryOverride = recordingDirectory;
        this._notifier = notifier || sendPostRecordingNotifications;
        this._mp3Converter = mp3Converter || WavToMp3Service.convertWavToMp3.bind(WavToMp3Service);
        this._ffmpegFactory = ffmpegFactory || (() => ffmpeg());
        this._probeDuration = probeDuration || _defaultProbeDuration;
        this._ensureDir(this._stagingDir);
    }

    get _recordingDirectory() {
        if (this._recordingDirectoryOverride) return this._recordingDirectoryOverride;
        return (config.recording && config.recording.directory) || './recordings';
    }

    hasActiveWindow(talkgroupLabel) {
        return this._windows.has(this._key(talkgroupLabel));
    }

    async onToneDetected({ wavFilePath, dateTime, talkgroupLabel, detectionData }) {
        const key = this._key(talkgroupLabel);
        if (!key) {
            log.warning(`RdioRecordingService: onToneDetected called with empty talkgroupLabel; ignoring`);
            return;
        }
        const call = await this._stageAndProbe(wavFilePath, dateTime);
        if (!call) return;
        let window = this._windows.get(key);
        if (!window) {
            window = this._createWindow({ key, detectionData, firstCall: call });
        } else {
            window.calls.push(call);
        }
        this._checkEarlySend(window);
    }

    async captureCall({ wavFilePath, dateTime, talkgroupLabel }) {
        const key = this._key(talkgroupLabel);
        const window = this._windows.get(key);
        if (!window) return false;
        const call = await this._stageAndProbe(wavFilePath, dateTime);
        if (!call) return false;
        window.calls.push(call);
        this._checkEarlySend(window);
        return true;
    }

    dispose() {
        for (const window of this._windows.values()) {
            if (window.earlyTimer) clearTimeout(window.earlyTimer);
            if (window.hardTimer) clearTimeout(window.hardTimer);
            for (const call of window.calls) this._safeUnlink(call.stagedPath);
        }
        this._windows.clear();
    }

    _key(talkgroupLabel) {
        if (talkgroupLabel == null) return '';
        return String(talkgroupLabel).trim().toLowerCase();
    }

    _createWindow({ key, detectionData, firstCall }) {
        const cfg = _resolveRdioConfig();
        const { notificationParams, detectorName } = this._buildNotificationParams(detectionData);
        const window = {
            key,
            detectorName,
            notificationParams,
            calls: [firstCall],
            startTime: Date.now(),
            earlyTimer: null,
            hardTimer: null,
            finalizing: false,
        };
        window.hardTimer = setTimeout(() => this._finalize(key), cfg.windowTimeoutSec * 1000);
        window.earlyTimer = setTimeout(() => this._maybeEarlyFinalize(key), cfg.earlySendAfterSec * 1000);
        this._windows.set(key, window);
        log.info(`RdioRecordingService: opened recording window for talkgroup="${key}" detector="${detectorName}"`);
        return window;
    }

    _buildNotificationParams(detectionData) {
        const timestamp = detectionData && detectionData.detectedAt
            ? new Date(detectionData.detectedAt).getTime()
            : Date.now();
        const detectorName = (detectionData && detectionData.detector && detectionData.detector.name) || 'unknown';
        const baseFilename = `${timestamp}-${detectorName}.mp3`;
        const finalFilename = path.join(this._recordingDirectory, baseFilename);
        const notificationParams = new NotificationParams({
            uuid: detectionData && detectionData.uuid,
            detector: detectionData && detectionData.detector,
            timestamp,
            matchAverages: (detectionData && detectionData.matchAverages) || [],
            notifications: (detectionData && detectionData.notifications) || {},
            filename: finalFilename,
            message: detectionData && detectionData.message,
            attachFile: true,
        });
        return { notificationParams, detectorName };
    }

    async _stageAndProbe(wavFilePath, dateTime) {
        try {
            this._ensureDir(this._stagingDir);
            const stagedPath = path.join(this._stagingDir, `${uuidv4()}.wav`);
            fs.copyFileSync(wavFilePath, stagedPath);
            const duration = await this._probeDuration(stagedPath);
            return {
                stagedPath,
                dateTime: _parseDateTime(dateTime),
                duration: duration || 0,
            };
        } catch (err) {
            log.error(`RdioRecordingService: failed to stage wav ${wavFilePath}: ${err.message}`);
            return null;
        }
    }

    _checkEarlySend(window) {
        const cfg = _resolveRdioConfig();
        const elapsedSec = (Date.now() - window.startTime) / 1000;
        if (elapsedSec < cfg.earlySendAfterSec) return;
        const audioSec = window.calls.reduce((s, c) => s + c.duration, 0);
        if (audioSec >= cfg.earlySendMinAudioSec) this._finalize(window.key);
    }

    _maybeEarlyFinalize(key) {
        const window = this._windows.get(key);
        if (!window) return;
        const cfg = _resolveRdioConfig();
        const audioSec = window.calls.reduce((s, c) => s + c.duration, 0);
        if (audioSec >= cfg.earlySendMinAudioSec) this._finalize(key);
    }

    async _finalize(key) {
        const window = this._windows.get(key);
        if (!window || window.finalizing) return;
        window.finalizing = true;
        this._windows.delete(key);
        if (window.earlyTimer) clearTimeout(window.earlyTimer);
        if (window.hardTimer) clearTimeout(window.hardTimer);

        const sortedCalls = [...window.calls].sort((a, b) => a.dateTime - b.dateTime);
        const { notificationParams, detectorName } = window;

        this._ensureDir(this._recordingDirectory);
        const timestamp = notificationParams.timestamp;
        const baseName = `${timestamp}-${detectorName}`;
        const intermediateWav = path.join(this._recordingDirectory, `${baseName}.wav`);
        const finalMp3 = path.join(this._recordingDirectory, `${baseName}.mp3`);

        let stitchedWav = null;
        try {
            let mp3Source;
            if (sortedCalls.length === 1) {
                mp3Source = sortedCalls[0].stagedPath;
            } else {
                try {
                    await this._stitchCalls(sortedCalls, intermediateWav);
                    stitchedWav = intermediateWav;
                    mp3Source = intermediateWav;
                } catch (err) {
                    log.error(`RdioRecordingService: stitch failed: ${err.message}. Falling back to first call only.`);
                    mp3Source = sortedCalls[0].stagedPath;
                }
            }

            await this._mp3Converter({ inputPath: mp3Source, outputPath: finalMp3 });
            notificationParams.filename = finalMp3;
            log.info(`RdioRecordingService: finalized recording ${finalMp3} from ${sortedCalls.length} call(s) for talkgroup="${key}"`);
            await this._notifier(notificationParams);
        } catch (err) {
            log.error(`RdioRecordingService: finalize error for talkgroup="${key}": ${err.message}`);
        } finally {
            if (stitchedWav) this._safeUnlink(stitchedWav);
            sortedCalls.forEach(c => this._safeUnlink(c.stagedPath));
        }
    }

    _stitchCalls(calls, outputWavPath) {
        return new Promise((resolve, reject) => {
            const command = this._ffmpegFactory();
            const filterRefs = [];

            command.input(calls[0].stagedPath);
            let inputIndex = 0;
            filterRefs.push(`[${inputIndex}:a]`);

            for (let i = 1; i < calls.length; i++) {
                const prev = calls[i - 1];
                const curr = calls[i];
                const deltaSec = (curr.dateTime.getTime() - prev.dateTime.getTime()) / 1000;
                const gap = Math.max(0, deltaSec - prev.duration);

                if (gap > 0) {
                    command.input('anullsrc=r=44100:cl=mono')
                        .inputOptions(['-f', 'lavfi', '-t', String(gap)]);
                    inputIndex++;
                    filterRefs.push(`[${inputIndex}:a]`);
                }

                command.input(curr.stagedPath);
                inputIndex++;
                filterRefs.push(`[${inputIndex}:a]`);
            }

            const filter = `${filterRefs.join('')}concat=n=${filterRefs.length}:v=0:a=1[out]`;
            command
                .complexFilter(filter)
                .outputOptions(['-map', '[out]', '-ar', '44100', '-ac', '1'])
                .on('error', (err) => reject(err))
                .on('end', () => resolve(outputWavPath))
                .save(outputWavPath);
        });
    }

    _ensureDir(dir) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
    }

    _safeUnlink(p) {
        try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
    }
}

const rdioRecordingService = new RdioRecordingService();

module.exports = { RdioRecordingService, rdioRecordingService };
