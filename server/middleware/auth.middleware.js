const log = require('../../util/logger');

/**
 * Simple authentication middleware for the UI
 * Uses UI_PASSWORD environment variable or config
 */
function authenticate(req, res, next) {
    //TODO: Placeholder
    const uiPassword = process.env.UI_PASSWORD || 'admin123'; // Default password
    
    // Check for Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
            message: 'Please provide Authorization header'
        });
    }
    
    // Simple password-based auth
    // Format: "Bearer password" or just "password"
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader;
    
    if (token !== uiPassword) {
        log.warn('Failed authentication attempt from ' + req.ip);
        return res.status(401).json({
            success: false,
            error: 'Invalid credentials'
        });
    }
    
    log.debug('Successful authentication from ' + req.ip);
    next();
}

/**
 * Login endpoint for getting authentication token
 */
function login(req, res) {
    //TODO: Placeholder
    const { password } = req.body;
    const uiPassword = process.env.UI_PASSWORD || 'admin123';
    
    if (!password) {
        return res.status(400).json({
            success: false,
            error: 'Password is required'
        });
    }
    
    if (password !== uiPassword) {
        log.warn('Failed login attempt from ' + req.ip);
        return res.status(401).json({
            success: false,
            error: 'Invalid password'
        });
    }
    
    log.info('Successful login from ' + req.ip);
    res.json({
        success: true,
        token: password, // Simple approach - return the password as token
        message: 'Authentication successful'
    });
}

module.exports = { authenticate, login };