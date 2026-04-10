const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const log = require('../../util/logger');
const { formatTimestamp, formatDuration } = require('../../util/formatters');
const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');
const { TonesDetectorConfig } = require('../../obj/config/TonesDetectorConfig');
const { AudioFileService } = require('../../service/AudioFileService');
const { DetectionService } = require('../../service/DetectionService');
const { AllToneDetectionService } = require('../../service/AllToneDetectionService');
const { getWebSocketServer, getGlobalDetectionStore, configureWebSocketEvents } = require('../index');
const config = require('config');
const garbageCollect = require("../../util/gc");

/**
 * Upload a WAV file and detect tones
 */
async function detectTones(req, res) {
    const requestId = uuidv4();
    const startTime = new Date();
    
    log.info(`API tone detection request started: ${requestId}`);

    // Validate file upload
    if (!req.file) {
        throw ErrorWithStatusCode.validation('No file uploaded. Please upload a WAV file.');
    }

    const uploadedFilePath = req.file.path;
    const originalFilename = req.file.originalname;

    // Rename uploaded file to have .wav extension for processing
    const wavFilePath = uploadedFilePath + '.wav';
    fs.renameSync(uploadedFilePath, wavFilePath);

    log.info(`Processing uploaded file: ${originalFilename} (${requestId})`);

    // Get parsed detector configuration from middleware
    const { enableNotifications, enableAllToneDetector, customDetectors, globalOverrides, detectorConfigs } = req.detectorConfig;

    // Initialize audio file service
    const audioFileService = new AudioFileService({
        chunkDurationSeconds: 1
    });

    // Initialize detection service in file mode
    const detectionService = new DetectionService({
        audioInterface: null,
        frequencyScaleFactor: config.audio.frequencyScaleFactor,
        fileMode: true,
        recording: false, // Disable recording for API requests
        areNotificationsEnabled: enableNotifications, // Control notifications based on request flag
        sourceContext: { source: 'file-upload' }
    });

    // Configure detectors using pre-parsed configuration
    const detectors = [];

    detectorConfigs.forEach(detectorConfigObj => {
        const detector = detectionService.addToneDetector(detectorConfigObj);
        detectors.push(detector);
        
        log.debug(`API: Added detector for ${detectorConfigObj.name} with tones ${detectorConfigObj.tones.map(v => `${v}Hz`).join(', ')}`);
    });

    // Initialize AllToneDetectionService if enabled
    let allToneDetectionService = null;
    if (enableAllToneDetector && config.allToneDetector) {
        allToneDetectionService = new AllToneDetectionService({
            startFreq: config.allToneDetector.startFreq,
            endFreq: config.allToneDetector.endFreq,
            tolerancePercent: config.allToneDetector.tolerancePercent,
            rangeOverlapModifier: config.allToneDetector.rangeOverlapModifier,
            matchThreshold: config.allToneDetector.matchThreshold,
            audioInterface: null, // File mode
            frequencyScaleFactor: config.audio.frequencyScaleFactor,
            silenceAmplitude: config.audio.silenceAmplitude,
            logLevel: process.env.FD_LOG_LEVEL || "info",
            fileMode: true,
            sourceContext: { source: 'file-upload' }
        });
        
        log.debug(`API: Initialized All Tone Detector for range ${config.allToneDetector.startFreq}Hz to ${config.allToneDetector.endFreq}Hz`);
    }

    // Track detections
    const detections = [];
    const allToneDetections = [];

    // Configure universal WebSocket events (includes persistence and WebSocket broadcasting)
    const wss = getWebSocketServer();
    if (wss) {
        configureWebSocketEvents({
            detectionService,
            allToneDetectionService,
            wss
        });
    }

    // Create additional listeners for API response collection
    const detectionListener = createDetectionListener(detections, requestId);
    detectionService.on('toneDetected', detectionListener);

    // Listen for multi-tone detections if AllToneDetector is enabled
    let multiToneDetectionListener = null;
    if (allToneDetectionService) {
        multiToneDetectionListener = createMultiToneDetectionListener(allToneDetections, requestId);
        allToneDetectionService.on('multiToneDetected', multiToneDetectionListener);
    }

    // Process audio chunks
    audioFileService.on('audioData', (audioData) => {
        const audioDataParams = {
            timestamp: audioData.timestamp,
            filePath: audioData.filePath,
            audioBuffer: audioData.audioBuffer,
            sampleRate: audioData.sampleRate
        }

        detectionService.processAudioData(audioDataParams);

        // Also process through AllToneDetectionService if enabled
        if (allToneDetectionService) {
            allToneDetectionService.processAudioData(audioDataParams)
        }
    });

    try {
        // Process the file
        await audioFileService.processFile(wavFilePath);

        //Wait for the detection service (Note: This is a polling loop internally)
        await detectionService.waitForProcessingToComplete();
        
        // Also wait for AllToneDetectionService to complete if enabled
        if (allToneDetectionService) {
            await allToneDetectionService.waitForProcessingToComplete();
        }
        
        // Clean up event listeners
        detectionService.removeListener('toneDetected', detectionListener);
        if (allToneDetectionService && multiToneDetectionListener) {
            allToneDetectionService.removeListener('multiToneDetected', multiToneDetectionListener);
        }

        // Get file duration
        const status = audioFileService.getStatus();
        const processingTime = Date.now() - startTime.getTime();

        // Prepare response
        const response = {
            success: true,
            requestId,
            processed: startTime.toISOString(),
            filename: originalFilename,
            duration: formatDuration(status.totalDuration),
            durationSeconds: status.totalDuration,
            detections,
            allToneDetections,
            processingTimeMs: processingTime,
            detectorsUsed: detectorConfigs.length,
            customConfiguration: {
                enableNotifications,
                enableAllToneDetector,
                customDetectors,
                globalOverrides
            }
        };

        log.info(`API tone detection completed: ${detections.length} detections, ${allToneDetections.length} multi-tone detections in ${processingTime}ms (${requestId})`);

        res.json(response);

    } catch (processingError) {
        log.error(`API: Error processing audio data: ${processingError.message} (${requestId})`);
        throw ErrorWithStatusCode.internal(
            `Audio processing failed: ${processingError.message}`,
            'Failed to process uploaded audio file'
        );
    } finally {
        try {
            // Dispose of services in proper order to prevent memory leaks
            if (detectionService && typeof detectionService.dispose === 'function') {
                detectionService.dispose();
            }
            if (allToneDetectionService && typeof allToneDetectionService.dispose === 'function') {
                allToneDetectionService.dispose();
            }
            if (audioFileService && typeof audioFileService.dispose === 'function') {
                audioFileService.dispose();
            }

            // Force garbage collection on cleanup to prevent memory accumulation
            garbageCollect("Detection Controller");
        } catch (disposeError) {
            log.error(`API: Failed to dispose services: ${disposeError.message} (${requestId})`);
        }
        
        // Clean up uploaded file
        try {
            if (fs.existsSync(wavFilePath)) {
                fs.unlinkSync(wavFilePath);
            }
        } catch (cleanupError) {
            log.warning(`API: Failed to clean up uploaded file: ${cleanupError.message} (${requestId})`);
        }
    }
}

/**
 * Create a detection listener function
 * @param {Array} detections - Array to store detections
 * @param {string} requestId - Request ID for logging
 * @returns {Function} Detection listener function
 */
function createDetectionListener(detections, requestId) {
    return function handleDetection(detection) {
        // Use fileTimestamp (file-relative seconds) for file position display, fall back to timestamp
        const fileSeconds = detection.fileTimestamp !== undefined ? detection.fileTimestamp : detection.timestamp;
        const detectionData = {
            detector: detection.detector.name,
            tones: detection.detector.tones,
            timestamp: formatTimestamp(fileSeconds),
            timestampSeconds: fileSeconds,
            detectedAt: detection.detectedAt,
            matchAverages: detection.matchAverages,
            message: detection.message
        };

        detections.push(detectionData);
        log.info(`API detection: ${detection.detector.name} detected at ${detectionData.timestamp} (${requestId})`);
        
        // Note: WebSocket broadcasting and persistence handled by configureWebSocketEvents
    };
}

/**
 * Create a multi-tone detection listener function
 * @param {Array} allToneDetections - Array to store multi-tone detections
 * @param {string} requestId - Request ID for logging
 * @returns {Function} Multi-tone detection listener function
 */
function createMultiToneDetectionListener(allToneDetections, requestId) {
    return function handleMultiToneDetection(eventData) {
        // Extract data from the event - could be legacy format (just tones array) or new format (object with tones and timestamp)
        const tones = Array.isArray(eventData) ? eventData : eventData.tones;
        const detectionTimestamp = Array.isArray(eventData) ? 0 : (eventData.timestamp !== undefined ? eventData.timestamp : 0);

        const detectionData = {
            detector: 'All Tone Detector',
            tones: tones,
            timestamp: formatTimestamp(detectionTimestamp),
            timestampSeconds: detectionTimestamp,
            matchAverages: tones,
            message: `Multi-tone detection: ${tones.map(f => `${f}Hz`).join(', ')}`,
            type: 'discovery'
        };

        allToneDetections.push(detectionData);
        log.info(`API multi-tone detection: ${tones.map(f => `${f}Hz`).join(', ')} at ${detectionTimestamp}s (${requestId})`);
        
        // Note: WebSocket broadcasting and persistence handled by configureWebSocketEvents
    };
}

/**
 * Get recent detections from persistence storage for client population
 */
async function getRecentDetections(req, res) {
    try {
        // Get detection store
        const detectionStore = getGlobalDetectionStore();
        if (!detectionStore) {
            return res.status(503).json({
                success: false,
                error: 'Detection store not available',
                detections: [],
                meta: { count: 0, limit: 0 }
            });
        }

        // Parse query parameters
        const limit = Math.min(parseInt(req.query.limit) || 50, 50);
        
        log.debug(`API request for recent detections: limit=${limit}`);

        // Get recent detections (raw WebSocket data)
        const detections = detectionStore.getRecentDetections(limit);

        log.debug(`Returning ${detections.length} recent detections via API`);

        res.json({
            success: true,
            detections: detections,
            meta: {
                count: detections.length,
                limit: limit
            }
        });

    } catch (error) {
        log.error(`Error retrieving recent detections via API: ${error.message}`, error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve recent detections',
            detections: [],
            meta: { count: 0, limit: parseInt(req.query.limit) || 50 }
        });
    }
}

module.exports = { detectTones, getRecentDetections };