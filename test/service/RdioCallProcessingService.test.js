/**
 * Tests for the detection-listener factories used by RdioCallProcessingService.
 * Full orchestration (audio piping + dispose) is exercised by the integration
 * path; these tests pin the listener contract that the controller relies on.
 */

const { expect } = require('chai');
const sinon = require('sinon');

const {
    createDetectionLogListener,
    createRecordingWindowListener,
} = require('../../service/RdioCallProcessingService');
const { rdioRecordingService } = require('../../service/RdioRecordingService');

describe('RdioCallProcessingService listeners', function() {
    describe('createDetectionLogListener', function() {
        it('pushes detection data with Rdio metadata', function() {
            const detections = [];
            const rdioMetadata = {
                talkgroup: '1001',
                talkgroupLabel: 'Fire Dispatch',
                system: '1',
                systemLabel: 'County',
            };
            const listener = createDetectionLogListener(detections, rdioMetadata, 'test-request-id');
            const detectedAt = new Date().toISOString();

            listener({
                detector: { name: 'Fire Station 1', tones: [911, 2938] },
                detectedAt,
                matchAverages: [911.2, 2938.5],
                message: 'Fire Station 1 tone detected',
                sourceContext: { source: 'rdio', talkgroup: { label: 'Fire Dispatch' } },
            });

            expect(detections).to.have.length(1);
            expect(detections[0]).to.have.property('detector', 'Fire Station 1');
            expect(detections[0]).to.have.property('detectedAt', detectedAt);
            expect(detections[0]).to.have.property('rdioMetadata');
            expect(detections[0].rdioMetadata).to.have.property('talkgroupLabel', 'Fire Dispatch');
        });

        it('accumulates multiple detections', function() {
            const detections = [];
            const listener = createDetectionLogListener(detections, { talkgroupLabel: 'Fire Dispatch' }, 'test-request-id');
            const now = new Date().toISOString();
            listener({ detector: { name: 'Det 1', tones: [911] }, detectedAt: now, matchAverages: [911], message: 'det1' });
            listener({ detector: { name: 'Det 2', tones: [440] }, detectedAt: now, matchAverages: [440], message: 'det2' });
            expect(detections).to.have.length(2);
        });
    });

    describe('createRecordingWindowListener', function() {
        afterEach(function() { sinon.restore(); });

        it('forwards detection to RdioRecordingService.onToneDetected', function() {
            const stub = sinon.stub(rdioRecordingService, 'onToneDetected').resolves();
            const listener = createRecordingWindowListener({
                wavFilePath: '/tmp/foo.wav',
                rdioMetadata: { dateTime: '2024-01-01T00:00:00Z', talkgroupLabel: 'Fire Dispatch' },
                detectorConfigs: [{ name: 'Fire Station 1', isRecordingEnabled: true }],
                requestId: 'req-1',
            });

            listener({
                detector: { name: 'Fire Station 1', tones: [911, 2938] },
                detectedAt: '2024-01-01T00:00:00Z',
                matchAverages: [911, 2938],
                notifications: {},
                message: 'tone',
            });

            expect(stub.calledOnce).to.be.true;
            const call = stub.firstCall.args[0];
            expect(call.wavFilePath).to.equal('/tmp/foo.wav');
            expect(call.talkgroupLabel).to.equal('Fire Dispatch');
            expect(call.detectionData.detector.name).to.equal('Fire Station 1');
        });

        it('skips forwarding when the matched detector has isRecordingEnabled=false', function() {
            const stub = sinon.stub(rdioRecordingService, 'onToneDetected').resolves();
            const listener = createRecordingWindowListener({
                wavFilePath: '/tmp/foo.wav',
                rdioMetadata: { dateTime: '2024-01-01T00:00:00Z', talkgroupLabel: 'Fire Dispatch' },
                detectorConfigs: [{ name: 'No-Record Det', isRecordingEnabled: false }],
                requestId: 'req-2',
            });

            listener({
                detector: { name: 'No-Record Det', tones: [911] },
                detectedAt: '2024-01-01T00:00:00Z',
                matchAverages: [911],
                notifications: {},
                message: 'tone',
            });

            expect(stub.called).to.be.false;
        });
    });
});
