require('dotenv').config();
const expect  = require("chai").expect;
const {ToneDetector, MATCH_STATES} = require('../../obj/ToneDetector');
const path = require('path');

const DEFAULT_PARAMS = {
    tone: 1000,
    tolerancePercent: 0.02,
    matchThreshold: 8
};

describe("ToneDetector", function() {
    it("should be able build", async function() {
        const detector = new ToneDetector(DEFAULT_PARAMS);
        expect(detector).instanceOf(ToneDetector);
        expect(detector.tone).equals(DEFAULT_PARAMS.tone);
        expect(detector.tolerancePercent).equals(DEFAULT_PARAMS.tolerancePercent);
        expect(detector.matchThreshold).equals(DEFAULT_PARAMS.matchThreshold);
        expect(detector._matchCount).equals(0);
        expect(detector._unmatchedCount).equals(0);
    });

    it("should be able process values and progress through proper states", async function() {
        const VALUES = [0, 1001, 1024, 985, 988, 985, 1004, 400, 400, 400, 988];
        const tolerance = DEFAULT_PARAMS.tone * DEFAULT_PARAMS.tolerancePercent ;
        VALUES[0] = DEFAULT_PARAMS.tone - tolerance + 1;

        const detector = new ToneDetector(DEFAULT_PARAMS);

        expect(detector.state).equals(MATCH_STATES.WAITING);
        detector.processValue(VALUES[0]);
        expect(detector.state).equals(MATCH_STATES.WAITING);
        detector.processValue(VALUES[1]);
        expect(detector.state).equals(MATCH_STATES.MATCH_IN_PROGRESS);

        VALUES.slice(2).map(v => detector.processValue(v));
        expect(detector._matchCount).equals(6);
        expect(detector._unmatchedCount).equals(4);

        detector.processValue(1019);
        detector.processValue(1020);
        expect(detector.state).equals(MATCH_STATES.MATCH);
        expect(detector.processValue(1020).warn).to.be.true;

        detector.resetMatch();
        expect(detector._matchCount).equals(0);
        expect(detector._unmatchedCount).equals(0);
    });
});