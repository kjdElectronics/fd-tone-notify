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
        server.timeout = 5000;
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
        ? 'Pipe ' + port
        : 'Port ' + port;

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

module.exports = {startServer};