const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const log = require('../../util/logger');
const { formatTimestamp, formatDuration } = require('../../util/formatters');
const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');
const { TonesDetectorConfig } = require('../../obj/config/TonesDetectorConfig');
const { AudioFileService } = require('../../service/AudioFileService');
const { DetectionService } = require('../../service/DetectionService');
const { AllToneDetectionService } = require('../../service/AllToneDetectionService');
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
    const { enableNotifications, enableAllToneDetector, customDetectors, globalOverrides, detectorConfigs } = req.detectorConfig;

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
        recording: false, // Disable recording for API requests
        areNotificationsEnabled: enableNotifications // Control notifications based on request flag
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
            sampleRate: config.audio.sampleRate,
            tolerancePercent: config.allToneDetector.tolerancePercent,
            rangeOverlapModifier: config.allToneDetector.rangeOverlapModifier,
            matchThreshold: config.allToneDetector.matchThreshold,
            audioInterface: null, // File mode
            frequencyScaleFactor: config.audio.frequencyScaleFactor,
            silenceAmplitude: config.audio.silenceAmplitude,
            logLevel: process.env.FD_LOG_LEVEL || "info",
            fileMode: true
        });
        
        log.debug(`API: Initialized All Tone Detector for range ${config.allToneDetector.startFreq}Hz to ${config.allToneDetector.endFreq}Hz`);
    }

    // Track detections
    const detections = [];
    const allToneDetections = [];

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

    // Listen for multi-tone detections if AllToneDetector is enabled
    let multiToneDetectionListener = null;
    let lastAudioTimestamp = 0; // Track the most recent audio chunk timestamp
    
    if (allToneDetectionService) {
        multiToneDetectionListener = (tones) => {
            // Use the most recent audio timestamp for multi-tone detections
            // This approximates when the tones were detected in the audio file
            const detectionData = {
                detector: 'All Tone Detector',
                tones: tones,
                timestamp: formatTimestamp(lastAudioTimestamp),
                timestampSeconds: lastAudioTimestamp,
                matchAverages: tones,
                message: `Multi-tone detection: ${tones.map(f => `${f}Hz`).join(', ')}`,
                type: 'discovery'
            };
            
            allToneDetections.push(detectionData);
            log.info(`API multi-tone detection: ${tones.map(f => `${f}Hz`).join(', ')} at ~${lastAudioTimestamp}s (${requestId})`);
        };

        allToneDetectionService.on('multiToneDetected', multiToneDetectionListener);
    }

    // Process audio chunks
    audioFileService.on('audioData', (audioData) => {
        const audioDataParams = {
            timestamp: audioData.timestamp,
            filePath: audioData.filePath,
            audioBuffer: audioData.audioBuffer
        }

        // Update the most recent timestamp for AllToneDetector
        lastAudioTimestamp = audioData.timestamp;

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