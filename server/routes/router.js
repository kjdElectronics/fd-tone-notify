const express = require('express');
const path = require('path');
const configRoutes = require('./config');
const detectionRoutes = require('./detection');
const detectorRoutes = require('./detector');
const systemRoutes = require('./system');
const notificationRoutes = require('./notifications');
const rdioScannerRoutes = require('./rdio-scanner');
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
    app.use('/api/detectors', detectorRoutes);
    app.use('/api/system', systemRoutes);
    app.use('/api/notifications', notificationRoutes);
    app.use('/api/detections', detectionRoutes);
    app.use('/api/call-upload', rdioScannerRoutes);

    // SPA fallback: the production Docker image serves the built Vue UI (a
    // client-side, history-mode router) as static files out of server/public.
    // Any GET request that isn't an API call and didn't match a static asset
    // (express.static already ran earlier in the middleware chain) is a
    // client-side route - serve the SPA shell so vue-router can take over,
    // instead of a bare 404 on refresh/deep-link.
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
        res.sendFile(path.join(__dirname, '../public/index.html'), err => {
            if (err) next();
        });
    });
}

module.exports = { configureRoutes };