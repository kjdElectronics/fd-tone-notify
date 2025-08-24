const express = require('express');
const http = require('http');
const cors = require('cors');
const chalk = require('chalk');
const logger = require('../util/logger');

const HealthRoutes = require('./routes/health');
const ProcessRoutes = require('./routes/processes');
const WebSocketManager = require('./routes/websocket');

/**
 * ApiServer provides HTTP and WebSocket APIs for process management
 * and real-time status updates to the UI.
 */
class ApiServer {
    constructor(processManager, statusMonitor, options = {}) {
        this.processManager = processManager;
        this.statusMonitor = statusMonitor;
        this.options = options;
        this.port = options.managerPort || 3001;
        
        this.app = null;
        this.server = null;
        this.webSocketManager = null;
    }

    /**
     * Start the API server
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                // Create Express app
                this.app = express();
                
                // Middleware
                this.app.use(cors({
                    origin: function (origin, callback) {
                        // Allow requests with no origin (like mobile apps, curl, postman, etc.)
                        if (!origin) return callback(null, true);

                        // Allow any localhost origin
                        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
                            return callback(null, true);
                        }
                        
                        // Reject other origins
                        callback(new Error('Not allowed by CORS'));
                    },
                    credentials: true
                }));
                
                this.app.use(express.json());
                
                // Setup routes
                this.setupRoutes();
                
                // Create HTTP server
                this.server = http.createServer(this.app);
                
                // Setup WebSocket manager
                this.webSocketManager = new WebSocketManager(this.statusMonitor);
                this.webSocketManager.setup(this.server);
                
                // Connect logger to WebSocket manager for live log streaming
                logger.setWebSocketManager(this.webSocketManager);
                
                // Start listening
                this.server.listen(this.port, () => {
                    resolve();
                });
                
                this.server.on('error', (error) => {
                    reject(error);
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Stop the API server
     */
    async stop() {
        return new Promise((resolve) => {
            // Close WebSocket connections
            if (this.webSocketManager) {
                this.webSocketManager.close();
            }
            
            // Close HTTP server
            if (this.server) {
                this.server.close(() => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Setup HTTP routes
     */
    setupRoutes() {
        // Setup health routes
        const healthRoutes = new HealthRoutes(this.statusMonitor);
        this.app.use('/', healthRoutes.setupRoutes());

        // Setup process management routes
        const processRoutes = new ProcessRoutes(this.processManager);
        this.app.use('/', processRoutes.setupRoutes());
    }
}

module.exports = ApiServer;