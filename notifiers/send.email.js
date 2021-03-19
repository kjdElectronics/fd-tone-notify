const chalk = require('chalk');
const config = require('config');
const log = require('../util/logger');
const nodemailer = require("nodemailer");
const path = require('path');

let transporter = null;

function __init(){
    const USERNAME = process.env.FD_SMTP_USERNAME;
    const PASSWORD = process.env.FD_SMTP_PASSWORD;
    if(!USERNAME || !PASSWORD){
        const errMsg = "Mail Notification: Incomplete SMTP configuration. Check that environment variables FD_SMTP_USERNAME and FD_SMTP_PASSWORD are both set";
        log.crit(errMsg);
        throw new Error(errMsg);
    }

    transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
            user: USERNAME,
            pass: PASSWORD,
        },
    });
}

async function sendEmail({to, bcc, subject, text, filename, recordingRelPath, attachFile, isTest=false}){
    if(isTest){
        subject = 'TEST - ' + subject;
        text = 'TEST - ' + text;
    }


    log.info(`Sending email to ${to ? to: "N/A"}, bcc: ${bcc ? bcc : "N/A"}. Subject: ${subject}. Attach File: ${attachFile}`);
    if(transporter == null)
        __init();
    const options = {
        from: config.email.from, // sender address
        to,
        bcc,
        subject,
        text, // plain text body
    };
    if(attachFile){
        options.attachments = [
            {
                filename,
                path: path.resolve(recordingRelPath)
            }
        ]
    }

    return transporter.sendMail(options)
        .then(info => {
            log.info(`  Email Notification Sent: Message ID ${info.messageId}`);
            return info;
        })
}

module.exports = {sendEmail};