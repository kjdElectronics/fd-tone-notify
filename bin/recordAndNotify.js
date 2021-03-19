const log = require('../util/logger');
const {sendPostRecordingNotifications} = require('../notifiers');
const { workerData, parentPort } = require('worker_threads');
const {NotificationParams} = require('../obj/NotificationParams');
const {RecordingService} = require('../service/RecordingService');
const { program } = require('commander');

async function main(){
    if(workerData)
        return recordAndNotifyWorker();
    if(process.send)
        return recordAndNotifyForked();
    return commandLineRecord();
}

async function recordAndNotifyWorker(){
    log.info("Initializing Recording Worker Thread");

    const recordingService = new RecordingService();

    parentPort.on("message", async message => {
        if (message === "exit")
            parentPort.close();
        else { //Start recording
            const notificationParams = new NotificationParams({...message,
                attachFile: true});
            const filename = await recordingService.recordFile(notificationParams);
            return sendNotifications(notificationParams)
                .finally(r => parentPort.close())
        }
    });
}

async function recordAndNotifyForked(){
    log.info("Initializing Recording Forked Thread");
    const recordingService = new RecordingService();

    process.on('message', async message => {
        //Start recording
        const notificationParams = new NotificationParams({...message,
            attachFile: true});
        const filename = await recordingService.recordFile(notificationParams);
        return sendNotifications(notificationParams)
            .finally(r => process.exit(0))
    });
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
            filename: filename,
            message: message,
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
    return await sendPostRecordingNotifications(notificationParams)
        .catch(err => {
            log.error(`Error sending post recording notifications`);
            log.debug(err.stack);
        })
}

if (require.main === module)
    return main();
module.exports = {recordAndNotify};