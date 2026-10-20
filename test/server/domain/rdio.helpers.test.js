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

        it('should carry req.ingestSource through as sourceId/sourceName (per-source ingest keys)', function() {
            const req = {
                body: { talkgroupLabel: 'Fire Dispatch' },
                ingestSource: { id: 'a1b2c3d4e5f60718', name: 'Rdio Source A' }
            };

            const metadata = extractRdioMetadata(req, 'test-request-id');

            expect(metadata.sourceId).to.equal('a1b2c3d4e5f60718');
            expect(metadata.sourceName).to.equal('Rdio Source A');
        });

        it('should default sourceId/sourceName to null when authenticated via the legacy shared key', function() {
            const metadata = extractRdioMetadata({ body: { talkgroupLabel: 'Fire Dispatch' } }, 'test-request-id');

            expect(metadata.sourceId).to.be.null;
            expect(metadata.sourceName).to.be.null;
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
                    { name: 'Empty Filter', talkgroupFilter: '', tones: [500, 700] },
                    { name: 'Multi Filter', talkgroupFilter: ['Derry Primary', 'Auburn Fire'], tones: [566, 1130] },
                    { name: 'Empty Array Filter', talkgroupFilter: [], tones: [300, 400] }
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

        it('should match any talkgroup in a talkgroupFilter array', function() {
            expect(findMatchingDetectors('auburn fire').map(d => d.name)).to.deep.equal(['Multi Filter']);
            expect(findMatchingDetectors('Derry Primary').map(d => d.name)).to.deep.equal(['Multi Filter']);
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

    describe('findMatchingDetectors - sources filter (per-source ingest keys)', function() {
        beforeEach(function() {
            sinon.stub(config, 'detection').value({
                detectors: [
                    { name: 'Any Source', talkgroupFilter: 'Fire Dispatch', tones: [911, 2938] },
                    { name: 'Only Source A', talkgroupFilter: 'Fire Dispatch', tones: [440, 879], sources: ['source-a-id'] },
                    { name: 'Only Source B', talkgroupFilter: 'Fire Dispatch', tones: [500, 700], sources: ['source-b-id'] },
                    { name: 'Multiple Sources', talkgroupFilter: 'Fire Dispatch', tones: [600, 800], sources: ['source-a-id', 'source-b-id'] },
                    { name: 'Empty Sources Array', talkgroupFilter: 'Fire Dispatch', tones: [700, 900], sources: [] }
                ]
            });
        });

        afterEach(function() { sinon.restore(); });

        it('without a sourceId, only matches detectors with no source restriction (legacy shared-key auth has no source identity)', function() {
            const names = findMatchingDetectors('Fire Dispatch').map(d => d.name);
            expect(names).to.have.members(['Any Source', 'Empty Sources Array']);
            expect(names).to.not.include.members(['Only Source A', 'Only Source B', 'Multiple Sources']);
        });

        it('only matches detectors with no sources filter, or whose sources include the given sourceId', function() {
            const names = findMatchingDetectors('Fire Dispatch', 'source-a-id').map(d => d.name);
            expect(names).to.have.members(['Any Source', 'Only Source A', 'Multiple Sources', 'Empty Sources Array']);
            expect(names).to.not.include('Only Source B');
        });

        it('a detector scoped to a different source is excluded', function() {
            const names = findMatchingDetectors('Fire Dispatch', 'source-b-id').map(d => d.name);
            expect(names).to.not.include('Only Source A');
            expect(names).to.include('Only Source B');
        });

        it('an empty sources array behaves the same as no sources filter (matches every source)', function() {
            const names = findMatchingDetectors('Fire Dispatch', 'some-other-source').map(d => d.name);
            expect(names).to.include('Empty Sources Array');
            expect(names).to.include('Any Source');
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
            expect(configs[0].talkgroupFilter).to.deep.equal(['Fire Dispatch']);
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
