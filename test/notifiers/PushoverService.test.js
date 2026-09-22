require('dotenv').config();
// PushoverService reads FD_PUSHOVER_APP_TOKEN once at module load (same
// pattern as PushBulletService.js), so it must be set before requiring.
// The require cache is busted first: other test files (e.g.
// test/bin/detectFromFiles.test.js, via service/DetectionService.js ->
// notifiers/index.js) may already have required this module - without the
// env var set - before this file's turn in mocha's load order, which would
// otherwise leave TOKEN captured as undefined regardless of what's set here.
process.env.FD_PUSHOVER_APP_TOKEN = 'test-pushover-app-token';
const pushoverServicePath = require.resolve('../../notifiers/PushoverService');
delete require.cache[pushoverServicePath];

const expect = require('chai').expect;
const nock = require('nock');
const path = require('path');
const { PushoverService } = require(pushoverServicePath);

describe('PushoverService', function() {
    afterEach(function() {
        nock.cleanAll();
    });

    describe('push', function() {
        it('should POST title/message/user/token to the Pushover messages API', async function() {
            let capturedBody;
            nock('https://api.pushover.net')
                .post('/1/messages.json', body => { capturedBody = body; return true; })
                .reply(200, { status: 1, request: 'test-request-id' });

            const result = await PushoverService.push({
                title: 'Engine 1',
                message: 'Tone detected',
                user: 'u1a2b3c4d5e6f7g8h9'
            });

            expect(result).to.be.true;
            expect(capturedBody).to.deep.equal({
                token: 'test-pushover-app-token',
                user: 'u1a2b3c4d5e6f7g8h9',
                title: 'Engine 1',
                message: 'Tone detected'
            });
        });

        it('should include priority and sound when provided', async function() {
            let capturedBody;
            nock('https://api.pushover.net')
                .post('/1/messages.json', body => { capturedBody = body; return true; })
                .reply(200, { status: 1 });

            await PushoverService.push({
                title: 'Engine 1',
                message: 'Tone detected',
                user: 'u1',
                priority: 1,
                sound: 'siren'
            });

            expect(capturedBody.priority).to.equal(1);
            expect(capturedBody.sound).to.equal('siren');
        });

        it('should throw when the Pushover API returns an error', async function() {
            nock('https://api.pushover.net')
                .post('/1/messages.json')
                .reply(400, { status: 0, errors: ['user identifier is invalid'] });

            let error;
            try {
                await PushoverService.push({ title: 'Engine 1', message: 'Tone detected', user: 'bad-user' });
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });
    });

    describe('pushFile', function() {
        it('should POST a multipart form with the audio file as an attachment', async function() {
            const absPath = path.resolve('./test/wav', 'raw.wav');

            nock('https://api.pushover.net')
                .post('/1/messages.json')
                .reply(200, { status: 1 });

            const result = await PushoverService.pushFile({
                title: 'Engine 1 Dispatch Audio',
                message: 'Engine 1 Dispatch Audio',
                user: 'u1a2b3c4d5e6f7g8h9',
                absolutePath: absPath
            });

            expect(result).to.be.true;
        });
    });
});
