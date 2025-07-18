const { TonesDetectorConfig } = require('../../obj/config/TonesDetectorConfig');
const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');
const config = require('config');

/**
 * Middleware to parse and validate detector configuration from request body
 * Attaches parsed configuration to req.detectorConfig for use in controllers
 */
function parseDetectorConfig(req, res, next) {
    try {
        // Parse and validate request options
        const enableNotifications = parseBoolean(req.body.enableNotifications);
        const customDetectors = parseCustomDetectors(req.body.detectors);
        const globalMatchThreshold = parseNumericParam(req.body.matchThreshold, 'matchThreshold', 1, 100);
        const globalTolerancePercent = parseNumericParam(req.body.tolerancePercent, 'tolerancePercent', 0, 1);

        // Configure detectors (use custom or default config)
        const detectorsToUse = customDetectors || config.detection.detectors;
        const detectorConfigs = [];

        detectorsToUse.forEach(detectorConfig => {
            // Create TonesDetectorConfig with validation
            const detectorConfigObj = new TonesDetectorConfig({
                name: detectorConfig.name,
                tones: detectorConfig.tones,
                resetTimeoutMs: detectorConfig.resetTimeoutMs || config.detection.defaultResetTimeoutMs,
                lockoutTimeoutMs: detectorConfig.lockoutTimeoutMs || config.detection.defaultLockoutTimeoutMs,
                minRecordingLengthSec: detectorConfig.minRecordingLengthSec || config.detection.minRecordingLengthSec,
                maxRecordingLengthSec: detectorConfig.maxRecordingLengthSec || config.detection.maxRecordingLengthSec,
                matchThreshold: globalMatchThreshold || detectorConfig.matchThreshold || config.detection.defaultMatchThreshold,
                tolerancePercent: globalTolerancePercent || detectorConfig.tolerancePercent || config.detection.defaultTolerancePercent,
                isRecordingEnabled: false, // Force disable recording for API
                notifications: enableNotifications ? detectorConfig.notifications : null
            });

            detectorConfigs.push(detectorConfigObj);
        });

        // Attach parsed configuration to request object
        req.detectorConfig = {
            enableNotifications,
            customDetectors: !!customDetectors,
            globalOverrides: {
                matchThreshold: globalMatchThreshold,
                tolerancePercent: globalTolerancePercent
            },
            detectorConfigs
        };

        next();
    } catch (error) {
        next(error);
    }
}

/**
 * Parse and validate boolean parameter
 * @private
 */
function parseBoolean(value) {
    if (value === undefined || value === null) {
        return false;
    }
    
    if (typeof value === 'boolean') {
        return value;
    }
    
    if (typeof value === 'string') {
        const lowercaseValue = value.toLowerCase();
        if (lowercaseValue === 'true' || lowercaseValue === '1') {
            return true;
        }
        if (lowercaseValue === 'false' || lowercaseValue === '0') {
            return false;
        }
    }
    
    throw ErrorWithStatusCode.validation(`Invalid boolean value: ${value}. Must be true, false, 1, or 0`);
}

/**
 * Parse and validate numeric parameter
 * @private
 */
function parseNumericParam(value, paramName, min, max) {
    if (value === undefined || value === null) {
        return null;
    }
    
    const numValue = parseFloat(value);
    
    if (!Number.isFinite(numValue)) {
        throw ErrorWithStatusCode.validation(`${paramName} must be a valid number`);
    }
    
    if (numValue < min || numValue > max) {
        throw ErrorWithStatusCode.validation(`${paramName} must be between ${min} and ${max}`);
    }
    
    return numValue;
}

/**
 * Parse and validate custom detectors
 * @private
 */
function parseCustomDetectors(value) {
    if (value === undefined || value === null) {
        return null;
    }
    
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) {
                throw ErrorWithStatusCode.validation('Custom detectors must be an array');
            }
            return parsed;
        } catch (parseError) {
            throw ErrorWithStatusCode.validation(`Invalid JSON in detectors parameter: ${parseError.message}`);
        }
    }
    
    if (Array.isArray(value)) {
        return value;
    }
    
    throw ErrorWithStatusCode.validation('Custom detectors must be a JSON string or array');
}

module.exports = { parseDetectorConfig };