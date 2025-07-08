const fs = require('fs');
const path = require('path');
const { Reader } = require('wav');
const log = require('../util/logger');
const EventEmitter = require('events');

class AudioFileService extends EventEmitter {
    constructor(config = {}) {
        super();
        this.sampleRate = config.sampleRate || 44100;
        this.chunkDurationSeconds = config.chunkDurationSeconds || 1;
        this.isProcessing = false;
        this.currentFile = null;
        this.totalDuration = 0;
        this.processedDuration = 0;
    }

    /**
     * Process a single WAV file and emit audio chunks with timing information
     * @param {string} filePath - Path to the WAV file
     * @returns {Promise} - Resolves when file processing is complete
     */
    async processFile(filePath) {
        return new Promise((resolve, reject) => {
            if (this.isProcessing) {
                return reject(new Error('AudioFileService is already processing a file'));
            }

            if (!fs.existsSync(filePath)) {
                return reject(new Error(`File does not exist: ${filePath}`));
            }

            if (path.extname(filePath).toLowerCase() !== '.wav') {
                return reject(new Error(`Unsupported file format. Only WAV files are supported: ${filePath}`));
            }

            this.isProcessing = true;
            this.currentFile = filePath;
            this.processedDuration = 0;

            log.info(`Starting audio file processing: ${filePath}`);

            const fileReader = new Reader();
            let audioBuffer = [];
            let samplesPerChunk = this.sampleRate * this.chunkDurationSeconds;
            let chunkIndex = 0;
            let readStream = null;

            // Store references for cleanup
            this._currentReader = fileReader;
            this._currentStream = null;

            fileReader.on('format', (format) => {
                log.debug(`Audio format - Sample Rate: ${format.sampleRate}Hz, Channels: ${format.channels}, Bit Depth: ${format.bitDepth}`);
                
                // Validate format compatibility
                if (format.sampleRate !== this.sampleRate) {
                    log.warning(`File sample rate (${format.sampleRate}Hz) differs from expected (${this.sampleRate}Hz). Results may be affected.`);
                }

                // Calculate total duration
                const stats = fs.statSync(filePath);
                const bytesPerSample = format.bitDepth / 8;
                const totalSamples = (stats.size - 44) / (bytesPerSample * format.channels); // Subtract WAV header size
                this.totalDuration = totalSamples / format.sampleRate;
                
                log.info(`File duration: ${this.formatDuration(this.totalDuration)}`);
            });

            fileReader.on('data', (chunk) => {
                // Check if we've been stopped
                if (!this.isProcessing) {
                    return;
                }

                // Convert chunk to the format expected by the detection service
                const samples = this._convertChunkToSamples(chunk);
                audioBuffer.push(...samples);

                // Process complete chunks
                while (audioBuffer.length >= samplesPerChunk && this.isProcessing) {
                    const chunkData = audioBuffer.splice(0, samplesPerChunk);
                    const timestamp = chunkIndex * this.chunkDurationSeconds;
                    
                    this.emit('audioData', {
                        audioBuffer: Buffer.from(new Int16Array(chunkData).buffer),
                        timestamp: timestamp,
                        duration: this.chunkDurationSeconds,
                        chunkIndex: chunkIndex,
                        filePath: filePath
                    });

                    chunkIndex++;
                    this.processedDuration = timestamp + this.chunkDurationSeconds;
                }
            });

            fileReader.on('end', () => {
                // Only process if we haven't been stopped
                if (this.isProcessing) {
                    // Process any remaining audio data
                    if (audioBuffer.length > 0) {
                        const timestamp = chunkIndex * this.chunkDurationSeconds;
                        const actualDuration = audioBuffer.length / this.sampleRate;
                        
                        // Pad to chunk size if needed
                        while (audioBuffer.length < samplesPerChunk) {
                            audioBuffer.push(0);
                        }

                        this.emit('audioData', {
                            audioBuffer: Buffer.from(new Int16Array(audioBuffer).buffer),
                            timestamp: timestamp,
                            duration: actualDuration,
                            chunkIndex: chunkIndex,
                            filePath: filePath,
                            isLastChunk: true
                        });
                    }

                    log.info(`Completed processing file: ${filePath} (${this.formatDuration(this.totalDuration)})`);
                    this.isProcessing = false;
                    this.currentFile = null;
                    this._currentReader = null;
                    this._currentStream = null;
                    resolve();
                }
            });

            fileReader.on('error', (error) => {
                log.error(`Error processing audio file ${filePath}: ${error.message}`);
                this.isProcessing = false;
                this.currentFile = null;
                this._currentReader = null;
                this._currentStream = null;
                reject(error);
            });

            // Start reading the file
            readStream = fs.createReadStream(filePath);
            this._currentStream = readStream;
            readStream.pipe(fileReader);
        });
    }

    /**
     * Get list of WAV files from a directory (non-recursive)
     * @param {string} directoryPath - Path to directory
     * @returns {Array<string>} - Array of WAV file paths
     */
    getWavFilesFromDirectory(directoryPath) {
        if (!fs.existsSync(directoryPath)) {
            throw new Error(`Directory does not exist: ${directoryPath}`);
        }

        const stats = fs.statSync(directoryPath);
        if (!stats.isDirectory()) {
            throw new Error(`Path is not a directory: ${directoryPath}`);
        }

        const files = fs.readdirSync(directoryPath);
        const wavFiles = files
            .filter(file => path.extname(file).toLowerCase() === '.wav')
            .map(file => path.join(directoryPath, file))
            .filter(filePath => {
                try {
                    return fs.statSync(filePath).isFile();
                } catch (err) {
                    log.warning(`Could not access file: ${filePath}`);
                    return false;
                }
            });

        log.info(`Found ${wavFiles.length} WAV files in ${directoryPath}`);
        return wavFiles;
    }

    /**
     * Convert raw audio chunk to samples array
     * @private
     */
    _convertChunkToSamples(chunk) {
        const samples = [];
        // Assuming 16-bit PCM data
        for (let i = 0; i < chunk.length; i += 2) {
            if (i + 1 < chunk.length) {
                const sample = chunk.readInt16LE(i);
                samples.push(sample);
            }
        }
        return samples;
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
            
            // Clean up streams
            if (this._currentStream) {
                this._currentStream.destroy();
                this._currentStream = null;
            }
            if (this._currentReader) {
                this._currentReader = null;
            }
            
            this.emit('stopped');
        }
    }
}

module.exports = { AudioFileService };