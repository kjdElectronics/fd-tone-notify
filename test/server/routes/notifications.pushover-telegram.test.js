/**
 * POST /api/notifications/test exercising Pushover and Telegram end to end
 * (objective 6 acceptance: "POST /api/notifications/test for pushover and
 * telegram hit nock-mocked endpoints in tests"). service/NotificationTestService.js
 * reads notification types generically, so no changes were needed there -
 * this locks in that it actually works through the real HTTP route.
 */
process.env.FD_PUSHOVER_APP_TOKEN = 'test-pushover-app-token';
process.env.FD_TELEGRAM_BOT_TOKEN = 'test-telegram-bot-token';
[
    '../../../notifiers/PushoverService',
    '../../../notifiers/TelegramService',
    '../../../notifiers/index',
].forEach(modulePath => {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
});

const { expect } = require('chai');
const sinon = require('sinon');
const request = require('supertest');
const express = require('express');
const config = require('config');
const nock = require('nock');

const authMiddleware = require('../../../server/middleware/auth.middleware');
const authStub = authMiddleware.authenticate.isSinonProxy
    ? authMiddleware.authenticate
    : sinon.stub(authMiddleware, 'authenticate');
authStub.callsFake((requiredScope) => (req, res, next) => next());

const notificationsRoutes = require('../../../server/routes/notifications');

describe('POST /api/notifications/test - Pushover/Telegram', function() {
    let app;
    let detectionStub;

    beforeEach(function() {
        app = express();
        app.use(express.json());
        app.use('/api/notifications', notificationsRoutes);

        detectionStub = config.detection.isSinonProxy ? config.detection : sinon.stub(config, 'detection');
        detectionStub.value({
            detectors: [{
                name: 'Engine 1',
                tones: [850, 950],
                notifications: {
                    preRecording: {
                        pushover: [{ title: 'Engine 1', body: 'Tone detected', user: 'u1a2b3c4d5e6f7g8h9' }],
                        telegram: [{ title: 'Engine 1', body: 'Tone detected', chatId: '-1001234567890' }]
                    }
                }
            }]
        });
    });

    afterEach(function() {
        if (detectionStub.restore) detectionStub.restore();
        nock.cleanAll();
    });

    it('hits the Pushover and Telegram APIs when testing all notifications', async function() {
        const pushoverScope = nock('https://api.pushover.net').post('/1/messages.json').reply(200, { status: 1 });
        const telegramScope = nock('https://api.telegram.org')
            .post('/bottest-telegram-bot-token/sendMessage')
            .reply(200, { ok: true });

        const response = await request(app)
            .post('/api/notifications/test')
            .send({ testAll: true })
            .expect(200);

        expect(response.body.success).to.be.true;
        expect(pushoverScope.isDone()).to.be.true;
        expect(telegramScope.isDone()).to.be.true;
    });

    it('hits only the Pushover API when testing a single pushover notification', async function() {
        const pushoverScope = nock('https://api.pushover.net').post('/1/messages.json').reply(200, { status: 1 });

        const response = await request(app)
            .post('/api/notifications/test')
            .send({ detectorName: 'Engine 1', trigger: 'preRecording', type: 'pushover', index: 0 })
            .expect(200);

        expect(response.body.success).to.be.true;
        expect(pushoverScope.isDone()).to.be.true;
    });

    it('hits only the Telegram API when testing a single telegram notification', async function() {
        const telegramScope = nock('https://api.telegram.org')
            .post('/bottest-telegram-bot-token/sendMessage')
            .reply(200, { ok: true });

        const response = await request(app)
            .post('/api/notifications/test')
            .send({ detectorName: 'Engine 1', trigger: 'preRecording', type: 'telegram', index: 0 })
            .expect(200);

        expect(response.body.success).to.be.true;
        expect(telegramScope.isDone()).to.be.true;
    });
});
