const express = require('express');
const configRoutes = require('./config');
const detectionRoutes = require('./detection');
const systemRoutes = require('./system');
const notificationRoutes = require('./notifications');
const { login } = require('../middleware/auth.middleware');

/**
 * Configure all API routes
 * @param {Express} app - Express application instance
 */
function configureRoutes(app) {
    // Health check endpoint
    app.get('/api/health', (req, res) => {
        res.json({
            success: true,
            service: 'fd-tone-notify-api',
            timestamp: new Date().toISOString(),
            version: require('../../package.json').version
        });
    });

    // Authentication endpoint - //TODO This is a placeholder for now
    app.post('/api/auth/login', login);

    // Mount route modules
    app.use('/api/config', configRoutes);
    app.use('/api/system', systemRoutes);
    app.use('/api/notifications', notificationRoutes);
    app.use('/api', detectionRoutes);
}

module.exports = { configureRoutes };