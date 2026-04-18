const config = require('config');
const log = require('../../util/logger');
const { TonesDetectorConfig } = require('../../obj/config/TonesDetectorConfig');

/**
 * Pure helpers for turning an incoming Rdio Scanner call-upload request into
 * the domain objects the detection pipeline needs (metadata, matching detector
 * configs). Stateless — no side effects other than logging.
 */

/**
 * Extract Rdio Scanner metadata from the request body.
 * @param {Object} req - Express request (req.body, req.file).
 * @param {string} requestId - Correlation id for logs.
 */
function extractRdioMetadata(req, requestId) {
    const metadata = {
        dateTime: req.body.dateTime,
        talkgroup: req.body.talkgroup,
        talkgroupLabel: (req.body.talkgroupLabel || '').trim(),
        talkgroupGroup: req.body.talkgroupGroup,
        talkgroupTag: req.body.talkgroupTag,
        system: req.body.system,
        systemLabel: req.body.systemLabel,
        source: req.body.source,
        frequency: req.body.frequency
    };

    log.info(`Rdio Scanner call: talkgroup=${metadata.talkgroup}, talkgroupLabel="${metadata.talkgroupLabel || 'N/A'}", system=${metadata.system || 'N/A'}, systemLabel="${metadata.systemLabel || 'N/A'}", source=${metadata.source || 'N/A'}, frequency=${metadata.frequency || 'N/A'}, dateTime=${metadata.dateTime || 'N/A'} (${requestId})`);

    if (req.file) {
        const fileSizeKB = (req.file.size / 1024).toFixed(1);
        log.info(`Rdio Scanner audio: filename="${req.file.originalname}", size=${fileSizeKB}KB, mimetype=${req.file.mimetype || 'unknown'} (${requestId})`);
    }

    return metadata;
}

/**
 * Find configured detectors whose `talkgroupFilter` matches the incoming
 * talkgroup label (case-insensitive, trimmed). Detectors without a filter are
 * never matched on an Rdio call — they only run for live audio.
 */
function findMatchingDetectors(talkgroupLabel) {
    const allDetectors = (config.detection && config.detection.detectors) || [];
    const incomingLabel = (talkgroupLabel || '').trim().toLowerCase();

    return allDetectors.filter(detector => {
        const filter = (detector.talkgroupFilter || '').trim();
        if (!filter) return false;
        return filter.toLowerCase() === incomingLabel;
    });
}

/**
 * Wrap raw detector config entries in TonesDetectorConfig instances, applying
 * global defaults for any fields the detector does not specify.
 */
function createMatchingDetectorConfigs(matchingDetectors) {
    return matchingDetectors.map(detectorConfig => new TonesDetectorConfig({
        name: detectorConfig.name,
        tones: detectorConfig.tones,
        talkgroupFilter: detectorConfig.talkgroupFilter,
        resetTimeoutMs: detectorConfig.resetTimeoutMs || config.detection.defaultResetTimeoutMs,
        lockoutTimeoutMs: detectorConfig.lockoutTimeoutMs || config.detection.defaultLockoutTimeoutMs,
        minRecordingLengthSec: detectorConfig.minRecordingLengthSec || config.detection.minRecordingLengthSec,
        maxRecordingLengthSec: detectorConfig.maxRecordingLengthSec || config.detection.maxRecordingLengthSec,
        matchThreshold: detectorConfig.matchThreshold || config.detection.defaultMatchThreshold,
        tolerancePercent: detectorConfig.tolerancePercent || config.detection.defaultTolerancePercent,
        isRecordingEnabled: detectorConfig.isRecordingEnabled !== undefined
            ? detectorConfig.isRecordingEnabled
            : config.detection.isRecordingEnabled,
        notifications: detectorConfig.notifications
    }));
}

module.exports = {
    extractRdioMetadata,
    findMatchingDetectors,
    createMatchingDetectorConfigs,
};
