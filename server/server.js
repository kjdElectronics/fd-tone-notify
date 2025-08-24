let http = require('http');
const log = require('../util/logger');

function startServer(app) {
    let port = normalizePort(process.env.FD_PORT || '3000');
    /**
     * Get port from environment and store in Express.
     */
    app.set('port', port);

    /**
     * Create HTTP server.
     */

    const server = http.createServer(app);

    /**
     * Listen on provided port, on all network interfaces.
     */
    try {
        server.on('error', onError);
        server.on('listening', () => onListening(server));
        server.listen(port);
        server.timeout = 0; // Disable timeout for WebSocket connections
        
        // Setup graceful shutdown handling
        setupGracefulShutdown(server, app);
        
        return server;
    }
    catch (e) {
        log.error(`Failed to star server for remote monitoring`);
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
    log.info(`HTTP service started on ${addr.port}. http://localhost:${addr.port}`);
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

module.exports = {startServer};