const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const log = require('../../util/logger');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * POST /api/system/restart
 * Restart the backend server using the restart helper process
 */
router.post('/restart', authenticate, async (req, res) => {
    try {
        log.info('Restart request received from authenticated user');
        
        // Get current process PID
        const currentPid = process.pid;
        
        // Prepare arguments to pass to the restarted process
        const restartArgs = ['--web-server'];
        
        // Add port if it was specified
        if (process.env.FD_PORT) {
            restartArgs.push('--port', process.env.FD_PORT);
        }
        
        // Add any other relevant arguments from the original startup
        if (process.env.NODE_APP_INSTANCE) {
            restartArgs.push('--instance-name', process.env.NODE_APP_INSTANCE);
        }
        
        if (process.env.FD_RECORDING_DIRECTORY) {
            restartArgs.push('--recording-directory', process.env.FD_RECORDING_DIRECTORY);
        }
        
        log.info(`Initiating restart with PID ${currentPid} and args: ${restartArgs.join(' ')}`);
        
        // Get the project root and restart helper path
        const projectRoot = path.dirname(path.dirname(__dirname));
        const restartHelperPath = path.join(projectRoot, 'bin', 'restart-helper.js');
        
        // Spawn the restart helper process
        const helperArgs = [currentPid.toString(), ...restartArgs];
        
        log.info(`Spawning restart helper: node ${restartHelperPath} ${helperArgs.join(' ')}`);
        
        const helper = spawn('node', [restartHelperPath, ...helperArgs], {
            cwd: projectRoot,
            detached: true,
            stdio: 'ignore', // Don't inherit stdio to prevent the helper from blocking
            env: process.env
        });
        
        helper.on('spawn', () => {
            log.info(`Restart helper spawned with PID ${helper.pid}`);
        });
        
        helper.on('error', (error) => {
            log.error(`Failed to spawn restart helper: ${error.message}`);
        });
        
        // Unreference the helper so it can continue running
        helper.unref();
        
        // Send success response
        res.json({
            success: true,
            message: 'Restart initiated successfully',
            timestamp: new Date().toISOString(),
            helperPid: helper.pid
        });
        
        // Schedule the graceful shutdown
        setTimeout(() => {
            log.info('Initiating graceful shutdown for restart...');
            
            // Emit shutdown event to allow cleanup
            process.emit('gracefulShutdown', 'restart');
            
            // Give a moment for cleanup, then exit
            setTimeout(() => {
                log.info('Exiting for restart...');
                process.exit(0);
            }, 1000);
        }, 500); // Small delay to ensure response is sent
        
    } catch (error) {
        log.error(`Restart error: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: 'Failed to initiate restart',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/system/stop
 * Stop the backend server gracefully
 */
router.post('/stop', authenticate, async (req, res) => {
    try {
        log.info('Stop request received from authenticated user');
        
        // Send success response immediately before shutdown
        res.json({
            success: true,
            message: 'Server shutdown initiated',
            timestamp: new Date().toISOString(),
            pid: process.pid
        });
        
        // Schedule the graceful shutdown
        setTimeout(() => {
            log.info('Initiating graceful shutdown from stop request...');
            
            // Emit shutdown event to allow cleanup
            process.emit('gracefulShutdown', 'stop_request');
            
            // Give a moment for cleanup, then exit
            setTimeout(() => {
                log.info('Exiting from stop request...');
                process.exit(0);
            }, 1000);
        }, 500); // Small delay to ensure response is sent
        
    } catch (error) {
        log.error(`Stop error: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: 'Failed to initiate stop',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/system/status
 * Get system status information
 */
router.get('/status', authenticate, (req, res) => {
    try {
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        
        res.json({
            success: true,
            data: {
                pid: process.pid,
                uptime: uptime,
                memory: {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
                    external: Math.round(memoryUsage.external / 1024 / 1024) // MB
                },
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                environment: {
                    nodeEnv: process.env.NODE_ENV || 'development',
                    port: process.env.FD_PORT || 3000,
                    instanceName: process.env.NODE_APP_INSTANCE || 'default'
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        log.error(`Status error: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: 'Failed to get system status',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;