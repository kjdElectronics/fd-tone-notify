const bcrypt = require('bcrypt');
const log = require('../../util/logger');
const apiKeys = require('../auth/apiKeys');

/**
 * Authentication middleware for Rdio Scanner API endpoints (POST
 * /api/call-upload). Accepts EITHER of two things in the 'key' form field
 * Rdio Scanner/SDRTrunk/Thin Line Radio already send:
 *
 *  - a scoped API key (fdtn_<id>.<secret>, ingest or admin scope) - the
 *    current, preferred way to authenticate ingest sources, checked first.
 *    On success, req.ingestSource is set to {id, name} for per-source
 *    tagging (see service/DetectionService.js / obj/SourceContext.js).
 *  - the legacy shared secret: a plain string compared against the
 *    configured bcrypt-hashed API key (FD_RDIO_API_KEY_HASH), kept working
 *    unchanged for existing installations.
 */
async function authenticateRdio(req, res, next) {
    // Rdio Scanner sends 'key' as a form field in multipart data
    const providedKey = req.body?.key;

    if (apiKeys.parseApiKey(providedKey)) {
        const keyInfo = await apiKeys.verifyApiKey(providedKey);
        if (!keyInfo) {
            log.warning(`Rdio Scanner auth failed: invalid API key from ${req.ip}`);
            return res.status(401).json({
                success: false,
                error: 'Invalid API key'
            });
        }

        const hasScope = keyInfo.scopes.includes('admin') || keyInfo.scopes.includes('ingest');
        if (!hasScope) {
            log.warning(`Rdio Scanner auth failed: API key "${keyInfo.name}" (${keyInfo.id}) lacks ingest scope from ${req.ip}`);
            return res.status(403).json({
                success: false,
                error: 'Insufficient scope: this route requires "ingest"'
            });
        }

        req.ingestSource = { id: keyInfo.id, name: keyInfo.name };
        log.debug(`Rdio Scanner authenticated via API key (${keyInfo.id}) from ${req.ip}`);
        return next();
    }

    // Legacy path: shared secret, FD_RDIO_API_KEY_HASH.
    const configuredApiKeyHash = process.env.FD_RDIO_API_KEY_HASH;

    if (!configuredApiKeyHash) {
        log.warning('Rdio Scanner API key hash not configured (FD_RDIO_API_KEY_HASH). Allowing request without authentication.');
        return next();
    }

    if (!providedKey) {
        log.warning(`Rdio Scanner auth failed: no API key provided from ${req.ip}`);
        return res.status(401).json({
            success: false,
            error: 'Authentication required. Provide API key in "key" field.'
        });
    }

    // Compare provided plain text key against stored bcrypt hash
    const isValidKey = bcrypt.compareSync(String(providedKey), configuredApiKeyHash);

    if (!isValidKey) {
        log.warning(`Rdio Scanner auth failed: invalid API key from ${req.ip}`);
        return res.status(401).json({
            success: false,
            error: 'Invalid API key'
        });
    }

    log.debug(`Rdio Scanner authenticated request from ${req.ip}`);
    next();
}

module.exports = { authenticateRdio };
