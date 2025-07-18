const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');

/**
 * Configuration object for Pushbullet notifications with validation
 */
class PushbulletConfig {
    /**
     * Create a PushbulletConfig
     * @param {Object} config - Pushbullet configuration
     * @param {string} config.title - Notification title
     * @param {string} config.body - Notification body text
     * @param {string} [config.channelTag] - Pushbullet channel tag
     */
    constructor({ title, body, channelTag }) {
        this.validateAndSet({ title, body, channelTag });
    }

    /**
     * Validate and set Pushbullet configuration properties
     * @private
     */
    validateAndSet({ title, body, channelTag }) {
        // Validate required fields
        if (!title || typeof title !== 'string') {
            throw ErrorWithStatusCode.validation('Pushbullet "title" field is required and must be a string');
        }

        if (!body || typeof body !== 'string') {
            throw ErrorWithStatusCode.validation('Pushbullet "body" field is required and must be a string');
        }

        // Validate optional fields
        if (channelTag && typeof channelTag !== 'string') {
            throw ErrorWithStatusCode.validation('Pushbullet "channelTag" must be a string');
        }

        // Set properties
        this.title = title.trim();
        this.body = body.trim();
        this.channelTag = channelTag ? channelTag.trim() : undefined;
    }


    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        let {...result} = this;
        return result;
    }
}

module.exports = { PushbulletConfig };