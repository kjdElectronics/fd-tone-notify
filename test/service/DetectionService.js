require('dotenv').config();
const expect  = require("chai").expect;
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
const DYNAMIC_TEST_ARGS = [
    {filename: "raw.wav", tones: [911, 2934], sampleRate: 44100, frequencyScaleFactor: 1},
    {filename: "dispatch1.wav", tones: [567, 378], sampleRate: 44100, frequencyScaleFactor: 1},
    {filename: "six_tone.wav", tones: [602, 926, 602, 636, 636, 602], sampleRate: 32000, frequencyScaleFactor: 1},
    {filename: "dispatch2.wav", tones: [820, 2461], sampleRate: 32000, frequencyScaleFactor: 1}, //Note: According to Audacity this should be 823, 2385
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
        const detector = detection.addToneDetector({name: `Test Tone`, tones: args.tones});

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
        const detector = detection.addToneDetector({name: `Test Tone`, tones: args.tones, resetTimeoutMs: TIMEOUT});

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

        it('should process audio data directly in file mode', function(done) {
            const detection = new DetectionService({
                audioInterface: null,
                sampleRate: 44100,
                frequencyScaleFactor: 1,
                fileMode: true,
                recording: false
            });

            const testTones = [850, 860];
            const detector = detection.addToneDetector({
                name: 'File Mode Test',
                tones: testTones,
                matchThreshold: 1,
                tolerancePercent: 0.1
            });

            // Listen for detection
            detector.on('toneDetected', (result) => {
                expect(result).to.have.property('detector');
                expect(result.detector.tones).to.deep.equal(testTones);
                done();
            });

            // Generate synthetic audio data with the target frequencies
            const sampleRate = 44100;
            const duration = 2; // 2 seconds
            const samples = sampleRate * duration;
            const audioData = new Int16Array(samples);
            
            // Generate test tones
            for (let i = 0; i < samples; i++) {
                const t = i / sampleRate;
                const amplitude = 0.5 * 32767; // 16-bit audio
                audioData[i] = amplitude * (Math.sin(2 * Math.PI * 850 * t) + Math.sin(2 * Math.PI * 860 * t));
            }

            // Convert to buffer and process
            const buffer = Buffer.from(audioData.buffer);
            detection.processAudioData({
                audioBuffer: buffer,
                timestamp: 0,
                filePath: 'test-file.wav'
            });
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
            const testTimestamp = 5.5; // 5.5 seconds into the file

            detection.on('toneDetected', (detectionData) => {
                expect(detectionData).to.have.property('timestamp', testTimestamp);
                expect(detectionData).to.have.property('filePath', testFilePath);
                done();
            });

            const testTones = [1000];
            detection.addToneDetector({
                name: 'File Context Test',
                tones: testTones,
                matchThreshold: 1,
                tolerancePercent: 0.1
            });

            // Generate synthetic 1000Hz tone
            const sampleRate = 44100;
            const duration = 1;
            const samples = sampleRate * duration;
            const audioData = new Int16Array(samples);
            
            for (let i = 0; i < samples; i++) {
                const t = i / sampleRate;
                audioData[i] = 0.5 * 32767 * Math.sin(2 * Math.PI * 1000 * t);
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
    const detector = detection.addToneDetector({name: `Test Tone ${freqsString}`, tones});
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
        sampleRate,
        channels: 1,
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

    const detector = detection.addToneDetector({
        name: `File Mode Test ${freqsString}`,
        tones,
        matchThreshold: 6,
        tolerancePercent: 0.05
    });

    return new Promise((resolve, reject) => {
        // Set up timeout for test failure
        const failTimeout = setTimeout(() => {
            audioFileService.stop();
            reject(new Error(`File Mode: Tone Not Detected within Expected Timeframe for ${filename}`));
        }, 10000);

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
        audioFileService.processFile(filePath).catch((error) => {
            clearTimeout(failTimeout);
            reject(error);
        });
    });
}

function getFreqString(tones) {
    return `${tones.map(v => `${v}Hz`).join(", ")}`
}