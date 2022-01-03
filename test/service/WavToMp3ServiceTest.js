require('dotenv').config();
const expect  = require("chai").expect;
const {WavToMp3Service} = require("../../service/WavToMp3Service");

describe("WavToMp3", function() {
    it("should be able convert ", async function() {
        this.timeout(10000);
        return WavToMp3Service.convertWavToMp3({inputPath: "./test/wav/dispatch1.wav", outputPath: "result.mp3"})
            .then(r => {
                expect(true);
            })
            .catch(r =>{
                expect(false)
            });
    });
});