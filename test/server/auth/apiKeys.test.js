/**
 * API keys with scopes (objective 4). Keys are `fdtn_<keyId>.<secret>`;
 * only sha256(secret) is ever persisted, under secrets.json's `apiKeys`
 * array. These tests point apiKeys.js at a real temp file (by stubbing
 * config.file.util's getSecretsFilePath, which apiKeys.js calls live via
 * the module object rather than destructuring - see apiKeys.js) so the
 * read/write/hash/compare round trip is exercised for real, not mocked.
 */
const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const os = require('os');
const path = require('path');

const configFileUtil = require('../../../server/util/config.file.util');
const apiKeys = require('../../../server/auth/apiKeys');

describe('server/auth/apiKeys', function() {
    let tempSecretsPath;
    let getSecretsFilePathStub;

    beforeEach(function() {
        tempSecretsPath = path.join(os.tmpdir(), `fdtn-test-secrets-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
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

    describe('createApiKey', function() {
        it('returns a key formatted as fdtn_<id>.<secret>', async function() {
            const result = await apiKeys.createApiKey({ name: 'Test Key', scopes: ['read'] });

            expect(result.key).to.match(/^fdtn_[0-9a-f]+\.[0-9a-f]+$/);
            expect(result.id).to.be.a('string').with.length.greaterThan(0);
            expect(result.name).to.equal('Test Key');
            expect(result.scopes).to.deep.equal(['read']);
            expect(result.createdAt).to.be.a('string');
        });

        it('persists only the sha256 hash of the secret, never the plaintext secret', async function() {
            const result = await apiKeys.createApiKey({ name: 'Test Key', scopes: ['admin'] });

            const persisted = JSON.parse(fs.readFileSync(tempSecretsPath, 'utf8'));
            expect(persisted.apiKeys).to.have.length(1);
            const record = persisted.apiKeys[0];
            expect(record.id).to.equal(result.id);
            expect(record.name).to.equal('Test Key');
            expect(record.scopes).to.deep.equal(['admin']);
            expect(record.hash).to.match(/^[0-9a-f]{64}$/); // sha256 hex digest
            expect(JSON.stringify(persisted)).to.not.include(result.key.split('.')[1]); // the raw secret
        });

        it('rejects an invalid scope', async function() {
            let error;
            try {
                await apiKeys.createApiKey({ name: 'Bad Key', scopes: ['superuser'] });
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });

        it('rejects a missing name', async function() {
            let error;
            try {
                await apiKeys.createApiKey({ scopes: ['read'] });
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });
    });

    describe('verifyApiKey', function() {
        it('returns {id, name, scopes} for a valid key', async function() {
            const created = await apiKeys.createApiKey({ name: 'Ingest Key', scopes: ['ingest'] });

            const verified = await apiKeys.verifyApiKey(created.key);

            expect(verified).to.deep.equal({ id: created.id, name: 'Ingest Key', scopes: ['ingest'] });
        });

        it('returns null for a key with the right id but wrong secret', async function() {
            const created = await apiKeys.createApiKey({ name: 'Ingest Key', scopes: ['ingest'] });
            const tampered = `fdtn_${created.id}.0000000000000000000000000000000000000000000000`;

            const verified = await apiKeys.verifyApiKey(tampered);

            expect(verified).to.be.null;
        });

        it('returns null for an unknown key id', async function() {
            const verified = await apiKeys.verifyApiKey('fdtn_deadbeefdeadbeef.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
            expect(verified).to.be.null;
        });

        it('returns null for a malformed key (no prefix, no separator)', async function() {
            expect(await apiKeys.verifyApiKey('not-an-api-key')).to.be.null;
            expect(await apiKeys.verifyApiKey('fdtn_missing-the-dot')).to.be.null;
        });

        it('records lastUsedAt after a successful verification', async function() {
            const created = await apiKeys.createApiKey({ name: 'Ingest Key', scopes: ['ingest'] });

            await apiKeys.verifyApiKey(created.key);

            const persisted = JSON.parse(fs.readFileSync(tempSecretsPath, 'utf8'));
            expect(persisted.apiKeys[0].lastUsedAt).to.be.a('string');
        });
    });

    describe('listApiKeys', function() {
        it('never includes the hash', async function() {
            await apiKeys.createApiKey({ name: 'Key A', scopes: ['read'] });
            await apiKeys.createApiKey({ name: 'Key B', scopes: ['admin'] });

            const list = await apiKeys.listApiKeys();

            expect(list).to.have.length(2);
            list.forEach(key => expect(key).to.not.have.property('hash'));
            expect(list.map(k => k.name)).to.have.members(['Key A', 'Key B']);
        });
    });

    describe('deleteApiKey', function() {
        it('removes the key so it no longer verifies', async function() {
            const created = await apiKeys.createApiKey({ name: 'Doomed Key', scopes: ['read'] });

            const deleted = await apiKeys.deleteApiKey(created.id);
            expect(deleted).to.be.true;

            expect(await apiKeys.verifyApiKey(created.key)).to.be.null;
            expect(await apiKeys.listApiKeys()).to.have.length(0);
        });

        it('returns false for an unknown id', async function() {
            expect(await apiKeys.deleteApiKey('does-not-exist')).to.be.false;
        });
    });
});
