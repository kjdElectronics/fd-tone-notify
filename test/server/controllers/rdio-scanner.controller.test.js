/**
 * Tests for Rdio Scanner controller helper functions.
 *
 * Tests the extracted single-responsibility functions directly,
 * verifying talkgroup filtering, metadata extraction, and detector config creation.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const config = require('config');

describe('Rdio Scanner Controller', function() {
    let extractRdioMetadata, findMatchingDetectors, createMatchingDetectorConfigs, createRdioDetectionListener;

    before(function() {
        // Import the functions under test
        const controller = require('../../../server/controllers/rdio-scanner.controller');
        extractRdioMetadata = controller.extractRdioMetadata;
        findMatchingDetectors = controller.findMatchingDetectors;
        createMatchingDetectorConfigs = controller.createMatchingDetectorConfigs;
        createRdioDetectionListener = controller.createRdioDetectionListener;
    });

    describe('extractRdioMetadata', function() {
        it('should extract all Rdio metadata fields from request body', function() {
            const req = {
                body: {
                    dateTime: '2024-01-01T00:00:00Z',
                    talkgroup: '1001',
                    talkgroupLabel: 'Fire Dispatch',
                    talkgroupGroup: 'Fire',
                    talkgroupTag: 'dispatch',
                    system: '1',
                    systemLabel: 'County System',
                    source: '4424000',
                    frequency: '460000000'
                }
            };

            const metadata = extractRdioMetadata(req, 'test-request-id');

            expect(metadata).to.have.property('dateTime', '2024-01-01T00:00:00Z');
            expect(metadata).to.have.property('talkgroup', '1001');
            expect(metadata).to.have.property('talkgroupLabel', 'Fire Dispatch');
            expect(metadata).to.have.property('talkgroupGroup', 'Fire');
            expect(metadata).to.have.property('talkgroupTag', 'dispatch');
            expect(metadata).to.have.property('system', '1');
            expect(metadata).to.have.property('systemLabel', 'County System');
            expect(metadata).to.have.property('source', '4424000');
            expect(metadata).to.have.property('frequency', '460000000');
        });

        it('should trim talkgroupLabel whitespace', function() {
            const req = {
                body: { talkgroupLabel: '  Fire Dispatch  ' }
            };

            const metadata = extractRdioMetadata(req, 'test-request-id');

            expect(metadata.talkgroupLabel).to.equal('Fire Dispatch');
        });

        it('should handle missing talkgroupLabel', function() {
            const req = { body: {} };

            const metadata = extractRdioMetadata(req, 'test-request-id');

            expect(metadata.talkgroupLabel).to.equal('');
        });
    });

    describe('findMatchingDetectors', function() {
        let configStub;

        beforeEach(function() {
            configStub = sinon.stub(config, 'detection').value({
                detectors: [
                    { name: 'Fire Station 1', talkgroupFilter: 'Fire Dispatch', tones: [911, 2938] },
                    { name: 'Fire Station 2', talkgroupFilter: 'fire dispatch', tones: [440, 879] },
                    { name: 'EMS Unit', talkgroupFilter: 'EMS Dispatch', tones: [1202, 1843] },
                    { name: 'No Filter Detector', tones: [600, 800] },
                    { name: 'Empty Filter', talkgroupFilter: '', tones: [500, 700] }
                ],
                defaultMatchThreshold: 6,
                defaultTolerancePercent: 0.02,
                defaultResetTimeoutMs: 5000,
                defaultLockoutTimeoutMs: 7000,
                minRecordingLengthSec: 30,
                maxRecordingLengthSec: 45
            });
        });

        afterEach(function() {
            sinon.restore();
        });

        it('should find detectors matching talkgroupLabel case-insensitively', function() {
            const matches = findMatchingDetectors('Fire Dispatch');

            expect(matches).to.have.length(2);
            expect(matches[0].name).to.equal('Fire Station 1');
            expect(matches[1].name).to.equal('Fire Station 2');
        });

        it('should match with different case in incoming label', function() {
            const matches = findMatchingDetectors('FIRE DISPATCH');

            expect(matches).to.have.length(2);
        });

        it('should return empty array when no detectors match', function() {
            const matches = findMatchingDetectors('Police Dispatch');

            expect(matches).to.be.an('array').that.is.empty;
        });

        it('should skip detectors without talkgroupFilter', function() {
            const matches = findMatchingDetectors('Fire Dispatch');

            const names = matches.map(d => d.name);
            expect(names).to.not.include('No Filter Detector');
            expect(names).to.not.include('Empty Filter');
        });

        it('should skip detectors with empty talkgroupFilter', function() {
            const matches = findMatchingDetectors('');

            expect(matches).to.be.an('array').that.is.empty;
        });

        it('should handle null talkgroupLabel', function() {
            const matches = findMatchingDetectors(null);

            expect(matches).to.be.an('array').that.is.empty;
        });

        it('should trim whitespace from incoming label', function() {
            const matches = findMatchingDetectors('  Fire Dispatch  ');

            expect(matches).to.have.length(2);
        });
    });

    describe('createMatchingDetectorConfigs', function() {
        let configStub;

        beforeEach(function() {
            configStub = sinon.stub(config, 'detection').value({
                defaultMatchThreshold: 6,
                defaultTolerancePercent: 0.02,
                defaultResetTimeoutMs: 5000,
                defaultLockoutTimeoutMs: 7000,
                minRecordingLengthSec: 30,
                maxRecordingLengthSec: 45,
                isRecordingEnabled: true
            });
        });

        afterEach(function() {
            sinon.restore();
        });

        it('should create TonesDetectorConfig objects with correct properties', function() {
            const detectors = [{
                name: 'Fire Station 1',
                tones: [911, 2938],
                talkgroupFilter: 'Fire Dispatch',
                matchThreshold: 8,
                tolerancePercent: 0.03,
                isRecordingEnabled: true,
                notifications: {
                    preRecording: { emails: [], pushbullet: [], webhooks: [], externalCommands: [] },
                    postRecording: { emails: [], pushbullet: [], webhooks: [], externalCommands: [] }
                }
            }];

            const configs = createMatchingDetectorConfigs(detectors);

            expect(configs).to.have.length(1);
            expect(configs[0]).to.have.property('name', 'Fire Station 1');
            expect(configs[0]).to.have.property('talkgroupFilter', 'Fire Dispatch');
            expect(configs[0].tones).to.deep.equal([911, 2938]);
            expect(configs[0]).to.have.property('isRecordingEnabled', true);
        });

        it('should respect the detector isRecordingEnabled setting when explicitly false', function() {
            const detectors = [{
                name: 'Test',
                tones: [800, 1200],
                talkgroupFilter: 'Test',
                isRecordingEnabled: false
            }];

            const configs = createMatchingDetectorConfigs(detectors);

            expect(configs[0]).to.have.property('isRecordingEnabled', false);
        });

        it('should fall back to global isRecordingEnabled when detector value is undefined', function() {
            const detectors = [{
                name: 'Minimal',
                tones: [800, 1200],
                talkgroupFilter: 'Test'
            }];

            const configs = createMatchingDetectorConfigs(detectors);

            expect(configs[0]).to.have.property('isRecordingEnabled', true);
        });

        it('should fall back to default config values when not specified', function() {
            const detectors = [{
                name: 'Minimal',
                tones: [800, 1200],
                talkgroupFilter: 'Test'
            }];

            const configs = createMatchingDetectorConfigs(detectors);

            expect(configs[0]).to.have.property('matchThreshold', 6);
            expect(configs[0]).to.have.property('tolerancePercent', 0.02);
        });
    });

    describe('createRdioDetectionListener', function() {
        it('should push detection data with Rdio metadata when called', function() {
            const detections = [];
            const rdioMetadata = {
                talkgroup: '1001',
                talkgroupLabel: 'Fire Dispatch',
                system: '1',
                systemLabel: 'County'
            };

            const listener = createRdioDetectionListener(detections, rdioMetadata, 'test-request-id');

            const detectedAt = new Date().toISOString();
            listener({
                detector: { name: 'Fire Station 1', tones: [911, 2938] },
                detectedAt,
                matchAverages: [911.2, 2938.5],
                message: 'Fire Station 1 tone detected',
                sourceContext: { source: 'rdio', talkgroup: { label: 'Fire Dispatch' } }
            });

            expect(detections).to.have.length(1);
            expect(detections[0]).to.have.property('detector', 'Fire Station 1');
            expect(detections[0]).to.have.property('detectedAt', detectedAt);
            expect(detections[0]).to.have.property('rdioMetadata');
            expect(detections[0].rdioMetadata).to.have.property('talkgroupLabel', 'Fire Dispatch');
        });

        it('should accumulate multiple detections', function() {
            const detections = [];
            const rdioMetadata = { talkgroupLabel: 'Fire Dispatch' };

            const listener = createRdioDetectionListener(detections, rdioMetadata, 'test-request-id');

            const now = new Date().toISOString();
            listener({ detector: { name: 'Det 1', tones: [911] }, detectedAt: now, matchAverages: [911], message: 'det1' });
            listener({ detector: { name: 'Det 2', tones: [440] }, detectedAt: now, matchAverages: [440], message: 'det2' });

            expect(detections).to.have.length(2);
        });
    });
});
