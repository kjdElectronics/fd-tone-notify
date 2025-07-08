const fs = require('fs');
const path = require('path');
const log = require('../util/logger');
const EventEmitter = require('events');
const { AudioDecoder } = require('./AudioDecoder');

class AudioFileService extends EventEmitter {
    constructor(config = {}) {
        super();
        this.chunkDurationSeconds = config.chunkDurationSeconds || 1;
        this.isProcessing = false;
        this.currentFile = null;
        this.totalDuration = 0;
        this.processedDuration = 0;
    }

    /**
     * Process a single audio file and emit audio chunks with timing information
     * @param {string} filePath - Path to the audio file
     * @returns {Promise} - Resolves when file processing is complete
     */
    async processFile(filePath) {
        if (this.isProcessing) {
            throw new Error('AudioFileService is already processing a file');
        }

        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }

        const fileExtension = path.extname(filePath).toLowerCase();
        if (!AudioDecoder.getSupportedFormats().includes(fileExtension)) {
            throw new Error(`Unsupported file format: ${fileExtension}. Supported formats: ${AudioDecoder.getSupportedFormats().join(', ')}`);
        }

        this.isProcessing = true;
        this.currentFile = filePath;
        this.processedDuration = 0;

        try {
            log.info(`Starting audio file processing: ${filePath}`);

            // Decode the entire file using wav-decoder for consistency
            const decodedAudio = await AudioDecoder.decodeFile(filePath);
            this.totalDuration = decodedAudio.duration;

            log.info(`File duration: ${this.formatDuration(this.totalDuration)}`);

            // Create chunks using the AudioDecoder
            const chunks = AudioDecoder.createChunks(
                decodedAudio.samples,
                decodedAudio.sampleRate,
                this.chunkDurationSeconds,
                filePath
            );

            // Emit chunks in sequence
            for (const chunk of chunks) {
                if (!this.isProcessing) {
                    break; // Stop processing if stop() was called
                }

                this.emit('audioData', chunk);
                this.processedDuration = chunk.timestamp + chunk.duration;
            }

            if (this.isProcessing) {
                log.info(`Completed processing file: ${filePath} (${this.formatDuration(this.totalDuration)})`);
            }

        } catch (error) {
            log.error(`Error processing audio file ${filePath}: ${error.message}`);
            throw error;
        } finally {
            this.isProcessing = false;
            this.currentFile = null;
        }
    }

    /**
     * Get list of audio files from a directory (non-recursive)
     * @param {string} directoryPath - Path to directory
     * @returns {Array<string>} - Array of audio file paths
     */
    getSupportedAudioFilesFromDirectory(directoryPath) {
        if (!fs.existsSync(directoryPath)) {
            throw new Error(`Directory does not exist: ${directoryPath}`);
        }

        const stats = fs.statSync(directoryPath);
        if (!stats.isDirectory()) {
            throw new Error(`Path is not a directory: ${directoryPath}`);
        }

        const files = fs.readdirSync(directoryPath);
        const supportedFormats = AudioDecoder.getSupportedFormats();
        
        const audioFiles = files
            .filter(file => {
                const ext = path.extname(file).toLowerCase();
                return supportedFormats.includes(ext);
            })
            .map(file => path.join(directoryPath, file))
            .filter(filePath => {
                try {
                    return fs.statSync(filePath).isFile();
                } catch (err) {
                    log.warning(`Could not access file: ${filePath}`);
                    return false;
                }
            });

        log.info(`Found ${audioFiles.length} audio files in ${directoryPath}`);
        return audioFiles;
    }

    /**
     * Format duration in seconds to MM:SS.mmm format
     * @private
     */
    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toFixed(3).padStart(6, '0')}`;
    }

    /**
     * Get current processing status
     */
    getStatus() {
        return {
            isProcessing: this.isProcessing,
            currentFile: this.currentFile,
            totalDuration: this.totalDuration,
            processedDuration: this.processedDuration,
            progress: this.totalDuration > 0 ? (this.processedDuration / this.totalDuration) * 100 : 0
        };
    }

    /**
     * Stop processing (if running)
     */
    stop() {
        if (this.isProcessing) {
            log.info('Stopping audio file processing');
            this.isProcessing = false;
            this.currentFile = null;
            this.emit('stopped');
        }
    }

    /**
     * Get supported audio formats
     * @returns {Array<string>} - Array of supported file extensions
     */
    getSupportedFormats() {
        return AudioDecoder.getSupportedFormats();
    }

    /**
     * Gather all supported audio files from the provided paths
     * @param {string} pathsString - Comma-separated list of file paths or directories
     * @returns {Array<string>} - Array of audio file paths
     */
    gatherSupportedAudioFilesFromPaths(pathsString) {
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
                const fileExtension = path.extname(resolvedPath).toLowerCase();
                if (this.getSupportedFormats().includes(fileExtension)) {
                    allFiles.push(resolvedPath);
                } else {
                    console.error(`Skipping unsupported file: ${resolvedPath}`);
                    log.warning(`Skipping unsupported file: ${resolvedPath}`);
                }
            } else if (stats.isDirectory()) {
                // Directory - get all audio files (non-recursive)
                try {
                    const audioFiles = this.getSupportedAudioFilesFromDirectory(resolvedPath);
                    allFiles.push(...audioFiles);
                } catch (error) {
                    log.error(`Error reading directory ${resolvedPath}: ${error.message}`);
                }
            } else { //Should not be possible
                log.error(`Unsupported path type: ${resolvedPath}`);
            }
        }

        // Remove duplicates and sort
        const uniqueFiles = [...new Set(allFiles)].sort();
        return uniqueFiles;
    }
}

module.exports = { AudioFileService };