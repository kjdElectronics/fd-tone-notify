const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const log = require('../../util/logger');
const { TonesDetectorConfig } = require('../../obj/config/TonesDetectorConfig');
const { AudioFileService } = require('../../service/AudioFileService');
const { DetectionService } = require('../../service/DetectionService');
const { getWebSocketServer, configureWebSocketEvents } = require('../index');
const config = require('config');
const garbageCollect = require('../../util/gc');

/**
 * Handle Rdio Scanner call-upload API requests.
 * Orchestrates: validate -> extract metadata -> filter detectors -> process audio -> respond.
 */
async function handleCallUpload(req, res) {
    const requestId = uuidv4();
    const startTime = new Date();

    log.info(`Rdio Scanner ${req.method} ${req.originalUrl} received from ${req.ip} (${requestId})`);

    // Handle requests without audio file (SDRTrunk startup connectivity check)
    if (!req.file) {
        log.info(`Rdio Scanner call-upload: no audio file, treating as connectivity check (${requestId})`);
        return res.status(200).send('Call imported successfully');
    }

    // Extract and log Rdio metadata
    const rdioMetadata = extractRdioMetadata(req, requestId);

    // Find detectors matching the incoming talkgroup label
    const matchingDetectors = findMatchingDetectors(rdioMetadata.talkgroupLabel);

    // If no matching detectors, skip silently and return success
    if (matchingDetectors.length === 0) {
        log.debug(`Rdio Scanner: no matching detectors for talkgroupLabel="${rdioMetadata.talkgroupLabel}", skipping (${requestId})`);
        cleanupFile(req.file.path);
        return res.status(200).send('Call imported successfully');
    }

    log.info(`Rdio Scanner: ${matchingDetectors.length} detector(s) match talkgroupLabel="${rdioMetadata.talkgroupLabel}" (${requestId})`);

    // Rename uploaded file to .wav extension for processing
    const wavFilePath = req.file.path + '.wav';
    fs.renameSync(req.file.path, wavFilePath);

    // Build detector configs and process audio
    const detectorConfigs = createMatchingDetectorConfigs(matchingDetectors);

    try {
        await processCallAudio(wavFilePath, detectorConfigs, rdioMetadata, requestId, startTime);
        res.status(200).send('Call imported successfully');
    } catch (processingError) {
        log.error(`Rdio Scanner: error processing audio: ${processingError.message} (${requestId})`);
        res.status(500).json({
            success: false,
            error: 'Audio processing failed'
        });
    } finally {
        cleanupFile(wavFilePath);
    }
}

/**
 * Extract Rdio Scanner metadata from the request body and log it.
 * @param {Object} req - Express request object
 * @param {string} requestId - Request ID for logging
 * @returns {Object} Parsed Rdio metadata
 */
function extractRdioMetadata(req, requestId) {
    const metadata = {
        dateTime: req.body.dateTime,
        talkgroup: req.body.talkgroup,
        talkgroupLabel: (req.body.talkgroupLabel || '').trim(),
        talkgroupGroup: req.body.talkgroupGroup,
        talkgroupTag: req.body.talkgroupTag,
        system: req.body.system,
        systemLabel: req.body.systemLabel,
        source: req.body.source,
        frequency: req.body.frequency
    };

    log.info(`Rdio Scanner call: talkgroup=${metadata.talkgroup}, talkgroupLabel="${metadata.talkgroupLabel || 'N/A'}", system=${metadata.system || 'N/A'}, systemLabel="${metadata.systemLabel || 'N/A'}" (${requestId})`);

    return metadata;
}

/**
 * Find configured detectors whose talkgroupFilter matches the incoming label.
 * Detectors without a talkgroupFilter are skipped.
 * @param {string} talkgroupLabel - Incoming talkgroup label from Rdio Scanner
 * @returns {Object[]} Array of matching detector config objects
 */
function findMatchingDetectors(talkgroupLabel) {
    const allDetectors = config.detection?.detectors || [];
    const incomingLabel = (talkgroupLabel || '').trim().toLowerCase();

    return allDetectors.filter(detector => {
        const filter = (detector.talkgroupFilter || '').trim();
        if (!filter) return false;
        return filter.toLowerCase() === incomingLabel;
    });
}

/**
 * Create TonesDetectorConfig objects for matching detectors with appropriate defaults.
 * @param {Object[]} matchingDetectors - Raw detector configs from configuration
 * @returns {TonesDetectorConfig[]} Validated detector config objects
 */
function createMatchingDetectorConfigs(matchingDetectors) {
    return matchingDetectors.map(detectorConfig => {
        return new TonesDetectorConfig({
            name: detectorConfig.name,
            tones: detectorConfig.tones,
            talkgroupFilter: detectorConfig.talkgroupFilter,
            resetTimeoutMs: detectorConfig.resetTimeoutMs || config.detection.defaultResetTimeoutMs,
            lockoutTimeoutMs: detectorConfig.lockoutTimeoutMs || config.detection.defaultLockoutTimeoutMs,
            minRecordingLengthSec: detectorConfig.minRecordingLengthSec || config.detection.minRecordingLengthSec,
            maxRecordingLengthSec: detectorConfig.maxRecordingLengthSec || config.detection.maxRecordingLengthSec,
            matchThreshold: detectorConfig.matchThreshold || config.detection.defaultMatchThreshold,
            tolerancePercent: detectorConfig.tolerancePercent || config.detection.defaultTolerancePercent,
            isRecordingEnabled: false, // Force disable recording for Rdio API
            notifications: detectorConfig.notifications
        });
    });
}

/**
 * Create a detection event listener that tracks detections with Rdio metadata.
 * Follows the createDetectionListener pattern from detection.controller.js.
 * @param {Array} detections - Array to push detections into
 * @param {Object} rdioMetadata - Rdio Scanner call metadata
 * @param {string} requestId - Request ID for logging
 * @returns {Function} Event listener function
 */
function createRdioDetectionListener(detections, rdioMetadata, requestId) {
    return function handleDetection(detection) {
        detections.push({
            detector: detection.detector.name,
            tones: detection.detector.tones,
            timestamp: detection.timestamp,
            matchAverages: detection.matchAverages,
            message: detection.message,
            rdioMetadata
        });
        log.info(`Rdio Scanner detection: ${detection.detector.name} detected tones in call from talkgroup="${rdioMetadata.talkgroupLabel}" (${requestId})`);
    };
}

/**
 * Initialize services, process audio through tone detection, and clean up.
 * Creates per-request service instances (required due to internal state management).
 * @param {string} wavFilePath - Path to the audio file
 * @param {TonesDetectorConfig[]} detectorConfigs - Detector configurations to use
 * @param {Object} rdioMetadata - Rdio Scanner call metadata
 * @param {string} requestId - Request ID for logging
 * @param {Date} startTime - Request start time for performance logging
 */
async function processCallAudio(wavFilePath, detectorConfigs, rdioMetadata, requestId, startTime) {
    const audioFileService = new AudioFileService({
        chunkDurationSeconds: 1
    });

    const detectionService = new DetectionService({
        audioInterface: null,
        frequencyScaleFactor: config.audio.frequencyScaleFactor,
        fileMode: true,
        recording: false,
        areNotificationsEnabled: true
    });

    // Add detectors to the detection service
    detectorConfigs.forEach(detectorConfigObj => {
        detectionService.addToneDetector(detectorConfigObj);
        log.debug(`Rdio Scanner: added detector "${detectorConfigObj.name}" with tones ${detectorConfigObj.tones.map(v => `${v}Hz`).join(', ')} (${requestId})`);
    });

    // Track detections
    const detections = [];

    // Configure WebSocket events for broadcasting
    const wss = getWebSocketServer();
    if (wss) {
        configureWebSocketEvents({
            detectionService,
            allToneDetectionService: null,
            wss
        });
    }

    // Set up detection listener
    const detectionListener = createRdioDetectionListener(detections, rdioMetadata, requestId);
    detectionService.on('toneDetected', detectionListener);

    // Wire audio pipeline
    audioFileService.on('audioData', (audioData) => {
        detectionService.processAudioData({
            timestamp: audioData.timestamp,
            filePath: audioData.filePath,
            audioBuffer: audioData.audioBuffer,
            sampleRate: audioData.sampleRate
        });
    });

    try {
        await audioFileService.processFile(wavFilePath);
        await detectionService.waitForProcessingToComplete();

        detectionService.removeListener('toneDetected', detectionListener);

        const processingTime = Date.now() - startTime.getTime();

        if (detections.length > 0) {
            log.info(`Rdio Scanner: ${detections.length} tone detection(s) from talkgroup="${rdioMetadata.talkgroupLabel}" in ${processingTime}ms (${requestId})`);
        } else {
            log.debug(`Rdio Scanner: no tones detected in call from talkgroup="${rdioMetadata.talkgroupLabel}" in ${processingTime}ms (${requestId})`);
        }
    } finally {
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
}

/**
 * Clean up a file, logging any errors.
 * @param {string} filePath - Path to file to delete
 */
function cleanupFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        log.warning(`Rdio Scanner: failed to clean up file ${filePath}: ${error.message}`);
    }
}

module.exports = {
    handleCallUpload,
    // Exported for testing
    extractRdioMetadata,
    findMatchingDetectors,
    createMatchingDetectorConfigs,
    createRdioDetectionListener,
    processCallAudio,
    cleanupFile
};
