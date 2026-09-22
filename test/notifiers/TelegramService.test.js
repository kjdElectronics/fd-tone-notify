require('dotenv').config();
// TelegramService reads FD_TELEGRAM_BOT_TOKEN once at module load (same
// pattern as PushBulletService.js/PushoverService.js), so it must be set
// before requiring. The require cache is busted first: other test files
// (e.g. test/bin/detectFromFiles.test.js, via service/DetectionService.js
// -> notifiers/index.js) may already have required this module - without
// the env var set - before this file's turn in mocha's load order, which
// would otherwise leave BOT_TOKEN captured as undefined regardless of what's
// set here.
process.env.FD_TELEGRAM_BOT_TOKEN = 'test-telegram-bot-token';
const telegramServicePath = require.resolve('../../notifiers/TelegramService');
delete require.cache[telegramServicePath];

const expect = require('chai').expect;
const nock = require('nock');
const path = require('path');
const { TelegramService } = require(telegramServicePath);

describe('TelegramService', function() {
    afterEach(function() {
        nock.cleanAll();
    });

    describe('push', function() {
        it('should POST chat_id/text to the bot API sendMessage endpoint', async function() {
            let capturedBody;
            nock('https://api.telegram.org')
                .post('/bottest-telegram-bot-token/sendMessage', body => { capturedBody = body; return true; })
                .reply(200, { ok: true, result: { message_id: 1 } });

            const result = await TelegramService.push({
                title: 'Engine 1',
                message: 'Tone detected',
                chatId: '-1001234567890'
            });

            expect(result).to.be.true;
            expect(capturedBody.chat_id).to.equal('-1001234567890');
            expect(capturedBody.text).to.include('Engine 1');
            expect(capturedBody.text).to.include('Tone detected');
        });

        it('should throw when the bot API returns an error', async function() {
            nock('https://api.telegram.org')
                .post('/bottest-telegram-bot-token/sendMessage')
                .reply(400, { ok: false, description: 'Bad Request: chat not found' });

            let error;
            try {
                await TelegramService.push({ title: 'Engine 1', message: 'Tone detected', chatId: 'bad-chat' });
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });
    });

    describe('pushFile', function() {
        it('should POST a multipart form with the audio file to sendAudio', async function() {
            const absPath = path.resolve('./test/wav', 'raw.wav');

            nock('https://api.telegram.org')
                .post('/bottest-telegram-bot-token/sendAudio')
                .reply(200, { ok: true, result: { message_id: 2 } });

            const result = await TelegramService.pushFile({
                title: 'Engine 1 Dispatch Audio',
                message: 'Engine 1 Dispatch Audio',
                chatId: '-1001234567890',
                absolutePath: absPath
            });

            expect(result).to.be.true;
        });
    });
});
