const express = require('express');
const { getConfig, getConfiguration, updateConfig } = require('../controllers/config.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * GET /config
 * Get current detector configuration
 */
router.get('/', authenticate, getConfiguration);

/**
 * PUT /config/configuration
 * Update system configuration (requires authentication)
 */
router.put('/', authenticate, updateConfig);

module.exports = router;