const log = require('../util/logger');
const {sendPostRecordingNotifications} = require('../notifiers');
const { workerData, parentPort } = require('worker_threads');
const {NotificationParams} = require('../obj/NotificationParams');
const {RecordingService} = require('../service/RecordingService');
const { program } = require('commander');
const garbageCollect = require("../util/gc");

async function main(){
    try {
        if (workerData)
            return recordAndNotifyWorker();
        if (process.send)
            return recordAndNotifyForked();
        return commandLineRecord();
    }catch (e) {
        log.error(e);
        throw e;
    }
}

async function recordAndNotifyWorker(){
    log.info("Initializing Recording Worker Thread");

    const recordingService = new RecordingService();
    const memoryMonitor = _setupMemoryMonitor('WORKER');

    parentPort.on("message", async message => {
        if (message === "exit") {
            // Cleanup before exit
            clearInterval(memoryMonitor);
            if (recordingService && typeof recordingService.dispose === 'function') {
                recordingService.dispose();
            }
            parentPort.close();
        } else { //Start recording
            log.notice(`Recording Worker: STARTING RECORDING`);
            const notificationParams = new NotificationParams({...message,
                attachFile: true});
            const filename = await recordingService.recordFile(notificationParams);
            await sendNotifications(notificationParams)
                .finally(r => {
                    const exitCb = () => parentPort.close();
                    _cleanup({
                        exitCb: exitCb,
                        memoryMonitor,
                        recordingService});
                });
        }
    });
}

async function recordAndNotifyForked(){
    log.info("Initializing Recording Forked Thread");
    const recordingService = new RecordingService();
    const memoryMonitor = _setupMemoryMonitor('FORK');

    process.on('message', async message => {
        log.notice(`Recording Thread: STARTING RECORDING`);
        //Start recording
        const notificationParams = new NotificationParams({...message,
            attachFile: true});
        const filename = await recordingService.recordFile(notificationParams);
        return sendNotifications(notificationParams)
            .finally(r => {
                const exitDb = () => process.exit(0);
                _cleanup({
                    exitCb: exitDb,
                    memoryMonitor,
                    recordingService});
            });
    });
}

function _setupMemoryMonitor(processType) {
    let memoryCheckCount = 0;
    return setInterval(() => {
        const usage = process.memoryUsage();
        const memInfo = {
            check: ++memoryCheckCount,
            rss: Math.round(usage.rss / 1024 / 1024),
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
            external: Math.round(usage.external / 1024 / 1024)
        };
        log.debug(`Recording ${processType} memory check ${memoryCheckCount}: RSS=${memInfo.rss}MB, Heap=${memInfo.heapUsed}/${memInfo.heapTotal}MB, External=${memInfo.external}MB`);
        garbageCollect(`Recording ${processType}`);
    }, 30000); // Every 30 seconds
}

function _cleanup({exitCb, memoryMonitor, recordingService}){
    log.notice(`Recording: RECORDING COMPLETE. Waiting for 60 seconds before cleanup...`);

    setTimeout(() => {
        // Cleanup after recording complete
        clearInterval(memoryMonitor);
        if (recordingService && typeof recordingService.dispose === 'function') {
            recordingService.dispose();
        }
        log.notice(`Recording: CLEANUP COMPLETE. Exiting...`);
        exitCb();
    }, 60000)
}

async function commandLineRecord(){
    program
        .requiredOption('--detector <json>')
        .requiredOption('--timestamp <timestamp>')
        .requiredOption('--matchAverages <json>')
        .requiredOption('--notifications <json>')
        .requiredOption('--filename <filename>')
        .requiredOption('--message <message>')
        .parse();
    const options = program.opts();
    const recordingService = new RecordingService();
    const notificationParams = new NotificationParams(
        {
            detector: JSON.parse(options.detector),
            timestamp: Number.parseInt(options.timestamp),
            matchAverages: JSON.parse(options.matchAverages),
            notifications: JSON.parse(options.notifications),
            filename: options.filename,
            message: options.message,
            attachFile: true
    });
    const filename = await recordingService.recordFile(notificationParams);
    return sendNotifications(notificationParams)
        .finally(r => parentPort.close())
}

async function recordAndNotify(notificationParams){
    log.info("Starting Recording");
    const recordingService = new RecordingService();
    const filename = await recordingService.recordFile(notificationParams);
    return sendNotifications(notificationParams)
        .finally(r => parentPort.close())
}

async function sendNotifications(notificationParams) {
    return sendPostRecordingNotifications(notificationParams)
        .catch(err => {
            log.error(`Error sending post recording notifications`);
            log.debug(err.stack);
        })
}

if (require.main === module)
    return main();
module.exports = {recordAndNotify};