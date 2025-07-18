const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const log = require('../../util/logger');
const { formatTimestamp, formatDuration } = require('../../util/formatters');
const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');
const { TonesDetectorConfig } = require('../../obj/config/TonesDetectorConfig');
const { AudioFileService } = require('../../service/AudioFileService');
const { DetectionService } = require('../../service/DetectionService');
const config = require('config');

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
    const { enableNotifications, customDetectors, globalOverrides, detectorConfigs } = req.detectorConfig;

    // Initialize audio file service
    const audioFileService = new AudioFileService({
        chunkDurationSeconds: 1
    });

    // Initialize detection service in file mode
    const detectionService = new DetectionService({
        audioInterface: null,
        sampleRate: config.audio.sampleRate,
        frequencyScaleFactor: config.audio.frequencyScaleFactor,
        fileMode: true,
        recording: false // Disable recording for API requests
    });

    // Configure detectors using pre-parsed configuration
    const detectors = [];

    detectorConfigs.forEach(detectorConfigObj => {
        const detector = detectionService.addToneDetector(detectorConfigObj);
        detectors.push(detector);
        
        log.debug(`API: Added detector for ${detectorConfigObj.name} with tones ${detectorConfigObj.tones.map(v => `${v}Hz`).join(', ')}`);
    });

    // Track detections
    const detections = [];

    // Listen for tone detections
    const detectionListener = (detection) => {
        const detectionData = {
            detector: detection.detector.name,
            tones: detection.detector.tones,
            timestamp: formatTimestamp(detection.timestamp),
            timestampSeconds: detection.timestamp,
            matchAverages: detection.matchAverages,
            message: detection.message
        };
        
        detections.push(detectionData);
        log.info(`API detection: ${detection.detector.name} detected at ${detectionData.timestamp} (${requestId})`);
    };

    detectionService.on('toneDetected', detectionListener);

    // Process audio chunks
    audioFileService.on('audioData', (audioData) => {
        detectionService.processAudioData({
            timestamp: audioData.timestamp,
            filePath: audioData.filePath,
            audioBuffer: audioData.audioBuffer
        });
    });

    try {
        // Process the file
        await audioFileService.processFile(wavFilePath);
        
        // Clean up event listener
        detectionService.removeListener('toneDetected', detectionListener);
        
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
            processingTimeMs: processingTime,
            detectorsUsed: detectorConfigs.length,
            customConfiguration: {
                enableNotifications,
                customDetectors,
                globalOverrides
            }
        };

        log.info(`API tone detection completed: ${detections.length} detections in ${processingTime}ms (${requestId})`);
        res.json(response);

    } catch (processingError) {
        log.error(`API: Error processing audio data: ${processingError.message} (${requestId})`);
        throw ErrorWithStatusCode.internal(
            `Audio processing failed: ${processingError.message}`,
            'Failed to process uploaded audio file'
        );
    } finally {
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


module.exports = { detectTones };