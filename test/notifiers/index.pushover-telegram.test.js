/**
 * notifiers/index.js's Pushover/Telegram dispatch (objective 6), exercised
 * end-to-end through sendPreRecordingNotifications/sendPostRecordingNotifications
 * with nock-mocked HTTP endpoints - mirrors the Pushbullet dispatch pattern.
 *
 * NOTE on module caching: notifiers/PushoverService.js and
 * notifiers/TelegramService.js each read their API token/bot token once at
 * module load time (same pattern as PushBulletService.js), and
 * notifiers/index.js captures a reference to those modules at ITS OWN load
 * time. Since notifiers/index.js is already required by several other test
 * files (e.g. via service/DetectionService.js), it may already be cached -
 * with stale (unset) token modules - by the time this file loads, depending
 * on mocha's file order. The require cache for all three is busted below,
 * after setting the env vars, to force fresh requires that capture them
 * regardless of what any other file already did (same technique as
 * test/server/routes/system.restart.test.js).
 */
process.env.FD_PUSHOVER_APP_TOKEN = 'test-pushover-app-token';
process.env.FD_TELEGRAM_BOT_TOKEN = 'test-telegram-bot-token';

[
    '../../notifiers/PushoverService',
    '../../notifiers/TelegramService',
    '../../notifiers/index',
].forEach(modulePath => {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
});

const { expect } = require('chai');
const nock = require('nock');
const path = require('path');
const { sendPreRecordingNotifications, sendPostRecordingNotifications } = require('../../notifiers/index');
const { NotificationParams } = require('../../obj/NotificationParams');
const { TonesDetector } = require('../../obj/TonesDetector');
const { TonesDetectorConfig } = require('../../obj/config/TonesDetectorConfig');

function buildDetector(notifications) {
    return new TonesDetector(new TonesDetectorConfig({
        name: 'Engine 1',
        tones: [850, 950],
        notifications
    }));
}

describe('notifiers/index - Pushover/Telegram dispatch', function() {
    afterEach(function() {
        nock.cleanAll();
    });

    describe('sendPreRecordingNotifications', function() {
        it('sends a Pushover push with the configured title/body/user', async function() {
            let capturedBody;
            nock('https://api.pushover.net')
                .post('/1/messages.json', body => { capturedBody = body; return true; })
                .reply(200, { status: 1 });

            const detector = buildDetector({
                preRecording: { pushover: [{ title: 'Engine 1', body: 'Tone detected', user: 'u1a2b3c4d5e6f7g8h9' }] }
            });
            const params = new NotificationParams({ detector, notifications: detector.notifications, filename: 'test.wav' });

            await sendPreRecordingNotifications(params);

            expect(capturedBody.user).to.equal('u1a2b3c4d5e6f7g8h9');
            expect(capturedBody.title).to.equal('Engine 1');
            expect(capturedBody.message).to.equal('Tone detected');
        });

        it('sends a Telegram message with the configured chatId', async function() {
            let capturedBody;
            nock('https://api.telegram.org')
                .post('/bottest-telegram-bot-token/sendMessage', body => { capturedBody = body; return true; })
                .reply(200, { ok: true });

            const detector = buildDetector({
                preRecording: { telegram: [{ title: 'Engine 1', body: 'Tone detected', chatId: '-1001234567890' }] }
            });
            const params = new NotificationParams({ detector, notifications: detector.notifications, filename: 'test.wav' });

            await sendPreRecordingNotifications(params);

            expect(capturedBody.chat_id).to.equal('-1001234567890');
            expect(capturedBody.text).to.include('Engine 1');
            expect(capturedBody.text).to.include('Tone detected');
        });

        it('prefixes the message with TEST when isTest is true', async function() {
            let capturedBody;
            nock('https://api.pushover.net')
                .post('/1/messages.json', body => { capturedBody = body; return true; })
                .reply(200, { status: 1 });

            const detector = buildDetector({
                preRecording: { pushover: [{ title: 'Engine 1', body: 'Tone detected', user: 'u1' }] }
            });
            const params = new NotificationParams({ detector, notifications: detector.notifications, filename: 'test.wav', isTest: true });

            await sendPreRecordingNotifications(params);

            expect(capturedBody.message).to.include('TEST');
        });
    });

    describe('sendPostRecordingNotifications', function() {
        const wavFixture = path.resolve('./test/wav', 'raw.wav');

        it('sends the dispatch audio via Pushover attachment', async function() {
            nock('https://api.pushover.net')
                .post('/1/messages.json')
                .reply(200, { status: 1 });

            const detector = buildDetector({
                postRecording: { pushover: [{ title: 'Engine 1', body: 'Tone detected', user: 'u1' }] }
            });
            const params = new NotificationParams({
                detector, notifications: detector.notifications, filename: wavFixture, attachFile: true
            });

            const results = await sendPostRecordingNotifications(params);
            expect(results.every(r => r.status === 'fulfilled')).to.be.true;
        });

        it('sends the dispatch audio via Telegram sendAudio', async function() {
            nock('https://api.telegram.org')
                .post('/bottest-telegram-bot-token/sendAudio')
                .reply(200, { ok: true });

            const detector = buildDetector({
                postRecording: { telegram: [{ title: 'Engine 1', body: 'Tone detected', chatId: '-1001234567890' }] }
            });
            const params = new NotificationParams({
                detector, notifications: detector.notifications, filename: wavFixture, attachFile: true
            });

            const results = await sendPostRecordingNotifications(params);
            expect(results.every(r => r.status === 'fulfilled')).to.be.true;
        });
    });
});
