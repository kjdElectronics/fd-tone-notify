const winston = require('winston');
const Transport = require('winston-transport');

/**
 * Winston transport that sends log messages to WebSocket clients
 */
class WebSocketTransport extends Transport {
    constructor(opts) {
        super(opts);
        
        this.name = 'websocket';
        this.level = opts.level || 'info';
        this.webSocketManager = null;
    }

    /**
     * Parse ANSI color codes and convert to web-friendly color data
     */
    parseAnsiColors(text) {
        const ansiRegex = /\[([0-9;]+)m/g;
        const colorData = [];
        let cleanText = text;
        let match;
        let offset = 0;

        const ansiToColor = {
            '30': { color: 'black' },
            '31': { color: 'red' },
            '32': { color: 'green' },
            '33': { color: 'yellow' },
            '34': { color: 'blue' },
            '35': { color: 'magenta' },
            '36': { color: 'cyan' },
            '37': { color: 'white' },
            '90': { color: 'brightBlack' },
            '91': { color: 'brightRed' },
            '92': { color: 'brightGreen' },
            '93': { color: 'brightYellow' },
            '94': { color: 'brightBlue' },
            '95': { color: 'brightMagenta' },
            '96': { color: 'brightCyan' },
            '97': { color: 'brightWhite' },
            '1': { bold: true },
            '22': { bold: false },
            '39': { color: null }
        };

        let currentStyle = {};
        let styleStart = 0;

        while ((match = ansiRegex.exec(text)) !== null) {
            const codes = match[1].split(';');
            const matchStart = match.index - offset;
            
            if (Object.keys(currentStyle).length > 0 && matchStart > styleStart) {
                colorData.push({
                    start: styleStart,
                    end: matchStart,
                    ...currentStyle
                });
            }

            codes.forEach(code => {
                if (ansiToColor[code]) {
                    Object.assign(currentStyle, ansiToColor[code]);
                } else if (code === '0') {
                    currentStyle = {};
                }
            });

            styleStart = matchStart;
            cleanText = cleanText.replace(match[0], '');
            offset += match[0].length;
        }

        if (Object.keys(currentStyle).length > 0) {
            colorData.push({
                start: styleStart,
                end: cleanText.length,
                ...currentStyle
            });
        }

        return { cleanText, colorData };
    }

    /**
     * Set the WebSocket manager instance
     */
    setWebSocketManager(webSocketManager) {
        this.webSocketManager = webSocketManager;
    }

    /**
     * Core logging method for Winston transport
     */
    log(info, callback) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        // Send to WebSocket clients if manager is available
        if (this.webSocketManager) {
            const { cleanText, colorData } = this.parseAnsiColors(info.message);
            
            const logMessage = {
                type: 'log',
                data: {
                    level: info.level,
                    message: cleanText,
                    colorData: colorData,
                    timestamp: info.timestamp || new Date().toISOString(),
                    metadata: info.metadata || {}
                }
            };

            try {
                this.webSocketManager.broadcast(logMessage);
            } catch (error) {
                // Silently fail if WebSocket broadcasting fails
                // to prevent infinite loops
            }
        }

        callback();
    }
}

module.exports = WebSocketTransport;