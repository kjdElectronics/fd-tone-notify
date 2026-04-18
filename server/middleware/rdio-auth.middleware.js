const bcrypt = require('bcrypt');
const log = require('../../util/logger');

/**
 * Authentication middleware for Rdio Scanner API endpoints.
 * Validates the 'key' field from multipart form data against the configured
 * bcrypt-hashed API key (matching the auth.middleware.js pattern).
 */
function authenticateRdio(req, res, next) {
    // Get configured API key hash from environment or config
    const configuredApiKeyHash = process.env.FD_RDIO_API_KEY_HASH;

    if (!configuredApiKeyHash) {
        log.warning('Rdio Scanner API key hash not configured (FD_RDIO_API_KEY_HASH). Allowing request without authentication.');
        return next();
    }

    // Rdio Scanner sends 'key' as a form field in multipart data
    const providedKey = req.body?.key;

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
