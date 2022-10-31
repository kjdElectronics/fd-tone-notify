const fetch = require('node-fetch');
let fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const CUSTOM_ENV_VAR_PREFIX = "CUSTOM_ENV_VAR_";
const log = require('../util/logger');

async function postJson({address, headers={}, timestamp, tones, matchAverages, filename, detectorName, custom}) {
    _fillEnvVarsHeaders(headers);

    const postBody = {
        timestamp,
        tones,
        matchAverages,
        filename,
        detectorName,
        custom
    };

    return fetch(address, {
        method: 'post',
        body:    JSON.stringify(postBody),
        headers: { 'Content-Type': 'application/json', ...headers},
    })
        .then(res => _processResponse(res) )
        .catch(err => {
            log.error(`WebHook ${address} Failed. Error: ${err}`);
            log.debug(err.stack);
            throw err;
        })
}

async function postMultiPartFormDataWithFile({address, headers={}, timestamp, tones=[], matchAverages=[], filename,
                                                 recordingRelPath, detectorName, custom={}, isTest}){

    _fillEnvVarsHeaders(headers);
    const form = new FormData();
    form.append('timestamp', timestamp);
    form.append('tones', tones.toString());
    form.append('matchAverages', matchAverages.toString());
    form.append('detectorName', detectorName);
    form.append('custom', JSON.stringify(custom));
    form.append('isTest', isTest.toString());

    const buffer = fs.readFileSync(recordingRelPath);
        form.append('file', buffer, {
        contentType: 'audio/wav',
        name: 'audio',
        filename: filename,
    });

    return fetch(address, {
        method: 'post',
        body: form,
        headers
    })
        .catch(err => {
            log.error(`WebHook ${address} Failed to upload file (Multipart Form Data). Error: ${err}`);
            log.debug(err.stack);
            throw err;
        })
}

function _fillEnvVarsHeaders(headers){
    for (const property in headers) {
        if(!headers.hasOwnProperty(property))
            continue;
        if(headers[property].startsWith(CUSTOM_ENV_VAR_PREFIX)){
            const envVarName = headers[property].replace(CUSTOM_ENV_VAR_PREFIX, "");
            headers[property] = process.env[envVarName] ? process.env[envVarName] : null;
        }
    }
}

async function _processResponse(res){
    const text = await res.text();
    try{
        return JSON.parse(text);
    }catch(err) {
        return text;
    }
}

module.exports = {postJson, postMultiPartFormDataWithFile};