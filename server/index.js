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

    detectionService.on('toneDetected', data => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                const message = {type: 'toneDetected', data};
                client.send(JSON.stringify(message));
            }
        });
        log.info('Sending toneDetected to ws clients');
    });

    // Handle multiToneDetected events from AllToneDetectionService if enabled
    if (allToneDetectionService) {
        allToneDetectionService.on('multiToneDetected', data => {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    const message = {
                        type: 'multiToneDetected', 
                        data: {
                            tones: data,
                            timestamp: new Date().toISOString(),
                            detector: {
                                name: 'All Tone Detector',
                                type: 'discovery'
                            }
                        }
                    };
                    client.send(JSON.stringify(message));
                }
            });
            log.info(`Sending multiToneDetected to ws clients: ${data.map(f => `${f}Hz`).join(', ')}`);
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

module.exports = {startWebApp, configureWebSocketEvents };
