const { DetectionService } = require("../service/DetectionService");
const { AudioFileService } = require("../service/AudioFileService");
const config = require("config");
const log = require('../util/logger');
const fs = require('fs');
const path = require('path');

/**
 * Detect tones from audio files instead of live audio input
 * @param {Object} options - Configuration options
 * @param {string} options.paths - Comma-separated list of file paths or directories
 */
async function detectFromFiles({ paths } = {}) {
    if (!paths) {
        const errorMsg = 'No file paths or directories specified. Use --detect-from-files <paths>';
        log.error(errorMsg);
        throw new Error(errorMsg);
    }

    log.info('Starting tone detection from audio files');
    
    try {
        // Parse paths and gather all files to process
        const filesToProcess = await gatherFiles(paths);
        
        if (filesToProcess.length === 0) {
            console.error('No WAV files found to process');
            return;
        }

        log.info(`Found ${filesToProcess.length} WAV files to process`);

        // Initialize audio file service
        const audioFileService = new AudioFileService({
            sampleRate: config.audio.sampleRate,
            chunkDurationSeconds: 1
        });

        // Initialize detection service (without audio interface)
        const detectionService = new DetectionService({
            audioInterface: null, // No audio interface for file mode
            silenceAmplitude: config.audio.silenceAmplitude,
            sampleRate: config.audio.sampleRate,
            minRecordingLengthSec: config.audio.minRecordingLengthSec,
            maxRecordingLengthSec: config.audio.maxRecordingLengthSec,
            frequencyScaleFactor: config.audio.frequencyScaleFactor,
            recording: false, // Disable recording in file mode
            fileMode: true // Enable file mode to suppress warnings
        });

        // Add tone detectors from config
        config.detection.detectors.forEach(detectorConfig => {
            const options = {
                name: detectorConfig.name,
                tones: detectorConfig.tones,
                resetTimeoutMs: detectorConfig.resetTimeoutMs ? detectorConfig.resetTimeoutMs : config.detection.defaultResetTimeoutMs,
                lockoutTimeoutMs: detectorConfig.lockoutTimeoutMs ? detectorConfig.lockoutTimeoutMs : config.detection.defaultLockoutTimeoutMs,
                minRecordingLengthSec: detectorConfig.minRecordingLengthSec ? detectorConfig.minRecordingLengthSec : config.detection.minRecordingLengthSec,
                maxRecordingLengthSec: detectorConfig.maxRecordingLengthSec ? detectorConfig.maxRecordingLengthSec : config.detection.maxRecordingLengthSec,
                matchThreshold: detectorConfig.matchThreshold ? detectorConfig.matchThreshold : config.detection.defaultMatchThreshold,
                tolerancePercent: detectorConfig.tolerancePercent ? detectorConfig.tolerancePercent : config.detection.defaultTolerancePercent,
                isRecordingEnabled: false, // Force disable recording for file mode
                notifications: detectorConfig.notifications
            };

            log.info(`Adding Detector for ${options.name} with tones ${options.tones.map(v => `${v}Hz`).join(', ')}. `
                        + `Match Threshold: ${options.matchThreshold}, Tolerance: ${options.tolerancePercent * 100}%`);
            detectionService.addToneDetector(options);
        });

        // Results storage
        const results = {
            success: true,
            processed: new Date().toISOString(),
            totalFiles: filesToProcess.length,
            files: []
        };

        // Process each file
        for (const filePath of filesToProcess) {
            console.error(`Processing file: ${filePath}`);
            
            const fileResult = {
                filename: path.basename(filePath),
                filepath: filePath,
                duration: null,
                detections: []
            };

            try {
                // Track detections for this file
                const fileDetections = [];
                
                // Listen for tone detections
                const detectionListener = (detection) => {
                    fileDetections.push({
                        detector: detection.detector.name,
                        tones: detection.detector.tones,
                        timestamp: formatTimestamp(detection.timestamp),
                        timestampSeconds: detection.timestamp,
                        matchAverages: detection.matchAverages,
                        message: detection.message
                    });
                };

                detectionService.on('toneDetected', detectionListener);

                // Process audio chunks
                audioFileService.on('audioData', (audioData) => {
                    // Convert audio data to format expected by detection service
                    const processedData = {
                        timestamp: audioData.timestamp,
                        duration: audioData.duration,
                        chunkIndex: audioData.chunkIndex,
                        filePath: audioData.filePath,
                        audioBuffer: audioData.audioBuffer
                    };
                    
                    // Feed data to detection service
                    detectionService.processAudioData(processedData);
                });

                // Process the file
                await audioFileService.processFile(filePath);
                
                // Clean up listener
                detectionService.removeListener('toneDetected', detectionListener);
                
                // Get file duration
                const status = audioFileService.getStatus();
                fileResult.duration = formatDuration(status.totalDuration);
                fileResult.durationSeconds = status.totalDuration;
                fileResult.detections = fileDetections;

                log.info(`Completed processing ${filePath}: ${fileDetections.length} detections found`);
                
            } catch (error) {
                log.error(`Error processing file ${filePath}: ${error.message}`);
                fileResult.error = error.message;
            }

            results.files.push(fileResult);
        }

        // Output results as JSON to stdout (clean output)
        console.log(JSON.stringify(results, null, 2) + '\n');
        
        // Summary to stderr
        const totalDetections = results.files.reduce((sum, file) => sum + (file.detections ? file.detections.length : 0), 0);
        log.info(`Processing complete. Total detections: ${totalDetections} across ${results.totalFiles} files`);

    } catch (error) {
        log.error(`Error in detectFromFiles: ${error.message}`);
        throw error;
    }
}

/**
 * Gather all WAV files from the provided paths
 */
async function gatherFiles(pathsString) {
    const paths = pathsString.split(',').map(p => p.trim());
    const allFiles = [];

    for (const inputPath of paths) {
        const resolvedPath = path.resolve(inputPath);
        
        if (!fs.existsSync(resolvedPath)) {
            log.error(`Path does not exist: ${resolvedPath}`);
            continue;
        }

        const stats = fs.statSync(resolvedPath);
        
        if (stats.isFile()) {
            // Single file
            if (path.extname(resolvedPath).toLowerCase() === '.wav') {
                allFiles.push(resolvedPath);
            } else {
                log.warning(`Skipping non-WAV file: ${resolvedPath}`);
            }
        } else if (stats.isDirectory()) {
            // Directory - get all WAV files (non-recursive)
            try {
                const audioFileService = new AudioFileService();
                const wavFiles = audioFileService.getWavFilesFromDirectory(resolvedPath);
                allFiles.push(...wavFiles);
            } catch (error) {
                log.error(`Error reading directory ${resolvedPath}: ${error.message}`);
            }
        } else {
            log.error(`Unsupported path type: ${resolvedPath}`);
        }
    }

    // Remove duplicates and sort
    const uniqueFiles = [...new Set(allFiles)].sort();
    return uniqueFiles;
}

/**
 * Format timestamp in seconds to MM:SS.mmm format
 */
function formatTimestamp(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toFixed(3).padStart(6, '0')}`;
}

/**
 * Format duration in seconds to HH:MM:SS.mmm format
 */
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toFixed(3).padStart(6, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toFixed(3).padStart(6, '0')}`;
    }
}

module.exports = { detectFromFiles };