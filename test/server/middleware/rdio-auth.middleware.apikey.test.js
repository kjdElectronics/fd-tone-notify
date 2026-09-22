/**
 * server/middleware/rdio-auth.middleware.js gains an alternative auth path
 * for POST /api/call-upload (objective 4/5): a scoped API key
 * (fdtn_<id>.<secret>, ingest or admin scope) sent as the same 'key' form
 * field Rdio Scanner already uses - kept separate from
 * rdio-auth.middleware.test.js, which locks in the legacy
 * FD_RDIO_API_KEY_HASH path still working unchanged.
 */
const { expect } = require('chai');
const sinon = require('sinon');
const path = require('path');
const os = require('os');
const fs = require('fs');

const configFileUtil = require('../../../server/util/config.file.util');
const apiKeysModule = require('../../../server/auth/apiKeys');

describe('Rdio Auth Middleware - API key path', function() {
    let authenticateRdio;
    let req, res, next;
    let statusCode, jsonResponse, nextCalled;
    let tempSecretsPath;
    let getSecretsFilePathStub;

    beforeEach(function() {
        delete require.cache[require.resolve('../../../server/middleware/rdio-auth.middleware')];
        authenticateRdio = require('../../../server/middleware/rdio-auth.middleware').authenticateRdio;

        delete process.env.FD_RDIO_API_KEY_HASH; // legacy path unconfigured for these tests

        tempSecretsPath = path.join(os.tmpdir(), `fdtn-test-rdio-apikey-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
        fs.writeFileSync(tempSecretsPath, JSON.stringify({}));
        getSecretsFilePathStub = configFileUtil.getSecretsFilePath.isSinonProxy
            ? configFileUtil.getSecretsFilePath
            : sinon.stub(configFileUtil, 'getSecretsFilePath');
        getSecretsFilePathStub.returns(tempSecretsPath);

        statusCode = null;
        jsonResponse = null;
        nextCalled = false;

        req = { body: {}, ip: '127.0.0.1' };
        res = {
            status(code) { statusCode = code; return this; },
            json(data) { jsonResponse = data; return this; }
        };
        next = () => { nextCalled = true; };
    });

    afterEach(function() {
        getSecretsFilePathStub.restore();
        try { fs.unlinkSync(tempSecretsPath); } catch (e) { /* ignore */ }
    });

    it('accepts a valid ingest-scoped API key', async function() {
        const created = await apiKeysModule.createApiKey({ name: 'Source A', scopes: ['ingest'] });
        req.body = { key: created.key };

        await authenticateRdio(req, res, next);

        expect(nextCalled).to.be.true;
        expect(statusCode).to.be.null;
    });

    it('accepts a valid admin-scoped API key (admin satisfies every scope)', async function() {
        const created = await apiKeysModule.createApiKey({ name: 'Admin', scopes: ['admin'] });
        req.body = { key: created.key };

        await authenticateRdio(req, res, next);

        expect(nextCalled).to.be.true;
    });

    it('rejects a well-formed but wrong API key with 401', async function() {
        await apiKeysModule.createApiKey({ name: 'Source A', scopes: ['ingest'] });
        req.body = { key: 'fdtn_deadbeefdeadbeef.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };

        await authenticateRdio(req, res, next);

        expect(nextCalled).to.be.false;
        expect(statusCode).to.equal(401);
        expect(jsonResponse).to.have.property('success', false);
    });

    it('rejects a read-scoped key (wrong scope) with 403', async function() {
        const created = await apiKeysModule.createApiKey({ name: 'Read Only', scopes: ['read'] });
        req.body = { key: created.key };

        await authenticateRdio(req, res, next);

        expect(nextCalled).to.be.false;
        expect(statusCode).to.equal(403);
        expect(jsonResponse).to.have.property('success', false);
    });

    it('tags req.ingestSource with the key id/name on success (for per-source tagging)', async function() {
        const created = await apiKeysModule.createApiKey({ name: 'Source A', scopes: ['ingest'] });
        req.body = { key: created.key };

        await authenticateRdio(req, res, next);

        expect(req.ingestSource).to.deep.equal({ id: created.id, name: 'Source A' });
    });
});
