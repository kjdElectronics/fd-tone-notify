const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

// Other test files in this suite (e.g. server/controllers/detector.controller*.test.js)
// permanently replace this module's exports with sinon stubs at require time
// (outside any hook), which pollutes the shared require() cache for the rest
// of the mocha process. Force a pristine module instance here so these tests
// exercise the real implementation regardless of file load order.
const MODULE_PATH = require.resolve('../../../server/util/config.file.util');
delete require.cache[MODULE_PATH];
const {
    assignDetectorIds,
    readConfigFile,
    getConfigFilePath
} = require('../../../server/util/config.file.util');

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('config.file.util', function() {

    describe('assignDetectorIds (pure)', function() {
        it('should assign a UUID v4 to a detector missing an id', function() {
            const detectors = [{ name: 'No Id Detector', tones: [800] }];
            const changed = assignDetectorIds(detectors);

            expect(changed).to.be.true;
            expect(detectors[0].id).to.match(UUID_V4_REGEX);
        });

        it('should not modify a detector that already has an id', function() {
            const detectors = [{ id: 'existing-id-123', name: 'Has Id', tones: [800] }];
            const changed = assignDetectorIds(detectors);

            expect(changed).to.be.false;
            expect(detectors[0].id).to.equal('existing-id-123');
        });

        it('should assign different UUIDs to multiple detectors missing ids', function() {
            const detectors = [
                { name: 'Detector A', tones: [800] },
                { name: 'Detector B', tones: [900] }
            ];
            assignDetectorIds(detectors);

            expect(detectors[0].id).to.match(UUID_V4_REGEX);
            expect(detectors[1].id).to.match(UUID_V4_REGEX);
            expect(detectors[0].id).to.not.equal(detectors[1].id);
        });

        it('should return false and not throw for a non-array input', function() {
            expect(assignDetectorIds(undefined)).to.be.false;
            expect(assignDetectorIds(null)).to.be.false;
        });

        it('should return false when all detectors already have ids', function() {
            const detectors = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
            expect(assignDetectorIds(detectors)).to.be.false;
        });
    });

    describe('readConfigFile self-heal', function() {
        const TEST_INSTANCE = 'test-assign-ids';
        let testConfigPath;
        const originalNodeEnv = process.env.NODE_ENV;

        beforeEach(function() {
            process.env.NODE_ENV = TEST_INSTANCE;
            testConfigPath = getConfigFilePath();
            const fixture = {
                detection: {
                    detectors: [
                        { name: 'Missing Id Detector', tones: [800] },
                        { id: 'already-has-an-id', name: 'Has Id Detector', tones: [900] }
                    ]
                }
            };
            fs.writeFileSync(testConfigPath, JSON.stringify(fixture, null, 2));
        });

        afterEach(function() {
            if (fs.existsSync(testConfigPath)) fs.unlinkSync(testConfigPath);
            process.env.NODE_ENV = originalNodeEnv;
        });

        it('should assign missing ids on read and persist them to disk immediately', async function() {
            const configData = await readConfigFile();

            expect(configData.detection.detectors[0].id).to.match(UUID_V4_REGEX);
            expect(configData.detection.detectors[1].id).to.equal('already-has-an-id');

            // Verify persisted to disk (self-healed), not just in-memory
            const onDisk = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));
            expect(onDisk.detection.detectors[0].id).to.equal(configData.detection.detectors[0].id);
        });

        it('should keep the same id stable across repeated reads', async function() {
            const first = await readConfigFile();
            const firstId = first.detection.detectors[0].id;

            const second = await readConfigFile();
            expect(second.detection.detectors[0].id).to.equal(firstId);
        });
    });
});
