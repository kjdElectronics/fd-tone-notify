const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const chalk = require('chalk');
const logger = require('../util/logger');
const sslManager = require('../util/ssl-manager');

const HealthRoutes = require('./routes/health');
const ProcessRoutes = require('./routes/processes');
const WebSocketManager = require('./routes/websocket');
const NetworkUtils = require('../util/network-utils');

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
        try {
            // Create Express app
            this.app = express();
            
            // Middleware
            this.app.use(cors({
                origin: NetworkUtils.createCORSOriginValidator(),
                credentials: true
            }));
            
            this.app.use(express.json());
            
            // Setup routes
            this.setupRoutes();
            
            // Create HTTPS server with SSL certificates
            let server;
            let isHttps = false;
            
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
                server = https.createServer(credentials, this.app);
                isHttps = true;
                logger.info('Manager HTTPS server created with SSL certificates');

            } catch (sslError) {
                logger.warning(`Manager SSL setup failed, falling back to HTTP: ${sslError.message}`);
                server = http.createServer(this.app);
            }
            
            this.server = server;
            
            // Setup WebSocket manager
            this.webSocketManager = new WebSocketManager(this.statusMonitor);
            this.webSocketManager.setup(this.server);
            
            // Connect logger to WebSocket manager for live log streaming
            logger.setWebSocketManager(this.webSocketManager);
            
            // Start listening on all interfaces
            return new Promise((resolve, reject) => {
                this.server.listen(this.port, '0.0.0.0', () => {
                    const protocol = isHttps ? 'https' : 'http';
                    const wsProtocol = isHttps ? 'wss' : 'ws';
                    logger.info(`📡 Manager API listening on port ${this.port}`);
                    logger.info(`🔗 API: ${protocol}://localhost:${this.port}`);
                    logger.info(`🔌 WebSocket: ${wsProtocol}://localhost:${this.port}/ws`);
                    resolve();
                });
                
                this.server.on('error', (error) => {
                    reject(error);
                });
            });
            
        } catch (error) {
            throw error;
        }
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
        // Serve static files (SSL confirmation page)
        this.app.use(express.static(__dirname + '/public'));

        // Setup health routes
        const healthRoutes = new HealthRoutes(this.statusMonitor);
        this.app.use('/', healthRoutes.setupRoutes());

        // Setup process management routes
        const processRoutes = new ProcessRoutes(this.processManager);
        this.app.use('/', processRoutes.setupRoutes());
    }
}

module.exports = ApiServer;