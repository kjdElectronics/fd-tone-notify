const log = require('../../util/logger');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const sessions = require('../auth/sessions');
const apiKeys = require('../auth/apiKeys');
const configFileUtil = require('../util/config.file.util');

function extractBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    return authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
}

/**
 * Express middleware factory for the control plane's auth. Accepts EITHER:
 *
 *  - the UI session token issued by POST /api/auth/login (any requiredScope
 *    is satisfied - the UI itself has always had full access), or
 *  - `Authorization: Bearer fdtn_<id>.<secret>` API key with the given
 *    scope (an "admin"-scoped key satisfies every requiredScope).
 *
 * On success, sets req.auth to {type: 'session', scopes: ['admin']} or
 * {type: 'apiKey', id, name, scopes}.
 *
 * @param {'read'|'admin'|'ingest'} requiredScope
 * @returns {import('express').RequestHandler}
 */
function authenticate(requiredScope) {
    return async function (req, res, next) {
        try {
            const token = extractBearerToken(req);

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    message: 'Please provide Authorization header'
                });
            }

            if (sessions.isValidSession(token)) {
                req.auth = { type: 'session', scopes: ['admin'] };
                log.debug(`Successful session authentication from ${req.ip}`);
                return next();
            }

            if (apiKeys.parseApiKey(token)) {
                const keyInfo = await apiKeys.verifyApiKey(token);
                if (!keyInfo) {
                    log.warning(`Failed API key authentication attempt from ${req.ip}`);
                    return res.status(401).json({ success: false, error: 'Invalid API key' });
                }

                const hasScope = keyInfo.scopes.includes('admin') || keyInfo.scopes.includes(requiredScope);
                if (!hasScope) {
                    log.warning(`API key "${keyInfo.name}" (${keyInfo.id}) lacks required scope "${requiredScope}" from ${req.ip}`);
                    return res.status(403).json({
                        success: false,
                        error: `Insufficient scope: this route requires "${requiredScope}"`
                    });
                }

                req.auth = { type: 'apiKey', id: keyInfo.id, name: keyInfo.name, scopes: keyInfo.scopes };
                log.debug(`Successful API key (${keyInfo.id}) authentication from ${req.ip}`);
                return next();
            }

            log.warning(`Failed authentication attempt from ${req.ip}`);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        } catch (error) {
            log.error(`Authentication error: ${error.message}`);
            return res.status(500).json({ success: false, error: 'Authentication failed' });
        }
    };
}

/**
 * Login endpoint. Exchanges the UI password for an opaque session token
 * (server/auth/sessions.js) - NOT the password itself. The Vue UI treats
 * the returned token opaquely already (stores it, sends it back as
 * `Authorization: Bearer <token>`), so nothing about the UI needs to change
 * for this.
 */
function login(req, res) {
    const { password } = req.body;
    const uiPassword = process.env.UI_PASSWORD_HASH;

    if (!password) {
        return res.status(400).json({
            success: false,
            error: 'Password is required'
        });
    }

    const isValidPassword = bcrypt.compareSync(password, uiPassword);

    if (!isValidPassword) {
        log.warning('Failed login attempt from ' + req.ip);
        return res.status(401).json({
            success: false,
            error: 'Invalid password'
        });
    }

    const token = sessions.createSession();
    log.info('Successful login from ' + req.ip);
    res.json({
        success: true,
        token,
        message: 'Authentication successful'
    });
}

/**
 * Hash a password using bcrypt
 * @param {string} plainTextPassword - The plain text password to hash
 * @returns {string} The hashed password
 */
function hashPassword(plainTextPassword) {
    return bcrypt.hashSync(plainTextPassword, 10);
}

/**
 * Persist a new UI_PASSWORD_HASH into the secrets file, preserving every
 * other key already in it (API keys, other FD_* secrets, etc). Mirrors the
 * read/write pattern in server/auth/apiKeys.js.
 * @param {string} newHash
 */
async function _persistPasswordHash(newHash) {
    let secrets = {};
    try {
        const data = await fs.readFile(configFileUtil.getSecretsFilePath(), 'utf8');
        secrets = JSON.parse(data);
    } catch (error) {
        log.warning(`Failed to read secrets file while changing UI password: ${error.message}`);
    }

    secrets.UI_PASSWORD_HASH = newHash;
    await fs.writeFile(configFileUtil.getSecretsFilePath(), JSON.stringify(secrets, null, 2));
}

/**
 * POST /api/auth/password - change the UI password. Requires an actual UI
 * session (not an API key, even an admin-scoped one): this is a UI-only
 * flow for the person who just logged in with the password to change it,
 * mirrored by the "force a password change on the default password" prompt
 * in the Vue UI. Verifies the current password before accepting a new one,
 * hashes it the same way as the rest of the app (bcrypt, see
 * hashPassword()), and persists it to the secrets file, keeping
 * UI_PASSWORD_HASH as the source of truth (env var or config/secrets.json -
 * see util/config.secrets.js).
 */
async function changePassword(req, res) {
    if (!req.auth || req.auth.type !== 'session') {
        return res.status(403).json({
            success: false,
            error: 'A UI session is required to change the password (API keys cannot be used for this route)'
        });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            error: 'currentPassword and newPassword are required'
        });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({
            success: false,
            error: 'newPassword must be at least 8 characters'
        });
    }

    const currentHash = process.env.UI_PASSWORD_HASH;
    if (!currentHash || !bcrypt.compareSync(currentPassword, currentHash)) {
        log.warning('Failed password change attempt (incorrect current password) from ' + req.ip);
        return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const newHash = hashPassword(newPassword);

    try {
        await _persistPasswordHash(newHash);
    } catch (error) {
        log.error(`Failed to persist new UI password: ${error.message}`);
        return res.status(500).json({ success: false, error: 'Failed to save new password' });
    }

    // Keep the running process in sync so the new password works immediately,
    // without waiting for a restart to reload it from the secrets file.
    process.env.UI_PASSWORD_HASH = newHash;

    log.info('UI password changed from ' + req.ip);
    res.json({ success: true, message: 'Password changed successfully' });
}

module.exports = { authenticate, login, hashPassword, changePassword };
