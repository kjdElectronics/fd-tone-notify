const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');

/**
 * Configuration object for Pushover notifications with validation
 */
class PushoverConfig {
    /**
     * Create a PushoverConfig
     * @param {Object} config - Pushover configuration
     * @param {string} config.title - Notification title
     * @param {string} config.body - Notification message text
     * @param {string} config.user - Pushover user/group key to deliver to
     * @param {number} [config.priority] - Pushover priority, -2 (lowest) to 1 (high).
     *   Emergency priority (2) needs retry/expire parameters this integration
     *   doesn't support, so it's rejected here.
     * @param {string} [config.sound] - Pushover notification sound name
     */
    constructor({ title, body, user, priority, sound }) {
        this.validateAndSet({ title, body, user, priority, sound });
    }

    /**
     * Validate and set Pushover configuration properties
     * @private
     */
    validateAndSet({ title, body, user, priority, sound }) {
        if (!title || typeof title !== 'string') {
            throw ErrorWithStatusCode.validation('Pushover "title" field is required and must be a string');
        }

        if (!body || typeof body !== 'string') {
            throw ErrorWithStatusCode.validation('Pushover "body" field is required and must be a string');
        }

        if (!user || typeof user !== 'string') {
            throw ErrorWithStatusCode.validation('Pushover "user" field is required and must be a string');
        }

        if (priority !== undefined && priority !== null) {
            if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < -2 || priority > 1) {
                throw ErrorWithStatusCode.validation('Pushover "priority" must be an integer between -2 and 1');
            }
        }

        if (sound !== undefined && sound !== null && typeof sound !== 'string') {
            throw ErrorWithStatusCode.validation('Pushover "sound" must be a string');
        }

        // Set properties
        this.title = title.trim();
        this.body = body.trim();
        this.user = user.trim();
        this.priority = priority !== undefined && priority !== null ? priority : undefined;
        this.sound = sound ? sound.trim() : undefined;
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        let { ...result } = this;
        Object.keys(result).forEach(key => {
            if (result[key] === undefined) {
                delete result[key];
            }
        });
        return result;
    }
}

module.exports = { PushoverConfig };
