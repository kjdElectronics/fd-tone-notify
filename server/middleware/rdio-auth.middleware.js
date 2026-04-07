const crypto = require('crypto');
const log = require('../../util/logger');

/**
 * Authentication middleware for Rdio Scanner API endpoints.
 * Validates the 'key' field from multipart form data against the configured API key.
 */
function authenticateRdio(req, res, next) {
    // Get configured API key from environment or config
    const configuredApiKey = process.env.FD_RDIO_API_KEY;

    if (!configuredApiKey) {
        log.warning('Rdio Scanner API key not configured (FD_RDIO_API_KEY). Allowing request without authentication.');
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

    // Constant-time comparison to prevent timing attacks
    const keyBuffer = Buffer.from(String(providedKey));
    const configuredBuffer = Buffer.from(String(configuredApiKey));

    if (keyBuffer.length !== configuredBuffer.length || !crypto.timingSafeEqual(keyBuffer, configuredBuffer)) {
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
