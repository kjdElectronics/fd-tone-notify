/**
 * GET/PUT /api/config's secrets handling (server/controllers/config.controller.js):
 * - getConfiguration() never echoes write-only secrets back to the UI, even
 *   when they're set in the secrets file: UI_PASSWORD_HASH plus the newer
 *   FD_PUSHOVER_APP_TOKEN, FD_TELEGRAM_BOT_TOKEN, FD_DETECTION_WEBHOOK_URL,
 *   FD_DETECTION_WEBHOOK_SECRET.
 * - updateConfig()'s allow-list (updateSecretsFromData()) accepts those same
 *   four new keys and persists them to the secrets file, alongside the
 *   pre-existing ones.
 *
 * config.controller.js destructures getSecretsFilePath/getConfigFilePath/
 * readConfigFile/writeConfigFile/createBackup/markConfigChanged from
 * server/util/config.file.util ONCE at require time (see
 * system.restart.test.js's note on this repo-wide pattern) - stub
 * config.file.util first, then force a fresh require of
 * config.controller.js so it captures the stubs, instead of the real
 * functions (which would otherwise touch the real config/secrets.json).
 */
const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const os = require('os');
const path = require('path');

const configFileUtil = require('../../../server/util/config.file.util');

const stubbedNames = ['getSecretsFilePath', 'getConfigFilePath', 'readConfigFile', 'writeConfigFile', 'createBackup', 'markConfigChanged'];
const stubs = {};
stubbedNames.forEach(name => {
    stubs[name] = configFileUtil[name].isSinonProxy ? configFileUtil[name] : sinon.stub(configFileUtil, name);
});

const controllerPath = require.resolve('../../../server/controllers/config.controller');
delete require.cache[controllerPath];
const { getConfiguration, updateConfig } = require(controllerPath);

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; }
    };
}

describe('config.controller secrets handling', function() {
    let tempSecretsPath;

    beforeEach(function() {
        stubbedNames.forEach(name => stubs[name].resetHistory());

        tempSecretsPath = path.join(os.tmpdir(), `fdtn-test-config-secrets-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
        fs.writeFileSync(tempSecretsPath, JSON.stringify({
            FD_PUSHBULLET_API_KEY: 'pb-key',
            FD_PUSHOVER_APP_TOKEN: 'pushover-token',
            FD_TELEGRAM_BOT_TOKEN: 'telegram-token',
            FD_DETECTION_WEBHOOK_URL: 'https://example.com/webhook',
            FD_DETECTION_WEBHOOK_SECRET: 'webhook-secret',
            UI_PASSWORD_HASH: '$2b$10$fakehash'
        }));

        stubs.getSecretsFilePath.returns(tempSecretsPath);
        stubs.getConfigFilePath.returns('/fake/default.json');
        stubs.readConfigFile.resolves({ audio: {}, detection: { detectors: [] } });
        stubs.createBackup.resolves();
        stubs.writeConfigFile.resolves();
        stubs.markConfigChanged.returns();
    });

    afterEach(function() {
        try { fs.unlinkSync(tempSecretsPath); } catch (e) { /* ignore */ }
    });

    describe('GET /api/config (getConfiguration)', function() {
        it('never includes write-only secrets in the response', async function() {
            const res = mockRes();
            await getConfiguration({}, res);

            expect(res.body.success).to.be.true;
            expect(res.body.secrets).to.not.have.property('UI_PASSWORD_HASH');
            expect(res.body.secrets).to.not.have.property('FD_PUSHOVER_APP_TOKEN');
            expect(res.body.secrets).to.not.have.property('FD_TELEGRAM_BOT_TOKEN');
            expect(res.body.secrets).to.not.have.property('FD_DETECTION_WEBHOOK_URL');
            expect(res.body.secrets).to.not.have.property('FD_DETECTION_WEBHOOK_SECRET');

            // Sanity: a non-write-only secret is still returned as before.
            expect(res.body.secrets.FD_PUSHBULLET_API_KEY).to.equal('pb-key');
        });
    });

    describe('PUT /api/config (updateConfig)', function() {
        it('accepts and persists FD_PUSHOVER_APP_TOKEN, FD_TELEGRAM_BOT_TOKEN, FD_DETECTION_WEBHOOK_URL, FD_DETECTION_WEBHOOK_SECRET', async function() {
            const req = {
                body: {
                    configuration: {
                        FD_PUSHOVER_APP_TOKEN: 'new-pushover-token',
                        FD_TELEGRAM_BOT_TOKEN: 'new-telegram-token',
                        FD_DETECTION_WEBHOOK_URL: 'https://example.com/new-webhook',
                        FD_DETECTION_WEBHOOK_SECRET: 'new-webhook-secret'
                    }
                },
                app: {}
            };
            const res = mockRes();

            await updateConfig(req, res);

            expect(res.body.success).to.be.true;

            const persisted = JSON.parse(fs.readFileSync(tempSecretsPath, 'utf8'));
            expect(persisted.FD_PUSHOVER_APP_TOKEN).to.equal('new-pushover-token');
            expect(persisted.FD_TELEGRAM_BOT_TOKEN).to.equal('new-telegram-token');
            expect(persisted.FD_DETECTION_WEBHOOK_URL).to.equal('https://example.com/new-webhook');
            expect(persisted.FD_DETECTION_WEBHOOK_SECRET).to.equal('new-webhook-secret');
        });
    });
});
