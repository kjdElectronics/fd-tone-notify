const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const log = require('../util/logger');

const BOT_TOKEN = process.env.FD_TELEGRAM_BOT_TOKEN;
if(!BOT_TOKEN || BOT_TOKEN === "")
    log.crit("Telegram does not have a Bot Token. Notifications will not be sent");

function _apiBase(){
    return `https://api.telegram.org/bot${BOT_TOKEN}`;
}

class TelegramService{
    /**
     * Send a text notification via the Telegram Bot API's sendMessage.
     * @returns {Promise<boolean>}
     */
    static async push({title, message, chatId}){
        const postBody = {
            chat_id: chatId,
            text: `${title}\n${message}`,
        };

        return axios.post(`${_apiBase()}/sendMessage`, postBody, {
            headers: { 'Content-Type': 'application/json' },
        })
            .then(res => {
                return true;
            })
            .catch(err => {
                log.error(`Failed to send Telegram message. Error: ${err.message}`);
                log.error(err.response?.data);
                throw err;
            })
    }

    /**
     * Send a notification with the dispatch recording attached, via the
     * Telegram Bot API's sendAudio.
     * @returns {Promise<boolean>}
     */
    static async pushFile({title, message, chatId, absolutePath, filename}){
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', `${title}\n${message}`);
        form.append('audio', fs.readFileSync(absolutePath), {
            filename: filename || 'dispatch-audio.wav',
            contentType: 'audio/wav',
        });

        return axios.post(`${_apiBase()}/sendAudio`, form, {
            headers: form.getHeaders(),
        })
            .then(res => {
                return true;
            })
            .catch(err => {
                log.error(`Failed to send Telegram audio. Error: ${err.message}`);
                log.error(err.response?.data);
                throw err;
            })
    }
}

module.exports = {TelegramService};
