const crypto = require('crypto');
const fs = require('fs').promises;
const log = require('../../util/logger');
// Referenced via the module object (not destructured) so tests can stub
// getSecretsFilePath() regardless of require order - see
// test/server/auth/apiKeys.test.js.
const configFileUtil = require('../util/config.file.util');

const KEY_PREFIX = 'fdtn_';
const VALID_SCOPES = ['admin', 'read', 'ingest'];

/**
 * API keys with scopes, replacing the old placeholder auth that echoed the
 * UI password back as the bearer token. A key is `fdtn_<keyId>.<secret>`;
 * only sha256(secret) is ever persisted (config/secrets.json's `apiKeys`
 * array), compared with a constant-time comparison.
 */

async function _readSecretsFile() {
    try {
        const data = await fs.readFile(configFileUtil.getSecretsFilePath(), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        log.warning(`Failed to read secrets file for API keys: ${error.message}`);
        return {};
    }
}

async function _writeSecretsFile(secretsData) {
    await fs.writeFile(configFileUtil.getSecretsFilePath(), JSON.stringify(secretsData, null, 2));
}

function _hashSecret(secret) {
    return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function _constantTimeEqual(hexA, hexB) {
    const bufA = Buffer.from(hexA, 'hex');
    const bufB = Buffer.from(hexB, 'hex');
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function _validateScopes(scopes) {
    return Array.isArray(scopes) && scopes.length > 0 && scopes.every(s => VALID_SCOPES.includes(s));
}

/**
 * Parse `fdtn_<id>.<secret>` into {id, secret}, or null if it doesn't match
 * the expected shape (caller decides what "not one of ours" means).
 */
function parseApiKey(bearerValue) {
    if (typeof bearerValue !== 'string' || !bearerValue.startsWith(KEY_PREFIX)) return null;

    const withoutPrefix = bearerValue.slice(KEY_PREFIX.length);
    const dotIndex = withoutPrefix.indexOf('.');
    if (dotIndex === -1) return null;

    const id = withoutPrefix.slice(0, dotIndex);
    const secret = withoutPrefix.slice(dotIndex + 1);
    if (!id || !secret) return null;

    return { id, secret };
}

/**
 * Create a new API key. Returns the full plaintext key ONCE - it is never
 * recoverable again after this call, only its hash is stored.
 * @param {{name: string, scopes: string[]}} params
 * @returns {Promise<{id, name, scopes, createdAt, key}>}
 */
async function createApiKey({ name, scopes }) {
    if (!name || typeof name !== 'string') {
        throw new Error('name is required and must be a string');
    }
    if (!_validateScopes(scopes)) {
        throw new Error(`scopes must be a non-empty array containing only: ${VALID_SCOPES.join(', ')}`);
    }

    const secrets = await _readSecretsFile();
    if (!Array.isArray(secrets.apiKeys)) secrets.apiKeys = [];

    const id = crypto.randomBytes(8).toString('hex');
    const secret = crypto.randomBytes(24).toString('hex');
    const createdAt = new Date().toISOString();

    secrets.apiKeys.push({ id, name, scopes, hash: _hashSecret(secret), createdAt, lastUsedAt: null });
    await _writeSecretsFile(secrets);

    return { id, name, scopes, createdAt, key: `${KEY_PREFIX}${id}.${secret}` };
}

/**
 * List API keys without their hashes (or any other secret material).
 * @returns {Promise<Array<{id, name, scopes, createdAt, lastUsedAt}>>}
 */
async function listApiKeys() {
    const secrets = await _readSecretsFile();
    const apiKeys = Array.isArray(secrets.apiKeys) ? secrets.apiKeys : [];
    return apiKeys.map(({ hash, ...rest }) => rest);
}

/**
 * Delete an API key by id.
 * @returns {Promise<boolean>} true if a key was removed, false if no key had that id
 */
async function deleteApiKey(id) {
    const secrets = await _readSecretsFile();
    if (!Array.isArray(secrets.apiKeys)) return false;

    const index = secrets.apiKeys.findIndex(key => key.id === id);
    if (index === -1) return false;

    secrets.apiKeys.splice(index, 1);
    await _writeSecretsFile(secrets);
    return true;
}

/**
 * Verify a full `fdtn_<id>.<secret>` key against the stored hash.
 * @returns {Promise<{id, name, scopes}|null>} null if the key is malformed,
 *   unknown, or the secret doesn't match.
 */
async function verifyApiKey(bearerValue) {
    const parsed = parseApiKey(bearerValue);
    if (!parsed) return null;

    const secrets = await _readSecretsFile();
    const apiKeys = Array.isArray(secrets.apiKeys) ? secrets.apiKeys : [];
    const record = apiKeys.find(key => key.id === parsed.id);
    if (!record) return null;

    if (!_constantTimeEqual(_hashSecret(parsed.secret), record.hash)) return null;

    record.lastUsedAt = new Date().toISOString();
    await _writeSecretsFile(secrets);

    return { id: record.id, name: record.name, scopes: record.scopes };
}

module.exports = {
    createApiKey,
    listApiKeys,
    deleteApiKey,
    verifyApiKey,
    parseApiKey,
    KEY_PREFIX,
    VALID_SCOPES
};
