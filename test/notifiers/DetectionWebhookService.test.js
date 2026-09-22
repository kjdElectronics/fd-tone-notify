require('dotenv').config();
const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const crypto = require('crypto');
const axios = require('axios');
const log = require('../../util/logger');
const { sendDetectionWebhook } = require('../../notifiers/DetectionWebhookService');
const { version: fdtnVersion } = require('../../package.json');

const WEBHOOK_URL = 'http://localhost:9999/webhook';
const WEBHOOK_SECRET = 'test-webhook-secret';

const SAMPLE_DETECTION = {
    detectorId: '11111111-1111-4111-8111-111111111111',
    detectorName: 'Test Fire Department',
    tones: [911, 2938],
    matchAverages: [910.5, 2937.1],
    timestamp: '2025-01-15T10:30:45.123Z',
    source: { type: 'mic' },
    recordingRelativePath: '1700000000000-Test Fire Department.wav'
};

describe('DetectionWebhookService', function() {
    let originalUrl, originalSecret;

    beforeEach(function() {
        originalUrl = process.env.FD_DETECTION_WEBHOOK_URL;
        originalSecret = process.env.FD_DETECTION_WEBHOOK_SECRET;
    });

    afterEach(function() {
        sinon.restore();
        nock.cleanAll();
        if (originalUrl === undefined) delete process.env.FD_DETECTION_WEBHOOK_URL;
        else process.env.FD_DETECTION_WEBHOOK_URL = originalUrl;
        if (originalSecret === undefined) delete process.env.FD_DETECTION_WEBHOOK_SECRET;
        else process.env.FD_DETECTION_WEBHOOK_SECRET = originalSecret;
    });

    describe('no-op when unconfigured', function() {
        it('should not make any HTTP request when FD_DETECTION_WEBHOOK_URL is unset', async function() {
            delete process.env.FD_DETECTION_WEBHOOK_URL;
            delete process.env.FD_DETECTION_WEBHOOK_SECRET;
            const postSpy = sinon.stub(axios, 'post');

            await sendDetectionWebhook(SAMPLE_DETECTION);

            expect(postSpy.called).to.be.false;
        });
    });

    describe('payload shape and headers', function() {
        it('should POST the expected payload shape with the correct headers', async function() {
            process.env.FD_DETECTION_WEBHOOK_URL = WEBHOOK_URL;
            process.env.FD_DETECTION_WEBHOOK_SECRET = WEBHOOK_SECRET;
            const postStub = sinon.stub(axios, 'post').resolves({ status: 200, data: 'ok' });

            await sendDetectionWebhook(SAMPLE_DETECTION);

            expect(postStub.calledOnce).to.be.true;
            const [calledUrl, calledBody, calledConfig] = postStub.getCall(0).args;

            expect(calledUrl).to.equal(WEBHOOK_URL);

            const payload = JSON.parse(calledBody);
            expect(payload).to.deep.equal({
                event: 'detection',
                detectorId: SAMPLE_DETECTION.detectorId,
                detectorName: SAMPLE_DETECTION.detectorName,
                tones: SAMPLE_DETECTION.tones,
                matchAverages: SAMPLE_DETECTION.matchAverages,
                timestamp: SAMPLE_DETECTION.timestamp,
                source: SAMPLE_DETECTION.source,
                recordingRelativePath: SAMPLE_DETECTION.recordingRelativePath,
                fdtnVersion
            });

            expect(calledConfig.headers['Content-Type']).to.equal('application/json');
            expect(calledConfig.headers['X-FDTN-Event']).to.equal('detection');
            expect(calledConfig.headers['X-FDTN-Timestamp']).to.match(/^\d+$/);
            expect(calledConfig.headers['X-FDTN-Signature']).to.match(/^sha256=[0-9a-f]{64}$/);
            expect(calledConfig.timeout).to.equal(5000);
        });

        it('should default recordingRelativePath to null when not provided', async function() {
            process.env.FD_DETECTION_WEBHOOK_URL = WEBHOOK_URL;
            process.env.FD_DETECTION_WEBHOOK_SECRET = WEBHOOK_SECRET;
            const postStub = sinon.stub(axios, 'post').resolves({ status: 200, data: 'ok' });

            const { recordingRelativePath, ...withoutRecording } = SAMPLE_DETECTION;
            await sendDetectionWebhook(withoutRecording);

            const payload = JSON.parse(postStub.getCall(0).args[1]);
            expect(payload.recordingRelativePath).to.be.null;
        });
    });

    describe('HMAC signature (known vector)', function() {
        it('should sign "<timestamp>.<body>" with HMAC-SHA256 using the configured secret', async function() {
            process.env.FD_DETECTION_WEBHOOK_URL = WEBHOOK_URL;
            process.env.FD_DETECTION_WEBHOOK_SECRET = WEBHOOK_SECRET;
            const postStub = sinon.stub(axios, 'post').resolves({ status: 200, data: 'ok' });

            await sendDetectionWebhook(SAMPLE_DETECTION);

            const [, calledBody, calledConfig] = postStub.getCall(0).args;
            const sentTimestamp = calledConfig.headers['X-FDTN-Timestamp'];
            const sentSignature = calledConfig.headers['X-FDTN-Signature'];

            const expectedSignature = 'sha256=' + crypto
                .createHmac('sha256', WEBHOOK_SECRET)
                .update(`${sentTimestamp}.${calledBody}`)
                .digest('hex');

            expect(sentSignature).to.equal(expectedSignature);
        });
    });

    describe('retry behavior (nock)', function() {
        it('should retry once after 2s on a 5xx response and succeed', async function() {
            process.env.FD_DETECTION_WEBHOOK_URL = WEBHOOK_URL;
            process.env.FD_DETECTION_WEBHOOK_SECRET = WEBHOOK_SECRET;
            const postSpy = sinon.spy(axios, 'post');

            nock('http://localhost:9999')
                .post('/webhook')
                .reply(500)
                .post('/webhook')
                .reply(200, 'ok');

            await sendDetectionWebhook(SAMPLE_DETECTION, { retryDelayMs: 5 });

            expect(postSpy.callCount).to.equal(2);
            expect(nock.isDone()).to.be.true;
        });

        it('should not retry on a 4xx response', async function() {
            process.env.FD_DETECTION_WEBHOOK_URL = WEBHOOK_URL;
            process.env.FD_DETECTION_WEBHOOK_SECRET = WEBHOOK_SECRET;
            const postSpy = sinon.spy(axios, 'post');

            nock('http://localhost:9999')
                .post('/webhook')
                .reply(400, 'bad request');

            await sendDetectionWebhook(SAMPLE_DETECTION, { retryDelayMs: 5 });

            expect(postSpy.callCount).to.equal(1);
            expect(nock.isDone()).to.be.true;
        });

        it('should never throw and should log a warning when both attempts fail', async function() {
            process.env.FD_DETECTION_WEBHOOK_URL = WEBHOOK_URL;
            process.env.FD_DETECTION_WEBHOOK_SECRET = WEBHOOK_SECRET;
            const postSpy = sinon.spy(axios, 'post');
            const warningSpy = sinon.spy(log, 'warning');

            nock('http://localhost:9999')
                .post('/webhook')
                .reply(503)
                .post('/webhook')
                .reply(503);

            await sendDetectionWebhook(SAMPLE_DETECTION, { retryDelayMs: 5 });

            expect(postSpy.callCount).to.equal(2);
            expect(warningSpy.called).to.be.true;
        });

        it('should retry on a network error and never throw', async function() {
            process.env.FD_DETECTION_WEBHOOK_URL = WEBHOOK_URL;
            process.env.FD_DETECTION_WEBHOOK_SECRET = WEBHOOK_SECRET;
            const postSpy = sinon.spy(axios, 'post');

            nock('http://localhost:9999')
                .post('/webhook')
                .replyWithError('connection reset')
                .post('/webhook')
                .reply(200, 'ok');

            await sendDetectionWebhook(SAMPLE_DETECTION, { retryDelayMs: 5 });

            expect(postSpy.callCount).to.equal(2);
        });
    });
});
