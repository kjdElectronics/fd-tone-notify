/**
 * Tests for Rdio Scanner domain helpers: metadata extraction, talkgroup
 * matching, and detector config construction.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const config = require('config');

const {
    extractRdioMetadata,
    findMatchingDetectors,
    createMatchingDetectorConfigs,
} = require('../../../server/domain/rdio.helpers');

describe('Rdio Metadata Domain', function() {
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
            const metadata = extractRdioMetadata({ body: { talkgroupLabel: '  Fire Dispatch  ' } }, 'test-request-id');
            expect(metadata.talkgroupLabel).to.equal('Fire Dispatch');
        });

        it('should handle missing talkgroupLabel', function() {
            const metadata = extractRdioMetadata({ body: {} }, 'test-request-id');
            expect(metadata.talkgroupLabel).to.equal('');
        });
    });

    describe('findMatchingDetectors', function() {
        beforeEach(function() {
            sinon.stub(config, 'detection').value({
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

        afterEach(function() { sinon.restore(); });

        it('should find detectors matching talkgroupLabel case-insensitively', function() {
            const matches = findMatchingDetectors('Fire Dispatch');
            expect(matches).to.have.length(2);
            expect(matches[0].name).to.equal('Fire Station 1');
            expect(matches[1].name).to.equal('Fire Station 2');
        });

        it('should match with different case in incoming label', function() {
            expect(findMatchingDetectors('FIRE DISPATCH')).to.have.length(2);
        });

        it('should return empty array when no detectors match', function() {
            expect(findMatchingDetectors('Police Dispatch')).to.be.an('array').that.is.empty;
        });

        it('should skip detectors without talkgroupFilter', function() {
            const names = findMatchingDetectors('Fire Dispatch').map(d => d.name);
            expect(names).to.not.include('No Filter Detector');
            expect(names).to.not.include('Empty Filter');
        });

        it('should skip detectors with empty talkgroupFilter', function() {
            expect(findMatchingDetectors('')).to.be.an('array').that.is.empty;
        });

        it('should handle null talkgroupLabel', function() {
            expect(findMatchingDetectors(null)).to.be.an('array').that.is.empty;
        });

        it('should trim whitespace from incoming label', function() {
            expect(findMatchingDetectors('  Fire Dispatch  ')).to.have.length(2);
        });
    });

    describe('createMatchingDetectorConfigs', function() {
        beforeEach(function() {
            sinon.stub(config, 'detection').value({
                defaultMatchThreshold: 6,
                defaultTolerancePercent: 0.02,
                defaultResetTimeoutMs: 5000,
                defaultLockoutTimeoutMs: 7000,
                minRecordingLengthSec: 30,
                maxRecordingLengthSec: 45,
                isRecordingEnabled: true,
            });
        });

        afterEach(function() { sinon.restore(); });

        it('should create TonesDetectorConfig objects with correct properties', function() {
            const configs = createMatchingDetectorConfigs([{
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
            }]);

            expect(configs).to.have.length(1);
            expect(configs[0]).to.have.property('name', 'Fire Station 1');
            expect(configs[0]).to.have.property('talkgroupFilter', 'Fire Dispatch');
            expect(configs[0].tones).to.deep.equal([911, 2938]);
            expect(configs[0]).to.have.property('isRecordingEnabled', true);
        });

        it('should respect the detector isRecordingEnabled setting when explicitly false', function() {
            const configs = createMatchingDetectorConfigs([{
                name: 'Test',
                tones: [800, 1200],
                talkgroupFilter: 'Test',
                isRecordingEnabled: false,
            }]);
            expect(configs[0]).to.have.property('isRecordingEnabled', false);
        });

        it('should fall back to global isRecordingEnabled when detector value is undefined', function() {
            const configs = createMatchingDetectorConfigs([{
                name: 'Minimal',
                tones: [800, 1200],
                talkgroupFilter: 'Test',
            }]);
            expect(configs[0]).to.have.property('isRecordingEnabled', true);
        });

        it('should fall back to default config values when not specified', function() {
            const configs = createMatchingDetectorConfigs([{
                name: 'Minimal',
                tones: [800, 1200],
                talkgroupFilter: 'Test',
            }]);
            expect(configs[0]).to.have.property('matchThreshold', 6);
            expect(configs[0]).to.have.property('tolerancePercent', 0.02);
        });
    });
});
