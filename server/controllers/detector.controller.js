
const log = require('../../util/logger');
const {readConfigFile, createBackup, writeConfigFile, markConfigChanged} = require("../util/config.file.util");

/**
 * Get all detectors from configuration
 */
async function getDetectors(req, res) {
    try {
        const configData = await readConfigFile();
        const detectors = configData.detection?.detectors || [];
        
        res.json({
            success: true,
            detectors: detectors,
            count: detectors.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        log.error(`Failed to get detectors: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve detectors',
            details: error.message
        });
    }
}

/**
 * Create a new detector with smart defaults
 */
async function createDetector(req, res) {
    try {
        const detectorData = req.body;

        // Validate required fields
        const validationErrors = validateDetector(detectorData);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validationErrors
            });
        }

        // Create backup
        await createBackup();

        // Read current config
        const configData = await readConfigFile();
        
        // Apply smart defaults
        const newDetector = applyDefaults(detectorData, configData);
        
        // Ensure detectors array exists
        configData.detection = configData.detection || {};
        configData.detection.detectors = configData.detection.detectors || [];
        
        // Check for duplicate detector names
        const existingDetector = configData.detection.detectors.find(
            detector => detector.name === newDetector.name
        );
        if (existingDetector) {
            return res.status(400).json({
                success: false,
                error: 'Detector name already exists',
                details: `A detector with the name "${newDetector.name}" already exists`
            });
        }
        
        // Add new detector
        configData.detection.detectors.push(newDetector);
        
        // Write updated config
        await writeConfigFile(configData);
        
        log.info(`New detector created: ${newDetector.name}`);
        
        // Mark config as changed
        markConfigChanged(req);
        
        res.json({
            success: true,
            message: 'Detector created successfully',
            detector: newDetector,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        log.error(`Failed to create detector: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to create detector',
            details: error.message
        });
    }
}

/**
 * Update an existing detector
 */
async function updateDetector(req, res) {
    try {
        const detectorId = parseInt(req.params.id);
        const detectorData = req.body;

        // Validate detector data
        const validationErrors = validateDetector(detectorData, true);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validationErrors
            });
        }

        // Create backup
        await createBackup();

        // Read current config
        const configData = await readConfigFile();
        
        if (!configData.detection?.detectors || !Array.isArray(configData.detection.detectors)) {
            return res.status(404).json({
                success: false,
                error: 'No detectors found in configuration'
            });
        }
        
        // Find detector by index
        if (detectorId < 0 || detectorId >= configData.detection.detectors.length) {
            return res.status(404).json({
                success: false,
                error: 'Detector not found',
                details: `Detector index ${detectorId} does not exist`
            });
        }
        
        const existingDetector = configData.detection.detectors[detectorId];
        
        // Check for duplicate names (excluding current detector)
        if (detectorData.name && detectorData.name !== existingDetector.name) {
            const duplicateDetector = configData.detection.detectors.find(
                (detector, index) => index !== detectorId && detector.name === detectorData.name
            );
            if (duplicateDetector) {
                return res.status(400).json({
                    success: false,
                    error: 'Detector name already exists',
                    details: `A detector with the name "${detectorData.name}" already exists`
                });
            }
        }
        
        // Apply defaults to any missing fields and merge with existing detector
        const updatedDetector = applyDefaults({
            ...existingDetector,
            ...detectorData
        }, configData);
        
        // Update detector in config
        configData.detection.detectors[detectorId] = updatedDetector;
        
        // Write updated config
        await writeConfigFile(configData);
        
        log.info(`Detector updated: ${updatedDetector.name} (index: ${detectorId})`);
        
        // Mark config as changed
        markConfigChanged(req);
        
        res.json({
            success: true,
            message: 'Detector updated successfully',
            detector: updatedDetector,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        log.error(`Failed to update detector: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to update detector',
            details: error.message
        });
    }
}

/**
 * Delete a detector
 */
async function deleteDetector(req, res) {
    try {
        const detectorId = parseInt(req.params.id);

        // Create backup
        await createBackup();

        // Read current config
        const configData = await readConfigFile();
        
        if (!configData.detection?.detectors || !Array.isArray(configData.detection.detectors)) {
            return res.status(404).json({
                success: false,
                error: 'No detectors found in configuration'
            });
        }
        
        // Find detector by index
        if (detectorId < 0 || detectorId >= configData.detection.detectors.length) {
            return res.status(404).json({
                success: false,
                error: 'Detector not found',
                details: `Detector index ${detectorId} does not exist`
            });
        }
        
        const detectorToDelete = configData.detection.detectors[detectorId];
        
        // Remove detector from config
        configData.detection.detectors.splice(detectorId, 1);
        
        // Write updated config
        await writeConfigFile(configData);
        
        log.info(`Detector deleted: ${detectorToDelete.name} (index: ${detectorId})`);
        
        // Mark config as changed
        markConfigChanged(req);
        
        res.json({
            success: true,
            message: 'Detector deleted successfully',
            deletedDetector: detectorToDelete,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        log.error(`Failed to delete detector: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to delete detector',
            details: error.message
        });
    }
}

/**
 * Apply smart defaults to detector data
 */
function applyDefaults(detectorData, configData) {
    const defaults = configData.detection || {};
    
    return {
        name: detectorData.name || `New Tone ${new Date().toLocaleString()}`,
        tones: detectorData.tones || [],
        matchThreshold: detectorData.matchThreshold ?? defaults.defaultMatchThreshold ?? 6,
        tolerancePercent: detectorData.tolerancePercent ?? defaults.defaultTolerancePercent ?? 0.02,
        resetTimeoutMs: detectorData.resetTimeoutMs ?? defaults.defaultResetTimeoutMs ?? 5000,
        lockoutTimeoutMs: detectorData.lockoutTimeoutMs ?? defaults.defaultLockoutTimeoutMs ?? 7000,
        isRecordingEnabled: detectorData.isRecordingEnabled ?? defaults.isRecordingEnabled ?? true,
        minRecordingLengthSec: detectorData.minRecordingLengthSec ?? defaults.minRecordingLengthSec ?? 30,
        maxRecordingLengthSec: detectorData.maxRecordingLengthSec ?? defaults.maxRecordingLengthSec ?? 45,
        notifications: detectorData.notifications || {
            preRecording: {
                pushbullet: [],
                webhooks: [],
                externalCommands: [],
                emails: []
            },
            postRecording: {
                pushbullet: [],
                webhooks: [],
                externalCommands: [],
                emails: []
            }
        }
    };
}

/**
 * Validate detector data
 */
function validateDetector(detectorData, isUpdate = false) {
    const errors = [];
    
    // Name validation (required for new detectors)
    if (!isUpdate && (!detectorData.name || typeof detectorData.name !== 'string' || detectorData.name.trim() === '')) {
        errors.push('Detector name is required and must be a non-empty string');
    }
    
    // Tones validation (required for new detectors)
    if (!isUpdate && (!detectorData.tones || !Array.isArray(detectorData.tones) || detectorData.tones.length === 0)) {
        errors.push('Tones array is required and must contain at least one tone');
    }
    
    if (detectorData.tones && Array.isArray(detectorData.tones)) {
        for (let i = 0; i < detectorData.tones.length; i++) {
            const tone = detectorData.tones[i];
            if (typeof tone !== 'number' || tone < 100 || tone > 4000) {
                errors.push(`Tone at index ${i} must be a number between 100 and 4000 Hz`);
            }
        }
    }
    
    // Threshold validation
    if (detectorData.matchThreshold !== undefined) {
        if (typeof detectorData.matchThreshold !== 'number' || detectorData.matchThreshold < 1) {
            errors.push('Match threshold must be a positive number');
        }
    }
    
    // Tolerance validation
    if (detectorData.tolerancePercent !== undefined) {
        if (typeof detectorData.tolerancePercent !== 'number' || detectorData.tolerancePercent < 0 || detectorData.tolerancePercent > 1) {
            errors.push('Tolerance percent must be a number between 0 and 1');
        }
    }
    
    // Timeout validations
    if (detectorData.resetTimeoutMs !== undefined) {
        if (typeof detectorData.resetTimeoutMs !== 'number' || detectorData.resetTimeoutMs < 0) {
            errors.push('Reset timeout must be a non-negative number');
        }
    }
    
    if (detectorData.lockoutTimeoutMs !== undefined) {
        if (typeof detectorData.lockoutTimeoutMs !== 'number' || detectorData.lockoutTimeoutMs < 0) {
            errors.push('Lockout timeout must be a non-negative number');
        }
    }
    
    // Recording length validations
    if (detectorData.minRecordingLengthSec !== undefined) {
        if (typeof detectorData.minRecordingLengthSec !== 'number' || detectorData.minRecordingLengthSec < 1) {
            errors.push('Minimum recording length must be at least 1 second');
        }
    }
    
    if (detectorData.maxRecordingLengthSec !== undefined) {
        if (typeof detectorData.maxRecordingLengthSec !== 'number' || detectorData.maxRecordingLengthSec < 1) {
            errors.push('Maximum recording length must be at least 1 second');
        }
    }
    
    // Validate min < max for recording lengths
    if (detectorData.minRecordingLengthSec !== undefined && detectorData.maxRecordingLengthSec !== undefined) {
        if (detectorData.minRecordingLengthSec >= detectorData.maxRecordingLengthSec) {
            errors.push('Minimum recording length must be less than maximum recording length');
        }
    }
    
    return errors;
}

module.exports = { 
    getDetectors, 
    createDetector, 
    updateDetector, 
    deleteDetector 
};