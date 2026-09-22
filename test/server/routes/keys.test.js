/**
 * Admin routes for managing control-plane API keys (objective 4):
 * GET /api/keys (list, no secrets), POST /api/keys {name, scopes} (returns
 * the full key ONCE), DELETE /api/keys/:id. All require admin scope or a UI
 * session, via the same authenticate('admin') middleware every other admin
 * route uses.
 */
const { expect } = require('chai');
const sinon = require('sinon');
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

const configFileUtil = require('../../../server/util/config.file.util');
const authMiddleware = require('../../../server/middleware/auth.middleware');

// authenticate() is a scope-taking factory - stub it as a bypass so this
// suite tests the keys routes/controller, not the auth layer itself
// (that's test/server/middleware/auth.middleware.test.js's job). Guarded
// with isSinonProxy per this repo's established cross-file stubbing
// convention (see e.g. config.controller.test.js).
const authStub = authMiddleware.authenticate.isSinonProxy
    ? authMiddleware.authenticate
    : sinon.stub(authMiddleware, 'authenticate');
authStub.callsFake((requiredScope) => (req, res, next) => next());

const keysRoutes = require('../../../server/routes/keys');

describe('API key management routes', function() {
    let app;
    let tempSecretsPath;
    let getSecretsFilePathStub;

    beforeEach(function() {
        app = express();
        app.use(express.json());
        app.use('/api/keys', keysRoutes);

        tempSecretsPath = path.join(os.tmpdir(), `fdtn-test-keys-routes-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
        fs.writeFileSync(tempSecretsPath, JSON.stringify({}));

        getSecretsFilePathStub = configFileUtil.getSecretsFilePath.isSinonProxy
            ? configFileUtil.getSecretsFilePath
            : sinon.stub(configFileUtil, 'getSecretsFilePath');
        getSecretsFilePathStub.returns(tempSecretsPath);
    });

    afterEach(function() {
        getSecretsFilePathStub.restore();
        try { fs.unlinkSync(tempSecretsPath); } catch (e) { /* ignore */ }
    });

    describe('GET /api/keys', function() {
        it('lists keys without ever including a hash', async function() {
            await request(app).post('/api/keys').send({ name: 'Key A', scopes: ['read'] }).expect(201);
            await request(app).post('/api/keys').send({ name: 'Key B', scopes: ['admin'] }).expect(201);

            const response = await request(app).get('/api/keys').expect(200);

            expect(response.body.success).to.be.true;
            expect(response.body.keys).to.have.length(2);
            response.body.keys.forEach(key => {
                expect(key).to.not.have.property('hash');
                expect(key).to.not.have.property('secret');
                expect(key).to.not.have.property('key');
            });
        });

        it('returns an empty list when no keys exist', async function() {
            const response = await request(app).get('/api/keys').expect(200);
            expect(response.body.keys).to.deep.equal([]);
        });
    });

    describe('POST /api/keys', function() {
        it('creates a key and returns the full plaintext key exactly once', async function() {
            const response = await request(app)
                .post('/api/keys')
                .send({ name: 'Control Plane', scopes: ['admin'] })
                .expect(201);

            expect(response.body.success).to.be.true;
            expect(response.body.key.key).to.match(/^fdtn_[0-9a-f]+\.[0-9a-f]+$/);
            expect(response.body.key.name).to.equal('Control Plane');
            expect(response.body.key.scopes).to.deep.equal(['admin']);

            // A subsequent list never exposes that plaintext key again.
            const listResponse = await request(app).get('/api/keys').expect(200);
            listResponse.body.keys.forEach(key => expect(key).to.not.have.property('key'));
        });

        it('rejects an invalid scope with 400', async function() {
            const response = await request(app)
                .post('/api/keys')
                .send({ name: 'Bad', scopes: ['superuser'] })
                .expect(400);

            expect(response.body.success).to.be.false;
        });

        it('rejects a missing name with 400', async function() {
            await request(app)
                .post('/api/keys')
                .send({ scopes: ['read'] })
                .expect(400);
        });
    });

    describe('DELETE /api/keys/:id', function() {
        it('deletes a key so it no longer appears in the list', async function() {
            const created = await request(app)
                .post('/api/keys')
                .send({ name: 'Doomed', scopes: ['read'] })
                .expect(201);
            const id = created.body.key.id;

            await request(app).delete(`/api/keys/${id}`).expect(200);

            const listResponse = await request(app).get('/api/keys').expect(200);
            expect(listResponse.body.keys.map(k => k.id)).to.not.include(id);
        });

        it('returns 404 for an unknown key id', async function() {
            await request(app).delete('/api/keys/does-not-exist').expect(404);
        });
    });
});
