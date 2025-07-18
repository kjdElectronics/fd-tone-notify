const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');

/**
 * Configuration object for webhook notifications with validation
 */
class WebhookConfig {
    /**
     * Create a WebhookConfig
     * @param {Object} config - Webhook configuration
     * @param {string} config.address - Webhook URL
     * @param {Object} [config.headers] - HTTP headers to send
     * @param {Object} [config.custom] - Custom data to include in payload
     */
    constructor({ address, headers, custom }) {
        this.validateAndSet({ address, headers, custom });
    }

    /**
     * Validate and set webhook configuration properties
     * @private
     */
    validateAndSet({ address, headers, custom }) {
        // Validate required fields
        if (!address || typeof address !== 'string') {
            throw ErrorWithStatusCode.validation('Webhook "address" field is required and must be a string');
        }

        // Validate URL format
        try {
            new URL(address);
        } catch (error) {
            throw ErrorWithStatusCode.validation(`Invalid webhook URL: ${address}`);
        }

        // Validate optional fields
        if (headers && typeof headers !== 'object') {
            throw ErrorWithStatusCode.validation('Webhook "headers" must be an object');
        }

        if (custom && typeof custom !== 'object') {
            throw ErrorWithStatusCode.validation('Webhook "custom" must be an object');
        }

        // Validate headers if provided
        if (headers) {
            for (const [key, value] of Object.entries(headers)) {
                if (typeof key !== 'string') {
                    throw ErrorWithStatusCode.validation('Webhook header keys must be strings');
                }
                if (typeof value !== 'string') {
                    throw ErrorWithStatusCode.validation('Webhook header values must be strings');
                }
            }
        }

        // Set properties
        this.address = address.trim();
        this.headers = headers || {};
        this.custom = custom || {};
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

module.exports = { WebhookConfig };