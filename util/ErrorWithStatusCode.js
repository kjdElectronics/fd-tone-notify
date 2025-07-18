/**
 * Custom error class that includes HTTP status code and user-friendly message
 * Allows controllers to throw errors without handling HTTP response details
 */
class ErrorWithStatusCode extends Error {
    /**
     * Create an error with HTTP status code
     * @param {{statusCode: number, message: string}} message - Error message for logging
     * @param {number} statusCode - HTTP status code (default: 500)
     * @param {string} userMessage - User-friendly message (default: uses message)
     */
    constructor(message, statusCode = 500, userMessage = null) {
        super(message);
        this.name = 'ErrorWithStatusCode';
        this.statusCode = statusCode;
        this.userMessage = userMessage || message;
        
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ErrorWithStatusCode);
        }
    }

    /**
     * Create a validation error (400 Bad Request)
     * @param {string} message - Validation error message
     * @param {string} userMessage - User-friendly message
     * @returns {ErrorWithStatusCode}
     */
    static validation(message, userMessage = null) {
        return new ErrorWithStatusCode(message, 400, userMessage || message);
    }

    /**
     * Create a not found error (404 Not Found)
     * @param {string} message - Not found error message
     * @param {string} userMessage - User-friendly message
     * @returns {ErrorWithStatusCode}
     */
    static notFound(message, userMessage = null) {
        return new ErrorWithStatusCode(message, 404, userMessage || 'Resource not found');
    }

    /**
     * Create an internal server error (500 Internal Server Error)
     * @param {string} message - Internal error message
     * @param {string} userMessage - User-friendly message
     * @returns {ErrorWithStatusCode}
     */
    static internal(message, userMessage = 'Internal server error') {
        return new ErrorWithStatusCode(message, 500, userMessage);
    }

    /**
     * Create an unauthorized error (401 Unauthorized)
     * @param {string} message - Unauthorized error message
     * @param {string} userMessage - User-friendly message
     * @returns {ErrorWithStatusCode}
     */
    static unauthorized(message, userMessage = 'Unauthorized') {
        return new ErrorWithStatusCode(message, 401, userMessage);
    }

    /**
     * Create a forbidden error (403 Forbidden)
     * @param {string} message - Forbidden error message
     * @param {string} userMessage - User-friendly message
     * @returns {ErrorWithStatusCode}
     */
    static forbidden(message, userMessage = 'Forbidden') {
        return new ErrorWithStatusCode(message, 403, userMessage);
    }
}

module.exports = { ErrorWithStatusCode };