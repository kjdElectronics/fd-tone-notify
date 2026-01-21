const {PushMessageOptions} = require("../obj/PushMessageOptions");
const {runExternalCommand} = require('./external.command');
const {sendEmail} = require('./send.email');
const {postJson, postMultiPartFormDataWithFile} = require('./webhook');
const {PushBulletService} = require('./PushBulletService');
const {PushoverService} = require('./PushoverService');
const chalk = require('chalk');
const log = require('../util/logger');
const path = require('path');
const {NotificationParams} = require("../obj/NotificationParams");
const {PRE, POST} = require("../obj/NotificationParams");

//TODO Add Test for this file

async function sendPreRecordingNotifications(notificationParams){
    if(!(notificationParams instanceof NotificationParams)) {
        const message = "notificationParams must be instance of NotificationParams";
        log.error(message);
        throw new Error(message);
    }

    log.debug(`Processing PRE recording notifications for ${notificationParams.detector.name}. UUID: ${notificationParams.uuid}`);
    const p = _pushbulletNotifications(notificationParams, PRE);
    const p2 = _pushoverNotifications(notificationParams, PRE);
    let promises = [p, p2];
    if(notificationParams.notifications.preRecording) {
        promises = promises.concat(_emailNotifications(notificationParams, PRE));
        promises = promises.concat(_webhooks(notificationParams, PRE));
        promises = promises.concat(_externalCommands(notificationParams, PRE));
    }
    return Promise.allSettled(promises);
}

async function sendPostRecordingNotifications(notificationParams){
    if(!(notificationParams instanceof NotificationParams)) {
        const message = "notificationParams must be instance of NotificationParams";
        log.error(message);
        throw new Error(message);
    }

    log.debug(`Processing POST recording notifications ${notificationParams.detector.name}. UUID: ${notificationParams.uuid}`);
    const p = _pushbulletNotifications(notificationParams, POST);
    const p2 = _pushoverNotifications(notificationParams, POST);
    let promises = [p, p2];
    if(notificationParams.notifications.postRecording) {
        promises = promises.concat(_emailNotifications(notificationParams, POST));
        promises = promises.concat(_webhooks(notificationParams, POST));
        promises = promises.concat(_externalCommands(notificationParams, POST));
    }
    return Promise.allSettled(promises);
}

async function _pushbulletNotifications(params, prePostType) {
    const pushbullets = params.getPushbullets(prePostType);
    if (pushbullets.length === 0) {
        log.debug(`No Pushbullet ${prePostType} Recording notifications`);
        return;
    }

    log.info(`Sending ${pushbullets.length}x ${prePostType} Recording Pushbullet notifications`);
    return pushbullets.map(push => {
        if (prePostType === PRE) {
            const options = new PushMessageOptions({...push, timestamp: params.timestamp, isTest: params.isTest})
            return PushBulletService.push(options)
                .then(r => log.info(chalk.bold.green("Initial Push Sent")))
                .catch(err => {
                    log.error("Error sending Initial push");
                    log.debug(err.stack);
                });
        } else {
            const options = {
                filename: params.filename,
                title: `${params.detector ? params.detector.name : ''} Dispatch Audio`,
                absolutePath: path.resolve(params.filename),
                channelTag: push.channelTag,
            };

            return PushBulletService.pushFile(options)
                .then(r => log.info("Push Audio Link Sent"))
                .catch(err => {
                    log.error("Error Audio Link Push");
                    log.debug(err.stack);
                });
        }
    });
}

async function _pushoverNotifications(params, prePostType) {
    const pushovers = params.getPushovers(prePostType);
    if (pushovers.length === 0) {
        log.debug(`No Pushover ${prePostType} Recording notifications`);
        return;
    }

    log.info(`Sending ${pushovers.length}x ${prePostType} Recording Pushover notifications`);
    return pushovers.map(push => {
        if (prePostType === PRE) {
            const options = {
                message: push.message || push.body || `Tone Received ${params.dateString}`,
                title: push.title,
                device: push.device,
                priority: push.priority,
                sound: push.sound
            };
            return PushoverService.push(options)
                .then(r => log.info(chalk.bold.green("Pushover Initial Notification Sent")))
                .catch(err => {
                    log.error("Error sending Pushover initial notification");
                    log.debug(err.stack);
                });
        } else {
            const options = {
                title: push.title || `${params.detector ? params.detector.name : ''} Dispatch Audio`,
                message: push.message || push.body || `Audio recording from ${params.dateString}`,
                absolutePath: path.resolve(params.filename),
                filename: path.basename(params.filename),
                device: push.device,
                priority: push.priority,
                sound: push.sound
            };

            return PushoverService.pushFile(options)
                .then(r => log.info("Pushover Audio Notification Sent"))
                .catch(err => {
                    log.error("Error sending Pushover audio notification");
                    log.debug(err.stack);
                });
        }
    });
}

async function _emailNotifications(params, prePostType){
    const emails = params.getEmails(prePostType);
    if(emails.length === 0)
        return;

    log.info(`Sending ${emails.length}x ${prePostType} Recording email notifications`);
    return emails.map(email => {
        return sendEmail({...email, filename: path.basename(params.filename),  isTest: params.isTest,
            recordingRelPath: params.filename, attachFile: params.attachFile})
            .catch(err => {
                log.error(`Email Error: ${emails.to}`);
                log.debug(err.stack);
            })
    })
}

async function _webhooks(params, prePostType){
    const webhooks = params.getWebhooks(prePostType);
    if(webhooks.length === 0)
        return;

    log.info(`Sending ${webhooks.length}x ${prePostType} Recording webhook notifications.`);
    return webhooks.map(webhook => {
        const options = {
            address: webhook.address,
            headers: webhook.headers,
            custom: webhook.custom,
            timestamp: params.timestamp,
            tones: params.detector.tones,
            matchAverages: params.matchAverages,
            filename: path.basename(params.filename),
            recordingRelPath: params.filename,
            detectorName: params.detector.name,
            isTest: params.isTest
        };
        let promise;
        if(params.attachFile)
            promise =  postMultiPartFormDataWithFile(options);
        else
            promise = postJson(options);
        promise
            .catch(err => {
                log.error(`Webhook Error: ${webhook.address}`);
                log.debug(err.stack);
            })
    })
}

async function _externalCommands(params, prePostType){
    const commands = params.getCommands(prePostType);
    if(commands.length === 0)
        return;

    log.info(`Running ${commands.length}x ${prePostType} Recording commands`);
    return commands.map(commandConfig => {
        const options ={
            command: commandConfig.command,
            description: commandConfig.description,
            timestamp: params.timestamp,
            tones: params.detector.tones,
            matchAverages: params.matchAverages,
            recordingRelPath: params.filename,
            filename: path.basename(params.filename),
            detectorName: params.detector.name,
            custom: commandConfig.custom,
        };
        return runExternalCommand(options)
            .catch(err => {
                log.error(`External Command Error: ${commandConfig.command}`);
                log.debug(err.stack);
            })
    })
}

module.exports = {sendPreRecordingNotifications, sendPostRecordingNotifications};