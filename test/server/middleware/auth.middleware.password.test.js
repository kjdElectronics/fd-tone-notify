/**
 * POST /api/auth/password (server/middleware/auth.middleware.js's
 * changePassword()) - lets a logged-in UI session change the UI password,
 * which the Vue UI uses to force a password change away from the shipped
 * default (docs/api.md's "change it before exposing the API" warning).
 *
 * Deliberately requires an actual UI session, not an API key (even an
 * admin-scoped one) - this is a UI-only flow for the person who just
 * authenticated with the password itself.
 *
 * Runs against the real bcrypt/session/apiKeys/config.file.util code (not
 * mocked), with a temp secrets file, mirroring
 * test/server/middleware/auth.middleware.test.js's pattern.
 */
const { expect } = require('chai');
const sinon = require('sinon');
const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const os = require('os');
const path = require('path');

const configFileUtil = require('../../../server/util/config.file.util');
const sessions = require('../../../server/auth/sessions');
const apiKeysModule = require('../../../server/auth/apiKeys');

// See auth.middleware.test.js for why this guard is needed: other suites
// globally stub authMiddleware.authenticate as a bypass, and mocha requires
// every spec file before running any test, so this file's own top-level
// code may run after that stub is already in place. Undo it so this suite
// always exercises the real authenticate()/changePassword().
const authMiddlewareModule = require('../../../server/middleware/auth.middleware');
if (authMiddlewareModule.authenticate.isSinonProxy) {
    authMiddlewareModule.authenticate.restore();
}
const { authenticate, changePassword } = authMiddlewareModule;

const CURRENT_PASSWORD = 'current-password-123';
const CURRENT_PASSWORD_HASH = bcrypt.hashSync(CURRENT_PASSWORD, 4); // low cost factor - tests only

describe('POST /api/auth/password (changePassword)', function() {
    let app;
    let tempSecretsPath;
    let getSecretsFilePathStub;
    let previousUiPasswordHash;

    beforeEach(function() {
        app = express();
        app.use(express.json());
        app.post('/api/auth/password', authenticate('admin'), changePassword);

        tempSecretsPath = path.join(os.tmpdir(), `fdtn-test-password-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
        fs.writeFileSync(tempSecretsPath, JSON.stringify({}));

        getSecretsFilePathStub = configFileUtil.getSecretsFilePath.isSinonProxy
            ? configFileUtil.getSecretsFilePath
            : sinon.stub(configFileUtil, 'getSecretsFilePath');
        getSecretsFilePathStub.returns(tempSecretsPath);

        previousUiPasswordHash = process.env.UI_PASSWORD_HASH;
        process.env.UI_PASSWORD_HASH = CURRENT_PASSWORD_HASH;

        sessions._clearAllSessions();
    });

    afterEach(function() {
        getSecretsFilePathStub.restore();
        try { fs.unlinkSync(tempSecretsPath); } catch (e) { /* ignore */ }
        process.env.UI_PASSWORD_HASH = previousUiPasswordHash;
        sessions._clearAllSessions();
    });

    it('401s with no Authorization header at all', async function() {
        await request(app)
            .post('/api/auth/password')
            .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'a-new-password' })
            .expect(401);
    });

    it('403s an admin-scoped API key - a UI session is required', async function() {
        const created = await apiKeysModule.createApiKey({ name: 'Admin Key', scopes: ['admin'] });

        const response = await request(app)
            .post('/api/auth/password')
            .set('Authorization', `Bearer ${created.key}`)
            .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'a-new-password' })
            .expect(403);

        expect(response.body.success).to.be.false;
    });

    it('400s when currentPassword or newPassword is missing', async function() {
        const token = sessions.createSession();

        await request(app)
            .post('/api/auth/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ currentPassword: CURRENT_PASSWORD })
            .expect(400);

        await request(app)
            .post('/api/auth/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ newPassword: 'a-new-password' })
            .expect(400);
    });

    it('400s a newPassword shorter than 8 characters', async function() {
        const token = sessions.createSession();

        const response = await request(app)
            .post('/api/auth/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'short' })
            .expect(400);

        expect(response.body.success).to.be.false;
    });

    it('401s an incorrect currentPassword and leaves UI_PASSWORD_HASH unchanged', async function() {
        const token = sessions.createSession();
        const hashBefore = process.env.UI_PASSWORD_HASH;

        const response = await request(app)
            .post('/api/auth/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ currentPassword: 'wrong-password', newPassword: 'a-new-password' })
            .expect(401);

        expect(response.body.success).to.be.false;
        expect(process.env.UI_PASSWORD_HASH).to.equal(hashBefore);
    });

    it('changes the password, persists it, and the old password stops working', async function() {
        const token = sessions.createSession();

        const response = await request(app)
            .post('/api/auth/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'a-brand-new-password' })
            .expect(200);

        expect(response.body.success).to.be.true;

        // The running process picks up the new hash immediately (no restart
        // needed) - the old password no longer verifies...
        expect(bcrypt.compareSync(CURRENT_PASSWORD, process.env.UI_PASSWORD_HASH)).to.be.false;
        // ...and the new one does.
        expect(bcrypt.compareSync('a-brand-new-password', process.env.UI_PASSWORD_HASH)).to.be.true;

        // ...and it was actually written to the secrets file, not just
        // process.env, so it survives a restart.
        const persisted = JSON.parse(fs.readFileSync(tempSecretsPath, 'utf8'));
        expect(bcrypt.compareSync('a-brand-new-password', persisted.UI_PASSWORD_HASH)).to.be.true;
    });

    it('preserves other keys already in the secrets file (e.g. API keys)', async function() {
        await apiKeysModule.createApiKey({ name: 'Keep Me', scopes: ['read'] });
        const token = sessions.createSession();

        await request(app)
            .post('/api/auth/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'a-brand-new-password' })
            .expect(200);

        const persisted = JSON.parse(fs.readFileSync(tempSecretsPath, 'utf8'));
        expect(persisted.apiKeys).to.have.length(1);
        expect(persisted.apiKeys[0].name).to.equal('Keep Me');
    });
});
