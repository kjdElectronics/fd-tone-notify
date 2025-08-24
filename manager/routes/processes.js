const express = require('express');
const router = express.Router();

/**
 * Process management route handlers
 */
class ProcessRoutes {
    constructor(processManager) {
        this.processManager = processManager;
    }

    /**
     * Setup process management routes
     */
    setupRoutes() {
        // Start backend
        router.post('/backend/start', async (req, res) => {
            try {
                await this.processManager.startBackend();
                res.json({
                    success: true,
                    message: 'Backend started successfully',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Stop backend
        router.post('/backend/stop', async (req, res) => {
            try {
                await this.processManager.stopBackend();
                res.json({
                    success: true,
                    message: 'Backend stopped successfully',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Restart backend
        router.post('/backend/restart', async (req, res) => {
            try {
                await this.processManager.restartBackend();
                res.json({
                    success: true,
                    message: 'Backend restarted successfully',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Start UI
        router.post('/ui/start', async (req, res) => {
            try {
                await this.processManager.startUI();
                res.json({
                    success: true,
                    message: 'UI started successfully',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Stop UI
        router.post('/ui/stop', async (req, res) => {
            try {
                await this.processManager.stopUI();
                res.json({
                    success: true,
                    message: 'UI stopped successfully',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Get process status
        router.get('/processes', (req, res) => {
            try {
                const status = this.processManager.getStatus();
                res.json({
                    success: true,
                    data: status,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        return router;
    }
}

module.exports = ProcessRoutes;