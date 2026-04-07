
const log = require('../../util/logger');
const {readConfigFile, createBackup, writeConfigFile, markConfigChanged} = require("../util/config.file.util");
const { validateDetector } = require('../domain/detector.validation');

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
        talkgroupFilter: detectorData.talkgroupFilter ?? '',
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


module.exports = { 
    getDetectors, 
    createDetector, 
    updateDetector, 
    deleteDetector 
};