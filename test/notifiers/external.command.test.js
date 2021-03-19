const {runExternalCommand} = require('../../notifiers/external.command');
const path = require('path');
const expect  = require("chai").expect;

describe("External Command", function() {
    it(`should be able to run external command`, async function () {
        const timestamp = new Date().getTime();
        const results = await runExternalCommand({
            command: `node ${path.resolve("test/notifiers/bin/test.external.js")} [timestamp] "[detectorName]" "[description]" [tones] [matchAverages] [recordingRelPath] [custom]`,
            commandName: "Some External Task",
            timestamp,
            tones: [1000, 2000],
            matchAverages: [1001, 2001],
            filename: null,
            detectorName: "Test FD",
            description: "Tone Detected",
            custom: {obj: true}
        });

        expect(results).to.deep.equal([
            "myArgs:  [",
            `  '${timestamp}',`,
            "  '\"Test FD\"',",
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
});