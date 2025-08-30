const axios = require('axios');
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

        return axios.post(`${BASE}/pushes`, postBody, {
            headers: { 'Content-Type': 'application/json',  'Access-Token': TOKEN},
        })
            .then(res => {
                return true;
            })
            .catch(err => {
                log.error(`Failed to push. Error: ${err.message}`);
                log.error(err.response?.data);
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

        return axios.post(`${BASE}/pushes`, postBody, {
            headers: { 'Content-Type': 'application/json',  'Access-Token': TOKEN},
        })
            .then(res => {
                return true;
            })
            .catch(err => {
                console.log(err.stack);
                log.error(`Failed to pushFile. Error: ${err.message}`);
                log.error(err.response?.data);
                throw err;
            })
    }

    static uploadRequest({filename, fileType, path}){
        const postBody = {
            file_name: filename,
            file_type: fileType
        };

        return axios.post(`${BASE}/upload-request`, postBody, {
            headers: { 'Content-Type': 'application/json',  'Access-Token': TOKEN},
        })
            .then(res => {
                return res.data;
            })
            .catch(err => {
                console.log(err.stack);
                log.error(`Failed to uploadRequest. Error: ${err.message}`);
                log.error(err.response?.data);
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

        return axios.post(uploadReqResult.upload_url, form, {
            headers: form.getHeaders()
        })
            .then(res => {
                return uploadReqResult;
            })
            .catch(err => {
                log.error(`Failed to uploadFile. Error: ${err.message}`);
                log.error(err.response?.data);
                throw err;
            })
    }
}

module.exports = {PushBulletService};