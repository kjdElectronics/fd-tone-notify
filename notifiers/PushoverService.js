const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const log = require('../util/logger');

const BASE = "https://api.pushover.net/1/messages.json";
const TOKEN = process.env.FD_PUSHOVER_APP_TOKEN;
if(!TOKEN || TOKEN === "")
    log.crit("Pushover does not have an App Token. Notifications will not be sent");

class PushoverService{
    /**
     * Send a text notification via the Pushover messages API.
     * @returns {Promise<boolean>}
     */
    static async push({title, message, user, priority, sound}){
        const postBody = {
            token: TOKEN,
            user,
            title,
            message
        };
        if(priority !== undefined)
            postBody.priority = priority;
        if(sound)
            postBody.sound = sound;

        return axios.post(BASE, postBody, {
            headers: { 'Content-Type': 'application/json' },
        })
            .then(res => {
                return true;
            })
            .catch(err => {
                log.error(`Failed to push to Pushover. Error: ${err.message}`);
                log.error(err.response?.data);
                throw err;
            })
    }

    /**
     * Send a notification with the dispatch recording attached, via
     * Pushover's `attachment` multipart field.
     * @returns {Promise<boolean>}
     */
    static async pushFile({title, message, user, absolutePath, priority, sound}){
        const form = new FormData();
        form.append('token', TOKEN);
        form.append('user', user);
        form.append('title', title);
        form.append('message', message);
        if(priority !== undefined)
            form.append('priority', String(priority));
        if(sound)
            form.append('sound', sound);
        form.append('attachment', fs.readFileSync(absolutePath), {
            filename: 'dispatch-audio.wav',
            contentType: 'audio/wav',
        });

        return axios.post(BASE, form, {
            headers: form.getHeaders(),
        })
            .then(res => {
                return true;
            })
            .catch(err => {
                log.error(`Failed to push file to Pushover. Error: ${err.message}`);
                log.error(err.response?.data);
                throw err;
            })
    }
}

module.exports = {PushoverService};
