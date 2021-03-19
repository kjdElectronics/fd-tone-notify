require('dotenv').config();
const expect  = require("chai").expect;
const fs = require('fs');
const WavDecoder = require('wav-decoder');
const path = require('path');
const decode = async (buffer) => {
    const decoded = await WavDecoder.decode(buffer);
    return decoded.channelData[0];
};

const {AllToneDetectionService} = require('../../service/AllToneDetectionService');

describe("AllToneDetectionService", function() {
    it(`should be able detect multi tone in 850 860 350 700 condensing 850 and 860 to single tone`, async function() {
        this.timeout(20000);
        const rawFile = fs.readFileSync(path.resolve("./test/wav", "multi.tone.850.860.350.700.wav") );
        const data = await decode(rawFile);

        const detection = new AllToneDetectionService({
            startFreq: 300,
            endFreq: 1000,
            micInputStream: null,
            sampleRate: 44100,
            notifications: false,
            tolerancePercent: 0.02,
            logLevel: "info"
        });

        //Chunk data so it is processed in correct order
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
            //Setup pass condition
            detection.on("multiToneDetected", multiToneMatch => {
                //The rounded average of 850 and 860 is condensed to a single match followed by matches for 350 and 700
                expect(multiToneMatch).to.deep.equal([857, 352, 700]);
                resolve(multiToneMatch);
            });
            //Process data
            dataSlices.forEach(slice => detection.__processData(slice));
        });
    });
});