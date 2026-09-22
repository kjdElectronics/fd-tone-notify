const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const apiKeys = require('../auth/apiKeys');
const log = require('../../util/logger');

/**
 * GET /api/keys
 * List API keys (never includes hashes or plaintext secrets).
 */
router.get('/', authenticate('admin'), async (req, res) => {
    try {
        const keys = await apiKeys.listApiKeys();
        res.json({ success: true, keys });
    } catch (error) {
        log.error(`Failed to list API keys: ${error.message}`);
        res.status(500).json({ success: false, error: 'Failed to list API keys' });
    }
});

/**
 * POST /api/keys
 * Create a new API key. The full plaintext key is only ever returned in
 * this response - only its hash is persisted.
 * Body: { name: string, scopes: ('admin'|'read'|'ingest')[] }
 */
router.post('/', authenticate('admin'), async (req, res) => {
    try {
        const { name, scopes } = req.body;
        const key = await apiKeys.createApiKey({ name, scopes });
        log.info(`API key "${name}" created with scopes [${scopes}] by ${req.ip}`);
        res.status(201).json({ success: true, key });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/keys/:id
 * Revoke an API key by id.
 */
router.delete('/:id', authenticate('admin'), async (req, res) => {
    try {
        const deleted = await apiKeys.deleteApiKey(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'API key not found' });
        }
        log.info(`API key ${req.params.id} deleted by ${req.ip}`);
        res.json({ success: true, message: 'API key deleted' });
    } catch (error) {
        log.error(`Failed to delete API key: ${error.message}`);
        res.status(500).json({ success: false, error: 'Failed to delete API key' });
    }
});

module.exports = router;
