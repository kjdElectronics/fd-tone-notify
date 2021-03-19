const log = require('../util/logger');
const {sendPostRecordingNotifications} = require("../notifiers");
const {sendPreRecordingNotifications} = require("../notifiers");
const {TonesDetector} = require("../obj/TonesDetector");
const {NotificationParams} = require("../obj/NotificationParams");
const fs = require('fs');
const config = require("config");

async function testNotifications(){
    const detectors =  config.detection.detectors.map(d => new TonesDetector(d));
    log.info(`Send TEST Pre Recording Notifications`);
    fs.writeFileSync('test-empty-recording.wav', "data");

    const timestamp = new Date().getTime();
    for (let i = 0; i < detectors.length; i++) {
        const detector = detectors[i];
        const params = new NotificationParams(
            {
                detector,
                timestamp,
                notifications: detector.notifications,
                filename: "test-empty-recording.wav",
                attachFile: false,
                message: "TEST NOTIFICATION",
                isTest: true
            }
        );

        try {
            await sendPreRecordingNotifications(params);
            log.info(`All TEST Pre Recording Notifications Sent for ${detector.name}`)
        }
        catch (err){
            log.error(`Failed to send all TEST Pre Recording Notifications for ${detector.name}`);
        }

        try {
            await sendPostRecordingNotifications(params);
            log.info(`All TEST POST Recording Notifications Sent for ${detector.name}`)
        }
        catch (err){
            log.error(`Failed to send all TEST POST Recording Notifications for ${detector.name}`);
        }
    }
}

module.exports = {testNotifications};