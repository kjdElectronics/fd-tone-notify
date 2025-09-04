const express = require('express');
const { 
    getDetectors, 
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
 * PUT /detectors/:id
 * Update an existing detector by index
 */
router.put('/:id', authenticate, updateDetector);

/**
 * DELETE /detectors/:id
 * Delete a detector by index
 */
router.delete('/:id', authenticate, deleteDetector);

module.exports = router;