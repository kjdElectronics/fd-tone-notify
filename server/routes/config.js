const express = require('express');
const { getConfig } = require('../controllers/config.controller');

const router = express.Router();

/**
 * GET /config
 * Get current detector configuration
 */
router.get('/', getConfig);

module.exports = router;