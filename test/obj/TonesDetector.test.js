require('dotenv').config();
const expect  = require("chai").expect;
const {TonesDetector, MATCH_STATES} = require('../../obj/TonesDetector');
const { TonesDetectorConfig } = require('../../obj/config/TonesDetectorConfig');
const path = require('path');

const DEFAULT_CONFIG = new TonesDetectorConfig({
    name: "Test",
    tones: [1000, 1300],
    tolerancePercent: 0.02,
    matchThreshold: 8
});

describe("TonesDetector", function() {
    it("should be able build", async function() {
        const tonesDetector = new TonesDetector(DEFAULT_CONFIG);
        expect(tonesDetector).instanceOf(TonesDetector);
        expect(tonesDetector.tones).deep.equals(DEFAULT_CONFIG.tones);
        expect(tonesDetector.tolerancePercent).equals(DEFAULT_CONFIG.tolerancePercent);
        expect(tonesDetector.matchThreshold).equals(DEFAULT_CONFIG.matchThreshold);
        expect(tonesDetector._detectors.length).equals(2);
    });

    it("should be able process values and progress through proper states", async function() {
        const PITCH_VALUES = [400, 400, 400, 400, 1000, 1002, 988, 975, 1002, 1020, 988,
            1018, 1000, 399, 1300, 1310, 300, 300, 300, 300, 1295, 1290, 1300,
            1280, 450, 1320, 1300];
        const tonesDetector = new TonesDetector(DEFAULT_CONFIG);
        return new Promise((resolve, reject) => {
            const failTimeout = setTimeout(() => {
                reject(new Error("Test Failed Timeout"));
            } , 10);
            tonesDetector.on("toneDetected", () => {
                clearTimeout(failTimeout);
                console.log("PASS");
                resolve();
            });
            tonesDetector.processValues({pitchValues: PITCH_VALUES, raw: new Array(PITCH_VALUES.length).fill(0.5)});
        });
    });

    //TODO - This behavior can cause false positives since the first tone match gets "locked" in. This is why
    //todo the TonesDetector has a timeout that resets all tone detectors after a set period. This should be revisited
    //todo as ideally x number of non-matches between tones should reset the detector
    it("should be able detect tone if another frequency is between the two tones", async function() {
        const PITCH_VALUES = [400, 400, 400, 400, 400, 400, 400, 400, 600, 600, 600, 600, 600, 600, 600, 600,
            600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600,
        800, 800, 800, 800, 800, 800, 800, 800, 800];
        const config = new TonesDetectorConfig({
            name: "Test",
            tones: [400, 800],
            tolerancePercent: 0.02,
            matchThreshold: 8
        });
        const tonesDetector = new TonesDetector(config);
        return new Promise((resolve, reject) => {
            const failTimeout = setTimeout(() => {
                reject(new Error("Test Failed Timeout"));
            } , 10);
            tonesDetector.on("toneDetected", () => {
                clearTimeout(failTimeout);
                console.log("PASS");
                resolve();
            });
            tonesDetector.processValues({pitchValues: PITCH_VALUES, raw: new Array(PITCH_VALUES.length).fill(0.5)});
        });
    });

    it("should be able detect a long multi tone sequence lasting 15 seconds", async function() {
        this.timeout(22000);
        const PITCH_VALUES = [
            400, 600,
            800, 900,
            1100, 1300,
            600, 400,
        ];
        const config = new TonesDetectorConfig({
            name: "Test",
            tones: PITCH_VALUES,
            tolerancePercent: 0.02,
            matchThreshold: 1
        });
        const tonesDetector = new TonesDetector(config);
        return new Promise(async (resolve, reject) => {
            const failTimeout = setTimeout(() => {
                reject(new Error("Test Failed Timeout"));
            } , 21000);
            tonesDetector.on("toneDetected", () => {
                clearTimeout(failTimeout);
                console.log("PASS");
                resolve();
            });

            for (let i = 0; i < PITCH_VALUES.length; i++) {
                tonesDetector.processValue(PITCH_VALUES[i]);
                await sleep(2500);
            }
        });
    });
});

async function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    })
}