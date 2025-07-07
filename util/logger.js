const  Coralogix = require("coralogix-logger");
const winston = require('winston');
const chalk = require('chalk');
let logger;
const {CoralogixWinstonTransport} = require("./CoralogixWinstonTransport");
const CORALOGIX_PRIVATE_KEY = process.env.FD_CORALOGIX_PRIVATE_KEY;
const moment = require('moment');
const config = require('config');
const suppressStdout = require("./logger.suppress.stdout");

let coralogixConfig;
if(CORALOGIX_PRIVATE_KEY){
    coralogixConfig = new Coralogix.LoggerConfig({
        applicationName: config.coralogix.applicationName,
        privateKey: CORALOGIX_PRIVATE_KEY,
        subsystemName: config.coralogix.subsystemName,
    });
}

//Check if console output should be disabled
const suppressStdOut = suppressStdout();

let alignColorsAndTime = winston.format.combine(
    winston.format.colorize({
        all:true
    }),
    winston.format.printf(
        info => `${moment().format("MMM-DD-YYYY HH:mm:ss")} ${info.level} : ${info.message}`
    )
);

const consoleFormat = winston.format.combine(
    winston.format.timestamp({
        format:"YY-MM-DD-HH:MM:SS"
    }),
    winston.format.printf(
        info => `${info.timestamp}  ${info.level} : ${info.message}`
    )
);

if(!logger) {
    const levels = winston.config.syslog.levels;
    levels.silly = 8;
    const transports = [
        new winston.transports.File({
            filename: 'log.log',
            level: 'info',
            format: consoleFormat
        })
    ];

    consoleTransport = new winston.transports.Console({
        format: alignColorsAndTime,
    });
    if(!suppressStdOut)
        transports.push(consoleTransport);

    if(CORALOGIX_PRIVATE_KEY) {
        transports.push(new CoralogixWinstonTransport({
            level: 'info',
            config: coralogixConfig,
        }));
    }

    logger = winston.createLogger({
        levels: levels,
        level: process.env.FD_LOG_LEVEL ? process.env.FD_LOG_LEVEL : "info",
        format: winston.format.json(),
        transports
    });
    logger.silly(chalk.bold.blue.bgGray('Starting Logging'));
}

module.exports = logger;