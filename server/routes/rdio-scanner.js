const express = require('express');
const { rdioUpload } = require('../middleware/upload.middleware');
const { authenticateRdio } = require('../middleware/rdio-auth.middleware');
const { handleCallUpload } = require('../controllers/rdio-scanner.controller');

const router = express.Router();

/**
 * POST /api/call-upload
 * Rdio Scanner compatible call upload endpoint.
 *
 * Accepts multipart/form-data with:
 * - key: API authentication key
 * - audio: Audio file (WAV, MP3, etc.)
 * - dateTime: RFC3339 or Unix timestamp
 * - talkgroup: Talkgroup ID (integer)
 * - talkgroupLabel: Talkgroup name (string) - used for detector matching
 * - talkgroupGroup: Talkgroup category (string, optional)
 * - talkgroupTag: Talkgroup tag (string, optional)
 * - system: System ID (integer, optional)
 * - systemLabel: System name (string, optional)
 * - source: Unit/source identifier (integer, optional)
 * - frequency: Call frequency in Hz (integer, optional)
 *
 * Response: "Call imported successfully" (200) on success
 */
router.post('/', (req, res) => {
    rdioUpload.single('audio')(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }

        // Authenticate after multer has parsed the form fields
        authenticateRdio(req, res, async (authErr) => {
            if (authErr) {
                // Clean up uploaded file if auth fails
                if (req.file) {
                    const fs = require('fs');
                    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
                }
                return res.status(authErr.statusCode || 401).json({
                    success: false,
                    error: authErr.message
                });
            }

            await handleCallUpload(req, res);
        });
    });
});

module.exports = router;
