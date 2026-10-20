const {PushMessageOptions} = require("../obj/PushMessageOptions");
const {runExternalCommand} = require('./external.command');
const {sendEmail} = require('./send.email');
const {postJson, postMultiPartFormDataWithFile} = require('./webhook');
const {PushBulletService} = require('./PushBulletService');
const {PushoverService} = require('./PushoverService');
const {TelegramService} = require('./TelegramService');
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
    const po = _pushoverNotifications(notificationParams, PRE);
    const tg = _telegramNotifications(notificationParams, PRE);
    let promises = [p, po, tg];
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
    const po = _pushoverNotifications(notificationParams, POST);
    const tg = _telegramNotifications(notificationParams, POST);
    let promises = [p, po, tg];
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
            const options = new PushMessageOptions({...push, timestamp: params.timestamp, isTest: params.isTest, talkgroup: params.talkgroup})
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
    return pushovers.map(po => {
        const options = new PushMessageOptions({...po, timestamp: params.timestamp, isTest: params.isTest, talkgroup: params.talkgroup});
        if (prePostType === PRE) {
            return PushoverService.push({title: options.title, message: options.body, user: po.user, priority: po.priority, sound: po.sound})
                .then(r => log.info(chalk.bold.green("Initial Pushover Push Sent")))
                .catch(err => {
                    log.error("Error sending Initial Pushover push");
                    log.debug(err.stack);
                });
        } else {
            return PushoverService.pushFile({
                title: `${params.detector ? params.detector.name : ''} Dispatch Audio`,
                message: options.body,
                user: po.user,
                priority: po.priority,
                sound: po.sound,
                absolutePath: path.resolve(params.filename),
            })
                .then(r => log.info("Pushover Audio Attachment Sent"))
                .catch(err => {
                    log.error("Error sending Pushover audio attachment");
                    log.debug(err.stack);
                });
        }
    });
}

async function _telegramNotifications(params, prePostType) {
    const telegrams = params.getTelegrams(prePostType);
    if (telegrams.length === 0) {
        log.debug(`No Telegram ${prePostType} Recording notifications`);
        return;
    }

    log.info(`Sending ${telegrams.length}x ${prePostType} Recording Telegram notifications`);
    return telegrams.map(tg => {
        const options = new PushMessageOptions({...tg, timestamp: params.timestamp, isTest: params.isTest, talkgroup: params.talkgroup});
        if (prePostType === PRE) {
            return TelegramService.push({title: options.title, message: options.body, chatId: tg.chatId})
                .then(r => log.info(chalk.bold.green("Initial Telegram Message Sent")))
                .catch(err => {
                    log.error("Error sending Initial Telegram message");
                    log.debug(err.stack);
                });
        } else {
            return TelegramService.pushFile({
                title: `${params.detector ? params.detector.name : ''} Dispatch Audio`,
                message: options.body,
                chatId: tg.chatId,
                absolutePath: path.resolve(params.filename),
                filename: path.basename(params.filename),
            })
                .then(r => log.info("Telegram Audio Attachment Sent"))
                .catch(err => {
                    log.error("Error sending Telegram audio attachment");
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
                log.error(`Email Error: ${err?.message || err?.toJSON() || err.toString()}`);
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
            detectedAt: new Date(params.timestamp).toISOString(),
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
            detectedAt: new Date(params.timestamp).toISOString(),
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