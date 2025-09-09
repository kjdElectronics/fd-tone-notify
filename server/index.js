let express = require('express');
//var favicon = require('serve-favicon');
let morgan = require('morgan');
//let bodyParser = require('body-parser');
let helmet = require('helmet');
const cors = require('cors');
const WebSocket = require('ws');
const log = require('../util/logger');
const path = require('path');
const moment = require("moment");
const { getDetectionStore } = require('./detection-store');
const PUBLIC_PATH = path.join(__dirname, './public');
//For Packaging

// javascript-obfuscator:disable
const htmlPath = path.join(__dirname, './public/index.css');
// javascript-obfuscator:disable
const cssPath = path.join(__dirname, './public/index.html');

const {startServer} = require("./server");
const NetworkUtils = require('../util/network-utils');

const corsOptions = {
    origin: NetworkUtils.createCORSOriginValidator(),
    credentials: true // Allow credentials (cookies, authorization headers)
};

// Module-level WebSocket server reference for use by other modules
let globalWss = null;

// Global detection store instance
let detectionStore = null;

async function startWebApp() {
    let app = express();
    
    //Standard middleware
    expressMiddlewareInit(app);

    //Configure application routes
    const { configureRoutes } = require('./routes/router');
    configureRoutes(app);

    errorHandlingMiddleware(app);

    const server = await startServer(app);
    
    // Create WebSocket server after HTTP server is ready
    const wss = new WebSocket.Server({ 
        server,
        path: '/api/websocket',
        perMessageDeflate: false,
        clientTracking: true
    });

    configureWss(wss);

    app.wss = wss;
    globalWss = wss; // Store reference for global access

    // Initialize detection store
    detectionStore = getDetectionStore();
    log.info('Detection store initialized');

    log.info('WebSocket server configured and attached to HTTP server');
    return app;
}

function expressMiddlewareInit(app){
    app.use(helmet());
    app.use(cors(corsOptions));

    // uncomment after placing your favicon in /public
    //app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
    app.use(morgan('dev', ));
    app.use('/', express.static(PUBLIC_PATH))
    app.use(express.json({ limit: '5mb' }));
    app.use(express.urlencoded({ extended: true, limit: '5mb' }));
    //app.use(cookieParser());
}

function errorHandlingMiddleware(app){
    const { errorHandler } = require('./middleware/error.middleware');
    app.use(errorHandler);
}

function configureWss(wss){
    wss.on('connection', (ws, req) => {
        log.info(`WebSocket client connected from ${req.socket.remoteAddress}`);

        //connection is up, let's add a simple simple event
        ws.on('message', (message) => {
            //log the received message and send it back to the client
            log.debug('WebSocket received: %s', message);
        });

        ws.on('close', (code, reason) => {
            log.info(`WebSocket client disconnected: ${code} ${reason}`);
        });

        ws.on('error', (error) => {
            log.error(`WebSocket client error: ${error.message}`);
        });

        //send immediately a feedback to the incoming connection
        try {
            ws.send(JSON.stringify({
                type: "connection", 
                data: {
                    message: "Connected to FD Tone Notify Backend", 
                    dateString: moment().format('MMMM Do YYYY, H:mm:ss'),
                    timestamp: new Date().toISOString()
                }
            }));
        } catch (error) {
            log.error(`Failed to send connection message: ${error.message}`);
        }
    });

    wss.on('error', (error) => {
        log.error(`WebSocket server error: ${error.message}`);
    });

    // Send heartbeat every 5 seconds to all connected clients
    setInterval(() => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(JSON.stringify({
                        type: 'heartbeat',
                        data: {
                            timestamp: new Date().toISOString(),
                            status: 'running',
                            message: 'Backend heartbeat'
                        }
                    }));
                } catch (error) {
                    log.error(`Failed to send heartbeat: ${error.message}`);
                }
            }
        });
    }, 5000);

    log.info('WebSocket server event handlers configured');
}


function configureWebSocketEvents({detectionService, allToneDetectionService, wss}){
    detectionService.on('audio', data => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({type: 'data', data}));
            }
        });
    });

    detectionService.on('pitchData', data => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({type: 'pitchData', data}));
            }
        });
    });

    detectionService.on('toneDetected', async data => {
        // Create message for WebSocket broadcast
        const message = {type: 'toneDetected', data};
        
        // Broadcast to WebSocket clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
        
        // Store the detection (same format as frontend expects)
        if (detectionStore) {
            detectionStore.addDetection({
                ...data,
                timestamp: new Date().toISOString(),
                type: 'configured'
            });
        }
        
        log.info('Sending toneDetected to ws clients and persisting');
    });

    // Handle multiToneDetected events from AllToneDetectionService if enabled
    if (allToneDetectionService) {
        allToneDetectionService.on('multiToneDetected', async eventData => {
            // Extract data from the event - could be legacy format (just tones array) or new format (object with tones and timestamp)
            const tones = Array.isArray(eventData) ? eventData : eventData.tones;
            const detectionTimestamp = Array.isArray(eventData) ? new Date().toISOString() : (eventData.timestamp ? new Date(eventData.timestamp * 1000).toISOString() : new Date().toISOString());
            
            // Create standardized message data
            const messageData = {
                tones: tones,
                timestamp: detectionTimestamp,
                detector: {
                    name: 'All Tone Detector',
                    type: 'discovery'
                }
            };
            
            // Broadcast to WebSocket clients
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    const message = {
                        type: 'multiToneDetected', 
                        data: messageData
                    };
                    client.send(JSON.stringify(message));
                }
            });
            
            // Store the detection (same format as frontend expects)
            if (detectionStore) {
                detectionStore.addDetection({
                    ...messageData,
                    timestamp: detectionTimestamp,
                    type: 'discovery'
                });
            }
            
            log.info(`Sending multiToneDetected to ws clients and persisting: ${tones.map(f => `${f}Hz`).join(', ')}`);
        });
    }

    // Add function to broadcast log messages
    function broadcastLog(level, message, data = {}) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'log',
                    data: {
                        level,
                        message,
                        timestamp: new Date().toISOString(),
                        ...data
                    }
                }));
            }
        });
    }

    // Expose broadcast function for use by other modules
    wss.broadcastLog = broadcastLog;
}

// Function to get the global WebSocket server instance
function getWebSocketServer() {
    return globalWss;
}

// Function to get the global detection store instance
function getGlobalDetectionStore() {
    return detectionStore;
}

module.exports = {startWebApp, configureWebSocketEvents, getWebSocketServer, getGlobalDetectionStore };
