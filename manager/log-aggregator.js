const chalk = require('chalk');
const moment = require('moment');
const logger = require('../util/logger');

/**
 * LogAggregator handles unified console output from multiple child processes
 * with proper formatting, colors, and process identification.
 */
class LogAggregator {
    constructor() {
        this.processColors = {
            'MANAGER': chalk.cyan,
            'BACKEND': chalk.green,
            'UI': chalk.yellow,
            'SYSTEM': chalk.magenta
        };
        
        this.logLevels = {
            'error': chalk.red,
            'warning': chalk.yellow,
            'info': chalk.white,
            'success': chalk.green,
            'debug': chalk.gray
        };
    }

    /**
     * Log a message with process prefix and optional level
     */
    log(processName, message, level = 'info') {
        const timestamp = moment().format('MMM-DD-YYYY HH:mm:ss');
        const colorFunc = this.processColors[processName] || chalk.white;
        const levelFunc = this.logLevels[level] || chalk.white;
        
        const prefix = colorFunc.bold(`[${processName}]`);

        const formattedMessage = `${prefix} ${levelFunc(message)}`;
        
        // Log through Winston with appropriate level
        switch(level) {
            case 'emergency':
                logger.emerg(formattedMessage);
                break;
            case 'alert':
                logger.alert(formattedMessage);
                break;
            case 'critical':
                logger.crit(formattedMessage);
                break;
            case 'error':
                logger.error(formattedMessage);
                break;
            case 'warning':
                logger.warning(formattedMessage);
                break;
            case 'info':
                logger.info(formattedMessage);
                break;
            case 'debug':
                logger.debug(formattedMessage);
                break;
            case 'silly':
                logger.silly(formattedMessage);
                break;
            default:
                logger.info(formattedMessage);
        }
    }

    /**
     * Attach a child process for log streaming
     */
    attachProcess(processName, childProcess, processManager = null) {
        if (childProcess.stdout) {
            childProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                lines.forEach(line => {
                    this.processLine(processName, line, 'stdout', processManager);
                });
            });
        }

        if (childProcess.stderr) {
            childProcess.stderr.on('data', (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                lines.forEach(line => {
                    this.processLine(processName, line, 'stderr', processManager);
                });
            });
        }
    }

    /**
     * Process and format a single log line from child process
     */
    processLine(processName, line, streamType, processManager = null) {
        // Skip empty lines
        if (!line.trim()) return;

        // Detect Vite port for UI process
        if (processName === 'UI' && processManager) {
            this.detectVitePort(line, processManager);
        }

        // Determine log level based on content and stream
        let level = 'info';
        
        if (streamType === 'stderr') {
            level = 'error';
        } else {
            // Analyze line content for log level
            const lowerLine = line.toLowerCase();

            if (lowerLine.includes('emergency'))
                level = 'emergency';
            else if (lowerLine.includes('alert'))
                level = 'alert';
            else if (lowerLine.includes('critical'))
                level = 'critical';
            else if (lowerLine.includes('error'))
                level = 'error';
            else if (lowerLine.includes('warn') || lowerLine.includes('warning'))
                level = 'warning';
            else if (lowerLine.includes('debug') || lowerLine.includes('verbose'))
                level = 'debug';
            else if (lowerLine.includes('silly'))
                level = 'silly';
        }

        // Clean up the line
        let cleanLine = this.stripAnsiCodes(line);
        
        // Remove timestamp if it looks like one (to avoid duplication)
        cleanLine = cleanLine.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s*/, '');
        cleanLine = cleanLine.replace(/^\w{3}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}\s+/, '');

        this.log(processName, cleanLine, level);
    }

    /**
     * Detect Vite dev server port from log output
     */
    detectVitePort(line, processManager) {
        // Strip ANSI color codes from the line before processing
        const cleanLine = this.stripAnsiCodes(line);

        // Look for Vite's local server URL patterns
        const vitePatterns = [
            /➜\s+Local:\s+https?:\/\/localhost:(\d+)/i,
            /Local:\s+https?:\/\/localhost:(\d+)/i,
            /Local:\s+https?:\/\/127\.0\.0\.1:(\d+)/i,
            /dev server running at.*:(\d+)/i,
            /ready in.*Local.*:(\d+)/i
        ];

        // Test patterns against clean line
        for (let i = 0; i < vitePatterns.length; i++) {
            const pattern = vitePatterns[i];
            const match = cleanLine.match(pattern);

            if (match && match[1]) {
                const port = parseInt(match[1]);
                if (port && port !== processManager.detectedPorts.ui) {
                    processManager.detectedPorts.ui = port;
                    this.log('UI', `✅ Detected UI dev server on port ${port}`, 'success');
                    break;
                }
            }
        }
    }

    /**
     * Log manager-specific messages
     */
    logManager(message, level = 'info') {
        this.log('MANAGER', message, level);
    }

    /**
     * Log system-level messages
     */
    logSystem(message, level = 'info') {
        this.log('SYSTEM', message, level);
    }

    /**
     * Log a formatted status table
     */
    logStatusTable(title, data) {
        const tableWidth = 80;
        const border = '═'.repeat(tableWidth);
        const lightBorder = '─'.repeat(tableWidth);
        
        logger.info(chalk.cyan(border));
        logger.info(chalk.cyan(`║${title.padStart((tableWidth - 2 + title.length) / 2).padEnd(tableWidth - 2)}║`));
        logger.info(chalk.cyan(border));
        
        data.forEach((row, index) => {
            if (index > 0) {
                logger.info(chalk.cyan(`║${lightBorder.substring(0, tableWidth - 2)}║`));
            }
            
            const [label, value, status] = row;
            const labelFormatted = `  ${label}:`.padEnd(20);
            const valueFormatted = value.padEnd(30);
            const statusFormatted = status.padEnd(tableWidth - 54);
            
            let statusColor = chalk.white;
            if (status.includes('✓') || status.includes('Running')) statusColor = chalk.green;
            else if (status.includes('✗') || status.includes('Error')) statusColor = chalk.red;
            else if (status.includes('⚠') || status.includes('Starting')) statusColor = chalk.yellow;
            
            logger.info(chalk.cyan('║') + 
                       chalk.white(labelFormatted) + 
                       chalk.gray(valueFormatted) + 
                       statusColor(statusFormatted) + 
                       chalk.cyan('║'));
        });
        
        logger.info(chalk.cyan(border));
    }

    /**
     * Log a simple separator with optional title
     */
    logSeparator(title = '') {
        const line = '═'.repeat(80);
        if (title) {
            const paddedTitle = ` ${title} `;
            const totalLength = line.length;
            const titleLength = paddedTitle.length;
            const sideLength = Math.floor((totalLength - titleLength) / 2);
            const leftSide = '═'.repeat(sideLength);
            const rightSide = '═'.repeat(totalLength - sideLength - titleLength);
            logger.info(chalk.cyan(`${leftSide}${chalk.white.bold(paddedTitle)}${rightSide}`));
        } else {
            logger.info(chalk.cyan(line));
        }
    }

    /**
     * Strip ANSI color codes from a string
     * @param {string} str - String that may contain ANSI codes
     * @returns {string} - Clean string without ANSI codes
     */
    stripAnsiCodes(str) {
        // Remove ANSI escape sequences (color codes, formatting, etc.)
        return str.replace(/\x1b\[[0-9;]*[mGKHJF]/g, '');
    }

}

module.exports = LogAggregator;