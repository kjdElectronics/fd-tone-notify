const express = require('express');
const router = express.Router();

/**
 * Health check and status route handlers
 */
class HealthRoutes {
    constructor(statusMonitor) {
        this.statusMonitor = statusMonitor;
    }

    /**
     * Setup health-related routes
     */
    setupRoutes() {
        // Health check
        router.get('/health', (req, res) => {
            res.json({
                success: true,
                service: 'fd-tone-notify-manager',
                timestamp: new Date().toISOString()
            });
        });

        // Get system status
        router.get('/status', (req, res) => {
            try {
                const status = this.statusMonitor.getStatus();
                res.json({
                    success: true,
                    data: status,
                    timestamp: status.timestamp
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Get health check (simplified endpoint)
        router.get('/health-check', (req, res) => {
            try {
                const status = this.statusMonitor.getStatus();
                res.json({
                    healthy: status.healthy,
                    status: status.overall,
                    timestamp: status.timestamp,
                    processes: status.processDetails,
                    manager: status.manager
                });
            } catch (error) {
                res.status(500).json({
                    healthy: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        return router;
    }
}

module.exports = HealthRoutes;