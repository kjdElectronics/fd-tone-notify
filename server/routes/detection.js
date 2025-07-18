const express = require('express');
const { upload } = require('../middleware/upload.middleware');
const { parseDetectorConfig } = require('../middleware/detector-config.middleware');
const { detectTones } = require('../controllers/detection.controller');

const router = express.Router();

/**
 * POST /detect-tones
 * Upload a WAV file and detect tones
 * 
 * Body:
 * - file: WAV audio file (multipart/form-data)
 * - enableNotifications: boolean (optional, default: false)
 * - detectors: array of detector configurations (optional, overrides config)
 * - matchThreshold: number (optional, global override)
 * - tolerancePercent: number (optional, global override)
 * 
 * Response:
 * {
 *   "success": true,
 *   "requestId": "uuid",
 *   "processed": "2025-01-15T10:30:45.123Z",
 *   "filename": "uploaded-file.wav",
 *   "duration": "00:04.474",
 *   "durationSeconds": 4.474,
 *   "detections": [
 *     {
 *       "detector": "Fire Station 1",
 *       "tones": [567, 378],
 *       "timestamp": "00:01.250",
 *       "timestampSeconds": 1.25,
 *       "matchAverages": [567.2, 378.1],
 *       "message": "Fire Station 1 tone detected"
 *     }
 *   ]
 * }
 */
router.post('/detect-tones', (req, res) => {
    upload.single('file')(req, res, async (err) => {
        // Handle multer file validation errors
        if (err) {
            return res.status(400).json({
                success: false,
                error: err.message,
                requestId: require('uuid').v4()
            });
        }
        
        // Parse detector configuration
        parseDetectorConfig(req, res, async (configErr) => {
            if (configErr) {
                return res.status(configErr.statusCode || 400).json({
                    success: false,
                    error: configErr.message,
                    requestId: require('uuid').v4()
                });
            }
            
            // Call controller function
            await detectTones(req, res);
        });
    });
});

module.exports = router;