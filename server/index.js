let express = require('express');
//var favicon = require('serve-favicon');
let morgan = require('morgan');
//let bodyParser = require('body-parser');
let helmet = require('helmet');
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
const corsOptions = {
    origin: function (origin, callback) {
        callback(null, true);
        return;
        if (whitelist.indexOf(origin) !== -1) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    }
};

function startWebApp() {
    let app = express();
    const server = startServer(app);
    const wss = new WebSocket.Server({ server });

    //Standard middleware
    expressMiddlewareInit(app);
    configureWss(wss);

    //Configure application routes
    const { configureRoutes } = require('./routes/router');
    configureRoutes(app);

    errorHandlingMiddleware(app);

    app.wss = wss;

    return app;
}

function expressMiddlewareInit(app){
    app.use(helmet());
    //app.use(cors(corsOptions));

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
    wss.on('connection', (ws) => {

        //connection is up, let's add a simple simple event
        ws.on('message', (message) => {
            //log the received message and send it back to the client
            console.log('received: %s', message);
        });

        //send immediatly a feedback to the incoming connection
        ws.send(JSON.stringify({type: "toneDetected", data: {message: "Connected", dateString: moment().format('MMMM Do YYYY, H:mm:ss')}}));
    });
}


function configureWebSocketEvents({detectionService, wss}){
    detectionService.on('audio', data => {
        wss.clients.forEach(client => {
            client.send(JSON.stringify({type: 'data', data}));
        });
    });

    detectionService.on('pitchData', data => {
        wss.clients.forEach(client => {
            client.send(JSON.stringify({type: 'pitchData', data}));
        });
        log.silly('Sending pitchData to ws clients');
    });

    detectionService.on('toneDetected', data => {
        wss.clients.forEach(client => {
            const message = {type: 'toneDetected', data};
            client.send(JSON.stringify(message));
        });
        log.info('Sending toneDetected to ws clients');
    })
}

module.exports = {startWebApp, configureWebSocketEvents };
