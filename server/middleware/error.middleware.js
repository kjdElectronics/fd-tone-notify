const log = require('../../util/logger');
const { ErrorWithStatusCode } = require('../../util/ErrorWithStatusCode');

/**
 * Error handling middleware for API endpoints
 */
function errorHandler(err, req, res, next) {
    // Handle custom ErrorWithStatusCode
    if (err instanceof ErrorWithStatusCode) {
        log.error(`API Error [${err.statusCode}]: ${err.message}`);
        
        return res.status(err.statusCode).json({
            success: false,
            error: err.userMessage,
            statusCode: err.statusCode
        });
    }

    // Handle generic errors with full stack trace logging
    log.error(`Unhandled Error: ${err.stack || err.message}`);
    
    // Set locals, only providing error details in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // Send generic error response
    res.status(err.status || 500).json({
        success: false,
        error: 'Internal server error',
        statusCode: err.status || 500,
        ...(req.app.get('env') === 'development' && { details: err.message })
    });
}

module.exports = { errorHandler };