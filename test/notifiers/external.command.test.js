const {runExternalCommand} = require('../../notifiers/external.command');
const path = require('path');
const expect  = require("chai").expect;
const os = require('os');

describe("External Command", function() {
    it(`should be able to run external command`, async function () {
        const timestamp = new Date().getTime();
        const results = await runExternalCommand({
            command: `node ${path.resolve("test/notifiers/bin/test.external.js")} [timestamp] "[detectorName]" "[filename]" "[description]" [tones] [matchAverages] [recordingRelPath] [custom]`,
            commandName: "Some External Task",
            timestamp,
            tones: [1000, 2000],
            matchAverages: [1001, 2001],
            filename: "testFileName.wav",
            detectorName: "Test FD",
            description: "Tone Detected",
            custom: {obj: true}
        });

        expect(results).to.deep.equal([
            "myArgs:  [",
            `  '${timestamp}',`,
            "  '\"Test FD\"',",
            "  '\"testFileName.wav\"',",
            "  '\"Tone Detected\"',",
            "  '1000,2000',",
            "  '1001,2001',",
            "  'null',",
            "  '{\"obj\":true}'",
            "]"
        ]);
    });

    it(`should be able to run external command that exits with non-zero exit code`, async function () {
        const timestamp = new Date().getTime();
        return runExternalCommand({
            command: `node ${path.resolve("test/notifiers/bin/test.external.js")}`,
            timestamp: 0
        }).then(r => {
            throw new Error("Did not throw")
        }).catch(exitCode => {
            expect(exitCode).equals(1);
        })
    });

    it(`should be able to run external bat command`, async function () {
        if (os.platform() !== 'win32') {
            this.skip();
        }
        const timestamp = new Date().getTime();
        const results = await runExternalCommand({
            command: `${path.resolve("test/notifiers/bin/test.bat")} [timestamp] "[detectorName]" "[filename]" "[description]" [tones] [matchAverages] [recordingRelPath] [custom]`,
            commandName: "Some External Task",
            timestamp,
            tones: [1000, 2000],
            matchAverages: [1001, 2001],
            filename: "testFileName.wav",
            detectorName: "Test FD",
            description: "Tone Detected",
            custom: {obj: true}
        });

        expect(results[1]).to.equals("\"Test Bat\"");
        expect(results[3]).to.includes('"\\"Tone Detected\\"" 1000,2000 1001,2001 null "{\\"obj\\":true}"');

    });
});