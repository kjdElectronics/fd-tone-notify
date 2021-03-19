const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const log = require('../util/logger');

const BASE="https://api.pushbullet.com/v2";
const TOKEN = process.env.FD_PUSHBULLET_API_KEY;
if(!TOKEN || TOKEN === "")
    log.crit("Push Bullet does not have an API Key. Notifications will not be sent");

class PushBulletService{
    static async push({body, title, channelTag}){
        const postBody = {
            type: "note",
            body: body,
            title: title,
            channel_tag: channelTag
        };

        return fetch(`${BASE}/pushes`, {
            method: 'post',
            body:    JSON.stringify(postBody),
            headers: { 'Content-Type': 'application/json',  'Access-Token': TOKEN},
        })
            .then(async res => {
                if(!res.ok) {
                    const t = await res.text();
                    log.error(t);
                    throw new Error(t);
                }
                return true;
            })
            .catch(err => {
                log.error(`Failed to push. Error: ${err}`);
                throw err;
            })
    }

    /**
     * NOTE - This works but the attached wav file does not appear to play nice on the Android app.
     * Using pushFileLink is a better option
     * @returns {Promise<T>}
     */
    static async pushFile({title, filename, fileType, absolutePath, channelTag}){
        const uploadReqResult = await PushBulletService.uploadRequest({filename: filename, file_type: "audio/wav"});
        await PushBulletService.uploadFile({uploadReqResult, absolutePath});
        //PUSH FILE
        const postBody = {
            type: "file",
            title: title,
            file_name: filename,
            file_type: fileType,
            body: uploadReqResult.file_url,
            file_url: uploadReqResult.file_url,
            channel_tag: channelTag
        };

        return fetch(`${BASE}/pushes`, {
            method: 'post',
            body:    JSON.stringify(postBody),
            headers: { 'Content-Type': 'application/json',  'Access-Token': TOKEN},
        })
            .then(async res => {
                if(!res.ok) {
                    const t = await res.text();
                    log.error(t);
                    throw new Error(t);
                }
                return true;
            })
            .catch(err => {
                console.log(err.stack);
                log.error(`Failed to pushFile. Error: ${err}`);
                throw err;
            })
    }

    static uploadRequest({filename, fileType, path}){
        const postBody = {
            file_name: filename,
            file_type: fileType
        };

        return fetch(`${BASE}/upload-request`, {
            method: 'post',
            body:    JSON.stringify(postBody),
            headers: { 'Content-Type': 'application/json',  'Access-Token': TOKEN},
        })
            .then(res => {
                return res.json();
            })
            .catch(err => {
                console.log(err.stack);
                log.error(`Failed to uploadRequest. Error: ${err}`);
                throw err;
            })
    }

    static uploadFile({uploadReqResult, absolutePath}){
        const form = new FormData();
        form.append('awsaccesskeyid', uploadReqResult.data.awsaccesskeyid);
        form.append('acl', uploadReqResult.data.acl);
        form.append('key', uploadReqResult.data.key);
        form.append('signature', uploadReqResult.data.signature);
        form.append('policy', uploadReqResult.data.policy);
        form.append('content-type', uploadReqResult.data['content-type']);
        form.append('file', fs.readFileSync(absolutePath));

        return fetch(uploadReqResult.upload_url, {
            method: 'post',
            body: form,
        })
            .then(res => {
                if(res.ok)
                    return uploadReqResult;
                else {
                    res.text().then(t => log.error(t)).catch();
                    throw new Error(res);
                }
            })
            .catch(err => {
                log.error(`Failed to uploadFile. Error: ${JSON.stringify(err)}`);
                throw err;
            })
    }
}

module.exports = {PushBulletService};