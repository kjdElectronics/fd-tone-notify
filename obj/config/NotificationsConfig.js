const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');
const { NotificationActionsConfig } = require('./NotificationActionsConfig');

/**
 * Configuration object for notifications with preRecording and postRecording phases
 */
class NotificationsConfig {
    /**
     * Create a NotificationsConfig
     * @param {Object} config - Notifications configuration
     * @param {Object} [config.preRecording] - Pre-recording notification actions configuration
     * @param {Object} [config.postRecording] - Post-recording notification actions configuration
     */
    constructor({ preRecording, postRecording } = {}) {
        this.validateAndSet({ preRecording, postRecording });
    }

    /**
     * Validate and set notifications configuration properties
     * @private
     */
    validateAndSet({ preRecording, postRecording }) {
        // Both phases are optional, but if provided must be objects
        if (preRecording && typeof preRecording !== 'object') {
            throw ErrorWithStatusCode.validation('Notifications "preRecording" must be an object');
        }

        if (postRecording && typeof postRecording !== 'object') {
            throw ErrorWithStatusCode.validation('Notifications "postRecording" must be an object');
        }

        // Validate and set notification phases using NotificationActionsConfig
        this.preRecording = preRecording ? new NotificationActionsConfig(preRecording) : null;
        this.postRecording = postRecording ? new NotificationActionsConfig(postRecording) : null;
    }


    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        const result = {};

        if (this.preRecording) {
            result.preRecording = this.preRecording.toJSON();
        }

        if (this.postRecording) {
            result.postRecording = this.postRecording.toJSON();
        }

        return result;
    }

    /**
     * Check if any notifications are configured
     * @returns {boolean}
     */
    hasNotifications() {
        return (this.preRecording && this.preRecording.hasActions()) || 
               (this.postRecording && this.postRecording.hasActions());
    }
}

module.exports = { NotificationsConfig };