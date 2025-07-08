const {expect} = require('chai');
const fs = require('fs');
const path = require('path');

// Mock the process.exit to prevent test termination
let originalExit;
let exitCode;

// Import detectFromFiles after mocking
const {detectFromFiles} = require('../../bin/detectFromFiles');

describe('detectFromFiles', function () {
    this.timeout(15000); // Allow time for file processing

    before(function () {
        // Mock process.exit to prevent test termination
        originalExit = process.exit;
        process.exit = function (code) {
            exitCode = code;
            // Don't actually exit during tests
        };
    });

    after(function () {
        // Restore original process.exit
        if (originalExit) {
            process.exit = originalExit;
        }
    });

    beforeEach(function () {
        // Reset exit code
        exitCode = undefined;

        // Ensure temp directories exist
        if (!fs.existsSync('./temp-uploads/')) {
            fs.mkdirSync('./temp-uploads/', {recursive: true});
        }
    });

    afterEach(function () {
        // Clean up any test files
        try {
            const testFiles = fs.readdirSync('./temp-uploads/');
            testFiles.forEach(file => {
                fs.unlinkSync(path.join('./temp-uploads/', file));
            });
        } catch (err) {
            // Ignore cleanup errors
        }
    });

    describe('Single File Processing', function () {
        it('should process a single WAV file and output JSON results', async function () {
            const testFile = path.resolve('./test/wav/dispatch1.wav');

            // Capture stdout and stderr separately
            let capturedStdout = '';
            let capturedStderr = '';
            const originalWrite = process.stdout.write;
            const originalStderrWrite = process.stderr.write;

            process.stdout.write = function (chunk) {
                capturedStdout += chunk;
                return true;
            };

            process.stderr.write = function (chunk) {
                capturedStderr += chunk;
                return true;
            };

            try {
                await detectFromFiles({paths: testFile});

                // Restore stdout and stderr
                process.stdout.write = originalWrite;
                process.stderr.write = originalStderrWrite;

                // The JSON should be in stdout, find the complete JSON block
                // Look for the first { and find its matching }
                const startIndex = capturedStdout.indexOf('{');
                if (startIndex === -1) {
                    console.log('Captured stdout:', capturedStdout);
                    console.log('Captured stderr:', capturedStderr);
                    throw new Error('No JSON output found in captured stdout');
                }

                let braceCount = 0;
                let endIndex = startIndex;
                for (let i = startIndex; i < capturedStdout.length; i++) {
                    if (capturedStdout[i] === '{') braceCount++;
                    if (capturedStdout[i] === '}') braceCount--;
                    if (braceCount === 0) {
                        endIndex = i;
                        break;
                    }
                }

                const jsonString = capturedStdout.substring(startIndex, endIndex + 1);
                const result = JSON.parse(jsonString);

                expect(result).to.have.property('success', true);
                expect(result).to.have.property('totalFiles', 1);
                expect(result).to.have.property('files');
                expect(result.files).to.be.an('array').with.length(1);

                const fileResult = result.files[0];
                expect(fileResult).to.have.property('filename', 'dispatch1.wav');
                expect(fileResult).to.have.property('filepath', testFile);
                expect(fileResult).to.have.property('duration');
                expect(fileResult).to.have.property('durationSeconds');
                expect(fileResult).to.have.property('detections');
                expect(fileResult.detections).to.be.an('array');

            } finally {
                process.stdout.write = originalWrite;
                process.stderr.write = originalStderrWrite;
            }
        });

        it('should handle non-existent files gracefully', async function () {
            const nonExistentFile = './test/wav/does-not-exist.wav';

            // Capture stdout and stderr separately
            let capturedStdout = '';
            let capturedStderr = '';
            const originalWrite = process.stdout.write;
            const originalStderrWrite = process.stderr.write;

            process.stdout.write = function (chunk) {
                capturedStdout += chunk;
                return true;
            };

            process.stderr.write = function (chunk) {
                capturedStderr += chunk;
                return true;
            };

            try {
                await detectFromFiles({paths: nonExistentFile});

                // Restore stdout and stderr
                process.stdout.write = originalWrite;
                process.stderr.write = originalStderrWrite;

                // When no files are found, detectFromFiles still outputs JSON with 0 files
                // But the function returns early, so check if we get JSON or check stderr
                if (capturedStdout.trim() === '') {
                    // No JSON output means no files were processed
                    expect(capturedStderr).to.include('No WAV files found to process');
                } else {
                    const startIndex = capturedStdout.indexOf('{');
                    if (startIndex !== -1) {
                        let braceCount = 0;
                        let endIndex = startIndex;
                        for (let i = startIndex; i < capturedStdout.length; i++) {
                            if (capturedStdout[i] === '{') braceCount++;
                            if (capturedStdout[i] === '}') braceCount--;
                            if (braceCount === 0) {
                                endIndex = i;
                                break;
                            }
                        }
                        const jsonString = capturedStdout.substring(startIndex, endIndex + 1);
                        const result = JSON.parse(jsonString);
                        expect(result).to.have.property('totalFiles', 0);
                        expect(result.files).to.be.an('array').with.length(0);
                    }
                }

            } finally {
                process.stdout.write = originalWrite;
                process.stderr.write = originalStderrWrite;
            }
        });
    });

    describe('Multiple File Processing', function () {
        it('should process multiple files separated by commas', async function () {
            const testFiles = [
                path.resolve('./test/wav/dispatch1.wav'),
                path.resolve('./test/wav/dispatch2.wav')
            ].join(',');

            // Capture stdout and stderr separately
            let capturedStdout = '';
            let capturedStderr = '';
            const originalWrite = process.stdout.write;
            const originalStderrWrite = process.stderr.write;

            process.stdout.write = function (chunk) {
                capturedStdout += chunk;
                return true;
            };

            process.stderr.write = function (chunk) {
                capturedStderr += chunk;
                return true;
            };

            try {
                await detectFromFiles({paths: testFiles});

                // Restore stdout and stderr
                process.stdout.write = originalWrite;
                process.stderr.write = originalStderrWrite;

                // The JSON should be in stdout, find the complete JSON block
                // Look for the first { and find its matching }
                const startIndex = capturedStdout.indexOf('{');
                if (startIndex === -1) {
                    console.log('Captured stdout:', capturedStdout);
                    console.log('Captured stderr:', capturedStderr);
                    throw new Error('No JSON output found in captured stdout');
                }

                let braceCount = 0;
                let endIndex = startIndex;
                for (let i = startIndex; i < capturedStdout.length; i++) {
                    if (capturedStdout[i] === '{') braceCount++;
                    if (capturedStdout[i] === '}') braceCount--;
                    if (braceCount === 0) {
                        endIndex = i;
                        break;
                    }
                }

                const jsonString = capturedStdout.substring(startIndex, endIndex + 1);
                const result = JSON.parse(jsonString);

                expect(result).to.have.property('success', true);
                expect(result).to.have.property('totalFiles', 2);
                expect(result.files).to.be.an('array').with.length(2);

                const filenames = result.files.map(f => f.filename);
                expect(filenames).to.include('dispatch1.wav');
                expect(filenames).to.include('dispatch2.wav');

            } finally {
                process.stdout.write = originalWrite;
                process.stderr.write = originalStderrWrite;
            }
        });

        describe('Error Handling', function () {
            it('should throw error when no paths provided', async function () {
                try {
                    await detectFromFiles({});
                    expect.fail('Should have thrown an error');
                } catch (error) {
                    expect(error.message).to.include('No file paths or directories specified');
                }
            });

            it('should throw error when paths is null', async function () {
                try {
                    await detectFromFiles({paths: null});
                    expect.fail('Should have thrown an error');
                } catch (error) {
                    expect(error.message).to.include('No file paths or directories specified');
                }
            });
        });
    });
});