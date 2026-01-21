const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const log = require('../util/logger');

const BASE = "https://api.pushover.net/1";
const TOKEN = process.env.FD_PUSHOVER_API_TOKEN;
const USER_KEY = process.env.FD_PUSHOVER_USER_KEY;

if(!TOKEN || TOKEN === "")
    log.crit("Pushover does not have an API Token. Notifications will not be sent");
if(!USER_KEY || USER_KEY === "")
    log.crit("Pushover does not have a User Key. Notifications will not be sent");

class PushoverService{
    /**
     * Send a message notification via Pushover
     * @param {string} message - The message content
     * @param {string} title - The notification title
     * @param {string} device - Optional device name
     * @param {number} priority - Priority level (-2 to 2, default 0)
     * @param {string} sound - Optional sound name
     * @returns {Promise<boolean>}
     */
    static async push({message, title, device, priority = 0, sound}){
        const postBody = {
            token: TOKEN,
            user: USER_KEY,
            message: message,
            title: title,
        };

        if(device) postBody.device = device;
        if(priority !== undefined && priority !== 0) postBody.priority = priority;
        if(sound) postBody.sound = sound;

        return fetch(`${BASE}/messages.json`, {
            method: 'post',
            body:    JSON.stringify(postBody),
            headers: { 'Content-Type': 'application/json'},
        })
            .then(async res => {
                const responseData = await res.json();
                if(!res.ok || responseData.status !== 1) {
                    log.error(`Pushover API Error: ${JSON.stringify(responseData)}`);
                    throw new Error(JSON.stringify(responseData));
                }
                return true;
            })
            .catch(err => {
                log.error(`Failed to push Pushover notification. Error: ${err}`);
                throw err;
            })
    }

    /**
     * Send a message with an attached audio file via Pushover
     * @param {string} title - The notification title
     * @param {string} message - The message content
     * @param {string} absolutePath - Absolute path to the audio file
     * @param {string} filename - Name of the file
     * @param {string} device - Optional device name
     * @param {number} priority - Priority level (-2 to 2, default 0)
     * @param {string} sound - Optional sound name
     * @returns {Promise<boolean>}
     */
    static async pushFile({title, message, absolutePath, filename, device, priority = 0, sound}){
        const form = new FormData();
        form.append('token', TOKEN);
        form.append('user', USER_KEY);
        form.append('message', message);
        form.append('title', title);
        
        if(device) form.append('device', device);
        if(priority !== undefined && priority !== 0) form.append('priority', priority);
        if(sound) form.append('sound', sound);
        
        // Attach the file
        form.append('attachment', fs.createReadStream(absolutePath), {
            filename: filename,
            contentType: 'audio/wav'
        });

        return fetch(`${BASE}/messages.json`, {
            method: 'post',
            body: form,
        })
            .then(async res => {
                const responseData = await res.json();
                if(!res.ok || responseData.status !== 1) {
                    log.error(`Pushover API Error: ${JSON.stringify(responseData)}`);
                    throw new Error(JSON.stringify(responseData));
                }
                return true;
            })
            .catch(err => {
                log.error(`Failed to push Pushover file notification. Error: ${err}`);
                throw err;
            })
    }
}

module.exports = {PushoverService};
