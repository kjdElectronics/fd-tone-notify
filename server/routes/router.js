const express = require('express');
const configRoutes = require('./config');
const detectionRoutes = require('./detection');

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

    // Mount route modules
    app.use('/api/config', configRoutes);
    app.use('/api', detectionRoutes);
}

module.exports = { configureRoutes };