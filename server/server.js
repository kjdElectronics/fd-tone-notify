let http = require('http');
let https = require('https');
const fs = require('fs');
const log = require('../util/logger');
const sslManager = require('../util/ssl-manager');

async function startServer(app) {
    let port = normalizePort(process.env.FD_PORT || '3000');
    /**
     * Get port from environment and store in Express.
     */
    app.set('port', port);

    /**
     * Create HTTPS server with SSL certificates.
     */
    let server;
    try {
        // Ensure SSL certificates exist
        const { keyPath, certPath } = await sslManager.ensureCertificates();
        
        // Read SSL certificates
        const privateKey = fs.readFileSync(keyPath, 'utf8');
        const certificate = fs.readFileSync(certPath, 'utf8');
        
        const credentials = {
            key: privateKey,
            cert: certificate
        };

        // Create HTTPS server
        server = https.createServer(credentials, app);
        log.info('HTTPS server created with SSL certificates');

    } catch (sslError) {
        log.error(`SSL setup failed: ${sslError.message}`);
        throw sslError;
    }

    /**
     * Listen on provided port, on all network interfaces (0.0.0.0).
     */
    try {
        server.on('error', onError);
        server.on('listening', () => onListening(server));
        server.listen(port, '0.0.0.0'); // Bind to all interfaces, not just localhost
        server.timeout = 0; // Disable timeout for WebSocket connections
        
        // Setup graceful shutdown handling
        setupGracefulShutdown(server, app);
        
        return server;
    }
    catch (e) {
        log.error(`Failed to start server for remote monitoring: ${e.message}`);
        throw e;
    }
}

function normalizePort(val) {
    let port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
}

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    let bind = typeof port === 'string'
        ? 'Pipe ' + error.port
        : 'Port ' + error.port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            log.error(bind + ' requires elevated privileges');
            process.kill(process.pid);
            break;
        case 'EADDRINUSE':
            log.error(bind + ' is already in use');
            process.kill(process.pid);
            break;
        default:
            throw error;
    }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening(server) {
    let addr = server.address();
    let bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
    
    const protocol = server instanceof https.Server ? 'https' : 'http';
    log.info(`${protocol.toUpperCase()} service started on ${addr.port}. ${protocol}://localhost:${addr.port}`);
}

/**
 * Setup graceful shutdown handling for the server
 * @param {http.Server} server - HTTP server instance
 * @param {Express} app - Express application instance
 */
function setupGracefulShutdown(server, app) {
    let shuttingDown = false;
    
    const gracefulShutdown = (signal) => {
        if (shuttingDown) {
            log.warning(`Already shutting down, ignoring ${signal}`);
            return;
        }
        
        shuttingDown = true;
        log.info(`Received ${signal}. Starting graceful shutdown...`);
        
        // Close insecure HTTP server if it was started
        if (app.insecureServer) {
            log.info('Closing insecure HTTP server...');
            app.insecureServer.close((err) => {
                if (err) {
                    log.error(`Error closing insecure HTTP server: ${err.message}`);
                } else {
                    log.info('Insecure HTTP server closed successfully');
                }
            });
        }

        // Close HTTP server (stops accepting new connections)
        server.close((err) => {
            if (err) {
                log.error(`Error closing HTTP server: ${err.message}`);
            } else {
                log.info('HTTP server closed successfully');
            }
            
            // Close WebSocket connections if available
            if (app.wss) {
                log.info('Closing WebSocket connections...');
                
                // Send shutdown notification to all connected clients
                app.wss.clients.forEach(client => {
                    if (client.readyState === 1) { // WebSocket.OPEN
                        try {
                            client.send(JSON.stringify({
                                type: 'shutdown',
                                data: {
                                    message: 'Server is shutting down for restart',
                                    timestamp: new Date().toISOString()
                                }
                            }));
                        } catch (error) {
                            log.error(`Error sending shutdown message to client: ${error.message}`);
                        }
                    }
                });
                
                // Close WebSocket server
                app.wss.close((err) => {
                    if (err) {
                        log.error(`Error closing WebSocket server: ${err.message}`);
                    } else {
                        log.info('WebSocket server closed successfully');
                    }
                    completeShutdown();
                });
            } else {
                completeShutdown();
            }
        });
        
        // Force shutdown after timeout
        const forceShutdownTimer = setTimeout(() => {
            log.warning('Force shutdown timeout reached');
            completeShutdown();
        }, 10000); // 10 second timeout
        
        function completeShutdown() {
            clearTimeout(forceShutdownTimer);
            log.info('Graceful shutdown completed');
            
            // Give a moment for final log messages to be written
            setTimeout(() => {
                process.exit(0);
            }, 100);
        }
    };
    
    // Listen for shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Listen for custom restart event
    process.on('gracefulShutdown', (reason) => {
        log.info(`Graceful shutdown requested: ${reason}`);
        gracefulShutdown(`gracefulShutdown(${reason})`);
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        log.error(`Uncaught exception: ${error.message}`, error);
        gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        log.error(`Unhandled rejection: ${reason}`, promise);
        gracefulShutdown('unhandledRejection');
    });
    
    log.info('Graceful shutdown handlers configured');
}

/**
 * Optionally start a plain HTTP server for the Rdio Scanner call-upload endpoint.
 * Only starts if FD_INSECURE_HTTP_RDIO_CALL_UPLOAD_PORT is set to a non-empty value.
 * This server exposes ONLY /api/call-upload over unencrypted HTTP.
 *
 * @returns {http.Server|null} The HTTP server instance, or null if not enabled
 */
function startInsecureRdioServer() {
    const portEnv = process.env.FD_INSECURE_HTTP_RDIO_CALL_UPLOAD_PORT;

    if (!portEnv || portEnv.trim() === '') {
        return null;
    }

    const port = normalizePort(portEnv.trim());
    if (port === false) {
        log.error(`Invalid FD_INSECURE_HTTP_RDIO_CALL_UPLOAD_PORT value: "${portEnv}"`);
        return null;
    }

    log.warning('='.repeat(70));
    log.warning('INSECURE HTTP SERVER ENABLED for Rdio Scanner call-upload endpoint');
    log.warning(`Listening on HTTP (not HTTPS) port ${port}`);
    log.warning('This server exposes /api/call-upload over unencrypted HTTP.');
    log.warning('Only use this in trusted network environments.');
    log.warning('='.repeat(70));

    const express = require('express');
    const insecureApp = express();

    insecureApp.use(express.json({ limit: '5mb' }));
    insecureApp.use(express.urlencoded({ extended: true, limit: '5mb' }));

    // Mount ONLY the Rdio Scanner call-upload route
    const rdioScannerRoutes = require('./routes/rdio-scanner');
    insecureApp.use('/api/call-upload', rdioScannerRoutes);

    // Reject all other routes
    insecureApp.use((req, res) => {
        res.status(404).json({
            success: false,
            error: 'Not found. This server only serves /api/call-upload.'
        });
    });

    // Basic error handler
    insecureApp.use((err, req, res, next) => {
        log.error(`Insecure HTTP server error: ${err.message}`);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    });

    const insecureServer = http.createServer(insecureApp);
    insecureServer.on('error', onError);
    insecureServer.on('listening', () => onListening(insecureServer));
    insecureServer.listen(port, '0.0.0.0');

    return insecureServer;
}

module.exports = { startServer, startInsecureRdioServer };