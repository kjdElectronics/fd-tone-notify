const { ErrorWithStatusCode } = require('./ErrorWithStatusCode');

/**
 * Validate numeric parameter
 * @param {number} value - Value to validate
 * @param {string} paramName - Parameter name for error messages
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @throws {ErrorWithStatusCode} If validation fails
 */
function validateNumericParam(value, paramName, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw ErrorWithStatusCode.validation(`${paramName} must be a finite number`);
    }
    if (value < min || value > max) {
        throw ErrorWithStatusCode.validation(`${paramName} must be between ${min} and ${max}`);
    }
}

module.exports = { validateNumericParam };