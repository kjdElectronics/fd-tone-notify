const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');

/**
 * Configuration object for external command notifications with validation
 */
class ExternalCommandConfig {
    /**
     * Create an ExternalCommandConfig
     * @param {Object} config - External command configuration
     * @param {string} config.command - Command to execute
     * @param {string} [config.description] - Description for logging
     * @param {Object} [config.custom] - Custom data to pass as JSON argument
     */
    constructor({ command, description, custom }) {
        this.validateAndSet({ command, description, custom });
    }

    /**
     * Validate and set external command configuration properties
     * @private
     */
    validateAndSet({ command, description, custom }) {
        // Validate required fields
        if (!command || typeof command !== 'string') {
            throw ErrorWithStatusCode.validation('ExternalCommand "command" field is required and must be a string');
        }

        // Validate optional fields
        if (description && typeof description !== 'string') {
            throw ErrorWithStatusCode.validation('ExternalCommand "description" must be a string');
        }

        if (custom && typeof custom !== 'object') {
            throw ErrorWithStatusCode.validation('ExternalCommand "custom" must be an object');
        }

        // Basic command validation - ensure it's not empty after trimming
        const trimmedCommand = command.trim();
        if (!trimmedCommand) {
            throw ErrorWithStatusCode.validation('ExternalCommand "command" cannot be empty');
        }

        // Set properties
        this.command = trimmedCommand;
        this.description = description ? description.trim() : undefined;
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

module.exports = { ExternalCommandConfig };