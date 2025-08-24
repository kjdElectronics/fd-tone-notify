const log = require('../../util/logger');
const bcrypt = require('bcrypt');

/**
 * Simple authentication middleware for the UI
 * Uses UI_PASSWORD_HASH environment variable or config
 */
function authenticate(req, res, next) {
    //TODO: Placeholder
    const uiPassword = process.env.UI_PASSWORD_HASH;
    
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
    
    // Check if password is hashed (starts with $2b$ for bcrypt)
    const isValidPassword = bcrypt.compareSync(token, uiPassword)
    
    if (!isValidPassword) {
        log.warning('Failed authentication attempt from ' + req.ip);
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
    const { password } = req.body;
    const uiPassword = process.env.UI_PASSWORD_HASH;
    
    if (!password) {
        return res.status(400).json({
            success: false,
            error: 'Password is required'
        });
    }
    
    // Check if password is hashed (starts with $2b$ for bcrypt)
    const isValidPassword = bcrypt.compareSync(password, uiPassword)
    
    if (!isValidPassword) {
        log.warning('Failed login attempt from ' + req.ip);
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

/**
 * Hash a password using bcrypt
 * @param {string} plainTextPassword - The plain text password to hash
 * @returns {string} The hashed password
 */
function hashPassword(plainTextPassword) {
    return bcrypt.hashSync(plainTextPassword, 10);
}

module.exports = { authenticate, login, hashPassword };