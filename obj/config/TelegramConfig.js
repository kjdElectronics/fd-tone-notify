const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');

/**
 * Configuration object for Telegram notifications with validation
 */
class TelegramConfig {
    /**
     * Create a TelegramConfig
     * @param {Object} config - Telegram configuration
     * @param {string} config.title - Notification title
     * @param {string} config.body - Notification message text
     * @param {string|number} config.chatId - Telegram chat id to deliver to (numeric
     *   user/group/channel id, or an "@channelusername" string)
     */
    constructor({ title, body, chatId }) {
        this.validateAndSet({ title, body, chatId });
    }

    /**
     * Validate and set Telegram configuration properties
     * @private
     */
    validateAndSet({ title, body, chatId }) {
        if (!title || typeof title !== 'string') {
            throw ErrorWithStatusCode.validation('Telegram "title" field is required and must be a string');
        }

        if (!body || typeof body !== 'string') {
            throw ErrorWithStatusCode.validation('Telegram "body" field is required and must be a string');
        }

        if (chatId === undefined || chatId === null || chatId === '') {
            throw ErrorWithStatusCode.validation('Telegram "chatId" field is required');
        }
        if (typeof chatId !== 'string' && typeof chatId !== 'number') {
            throw ErrorWithStatusCode.validation('Telegram "chatId" must be a string or number');
        }

        // Set properties
        this.title = title.trim();
        this.body = body.trim();
        this.chatId = typeof chatId === 'string' ? chatId.trim() : chatId;
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        let { ...result } = this;
        return result;
    }
}

module.exports = { TelegramConfig };
