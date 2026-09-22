/**
 * util/config.secrets.js loads a fixed list of named secrets from a secrets
 * file into process.env. FD_PUSHOVER_APP_TOKEN/FD_TELEGRAM_BOT_TOKEN
 * (objective 6) must be in that list, or notifiers/PushoverService.js /
 * notifiers/TelegramService.js never see them when configured via
 * config/secrets.json rather than a real env var.
 */
const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { populateSecretsEnvVar } = require('../../util/config.secrets');

describe('util/config.secrets - populateSecretsEnvVar', function() {
    let tempSecretsPath;
    let previousPushoverToken;
    let previousTelegramToken;

    beforeEach(function() {
        tempSecretsPath = path.join(os.tmpdir(), `fdtn-test-secrets-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
        previousPushoverToken = process.env.FD_PUSHOVER_APP_TOKEN;
        previousTelegramToken = process.env.FD_TELEGRAM_BOT_TOKEN;
        delete process.env.FD_PUSHOVER_APP_TOKEN;
        delete process.env.FD_TELEGRAM_BOT_TOKEN;
    });

    afterEach(function() {
        try { fs.unlinkSync(tempSecretsPath); } catch (e) { /* ignore */ }
        if (previousPushoverToken === undefined) delete process.env.FD_PUSHOVER_APP_TOKEN;
        else process.env.FD_PUSHOVER_APP_TOKEN = previousPushoverToken;
        if (previousTelegramToken === undefined) delete process.env.FD_TELEGRAM_BOT_TOKEN;
        else process.env.FD_TELEGRAM_BOT_TOKEN = previousTelegramToken;
    });

    it('loads FD_PUSHOVER_APP_TOKEN from the secrets file into process.env', function() {
        fs.writeFileSync(tempSecretsPath, JSON.stringify({ FD_PUSHOVER_APP_TOKEN: 'from-secrets-file' }));

        populateSecretsEnvVar({ secretsPath: tempSecretsPath });

        expect(process.env.FD_PUSHOVER_APP_TOKEN).to.equal('from-secrets-file');
    });

    it('loads FD_TELEGRAM_BOT_TOKEN from the secrets file into process.env', function() {
        fs.writeFileSync(tempSecretsPath, JSON.stringify({ FD_TELEGRAM_BOT_TOKEN: 'from-secrets-file' }));

        populateSecretsEnvVar({ secretsPath: tempSecretsPath });

        expect(process.env.FD_TELEGRAM_BOT_TOKEN).to.equal('from-secrets-file');
    });
});
