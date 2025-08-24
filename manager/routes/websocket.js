const WebSocket = require('ws');
const chalk = require('chalk');
const logger = require('../../util/logger');

/**
 * WebSocket server management for real-time updates
 */
class WebSocketManager {
    constructor(statusMonitor) {
        this.statusMonitor = statusMonitor;
        this.wss = null;
        this.clients = new Set();
    }

    /**
     * Setup WebSocket server on HTTP server
     */
    setup(server) {
        this.wss = new WebSocket.Server({ 
            server: server,
            path: '/ws'
        });

        this.wss.on('connection', (ws, req) => {
            logger.info(chalk.cyan(`[MANAGER] WebSocket client connected from ${req.socket.remoteAddress}`));
            this.clients.add(ws);

            // Send initial status
            this.sendToClient(ws, {
                type: 'status',
                data: this.statusMonitor.getStatus()
            });

            // Send welcome message
            this.sendToClient(ws, {
                type: 'welcome',
                data: {
                    message: 'Connected to FD Tone Notify Manager',
                    timestamp: new Date().toISOString()
                }
            });

            ws.on('close', () => {
                logger.info(chalk.cyan('[MANAGER] WebSocket client disconnected'));
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                logger.error(chalk.red(`[MANAGER] WebSocket error: ${error.message}`));
                this.clients.delete(ws);
            });

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleWebSocketMessage(ws, data);
                } catch (error) {
                    logger.error(chalk.red(`[MANAGER] Invalid WebSocket message: ${error.message}`));
                }
            });
        });

        // Listen for status updates
        this.statusMonitor.onStatusUpdate((updateEvent) => {
            this.broadcast({
                type: 'statusUpdate',
                data: updateEvent
            });
        });

        // Send heartbeat every 30 seconds to all connected clients
        setInterval(() => {
            if (this.wss && this.clients.size > 0) {
                logger.info(chalk.cyan(`[MANAGER] Sending heartbeat to ${this.clients.size} connected clients`));
                this.broadcast({
                    type: 'heartbeat',
                    data: {
                        timestamp: new Date().toISOString(),
                        status: 'running',
                        message: 'Manager heartbeat',
                        connectedClients: this.clients.size
                    }
                });
            }
        }, 30000);
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleWebSocketMessage(ws, data) {
        switch (data.type) {
            case 'ping':
                this.sendToClient(ws, { type: 'pong', data: { timestamp: new Date().toISOString() } });
                break;
                
            case 'getStatus':
                this.sendToClient(ws, {
                    type: 'status',
                    data: this.statusMonitor.getStatus()
                });
                break;
                
            default:
                logger.warning(chalk.yellow(`[MANAGER] Unknown WebSocket message type: ${data.type}`));
        }
    }

    /**
     * Send message to a specific WebSocket client
     */
    sendToClient(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(message));
            } catch (error) {
                logger.error(chalk.red(`[MANAGER] Error sending WebSocket message: ${error.message}`));
            }
        }
    }

    /**
     * Broadcast message to all connected WebSocket clients
     */
    broadcast(message) {
        this.clients.forEach(client => {
            this.sendToClient(client, message);
        });
    }

    /**
     * Close all WebSocket connections
     */
    close() {
        if (this.wss) {
            this.wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.close();
                }
            });
            this.wss.close();
        }
    }
}

module.exports = WebSocketManager;