const config = require('config');
const log = require('../util/logger');
const { AudioFileService } = require('./AudioFileService');
const { DetectionService } = require('./DetectionService');
const { SourceContext } = require('../obj/SourceContext');
const { rdioRecordingService } = require('./RdioRecordingService');
const garbageCollect = require('../util/gc');

const AUDIO_CHUNK_DURATION_SECONDS = 1;

/**
 * Orchestrates running an Rdio Scanner call through the tone-detection
 * pipeline. Creates per-request AudioFileService + DetectionService instances
 * (both hold internal state and must be isolated per call), pipes audio
 * between them, listens for tone detections, and hands qualifying audio off to
 * RdioRecordingService so that post-recording notifications can fire.
 *
 * WebSocket wiring is injected by the caller so this service stays free of
 * server/controller-layer dependencies.
 */
async function processRdioCall({
    wavFilePath,
    detectorConfigs,
    rdioMetadata,
    requestId,
    startTime,
    onServicesReady,
}) {
    const audioFileService = new AudioFileService({
        chunkDurationSeconds: AUDIO_CHUNK_DURATION_SECONDS,
    });

    const detectionService = new DetectionService({
        audioInterface: null,
        frequencyScaleFactor: config.audio.frequencyScaleFactor,
        fileMode: true,
        recording: false,
        areNotificationsEnabled: true,
        sourceContext: SourceContext.fromRdioMetadata(rdioMetadata),
    });

    detectorConfigs.forEach(detectorConfigObj => {
        detectionService.addToneDetector(detectorConfigObj);
        log.debug(`Rdio Scanner: added detector "${detectorConfigObj.name}" with tones ${detectorConfigObj.tones.map(v => `${v}Hz`).join(', ')} (${requestId})`);
    });

    // Allow the caller (controller) to attach WebSocket broadcasting or any
    // other per-request wiring before events begin firing.
    if (typeof onServicesReady === 'function') {
        onServicesReady({ detectionService, audioFileService });
    }

    const detections = [];
    const detectionLogListener = createDetectionLogListener(detections, rdioMetadata, requestId);
    const recordingWindowListener = createRecordingWindowListener({
        wavFilePath,
        rdioMetadata,
        detectorConfigs,
        requestId,
    });

    detectionService.on('toneDetected', detectionLogListener);
    detectionService.on('toneDetected', recordingWindowListener);

    audioFileService.on('audioData', (audioData) => {
        detectionService.processAudioData({
            timestamp: audioData.timestamp,
            filePath: audioData.filePath,
            audioBuffer: audioData.audioBuffer,
            sampleRate: audioData.sampleRate,
        });
    });

    try {
        await audioFileService.processFile(wavFilePath);
        await detectionService.waitForProcessingToComplete();

        detectionService.removeListener('toneDetected', detectionLogListener);
        detectionService.removeListener('toneDetected', recordingWindowListener);

        const processingTime = Date.now() - startTime.getTime();
        if (detections.length > 0) {
            log.info(`Rdio Scanner: ${detections.length} tone detection(s) from talkgroup="${rdioMetadata.talkgroupLabel}" in ${processingTime}ms (${requestId})`);
        } else {
            log.debug(`Rdio Scanner: no tones detected in call from talkgroup="${rdioMetadata.talkgroupLabel}" in ${processingTime}ms (${requestId})`);
        }

        return detections;
    } finally {
        disposePipeline({ detectionService, audioFileService, requestId });
    }
}

/**
 * Build a `toneDetected` listener that records detection metadata (with the
 * call's Rdio metadata attached) into the provided array for the caller to
 * inspect after processing.
 */
function createDetectionLogListener(detections, rdioMetadata, requestId) {
    return function handleDetection(detection) {
        detections.push({
            detector: detection.detector.name,
            tones: detection.detector.tones,
            detectedAt: detection.detectedAt,
            matchAverages: detection.matchAverages,
            message: detection.message,
            rdioMetadata,
        });
        log.info(`Rdio Scanner detection: ${detection.detector.name} detected tones in call from talkgroup="${rdioMetadata.talkgroupLabel}" (${requestId})`);
    };
}

/**
 * Build a `toneDetected` listener that hands the call's WAV to
 * RdioRecordingService so a post-recording stitching window opens (or extends)
 * for this talkgroup. Detectors with recording explicitly disabled are
 * skipped.
 */
function createRecordingWindowListener({ wavFilePath, rdioMetadata, detectorConfigs, requestId }) {
    return function handleDetectionForRecording(detectionData) {
        const matchedConfig = detectorConfigs.find(d => d.name === detectionData.detector?.name);
        if (matchedConfig && matchedConfig.isRecordingEnabled === false) return;

        rdioRecordingService.onToneDetected({
            wavFilePath,
            dateTime: rdioMetadata.dateTime,
            talkgroupLabel: rdioMetadata.talkgroupLabel,
            detectionData,
        }).catch(err => log.error(`Rdio Scanner: recording accumulator error: ${err.message} (${requestId})`));
    };
}

function disposePipeline({ detectionService, audioFileService, requestId }) {
    try {
        if (detectionService && typeof detectionService.dispose === 'function') {
            detectionService.dispose();
        }
        if (audioFileService && typeof audioFileService.dispose === 'function') {
            audioFileService.dispose();
        }
        garbageCollect('Rdio Scanner Controller');
    } catch (disposeError) {
        log.error(`Rdio Scanner: failed to dispose services: ${disposeError.message} (${requestId})`);
    }
}

module.exports = {
    processRdioCall,
    // Exported for testing:
    createDetectionLogListener,
    createRecordingWindowListener,
};
