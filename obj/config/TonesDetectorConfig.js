const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');
const { NotificationsConfig } = require('./NotificationsConfig');
const { validateNumericParam } = require('../../util/validation');

/**
 * Configuration object for TonesDetector with comprehensive validation
 */
class TonesDetectorConfig {
    /**
     * Create a TonesDetectorConfig
     * @param {Object} config - Detector configuration
     * @param {string} [config.id] - Stable UUID identifying this detector across config saves
     * @param {string} config.name - Detector name
     * @param {number[]} config.tones - Array of tone frequencies in Hz
     * @param {number} [config.matchThreshold=6] - Number of matches required for detection
     * @param {number} [config.tolerancePercent=0.02] - Frequency tolerance percentage (0-1)
     * @param {number} [config.resetTimeoutMs=7000] - Reset timeout in milliseconds
     * @param {number} [config.lockoutTimeoutMs=5000] - Lockout timeout in milliseconds
     * @param {number} [config.minRecordingLengthSec=30] - Minimum recording length in seconds
     * @param {number} [config.maxRecordingLengthSec] - Maximum recording length in seconds
     * @param {boolean} [config.isRecordingEnabled] - Whether recording is enabled
     * @param {Object} [config.notifications] - Notification configuration
     * @param {string|string[]} [config.talkgroupFilter] - Talkgroup label(s) to match for Rdio Scanner integration (legacy string accepted)
     * @param {boolean} [config.talkgroupExclusive=false] - When true, detector is excluded from live audio monitoring
     * @param {string[]} [config.sources=[]] - Ingest API key ids (per-source ingest keys) this detector is
     *   restricted to for Rdio call-upload matching. Empty (default) matches every source.
     */
    constructor({ id, name, tones = [], matchThreshold = 6, tolerancePercent = 0.02, resetTimeoutMs = 7000,
                  lockoutTimeoutMs = 5000, minRecordingLengthSec = 30, maxRecordingLengthSec,
                  isRecordingEnabled, notifications, talkgroupFilter, talkgroupExclusive, sources }) {
        this.validateAndSet({ id, name, tones, matchThreshold, tolerancePercent, resetTimeoutMs,
                             lockoutTimeoutMs, minRecordingLengthSec, maxRecordingLengthSec,
                             isRecordingEnabled, notifications, talkgroupFilter, talkgroupExclusive, sources });
    }

    /**
     * Validate and set detector configuration properties
     * @private
     */
    validateAndSet({ id, name, tones, matchThreshold, tolerancePercent, resetTimeoutMs,
                     lockoutTimeoutMs, minRecordingLengthSec, maxRecordingLengthSec,
                     isRecordingEnabled, notifications, talkgroupFilter, talkgroupExclusive, sources }) {
        // Validate required fields
        if (!name || typeof name !== 'string') {
            throw ErrorWithStatusCode.validation('Detector "name" is required and must be a string');
        }

        if (!Array.isArray(tones)) {
            throw ErrorWithStatusCode.validation('Detector "tones" must be an array');
        }

        if (tones.length === 0) {
            throw ErrorWithStatusCode.validation('Detector "tones" array cannot be empty');
        }

        // Validate tone frequencies
        tones.forEach((tone, index) => {
            if (typeof tone !== 'number' || !Number.isFinite(tone)) {
                throw ErrorWithStatusCode.validation(`Tone at index ${index} must be a finite number`);
            }
            if (tone <= 0) {
                throw ErrorWithStatusCode.validation(`Tone at index ${index} must be greater than 0 Hz`);
            }
            if (tone > 20000) {
                throw ErrorWithStatusCode.validation(`Tone at index ${index} must be less than 20000 Hz`);
            }
        });

        // Validate numeric parameters
        validateNumericParam(matchThreshold, 'matchThreshold', 1, 100);
        validateNumericParam(tolerancePercent, 'tolerancePercent', 0, 1);
        validateNumericParam(resetTimeoutMs, 'resetTimeoutMs', 0, 300000); // Max 5 minutes
        validateNumericParam(lockoutTimeoutMs, 'lockoutTimeoutMs', 0, 300000); // Max 5 minutes
        validateNumericParam(minRecordingLengthSec, 'minRecordingLengthSec', 1, 600); // Max 10 minutes

        // Validate maxRecordingLengthSec if provided
        if (maxRecordingLengthSec !== undefined) {
            validateNumericParam(maxRecordingLengthSec, 'maxRecordingLengthSec', 1, 600); // Max 10 minutes
            
            if (maxRecordingLengthSec < minRecordingLengthSec) {
                throw ErrorWithStatusCode.validation(
                    'maxRecordingLengthSec must be greater than or equal to minRecordingLengthSec'
                );
            }
        }

        // Validate boolean parameters
        if (isRecordingEnabled !== undefined && typeof isRecordingEnabled !== 'boolean') {
            throw ErrorWithStatusCode.validation('isRecordingEnabled must be a boolean');
        }

        if (talkgroupExclusive !== undefined && talkgroupExclusive !== null && typeof talkgroupExclusive !== 'boolean') {
            throw ErrorWithStatusCode.validation('talkgroupExclusive must be a boolean');
        }

        // Validate talkgroupFilter
        const talkgroupFilterError = TonesDetectorConfig.validateTalkgroupFilter(talkgroupFilter);
        if (talkgroupFilterError) {
            throw ErrorWithStatusCode.validation(talkgroupFilterError);
        }

        // Validate sources
        if (sources !== undefined && sources !== null) {
            if (!Array.isArray(sources)) {
                throw ErrorWithStatusCode.validation('sources must be an array');
            }
            sources.forEach((sourceId, index) => {
                if (typeof sourceId !== 'string' || !sourceId) {
                    throw ErrorWithStatusCode.validation(`sources[${index}] must be a non-empty string`);
                }
            });
        }

        // Validate notifications
        const notificationsConfig = notifications ? new NotificationsConfig(notifications) : null;

        // Set properties
        this.id = id || undefined;
        this.name = name.trim();
        this.tones = [...tones]; // Create a copy
        this.matchThreshold = matchThreshold;
        this.tolerancePercent = tolerancePercent;
        this.resetTimeoutMs = resetTimeoutMs;
        this.lockoutTimeoutMs = lockoutTimeoutMs;
        this.minRecordingLengthSec = minRecordingLengthSec;
        this.maxRecordingLengthSec = maxRecordingLengthSec || minRecordingLengthSec * 1.5;
        this.isRecordingEnabled = isRecordingEnabled;
        this.talkgroupFilter = TonesDetectorConfig.normalizeTalkgroupFilters(talkgroupFilter);
        this.talkgroupExclusive = talkgroupExclusive ?? false;
        this.sources = sources ? [...sources] : [];
        this.notifications = notificationsConfig;
    }

    /**
     * Normalize a talkgroupFilter value to an array of trimmed, non-empty labels.
     * Accepts the legacy single-string form ("Fire Dispatch") as well as arrays.
     * @param {string|string[]|null|undefined} value
     * @returns {string[]}
     */
    static normalizeTalkgroupFilters(value) {
        const list = Array.isArray(value) ? value : [value];
        return list
            .filter(v => typeof v === 'string')
            .map(v => v.trim())
            .filter(v => v.length > 0);
    }

    /**
     * Validate a talkgroupFilter value (string, array of strings, or empty)
     * @param {*} value
     * @returns {string|null} Error message, or null when valid
     */
    static validateTalkgroupFilter(value) {
        if (value === undefined || value === null) return null;
        const list = Array.isArray(value) ? value : [value];
        for (const v of list) {
            if (typeof v !== 'string') return 'talkgroupFilter must be a string or an array of strings';
            if (v.length > 255) return 'Each talkgroupFilter entry must be 255 characters or less';
        }
        return null;
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        let {...result} = this;
        
        if (this.notifications) {
            result.notifications = this.notifications.toJSON();
        }
        
        return result;
    }
}

module.exports = { TonesDetectorConfig };