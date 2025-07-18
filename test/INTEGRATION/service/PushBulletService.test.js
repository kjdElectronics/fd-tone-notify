require('dotenv').config();
const expect  = require("chai").expect;
const {PushBulletService} = require('../../../notifiers/PushBulletService');
const path = require('path');

describe("PushBulletService", function() {
    it("should be able to send file", async function() {
        this.timeout(8000);
        const absPath = path.resolve("./test/wav", "raw.wav");
        const okay = await PushBulletService.pushFile(
            {
                title: "Dispatch Audio Test",
                filename: "example-recording.wav",
                fileType: "audio/wav",
                absolutePath: absPath,
                channelTag: "fd-dispatch-other2"
            });
        expect(okay).is.true;
    });
});