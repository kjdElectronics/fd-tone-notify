const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const log = require('../../util/logger');
const { TonesDetectorConfig } = require('../../obj/config/TonesDetectorConfig');
const { AudioFileService } = require('../../service/AudioFileService');
const { DetectionService } = require('../../service/DetectionService');
const { getWebSocketServer, getGlobalDetectionStore, configureWebSocketEvents } = require('../index');
const config = require('config');
const garbageCollect = require('../../util/gc');

/**
 * Handle Rdio Scanner call-upload API requests.
 * Accepts audio files with talkgroup metadata, filters to matching detectors,
 * and runs tone detection with notifications enabled.
 */
async function handleCallUpload(req, res) {
    const requestId = uuidv4();
    const startTime = new Date();

    log.info(`Rdio Scanner call-upload received: ${requestId}`);

    // Validate audio file
    if (!req.file) {
        log.debug(`Rdio Scanner call-upload: no audio file provided (${requestId})`);
        return res.status(400).json({
            success: false,
            error: 'No audio file provided'
        });
    }

    // Extract Rdio Scanner metadata from form fields
    const {
        dateTime,
        talkgroup,
        talkgroupLabel,
        talkgroupGroup,
        talkgroupTag,
        system,
        systemLabel,
        source,
        frequency
    } = req.body;

    log.info(`Rdio Scanner call: talkgroup=${talkgroup}, talkgroupLabel="${talkgroupLabel || 'N/A'}", system=${system || 'N/A'}, systemLabel="${systemLabel || 'N/A'}" (${requestId})`);

    // Get configured detectors and filter by talkgroupFilter
    const allDetectors = config.detection?.detectors || [];
    const incomingLabel = (talkgroupLabel || '').trim();

    const matchingDetectors = allDetectors.filter(detector => {
        const filter = (detector.talkgroupFilter || '').trim();
        if (!filter) return false; // Skip detectors without talkgroupFilter
        return filter.toLowerCase() === incomingLabel.toLowerCase();
    });

    // If no matching detectors, skip silently and return success
    if (matchingDetectors.length === 0) {
        log.debug(`Rdio Scanner: no matching detectors for talkgroupLabel="${incomingLabel}", skipping (${requestId})`);

        // Clean up uploaded file
        cleanupFile(req.file.path);

        return res.status(200).send('Call imported successfully');
    }

    log.info(`Rdio Scanner: ${matchingDetectors.length} detector(s) match talkgroupLabel="${incomingLabel}" (${requestId})`);

    const uploadedFilePath = req.file.path;
    const originalFilename = req.file.originalname;

    // Rename uploaded file to have .wav extension for processing
    const wavFilePath = uploadedFilePath + '.wav';
    fs.renameSync(uploadedFilePath, wavFilePath);

    // Initialize audio file service
    const audioFileService = new AudioFileService({
        chunkDurationSeconds: 1
    });

    // Initialize detection service in file mode with notifications enabled
    const detectionService = new DetectionService({
        audioInterface: null,
        frequencyScaleFactor: config.audio.frequencyScaleFactor,
        fileMode: true,
        recording: false, // Recording disabled for Rdio (follow-up task)
        areNotificationsEnabled: true // Notifications enabled for Rdio calls
    });

    // Configure matching detectors
    const detectorConfigs = [];
    matchingDetectors.forEach(detectorConfig => {
        const detectorConfigObj = new TonesDetectorConfig({
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

        detectionService.addToneDetector(detectorConfigObj);
        detectorConfigs.push(detectorConfigObj);

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

    // Create detection listener for tracking
    const detectionListener = (detection) => {
        detections.push({
            detector: detection.detector.name,
            tones: detection.detector.tones,
            timestamp: detection.timestamp,
            matchAverages: detection.matchAverages,
            message: detection.message,
            rdioMetadata: {
                talkgroup,
                talkgroupLabel,
                talkgroupGroup,
                talkgroupTag,
                system,
                systemLabel,
                source,
                frequency,
                dateTime
            }
        });
        log.info(`Rdio Scanner detection: ${detection.detector.name} detected tones in call from talkgroup="${incomingLabel}" (${requestId})`);
    };
    detectionService.on('toneDetected', detectionListener);

    // Process audio chunks
    audioFileService.on('audioData', (audioData) => {
        detectionService.processAudioData({
            timestamp: audioData.timestamp,
            filePath: audioData.filePath,
            audioBuffer: audioData.audioBuffer,
            sampleRate: audioData.sampleRate
        });
    });

    try {
        // Process the file
        await audioFileService.processFile(wavFilePath);

        // Wait for detection to complete
        await detectionService.waitForProcessingToComplete();

        // Clean up event listeners
        detectionService.removeListener('toneDetected', detectionListener);

        const processingTime = Date.now() - startTime.getTime();

        if (detections.length > 0) {
            log.info(`Rdio Scanner: ${detections.length} tone detection(s) from talkgroup="${incomingLabel}" in ${processingTime}ms (${requestId})`);
        } else {
            log.debug(`Rdio Scanner: no tones detected in call from talkgroup="${incomingLabel}" in ${processingTime}ms (${requestId})`);
        }

        // Return Rdio Scanner expected response
        res.status(200).send('Call imported successfully');

    } catch (processingError) {
        log.error(`Rdio Scanner: error processing audio: ${processingError.message} (${requestId})`);
        res.status(500).json({
            success: false,
            error: 'Audio processing failed'
        });
    } finally {
        // Dispose services
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

        // Clean up uploaded file
        cleanupFile(wavFilePath);
    }
}

/**
 * Clean up a file, logging any errors
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

module.exports = { handleCallUpload };
