const moment = require('moment');
const PRE = "PRE";
const POST = "POST";
const { v4: uuidv4 } = require('uuid');

class NotificationParams{
    constructor({uuid , detector, timestamp=new Date().getTime(),
                    matchAverages=[], notifications={}, filename, attachFile=false, message, isTest=false}) {
        this.uuid  = uuid  ? uuid  : uuidv4();
        this.detector = detector;
        this.timestamp = timestamp ? timestamp : new Date().getTime();
        this.matchAverages = matchAverages;
        this.notifications = notifications;
        this.filename = filename;
        this.attachFile = attachFile;
        this.message = message;
        this.isTest = isTest;
    }

    toObj(){
        return {
            uuid : this.uuid,
            detector: this.detector.toObj(),
            timestamp: this.timestamp,
            matchAverages: this.matchAverages,
            notifications: this.notifications,
            filename: this.filename,
            dateString: this.dateString,
            message: this.message
        }
    }

    get dateString(){
        return moment(this.timestamp).format('MMMM Do YYYY, H:mm:ss');
    }

    getPushbullets(prePostType){
        return this.__getNotificationOptions({prePostType, notificationKey: "pushbullet"});
    }

    getEmails(prePostType){
        const emails = this.__getNotificationOptions({prePostType, notificationKey: "emails"});
        const updatedEmails = emails.map(email => {
                // Make a shallow copy of the email objects so we do not modify them
                let emailCopy = Object.assign({}, email);
                emailCopy.text = email.text.replace('%d', this.dateString);
                emailCopy.subject = email.subject.replace('%d', this.dateString);
                return emailCopy;
            });
        return updatedEmails;
    }

    getWebhooks(prePostType){
        return this.__getNotificationOptions({prePostType, notificationKey: "webhooks"});
    }

    getCommands(prePostType){
        return this.__getNotificationOptions({prePostType, notificationKey: "externalCommands"});
    }

    __getNotificationOptions({prePostType, notificationKey}){
        const options = this.notifications[this.__getKeyForPrePost(prePostType)];
        if (options && options[notificationKey])
            return this.notifications[this.__getKeyForPrePost(prePostType)][notificationKey];
        return [];
    }

    __getKeyForPrePost(prePostType){
        if(prePostType === PRE)
            return "preRecording";
        else if(prePostType === POST)
            return "postRecording";
        throw new Error("Invalid PrePost type")
    }
}

module.exports = {NotificationParams, PRE, POST};