const config = require('config');
const log = require('../../util/logger');

/**
 * Get current detector configuration
 */
async function getConfig(req, res) {
    try {
        const detectorConfigs = config.detection.detectors.map(detector => ({
            name: detector.name,
            tones: detector.tones,
            matchThreshold: detector.matchThreshold || config.detection.defaultMatchThreshold,
            tolerancePercent: detector.tolerancePercent || config.detection.defaultTolerancePercent,
            resetTimeoutMs: detector.resetTimeoutMs || config.detection.defaultResetTimeoutMs,
            lockoutTimeoutMs: detector.lockoutTimeoutMs || config.detection.defaultLockoutTimeoutMs
        }));

        res.json({
            success: true,
            detectors: detectorConfigs,
            defaults: {
                matchThreshold: config.detection.defaultMatchThreshold,
                tolerancePercent: config.detection.defaultTolerancePercent,
                resetTimeoutMs: config.detection.defaultResetTimeoutMs,
                lockoutTimeoutMs: config.detection.defaultLockoutTimeoutMs
            },
            audio: {
                sampleRate: config.audio.sampleRate,
                channels: config.audio.channels,
                frequencyScaleFactor: config.audio.frequencyScaleFactor
            }
        });
    } catch (error) {
        log.error(`API config error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = { getConfig };