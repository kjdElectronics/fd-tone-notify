const Transport = require('winston-transport');
const  Coralogix = require("coralogix-logger");
const { threadId, isMainThread, parentPort, workerData } = require('worker_threads');

const LEVEL_MAP = {
    emerg: "critical",
    emergency: "critical",

    alert: "critical",

    crit: "critical",
    critical: "critical",

    err: "error",
    error: "error",

    warn: "warning",
    warning: "warning",

    notice: "info",
    info: "info",
    debug: "verbose",
    silly: "debug"
};

class CoralogixWinstonTransport extends Transport{
    constructor(props) {
        super(props);
        if(!props.config)
            throw new Error("Must pass config as instance of Coralogix.LoggerConfig");
        Coralogix.CoralogixLogger.configure(props.config);
        this.logger = new Coralogix.CoralogixLogger(props.category ? props.category : undefined);
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        const cleanText =  info.message.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");

        // Perform the writing to the remote service
        const coraLog = new Coralogix.Log({
            severity: Coralogix.Severity[LEVEL_MAP[info.level]],
            level: info.level,
            text: `${info.level}: ${cleanText}`,
            threadId: threadId,
            isMainThread: isMainThread,
            category: "log",
            className: "N/A",
            methodName: "N/A"
        });
        this.logger.addLog(coraLog);
        callback();
    }
}

module.exports = {CoralogixWinstonTransport};