/**
 * server/middleware/auth.middleware.js - the control-plane auth rewrite
 * (objective 4): POST /api/auth/login returns an opaque session token
 * instead of echoing the password back, and authenticate(scope) accepts
 * EITHER that session token OR a scoped `Authorization: Bearer fdtn_...`
 * API key.
 *
 * These run against real bcrypt/session/apiKeys code (not mocked), with a
 * temp secrets file so API key persistence is exercised for real - only
 * config.file.util's getSecretsFilePath() is stubbed to point at it.
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

// This suite tests auth.middleware.js's REAL implementation, but several
// other test files (e.g. config.controller.test.js) globally stub
// authMiddleware.authenticate to a route-auth bypass for their own
// purposes - and since mocha requires every spec file before running any
// test, that stub may already be in place by the time this file's
// top-level code runs, depending on file load order. Undo it here (if
// present) before capturing authenticate/login, so this suite always
// exercises the real thing. This doesn't affect any other file: they
// already captured their own reference to the stub function object at
// their own require time, independent of what the authMiddleware.authenticate
// *property* points to afterward.
const authMiddlewareModule = require('../../../server/middleware/auth.middleware');
if (authMiddlewareModule.authenticate.isSinonProxy) {
    authMiddlewareModule.authenticate.restore();
}
const { authenticate, login } = authMiddlewareModule;

const PASSWORD = 'test-password-123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4); // low cost factor - tests only

describe('server/middleware/auth.middleware', function() {
    let tempSecretsPath;
    let getSecretsFilePathStub;
    let previousUiPasswordHash;

    beforeEach(function() {
        tempSecretsPath = path.join(os.tmpdir(), `fdtn-test-auth-secrets-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
        fs.writeFileSync(tempSecretsPath, JSON.stringify({}));

        getSecretsFilePathStub = configFileUtil.getSecretsFilePath.isSinonProxy
            ? configFileUtil.getSecretsFilePath
            : sinon.stub(configFileUtil, 'getSecretsFilePath');
        getSecretsFilePathStub.returns(tempSecretsPath);

        previousUiPasswordHash = process.env.UI_PASSWORD_HASH;
        process.env.UI_PASSWORD_HASH = PASSWORD_HASH;

        sessions._clearAllSessions();
    });

    afterEach(function() {
        getSecretsFilePathStub.restore();
        try { fs.unlinkSync(tempSecretsPath); } catch (e) { /* ignore */ }
        process.env.UI_PASSWORD_HASH = previousUiPasswordHash;
        sessions._clearAllSessions();
    });

    describe('POST /login (via the login handler)', function() {
        function buildApp() {
            const app = express();
            app.use(express.json());
            app.post('/login', login);
            return app;
        }

        it('returns an opaque session token, not the password, for a correct password', async function() {
            const response = await request(buildApp())
                .post('/login')
                .send({ password: PASSWORD })
                .expect(200);

            expect(response.body.success).to.be.true;
            expect(response.body.token).to.be.a('string');
            expect(response.body.token).to.not.equal(PASSWORD);
            expect(sessions.isValidSession(response.body.token)).to.be.true;
        });

        it('returns 401 for an incorrect password', async function() {
            const response = await request(buildApp())
                .post('/login')
                .send({ password: 'wrong-password' })
                .expect(401);

            expect(response.body.success).to.be.false;
        });

        it('returns 400 when no password is provided', async function() {
            await request(buildApp())
                .post('/login')
                .send({})
                .expect(400);
        });
    });

    describe('authenticate(scope) - scope boundaries', function() {
        function buildApp() {
            const app = express();
            app.use(express.json());
            app.get('/read-route', authenticate('read'), (req, res) => res.json({ success: true, auth: req.auth }));
            app.post('/admin-route', authenticate('admin'), (req, res) => res.json({ success: true, auth: req.auth }));
            app.post('/ingest-route', authenticate('ingest'), (req, res) => res.json({ success: true, auth: req.auth }));
            return app;
        }

        it('401s a request with no Authorization header', async function() {
            await request(buildApp()).get('/read-route').expect(401);
        });

        it('401s a request with a garbage bearer token', async function() {
            await request(buildApp())
                .get('/read-route')
                .set('Authorization', 'Bearer not-a-real-token')
                .expect(401);
        });

        it('no longer accepts the raw UI password as a bearer token (must go through /login for a session)', async function() {
            await request(buildApp())
                .get('/read-route')
                .set('Authorization', `Bearer ${PASSWORD}`)
                .expect(401);
        });

        it('a UI session token satisfies every scope', async function() {
            const token = sessions.createSession();

            for (const routeInfo of [
                { method: 'get', path: '/read-route' },
                { method: 'post', path: '/admin-route' },
                { method: 'post', path: '/ingest-route' }
            ]) {
                const response = await request(buildApp())[routeInfo.method](routeInfo.path)
                    .set('Authorization', `Bearer ${token}`)
                    .expect(200);
                expect(response.body.auth.type).to.equal('session');
            }
        });

        it('a read-scoped API key can hit a read route but is 403d on an admin route', async function() {
            const created = await apiKeysModule.createApiKey({ name: 'Read Key', scopes: ['read'] });
            const app = buildApp();

            const readResponse = await request(app)
                .get('/read-route')
                .set('Authorization', `Bearer ${created.key}`)
                .expect(200);
            expect(readResponse.body.auth).to.deep.equal({ type: 'apiKey', id: created.id, name: 'Read Key', scopes: ['read'] });

            await request(app)
                .post('/admin-route')
                .set('Authorization', `Bearer ${created.key}`)
                .expect(403);
        });

        it('an ingest-scoped API key is 403d on a read route', async function() {
            const created = await apiKeysModule.createApiKey({ name: 'Ingest Key', scopes: ['ingest'] });

            await request(buildApp())
                .get('/read-route')
                .set('Authorization', `Bearer ${created.key}`)
                .expect(403);
        });

        it('an admin-scoped API key satisfies every scope', async function() {
            const created = await apiKeysModule.createApiKey({ name: 'Admin Key', scopes: ['admin'] });
            const app = buildApp();

            await request(app).get('/read-route').set('Authorization', `Bearer ${created.key}`).expect(200);
            await request(app).post('/admin-route').set('Authorization', `Bearer ${created.key}`).expect(200);
            await request(app).post('/ingest-route').set('Authorization', `Bearer ${created.key}`).expect(200);
        });

        it('401s a well-formed but revoked/unknown API key', async function() {
            await request(buildApp())
                .get('/read-route')
                .set('Authorization', 'Bearer fdtn_deadbeefdeadbeef.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
                .expect(401);
        });

        it('a deleted API key stops working immediately', async function() {
            const created = await apiKeysModule.createApiKey({ name: 'Soon Deleted', scopes: ['admin'] });
            const app = buildApp();

            await request(app).post('/admin-route').set('Authorization', `Bearer ${created.key}`).expect(200);

            await apiKeysModule.deleteApiKey(created.id);

            await request(app).post('/admin-route').set('Authorization', `Bearer ${created.key}`).expect(401);
        });
    });
});
