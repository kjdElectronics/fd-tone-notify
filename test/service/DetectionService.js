require('dotenv').config();
const expect  = require("chai").expect;
const sinon = require('sinon');
const axios = require('axios');
const fs = require('fs');
const WavDecoder = require('wav-decoder');
const path = require('path');
const { AudioFileService } = require('../../service/AudioFileService');
const decode = async (buffer) => {
    const decoded = await WavDecoder.decode(buffer);
    return decoded.channelData[0];
};

process.env.FD_LOG_LEVEL = "silly"; //Force silly log level

const {DetectionService} = require('../../service/DetectionService');
const {TonesDetectorConfig} = require("../../obj/config/TonesDetectorConfig");
const {SourceContext} = require("../../obj/SourceContext");
const DYNAMIC_TEST_ARGS = [
    {filename: "raw.wav", tones: [911, 2934], sampleRate: 44100, frequencyScaleFactor: 1},
    {filename: "dispatch1.wav", tones: [567, 378], sampleRate: 44100, frequencyScaleFactor: 1},
    {filename: "six_tone.wav", tones: [602, 926, 602, 636, 636, 602], sampleRate: 32000, frequencyScaleFactor: 1},
    {filename: "dispatch2.wav", tones: [823, 2385], sampleRate: 32000, frequencyScaleFactor: 1},
    {filename: "multi.tone.850.860.350.700.wav", tones: [850, 860, 350, 700], sampleRate: 44100, frequencyScaleFactor: 1},
];

describe("DetectionService", function() {
    this.timeout(10000);

    DYNAMIC_TEST_ARGS.forEach(testArg => {
        const freqsString = getFreqString(testArg.tones);
        it(`should be able detect tones in ${testArg.filename}. Actual: ${freqsString}`, async function() {
            return generateTest({...testArg, freqsString});
        });
    });

    it(`should be able detect tones in ARGS[0] when data is sliced into small pieces`, async function() {
        const args = DYNAMIC_TEST_ARGS[0];
        const rawFile = fs.readFileSync(path.resolve("./test/wav", args.filename) );
        const data = await decode(rawFile);

        const detection = new DetectionService({micInputStream: null, sampleRate: args.sampleRate, frequencyScaleFactor: args.frequencyScaleFactor, notifications: false});
        const detector = detection.addToneDetector(new TonesDetectorConfig({name: `Test Tone`, tones: args.tones}));

        const SLICE_SIZE = 100;
        const dataSlices = [];
        let currentSlice = [];
        data.forEach(dataItem => {
            currentSlice.push(dataItem);
            if(currentSlice.length >= SLICE_SIZE) {
                dataSlices.push(currentSlice);
                currentSlice = [];
            }
        });

        return new Promise((resolve, reject) => {
            //Fail if event not triggered
            const failTimeout = setTimeout(() => {
                reject(new Error("Tone Not Detected within Expected Timeframe"));
            } , 5000);
            //Setup pass condition
            detector.on("toneDetected", () => {
                clearTimeout(failTimeout);
                console.log("PASS");
                resolve();
            });
            //Process data in small chuncks
            dataSlices.forEach(slice => detection.__processData(slice));
        });
    });

    it(`should be not able detect tones in ARGS[0] when too long passes after first tone is detected`, async function() {
        const TIMEOUT = 1000;
        const CHUNCKS_TO_PROCESS = 800;
        const args = DYNAMIC_TEST_ARGS[0];
        const rawFile = fs.readFileSync(path.resolve("./test/wav", args.filename) );
        const data = await decode(rawFile);

        const detection = new DetectionService({
            micInputStream: null,
            sampleRate: args.sampleRate,
            frequencyScaleFactor:
            args.frequencyScaleFactor,
            notifications: false,
        });
        const detector = detection.addToneDetector(new TonesDetectorConfig({name: `Test Tone`, tones: args.tones, resetTimeoutMs: TIMEOUT}));

        const SLICE_SIZE = 100;
        const dataSlices = [];
        let currentSlice = [];
        data.forEach(dataItem => {
            if(dataSlices.length >= CHUNCKS_TO_PROCESS)
                return;
            currentSlice.push(dataItem);
            if(currentSlice.length >= SLICE_SIZE) {
                dataSlices.push(currentSlice);
                currentSlice = [];
            }
        });

        return new Promise((resolve, reject) => {
            //Fail if event not triggered
            const failTimeout = setTimeout(() => {
                console.log("PASS. Tone Not Detected");
                resolve();
            } , TIMEOUT * 1.5);
            //Setup pass condition
            detector.on("toneDetected", () => {
                clearTimeout(failTimeout);
                console.log("FAIL");
                reject(new Error("Tone Was Detected"));
            });
            //Process data in small chuncks
            dataSlices.forEach(slice => detection.__processData(slice));
        });
    });

    it(`should correctly calculate isRecordingEnabled`, async function() {
        const args = DYNAMIC_TEST_ARGS[0];
        let detection = new DetectionService({micInputStream: null, sampleRate: args.sampleRate, frequencyScaleFactor: args.frequencyScaleFactor, notifications: false});
        //isRecordingEnabled was not specified in args
        //When not specified at global level calculated value should match detector value
        expect(detection._isRecordingEnabled(true)).to.be.true;
        expect(detection._isRecordingEnabled(false)).to.be.false;
        //When not specified in either location should default to true
        expect(detection._isRecordingEnabled(null)).to.be.true;

        //Set to false at the service level
        detection = new DetectionService({recording: false, micInputStream: null, sampleRate: args.sampleRate, frequencyScaleFactor: args.frequencyScaleFactor, notifications: false});
        expect(detection._isRecordingEnabled(true)).to.be.true; //Should override
        expect(detection._isRecordingEnabled(false)).to.be.false; //Should override
        //When not specified in either location should default to true
        expect(detection._isRecordingEnabled(null)).to.be.false; //Should fallback to service

        //Set to true at the service level
        detection = new DetectionService({recording: true, micInputStream: null, sampleRate: args.sampleRate, frequencyScaleFactor: args.frequencyScaleFactor, notifications: false});
        expect(detection._isRecordingEnabled(true)).to.be.true; //Should override
        expect(detection._isRecordingEnabled(false)).to.be.false; //Should override
        //When not specified in either location should default to true
        expect(detection._isRecordingEnabled(null)).to.be.true; //Should fallback to service
    });

    describe('File Mode Functionality', function() {
        it('should initialize in file mode without audio interface warnings', function() {
            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: 44100,
                frequencyScaleFactor: 1,
                fileMode: true,
                recording: false
            });
            
            expect(detection._fileMode).to.be.true;
            expect(detection._audioInterface).to.be.null;
        });

        it('should include file context in detection events for file mode', function(done) {
            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: 44100,
                frequencyScaleFactor: 1,
                fileMode: true,
                recording: false
            });

            const testFilePath = '/test/path/test-file.wav';
            const testTimestamp = 0; // fake

            detection.on('toneDetected', (detectionData) => {
                expect(detectionData).to.have.property('uuid');
                expect(detectionData).to.have.property('detector');
                expect(detectionData.detector.name).eq('File Context Test');
                expect(detectionData).to.have.property('fileTimestamp', testTimestamp);
                expect(detectionData).to.have.property('filePath', testFilePath);
                expect(detectionData).to.have.property('detectedAt');
                expect(detectionData).to.have.property('sourceContext');
                // detectedAt should be a valid ISO string (wall-clock time, not file-relative)
                expect(new Date(detectionData.detectedAt).getFullYear()).to.be.greaterThan(2020);
                done();
            });

            const testTones = [800, 1200];
            detection.addToneDetector(new TonesDetectorConfig({
                name: 'File Context Test',
                tones: testTones,
                matchThreshold: 1,
                tolerancePercent: 0.1
            }));

            // Generate synthetic 1000Hz tone
            const sampleRate = 44100;
            const duration = 2;
            const samples = sampleRate * duration;
            const audioData = new Int16Array(samples);

            for (let i = 0; i < samples; i++) {
                const t = i / sampleRate;
                if(i <= samples/2)
                    audioData[i] = 0.5 * 32767 * Math.sin(2 * Math.PI * testTones[0] * t);
                else
                    audioData[i] = 0.5 * 32767 * Math.sin(2 * Math.PI * testTones[1] * t);
            }

            const buffer = Buffer.from(audioData.buffer);
            detection.processAudioData({
                audioBuffer: buffer,
                timestamp: testTimestamp,
                filePath: testFilePath
            });
        });

        it('should throw error when using processAudioData outside file mode', function() {
            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: 44100,
                frequencyScaleFactor: 1,
                fileMode: false, // Not in file mode
                recording: false
            });

            expect(() => {
                detection.processAudioData({
                    audioBuffer: Buffer.alloc(1024),
                    timestamp: 0,
                    filePath: 'test.wav'
                });
            }).to.throw('processAudioData can only be used in file mode');
        });
    });

    describe('system-wide detection webhook', function() {
        let originalUrl, originalSecret;

        beforeEach(function() {
            originalUrl = process.env.FD_DETECTION_WEBHOOK_URL;
            originalSecret = process.env.FD_DETECTION_WEBHOOK_SECRET;
            process.env.FD_DETECTION_WEBHOOK_URL = 'http://localhost:9999/webhook';
            process.env.FD_DETECTION_WEBHOOK_SECRET = 'test-secret';
        });

        afterEach(function() {
            sinon.restore();
            if (originalUrl === undefined) delete process.env.FD_DETECTION_WEBHOOK_URL;
            else process.env.FD_DETECTION_WEBHOOK_URL = originalUrl;
            if (originalSecret === undefined) delete process.env.FD_DETECTION_WEBHOOK_SECRET;
            else process.env.FD_DETECTION_WEBHOOK_SECRET = originalSecret;
        });

        it('should fire the webhook with detectorId/tones/matchAverages/source.type="mic", independent of per-detector notification config', async function() {
            const postStub = sinon.stub(axios, 'post').resolves({ status: 200, data: 'ok' });
            const args = DYNAMIC_TEST_ARGS[0]; // raw.wav, tones [911, 2934]
            const filePath = path.resolve("./test/wav", args.filename);
            const audioFileService = new AudioFileService({ chunkDurationSeconds: 1 });

            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: args.sampleRate,
                frequencyScaleFactor: args.frequencyScaleFactor,
                fileMode: true,
                recording: false,
                sourceContext: SourceContext.live() // exercise the mic mapping regardless of the audio pipeline used in this test
            });

            detection.addToneDetector(new TonesDetectorConfig({
                id: '11111111-1111-4111-8111-111111111111',
                name: 'Webhook Independence Test',
                tones: args.tones,
                matchThreshold: 6,
                tolerancePercent: 0.05
                // Deliberately no `notifications` configured on this detector
            }));

            await new Promise((resolve, reject) => {
                const failTimeout = setTimeout(() => reject(new Error('Timeout: toneDetected not fired')), 8000);

                detection.on('toneDetected', () => {
                    clearTimeout(failTimeout);
                    resolve();
                });

                audioFileService.on('audioData', (audioData) => detection.processAudioData(audioData));
                audioFileService.processFile(filePath).catch(reject);
            });

            expect(postStub.calledOnce).to.be.true;
            const payload = JSON.parse(postStub.getCall(0).args[1]);
            expect(payload.event).to.equal('detection');
            expect(payload.detectorId).to.equal('11111111-1111-4111-8111-111111111111');
            expect(payload.detectorName).to.equal('Webhook Independence Test');
            expect(payload.tones).to.deep.equal(args.tones);
            expect(payload.matchAverages).to.be.an('array').with.length(2);
            expect(payload.source).to.have.property('type', 'mic');
            expect(payload.recordingRelativePath).to.be.null;
            expect(payload.fdtnVersion).to.be.a('string');
        });

        it('should map an Rdio sourceContext to source.type="rdio" and include talkgroup metadata', async function() {
            const postStub = sinon.stub(axios, 'post').resolves({ status: 200, data: 'ok' });
            const args = DYNAMIC_TEST_ARGS[0];
            const filePath = path.resolve("./test/wav", args.filename);
            const audioFileService = new AudioFileService({ chunkDurationSeconds: 1 });
            const sourceContext = SourceContext.fromRdioMetadata({
                dateTime: '1712754541',
                talkgroupLabel: 'Fire Dispatch',
                talkgroup: '1001'
            });

            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: args.sampleRate,
                frequencyScaleFactor: args.frequencyScaleFactor,
                fileMode: true,
                recording: false,
                sourceContext
            });

            detection.addToneDetector(new TonesDetectorConfig({
                name: 'Rdio Webhook Test',
                tones: args.tones,
                matchThreshold: 6,
                tolerancePercent: 0.05
            }));

            await new Promise((resolve, reject) => {
                const failTimeout = setTimeout(() => reject(new Error('Timeout: toneDetected not fired')), 8000);

                detection.on('toneDetected', () => {
                    clearTimeout(failTimeout);
                    resolve();
                });

                audioFileService.on('audioData', (audioData) => detection.processAudioData(audioData));
                audioFileService.processFile(filePath).catch(reject);
            });

            expect(postStub.calledOnce).to.be.true;
            const payload = JSON.parse(postStub.getCall(0).args[1]);
            expect(payload.source).to.have.property('type', 'rdio');
            expect(payload.source).to.have.nested.property('talkgroup.label', 'Fire Dispatch');
        });

        it('should include sourceId/sourceName in the webhook payload for a per-source-ingest-key Rdio call', async function() {
            const postStub = sinon.stub(axios, 'post').resolves({ status: 200, data: 'ok' });
            const args = DYNAMIC_TEST_ARGS[0];
            const filePath = path.resolve("./test/wav", args.filename);
            const audioFileService = new AudioFileService({ chunkDurationSeconds: 1 });
            const sourceContext = SourceContext.fromRdioMetadata({
                dateTime: '1712754541',
                talkgroupLabel: 'Fire Dispatch',
                talkgroup: '1001',
                sourceId: 'a1b2c3d4e5f60718',
                sourceName: 'Rdio Source A'
            });

            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: args.sampleRate,
                frequencyScaleFactor: args.frequencyScaleFactor,
                fileMode: true,
                recording: false,
                sourceContext
            });

            detection.addToneDetector(new TonesDetectorConfig({
                name: 'Per-Source Webhook Test',
                tones: args.tones,
                matchThreshold: 6,
                tolerancePercent: 0.05
            }));

            await new Promise((resolve, reject) => {
                const failTimeout = setTimeout(() => reject(new Error('Timeout: toneDetected not fired')), 8000);

                detection.on('toneDetected', () => {
                    clearTimeout(failTimeout);
                    resolve();
                });

                audioFileService.on('audioData', (audioData) => detection.processAudioData(audioData));
                audioFileService.processFile(filePath).catch(reject);
            });

            expect(postStub.calledOnce).to.be.true;
            const payload = JSON.parse(postStub.getCall(0).args[1]);
            expect(payload.source).to.have.property('sourceId', 'a1b2c3d4e5f60718');
            expect(payload.source).to.have.property('sourceName', 'Rdio Source A');
        });

        it('should not send the webhook when FD_DETECTION_WEBHOOK_URL is unset', async function() {
            delete process.env.FD_DETECTION_WEBHOOK_URL;
            const postStub = sinon.stub(axios, 'post').resolves({ status: 200, data: 'ok' });
            const args = DYNAMIC_TEST_ARGS[0];
            const filePath = path.resolve("./test/wav", args.filename);
            const audioFileService = new AudioFileService({ chunkDurationSeconds: 1 });

            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: args.sampleRate,
                frequencyScaleFactor: args.frequencyScaleFactor,
                fileMode: true,
                recording: false
            });

            detection.addToneDetector(new TonesDetectorConfig({
                name: 'No Webhook Test',
                tones: args.tones,
                matchThreshold: 6,
                tolerancePercent: 0.05
            }));

            await new Promise((resolve, reject) => {
                const failTimeout = setTimeout(() => reject(new Error('Timeout: toneDetected not fired')), 8000);

                detection.on('toneDetected', () => {
                    clearTimeout(failTimeout);
                    resolve();
                });

                audioFileService.on('audioData', (audioData) => detection.processAudioData(audioData));
                audioFileService.processFile(filePath).catch(reject);
            });

            expect(postStub.called).to.be.false;
        });
    });

    describe('sourceContext and timestamp resolution', function() {
        it('should default sourceContext to file-upload in file mode', function() {
            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: 44100,
                frequencyScaleFactor: 1,
                fileMode: true,
                recording: false
            });

            expect(detection.sourceContext).to.be.an.instanceOf(SourceContext);
            expect(detection.sourceContext.source).to.equal('file-upload');
        });

        it('should default sourceContext to live when not in file mode', function() {
            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: 44100,
                frequencyScaleFactor: 1,
                fileMode: false,
                recording: false
            });

            expect(detection.sourceContext).to.be.an.instanceOf(SourceContext);
            expect(detection.sourceContext.source).to.equal('live');
        });

        it('should use provided SourceContext', function() {
            const sourceContext = SourceContext.fromRdioMetadata({ dateTime: '1712754541', talkgroupLabel: 'Fire' });
            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: 44100,
                frequencyScaleFactor: 1,
                fileMode: true,
                recording: false,
                sourceContext
            });

            expect(detection.sourceContext).to.equal(sourceContext);
            expect(detection.sourceContext.source).to.equal('rdio');
        });

        it('should include sourceContext in emitted toneDetected event with Rdio timestamp', async function() {
            const sourceContext = SourceContext.fromRdioMetadata({
                dateTime: '1712754541',
                talkgroupLabel: 'Fire Dispatch'
            });
            const filePath = path.resolve("./test/wav", DYNAMIC_TEST_ARGS[0].filename);
            const audioFileService = new AudioFileService({ chunkDurationSeconds: 1 });
            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: DYNAMIC_TEST_ARGS[0].sampleRate,
                frequencyScaleFactor: DYNAMIC_TEST_ARGS[0].frequencyScaleFactor,
                fileMode: true,
                recording: false,
                sourceContext
            });

            detection.addToneDetector(new TonesDetectorConfig({
                name: 'SourceContext Test',
                tones: DYNAMIC_TEST_ARGS[0].tones,
                matchThreshold: 6,
                tolerancePercent: 0.05
            }));

            return new Promise((resolve, reject) => {
                const failTimeout = setTimeout(() => reject(new Error('Timeout: toneDetected not fired')), 5000);

                detection.on('toneDetected', (detectionData) => {
                    clearTimeout(failTimeout);
                    try {
                        expect(detectionData.sourceContext.source).to.equal('rdio');
                        expect(detectionData).to.have.property('detectedAt');
                        const detectedDate = new Date(detectionData.detectedAt);
                        expect(detectedDate.getFullYear()).to.equal(2024);
                        resolve();
                    } catch (e) { reject(e); }
                });

                audioFileService.on('audioData', (audioData) => {
                    detection.processAudioData(audioData);
                });

                audioFileService.processFile(filePath).catch(reject);
            });
        });

        it('should default to file-upload sourceContext when none is provided', async function() {
            const filePath = path.resolve("./test/wav", DYNAMIC_TEST_ARGS[0].filename);
            const audioFileService = new AudioFileService({ chunkDurationSeconds: 1 });
            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: DYNAMIC_TEST_ARGS[0].sampleRate,
                frequencyScaleFactor: DYNAMIC_TEST_ARGS[0].frequencyScaleFactor,
                fileMode: true,
                recording: false
            });

            detection.addToneDetector(new TonesDetectorConfig({
                name: 'Default Context Test',
                tones: DYNAMIC_TEST_ARGS[0].tones,
                matchThreshold: 6,
                tolerancePercent: 0.05
            }));

            return new Promise((resolve, reject) => {
                const failTimeout = setTimeout(() => reject(new Error('Timeout: toneDetected not fired')), 5000);

                detection.on('toneDetected', (detectionData) => {
                    clearTimeout(failTimeout);
                    try {
                        expect(detectionData.sourceContext.source).to.equal('file-upload');
                        expect(detectionData).to.have.property('detectedAt');
                        expect(new Date(detectionData.detectedAt).getFullYear()).to.be.greaterThan(2020);
                        resolve();
                    } catch (e) { reject(e); }
                });

                audioFileService.on('audioData', (audioData) => {
                    detection.processAudioData(audioData);
                });

                audioFileService.processFile(filePath).catch(reject);
            });
        });
    });

    DYNAMIC_TEST_ARGS.forEach(testArg => {
        const freqsString = getFreqString(testArg.tones);
        it(`should detect tones ${freqsString} in ${testArg.filename} using file mode`, async function() {
            return generateFileProcessingTest({...testArg, freqsString});
        });
    });

});

async function generateTest({filename, tones, sampleRate, frequencyScaleFactor=1, freqsString}) {
    const rawFile = fs.readFileSync(path.resolve("./test/wav", filename) );
    const data = await decode(rawFile);
    const detection = new DetectionService({micInputStream: null, sampleRate, frequencyScaleFactor, notifications: false});
    const detector = detection.addToneDetector(new TonesDetectorConfig({name: `Test Tone ${freqsString}`, tones}));
    return expectPassPromise({detection, detector, data})
}

function expectPassPromise({detection, detector, data}) {
    return new Promise((resolve, reject) => {
        //Fail if event not triggered
        const failTimeout = setTimeout(() => {
            reject(new Error("Tone Not Detected within Expected Timeframe"));
        } , 5000);
        //Setup pass condition
        detector.on("toneDetected", () => {
            clearTimeout(failTimeout);
            console.log("PASS");
            resolve();
        });
        //Process data
        detection.__processData(data);
    });
}

async function generateFileProcessingTest({filename, tones, sampleRate, frequencyScaleFactor=1, freqsString}) {
    const filePath = path.resolve("./test/wav", filename);
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`Test file does not exist: ${filePath}`);
    }

    // Initialize AudioFileService
    const audioFileService = new AudioFileService({
        chunkDurationSeconds: 1
    });

    // Initialize DetectionService in file mode
    const detection = new DetectionService({
        audioInterface: null,
        sampleRate,
        frequencyScaleFactor,
        fileMode: true,
        recording: false
    });

    const detector = detection.addToneDetector(new TonesDetectorConfig({
        name: `File Mode Test ${freqsString}`,
        tones,
        matchThreshold: 6,
        tolerancePercent: 0.05
    }));

    return new Promise((resolve, reject) => {
        // Set up timeout for test failure
        const failTimeout = setTimeout(() => {
            audioFileService.stop();
            reject(new Error(`File Mode: Tone Not Detected within Expected Timeframe for ${filename}`));
        }, 5000);

        // Set up success condition
        detector.on("toneDetected", (result) => {
            clearTimeout(failTimeout);
            audioFileService.stop();
            console.log(`File Mode PASS: ${freqsString} detected in ${filename}`);
            resolve();
        });

        // Set up audio data processing
        audioFileService.on('audioData', (audioData) => {
            try {
                detection.processAudioData(audioData);
            } catch (error) {
                clearTimeout(failTimeout);
                audioFileService.stop();
                reject(error);
            }
        });

        // Handle file processing errors
        audioFileService.on('error', (error) => {
            clearTimeout(failTimeout);
            reject(error);
        });

        // Start processing the file
        audioFileService.processFile(filePath)
            .then(() => {
                console.log("File processing complete.");
            })
            .catch((error) => {
            clearTimeout(failTimeout);
            reject(error);
        });
    });
}

function getFreqString(tones) {
    return `${tones.map(v => `${v}Hz`).join(", ")}`
}