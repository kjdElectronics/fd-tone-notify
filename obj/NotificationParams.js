const moment = require('moment');
const PRE = "PRE";
const POST = "POST";
const { v4: uuidv4 } = require('uuid');

class NotificationParams{
    constructor({uuid , detector, timestamp=new Date().getTime(),
                    matchAverages=[], notifications={}, filename, attachFile=false, message, isTest=false,
                    talkgroup=''}) {
        this.uuid  = uuid  ? uuid  : uuidv4();
        this.detector = detector;
        this.timestamp = timestamp ? timestamp : new Date().getTime();
        this.matchAverages = matchAverages;
        this.notifications = notifications;
        this.filename = filename;
        this.attachFile = attachFile;
        this.message = message;
        this.isTest = isTest;
        this.talkgroup = talkgroup || ''; // Rdio talkgroup label the call arrived on; empty for live/file audio
    }

    toObj(){
        return {
            uuid : this.uuid,
            detector: this.detector.toObj(),
            detectedAt: new Date(this.timestamp).toISOString(),
            matchAverages: this.matchAverages,
            notifications: this.notifications,
            filename: this.filename,
            dateString: this.dateString,
            message: this.message,
            talkgroup: this.talkgroup
        }
    }

    get dateString(){
        return moment(this.timestamp).format('MMMM Do YYYY, H:mm:ss');
    }

    /**
     * Replace notification template variables: %d (date/time) and %tg (talkgroup)
     */
    applyTemplate(str){
        if (typeof str !== 'string') return str;
        return str.replaceAll('%tg', this.talkgroup).replaceAll('%d', this.dateString);
    }

    getPushbullets(prePostType){
        return this.__getNotificationOptions({prePostType, notificationKey: "pushbullet"});
    }

    getEmails(prePostType){
        const emails = this.__getNotificationOptions({prePostType, notificationKey: "emails"});
        const updatedEmails = emails.map(email => {
                // Make a shallow copy of the email objects so we do not modify them
                let emailCopy = Object.assign({}, email);
                emailCopy.text = this.applyTemplate(email.text);
                emailCopy.subject = this.applyTemplate(email.subject);
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