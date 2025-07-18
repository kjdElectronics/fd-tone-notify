const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');
const { EmailConfig } = require('./EmailConfig');
const { PushbulletConfig } = require('./PushbulletConfig');
const { WebhookConfig } = require('./WebhookConfig');
const { ExternalCommandConfig } = require('./ExternalCommandConfig');

/**
 * Configuration object for notifications with preRecording and postRecording phases
 */
class NotificationsConfig {
    /**
     * Create a NotificationsConfig
     * @param {Object} config - Notifications configuration
     * @param {Object} [config.preRecording] - Pre-recording notification configuration
     * @param {Object} [config.postRecording] - Post-recording notification configuration
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

        // Validate and set notification phases
        this.preRecording = preRecording ? this.validateNotificationPhase(preRecording, 'preRecording') : null;
        this.postRecording = postRecording ? this.validateNotificationPhase(postRecording, 'postRecording') : null;
    }

    /**
     * Validate a notification phase (preRecording or postRecording)
     * @private
     */
    validateNotificationPhase(phase, phaseName) {
        const result = {
            emails: [],
            pushbullet: [],
            webhooks: [],
            externalCommands: []
        };

        // Validate emails array
        if (phase.emails) {
            if (!Array.isArray(phase.emails)) {
                throw ErrorWithStatusCode.validation(`${phaseName}.emails must be an array`);
            }
            result.emails = phase.emails.map(email => new EmailConfig(email));
        }

        // Validate pushbullet array
        if (phase.pushbullet) {
            if (!Array.isArray(phase.pushbullet)) {
                throw ErrorWithStatusCode.validation(`${phaseName}.pushbullet must be an array`);
            }
            result.pushbullet = phase.pushbullet.map(pb => new PushbulletConfig(pb));
        }

        // Validate webhooks array
        if (phase.webhooks) {
            if (!Array.isArray(phase.webhooks)) {
                throw ErrorWithStatusCode.validation(`${phaseName}.webhooks must be an array`);
            }
            result.webhooks = phase.webhooks.map(webhook => new WebhookConfig(webhook));
        }

        // Validate externalCommands array
        if (phase.externalCommands) {
            if (!Array.isArray(phase.externalCommands)) {
                throw ErrorWithStatusCode.validation(`${phaseName}.externalCommands must be an array`);
            }
            result.externalCommands = phase.externalCommands.map(cmd => new ExternalCommandConfig(cmd));
        }

        return result;
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        const result = {};

        if (this.preRecording) {
            result.preRecording = {
                emails: this.preRecording.emails.map(email => email.toJSON()),
                pushbullet: this.preRecording.pushbullet.map(pb => pb.toJSON()),
                webhooks: this.preRecording.webhooks.map(webhook => webhook.toJSON()),
                externalCommands: this.preRecording.externalCommands.map(cmd => cmd.toJSON())
            };
        }

        if (this.postRecording) {
            result.postRecording = {
                emails: this.postRecording.emails.map(email => email.toJSON()),
                pushbullet: this.postRecording.pushbullet.map(pb => pb.toJSON()),
                webhooks: this.postRecording.webhooks.map(webhook => webhook.toJSON()),
                externalCommands: this.postRecording.externalCommands.map(cmd => cmd.toJSON())
            };
        }

        return result;
    }

    /**
     * Check if any notifications are configured
     * @returns {boolean}
     */
    hasNotifications() {
        return !!(this.preRecording || this.postRecording);
    }
}

module.exports = { NotificationsConfig };