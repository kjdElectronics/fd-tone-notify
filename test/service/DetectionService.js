require('dotenv').config();
const expect  = require("chai").expect;
const fs = require('fs');
const WavDecoder = require('wav-decoder');
const path = require('path');
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

function getFreqString(tones) {
    return `${tones.map(v => `${v}Hz`).join(", ")}`
}