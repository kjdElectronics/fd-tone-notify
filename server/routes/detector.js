const express = require('express');
const {
    getDetectors,
    getDetector,
    createDetector,
    updateDetector,
    deleteDetector
} = require('../controllers/detector.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * GET /detectors
 * Get all detectors from configuration
 */
router.get('/', authenticate, getDetectors);

/**
 * POST /detectors
 * Create a new detector with smart defaults
 * Supports both manual creation and discovery conversion
 */
router.post('/', authenticate, createDetector);

/**
 * GET /detectors/:id
 * Get a single detector by its stable UUID id, falling back to its numeric
 * array index for backwards compatibility.
 */
router.get('/:id', authenticate, getDetector);

/**
 * PUT /detectors/:id
 * Update an existing detector by id (UUID) or, for backwards compatibility, index
 */
router.put('/:id', authenticate, updateDetector);

/**
 * DELETE /detectors/:id
 * Delete a detector by id (UUID) or, for backwards compatibility, index
 */
router.delete('/:id', authenticate, deleteDetector);

module.exports = router;