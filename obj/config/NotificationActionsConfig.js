const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');
const { EmailConfig } = require('./EmailConfig');
const { PushbulletConfig } = require('./PushbulletConfig');
const { WebhookConfig } = require('./WebhookConfig');
const { ExternalCommandConfig } = require('./ExternalCommandConfig');

/**
 * Configuration object for notification actions (emails, pushbullet, webhooks, external commands)
 */
class NotificationActionsConfig {
    /**
     * Create a NotificationActionsConfig
     * @param {Object} config - Notification actions configuration
     * @param {Array} [config.emails] - Array of email configurations
     * @param {Array} [config.pushbullet] - Array of pushbullet configurations
     * @param {Array} [config.webhooks] - Array of webhook configurations
     * @param {Array} [config.externalCommands] - Array of external command configurations
     */
    constructor({ emails, pushbullet, webhooks, externalCommands } = {}) {
        this.validateAndSet({ emails, pushbullet, webhooks, externalCommands });
    }

    /**
     * Validate and set notification actions configuration properties
     * @private
     */
    validateAndSet({ emails, pushbullet, webhooks, externalCommands }) {
        this.emails = [];
        this.pushbullet = [];
        this.webhooks = [];
        this.externalCommands = [];

        // Validate and set emails array
        if (emails) {
            if (!Array.isArray(emails)) {
                throw ErrorWithStatusCode.validation('emails must be an array');
            }
            this.emails = emails.map(email => new EmailConfig(email));
        }

        // Validate and set pushbullet array
        if (pushbullet) {
            if (!Array.isArray(pushbullet)) {
                throw ErrorWithStatusCode.validation('pushbullet must be an array');
            }
            this.pushbullet = pushbullet.map(pb => new PushbulletConfig(pb));
        }

        // Validate and set webhooks array
        if (webhooks) {
            if (!Array.isArray(webhooks)) {
                throw ErrorWithStatusCode.validation('webhooks must be an array');
            }
            this.webhooks = webhooks.map(webhook => new WebhookConfig(webhook));
        }

        // Validate and set externalCommands array
        if (externalCommands) {
            if (!Array.isArray(externalCommands)) {
                throw ErrorWithStatusCode.validation('externalCommands must be an array');
            }
            this.externalCommands = externalCommands.map(cmd => new ExternalCommandConfig(cmd));
        }
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        return {
            emails: this.emails.map(email => email.toJSON()),
            pushbullet: this.pushbullet.map(pb => pb.toJSON()),
            webhooks: this.webhooks.map(webhook => webhook.toJSON()),
            externalCommands: this.externalCommands.map(cmd => cmd.toJSON())
        };
    }

    /**
     * Check if any notification actions are configured
     * @returns {boolean}
     */
    hasActions() {
        return this.emails.length > 0 || 
               this.pushbullet.length > 0 || 
               this.webhooks.length > 0 || 
               this.externalCommands.length > 0;
    }
}

module.exports = { NotificationActionsConfig };