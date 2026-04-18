const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const log = require('../../util/logger');
const { TonesDetectorConfig } = require('../../obj/config/TonesDetectorConfig');
const { AudioFileService } = require('../../service/AudioFileService');
const { DetectionService } = require('../../service/DetectionService');
const { getWebSocketServer, configureWebSocketEvents } = require('../index');
const config = require('config');
const garbageCollect = require('../../util/gc');
const { SourceContext } = require('../../obj/SourceContext');
const { rdioRecordingService } = require('../../service/RdioRecordingService');

/**
 * Handle Rdio Scanner call-upload API requests.
 * Orchestrates: validate -> extract metadata -> filter detectors -> process audio -> respond.
 */
async function handleCallUpload(req, res) {
    const requestId = uuidv4();
    const startTime = new Date();

    log.info(`Rdio Scanner ${req.method} ${req.originalUrl} received from ${req.ip} (${requestId})`);

    // Handle requests without audio file (SDRTrunk startup connectivity check)
    // SDRTrunk sends test=1 with key+system but no talkgroup, expecting HTTP 417
    // with "Incomplete call data: no talkgroup" to confirm connectivity
    if (!req.file) {
        const talkgroup = req.body?.talkgroup;
        if (!talkgroup) {
            log.info(`Rdio Scanner connectivity check from ${req.ip}: no talkgroup provided, returning expected 417 (${requestId})`);
            return res.status(417).send('Incomplete call data: no talkgroup');
        }
        log.info(`Rdio Scanner call-upload: no audio file provided (${requestId})`);
        return res.status(200).send('Call imported successfully');
    }

    // Extract and log Rdio metadata
    const rdioMetadata = extractRdioMetadata(req, requestId);

    // Find detectors matching the incoming talkgroup label
    const matchingDetectors = findMatchingDetectors(rdioMetadata.talkgroupLabel);

    // If no matching detectors, check if a recording window is already open for this talkgroup.
    // When open, the call is same-talkgroup radio chatter that should be stitched into the recording.
    if (matchingDetectors.length === 0) {
        if (rdioRecordingService.hasActiveWindow(rdioMetadata.talkgroupLabel)) {
            log.debug(`Rdio Scanner: no matching detectors but active recording window for talkgroupLabel="${rdioMetadata.talkgroupLabel}", capturing for stitching (${requestId})`);
            const wavFilePathLocal = req.file.path + '.wav';
            try {
                await convertToWav(req.file.path, wavFilePathLocal, req.file.originalname, requestId);
                cleanupFile(req.file.path);
                await rdioRecordingService.captureCall({
                    wavFilePath: wavFilePathLocal,
                    dateTime: rdioMetadata.dateTime,
                    talkgroupLabel: rdioMetadata.talkgroupLabel
                });
            } catch (err) {
                log.error(`Rdio Scanner: failed to capture non-matching call into active window: ${err.message} (${requestId})`);
            } finally {
                cleanupFile(wavFilePathLocal);
            }
            return res.status(200).send('Call imported successfully');
        }
        log.debug(`Rdio Scanner: no matching detectors for talkgroupLabel="${rdioMetadata.talkgroupLabel}", skipping (${requestId})`);
        cleanupFile(req.file.path);
        return res.status(200).send('Call imported successfully');
    }

    log.info(`Rdio Scanner: ${matchingDetectors.length} detector(s) match talkgroupLabel="${rdioMetadata.talkgroupLabel}" (${requestId})`);

    // Convert uploaded audio to WAV for processing (SDRTrunk typically sends MP3)
    const wavFilePath = req.file.path + '.wav';
    try {
        await convertToWav(req.file.path, wavFilePath, req.file.originalname, requestId);
    } catch (conversionError) {
        log.error(`Rdio Scanner: audio conversion failed: ${conversionError.message} (${requestId})`);
        cleanupFile(req.file.path);
        cleanupFile(wavFilePath);
        return res.status(500).json({
            success: false,
            error: 'Audio conversion failed'
        });
    }

    // Clean up original uploaded file (conversion created a new WAV file)
    cleanupFile(req.file.path);

    // Build detector configs and process audio
    const detectorConfigs = createMatchingDetectorConfigs(matchingDetectors);

    try {
        const detections = await processCallAudio(wavFilePath, detectorConfigs, rdioMetadata, requestId, startTime);
        // If this call produced no tones but a recording window is open for this talkgroup,
        // stage its audio so it becomes part of the stitched recording.
        if ((!detections || detections.length === 0)
            && rdioRecordingService.hasActiveWindow(rdioMetadata.talkgroupLabel)) {
            await rdioRecordingService.captureCall({
                wavFilePath,
                dateTime: rdioMetadata.dateTime,
                talkgroupLabel: rdioMetadata.talkgroupLabel
            });
        }
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

    log.info(`Rdio Scanner call: talkgroup=${metadata.talkgroup}, talkgroupLabel="${metadata.talkgroupLabel || 'N/A'}", system=${metadata.system || 'N/A'}, systemLabel="${metadata.systemLabel || 'N/A'}", source=${metadata.source || 'N/A'}, frequency=${metadata.frequency || 'N/A'}, dateTime=${metadata.dateTime || 'N/A'} (${requestId})`);

    // Log audio file details for troubleshooting
    if (req.file) {
        const fileSizeKB = (req.file.size / 1024).toFixed(1);
        log.info(`Rdio Scanner audio: filename="${req.file.originalname}", size=${fileSizeKB}KB, mimetype=${req.file.mimetype || 'unknown'} (${requestId})`);
    }

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
            isRecordingEnabled: detectorConfig.isRecordingEnabled !== undefined
                ? detectorConfig.isRecordingEnabled
                : config.detection.isRecordingEnabled,
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
            detectedAt: detection.detectedAt,
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

    const sourceContext = SourceContext.fromRdioMetadata(rdioMetadata);

    const detectionService = new DetectionService({
        audioInterface: null,
        frequencyScaleFactor: config.audio.frequencyScaleFactor,
        fileMode: true,
        recording: false,
        areNotificationsEnabled: true,
        sourceContext
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

    // Wire recording accumulator: when a tone is detected, hand the wav off so the service
    // can stage it and start/extend a post-recording stitch window for this talkgroup.
    const recordingListener = (detectionData) => {
        const matchedConfig = detectorConfigs.find(d => d.name === detectionData.detector?.name);
        if (matchedConfig && matchedConfig.isRecordingEnabled === false) return;
        rdioRecordingService.onToneDetected({
            wavFilePath,
            dateTime: rdioMetadata.dateTime,
            talkgroupLabel: rdioMetadata.talkgroupLabel,
            detectionData
        }).catch(err => log.error(`Rdio Scanner: recording accumulator error: ${err.message} (${requestId})`));
    };
    detectionService.on('toneDetected', recordingListener);

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
        detectionService.removeListener('toneDetected', recordingListener);

        const processingTime = Date.now() - startTime.getTime();

        if (detections.length > 0) {
            log.info(`Rdio Scanner: ${detections.length} tone detection(s) from talkgroup="${rdioMetadata.talkgroupLabel}" in ${processingTime}ms (${requestId})`);
        } else {
            log.debug(`Rdio Scanner: no tones detected in call from talkgroup="${rdioMetadata.talkgroupLabel}" in ${processingTime}ms (${requestId})`);
        }

        return detections;
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
 * Convert an audio file to WAV format using FFmpeg.
 * If the file is already WAV (based on original filename), just renames it.
 * Follows the FFmpeg pattern from service/WavToMp3Service.js.
 * @param {string} inputPath - Path to the uploaded audio file
 * @param {string} outputPath - Path for the output WAV file
 * @param {string} originalFilename - Original filename from the upload (for extension check)
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<string>} Path to the WAV file
 */
function convertToWav(inputPath, outputPath, originalFilename, requestId) {
    const ext = path.extname(originalFilename || '').toLowerCase();

    // If already WAV, just rename
    if (ext === '.wav') {
        log.debug(`Rdio Scanner: audio is already WAV, renaming (${requestId})`);
        fs.renameSync(inputPath, outputPath);
        return Promise.resolve(outputPath);
    }

    log.info(`Rdio Scanner: converting ${ext || 'unknown format'} to WAV via FFmpeg (${requestId})`);

    return new Promise((resolve, reject) => {
        ffmpeg({ source: inputPath })
            .toFormat('wav')
            .audioFrequency(44100)
            .audioChannels(1)
            .on('error', (err) => {
                log.error(`Rdio Scanner: FFmpeg conversion error: ${err.message} (${requestId})`);
                reject(err);
            })
            .on('end', () => {
                log.info(`Rdio Scanner: audio converted to WAV successfully (${requestId})`);
                resolve(outputPath);
            })
            .save(outputPath);
    });
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
    convertToWav,
    cleanupFile
};
