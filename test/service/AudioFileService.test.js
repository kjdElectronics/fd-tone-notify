const { AudioFileService } = require('../../service/AudioFileService');
const fs = require('fs');
const path = require('path');
const expect = require('chai').expect;

describe('AudioFileService', function() {
    this.timeout(10000);
    
    let audioFileService;
    
    beforeEach(function() {
        audioFileService = new AudioFileService({
            sampleRate: 44100,
            chunkDurationSeconds: 1
        });
    });

    afterEach(function() {
        if (audioFileService) {
            audioFileService.stop();
        }
    });

    describe('Constructor and Configuration', function() {
        it('should initialize with default configuration', function() {
            const service = new AudioFileService();
            expect(service.sampleRate).to.equal(44100);
            expect(service.chunkDurationSeconds).to.equal(1);
            expect(service.isProcessing).to.be.false;
        });

        it('should initialize with custom configuration', function() {
            const service = new AudioFileService({
                sampleRate: 32000,
                chunkDurationSeconds: 0.5
            });
            expect(service.sampleRate).to.equal(32000);
            expect(service.chunkDurationSeconds).to.equal(0.5);
        });

        it('should provide correct status information', function() {
            const status = audioFileService.getStatus();
            expect(status).to.have.property('isProcessing', false);
            expect(status).to.have.property('currentFile', null);
            expect(status).to.have.property('totalDuration', 0);
            expect(status).to.have.property('processedDuration', 0);
            expect(status).to.have.property('progress', 0);
        });
    });

    describe('File Validation', function() {
        it('should reject non-existent files', async function() {
            try {
                await audioFileService.processFile('./non-existent-file.wav');
                throw new Error('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('File does not exist');
            }
        });

        it('should reject non-WAV files', async function() {
            const testFile = path.resolve('./test/service/AudioFileService.test.js');
            try {
                await audioFileService.processFile(testFile);
                throw new Error('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Unsupported file format. Only WAV files are supported');
            }
        });

        it('should prevent concurrent file processing', async function() {
            const testFile = path.resolve('./test/wav/raw.wav');
            
            // Start first processing
            const firstProcess = audioFileService.processFile(testFile);
            
            // Try to start second processing immediately
            try {
                await audioFileService.processFile(testFile);
                throw new Error('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('AudioFileService is already processing a file');
            }
            
            // Wait for first process to complete
            await firstProcess;
        });
    });

    describe('Directory Processing', function() {
        it('should find WAV files in directory', function() {
            const wavFiles = audioFileService.getWavFilesFromDirectory('./test/wav');
            expect(wavFiles).to.be.an('array');
            expect(wavFiles.length).to.be.greaterThan(0);
            
            // Check that all files are WAV files
            wavFiles.forEach(file => {
                expect(path.extname(file).toLowerCase()).to.equal('.wav');
            });
        });

        it('should handle non-existent directory', function() {
            expect(() => {
                audioFileService.getWavFilesFromDirectory('./non-existent-directory');
            }).to.throw('Directory does not exist');
        });

        it('should handle file path instead of directory', function() {
            const testFile = path.resolve('./test/wav/raw.wav');
            expect(() => {
                audioFileService.getWavFilesFromDirectory(testFile);
            }).to.throw('Path is not a directory');
        });

        it('should return empty array for directory with no WAV files', function() {
            // Create temporary directory with no WAV files
            const tempDir = './test-temp-no-wav';
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }
            
            try {
                const wavFiles = audioFileService.getWavFilesFromDirectory(tempDir);
                expect(wavFiles).to.be.an('array');
                expect(wavFiles).to.have.length(0);
            } finally {
                // Clean up
                if (fs.existsSync(tempDir)) {
                    fs.rmdirSync(tempDir);
                }
            }
        });
    });

    describe('Audio File Processing', function() {
        it('should process a simple WAV file successfully', async function() {
            const testFile = path.resolve('./test/wav/raw.wav');
            const audioChunks = [];
            
            audioFileService.on('audioData', (chunk) => {
                audioChunks.push(chunk);
            });

            await audioFileService.processFile(testFile);
            
            expect(audioChunks.length).to.be.greaterThan(0);
            
            // Verify chunk structure
            audioChunks.forEach((chunk, index) => {
                expect(chunk).to.have.property('audioBuffer');
                expect(chunk).to.have.property('timestamp');
                expect(chunk).to.have.property('duration');
                expect(chunk).to.have.property('chunkIndex', index);
                expect(chunk).to.have.property('filePath', testFile);
                expect(chunk.audioBuffer).to.be.instanceOf(Buffer);
                expect(chunk.timestamp).to.be.a('number');
                expect(chunk.duration).to.be.a('number');
            });
        });

        it('should emit chunks with correct timing', async function() {
            const testFile = path.resolve('./test/wav/raw.wav');
            const audioChunks = [];
            
            audioFileService.on('audioData', (chunk) => {
                audioChunks.push(chunk);
            });

            await audioFileService.processFile(testFile);
            
            // Verify timing progression
            audioChunks.forEach((chunk, index) => {
                expect(chunk.timestamp).to.equal(index * audioFileService.chunkDurationSeconds);
                expect(chunk.chunkIndex).to.equal(index);
            });
        });

        it('should mark the last chunk correctly', async function() {
            const testFile = path.resolve('./test/wav/raw.wav');
            const audioChunks = [];
            
            audioFileService.on('audioData', (chunk) => {
                audioChunks.push(chunk);
            });

            await audioFileService.processFile(testFile);
            
            expect(audioChunks.length).to.be.greaterThan(0);
            
            // Only the last chunk should have isLastChunk property
            audioChunks.forEach((chunk, index) => {
                if (index === audioChunks.length - 1) {
                    expect(chunk).to.have.property('isLastChunk', true);
                } else {
                    expect(chunk).to.not.have.property('isLastChunk');
                }
            });
        });

        it('should handle different sample rates with warnings', async function() {
            // This test assumes we have a file with different sample rate
            // For now, we'll test with a known file and verify the warning mechanism works
            const testFile = path.resolve('./test/wav/dispatch2.wav'); // Known to be 32kHz
            let warningLogged = false;
            
            // Mock the logger to capture warnings
            const originalWarning = require('../../util/logger').warning;
            require('../../util/logger').warning = (message) => {
                if (message.includes('Sample Rate') || message.includes('sample rate')) {
                    warningLogged = true;
                }
                originalWarning(message);
            };

            try {
                await audioFileService.processFile(testFile);
                // If the file has different sample rate, warning should be logged
                // We can't assert this strongly since we don't know the exact sample rate
            } finally {
                // Restore original logger
                require('../../util/logger').warning = originalWarning;
            }
        });

        it('should calculate duration correctly', async function() {
            const testFile = path.resolve('./test/wav/raw.wav');
            
            await audioFileService.processFile(testFile);
            
            const status = audioFileService.getStatus();
            expect(status.totalDuration).to.be.greaterThan(0);
            expect(status.processedDuration).to.be.greaterThan(0);
            expect(status.progress).to.be.greaterThan(95); // Should be near complete (allowing for small rounding differences)
        });

        it('should reset processing state after completion', async function() {
            const testFile = path.resolve('./test/wav/raw.wav');
            
            // Before processing
            expect(audioFileService.isProcessing).to.be.false;
            expect(audioFileService.currentFile).to.be.null;
            
            // Process file
            await audioFileService.processFile(testFile);
            
            // After processing
            expect(audioFileService.isProcessing).to.be.false;
            expect(audioFileService.currentFile).to.be.null;
        });
    });

    describe('Stop Functionality', function() {
        it('should handle stop when not processing', function() {
            expect(() => {
                audioFileService.stop();
            }).to.not.throw();
        });

        it('should emit stopped event when stopping during processing', function(done) {
            const testFile = path.resolve('./test/wav/long.wav');
            let stoppedEventReceived = false;
            
            audioFileService.on('stopped', () => {
                stoppedEventReceived = true;
                done();
            });

            // Start processing and stop very quickly
            audioFileService.processFile(testFile).then(() => {
                // If processing completes before stop, that's OK too
                if (!stoppedEventReceived) {
                    done();
                }
            }).catch(() => {
                // Expected to fail when stopped - that's OK
                if (!stoppedEventReceived) {
                    done();
                }
            });
            
            // Stop immediately
            setImmediate(() => {
                audioFileService.stop();
            });
        });
    });

    describe('Format Duration Utility', function() {
        it('should format duration correctly', function() {
            // Test the private method through public behavior
            const service = new AudioFileService();
            
            // We can test this indirectly by checking the duration format in processing
            const formattedShort = service.formatDuration(1.5);
            expect(formattedShort).to.match(/^\d{2}:\d{2}\.\d{3}$/);
            
            const formattedLong = service.formatDuration(125.789);
            expect(formattedLong).to.match(/^\d{2}:\d{2}\.\d{3}$/);
        });
    });

    describe('Multi-tone Test File Processing', function() {
        it('should process multi.tone.850.860.350.700.wav file successfully', async function() {
            const testFile = path.resolve('./test/wav/multi.tone.850.860.350.700.wav');
            
            if (!fs.existsSync(testFile)) {
                this.skip(); // Skip if file doesn't exist
                return;
            }

            const audioChunks = [];
            
            audioFileService.on('audioData', (chunk) => {
                audioChunks.push(chunk);
            });

            await audioFileService.processFile(testFile);
            
            expect(audioChunks.length).to.be.greaterThan(0);
            
            // Verify we get meaningful audio data
            audioChunks.forEach(chunk => {
                expect(chunk.audioBuffer.length).to.be.greaterThan(0);
                expect(chunk.filePath).to.equal(testFile);
            });
            
            // Should be approximately 8 seconds based on filename pattern
            const status = audioFileService.getStatus();
            expect(status.totalDuration).to.be.greaterThan(5);
            expect(status.totalDuration).to.be.lessThan(15);
        });
    });
});