const axios = require('axios');
let fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const CUSTOM_ENV_VAR_PREFIX = "CUSTOM_ENV_VAR_";
const log = require('../util/logger');

async function postJson({address, headers={}, timestamp, detectedAt, tones, matchAverages, filename, detectorName, custom}) {
    _fillEnvVarsHeaders(headers);

    const postBody = {
        timestamp,
        detectedAt,
        tones,
        matchAverages,
        filename,
        detectorName,
        custom
    };

    return axios.post(address, postBody, {
        headers: { 'Content-Type': 'application/json', ...headers},
    })
        .then(res => res.data)
        .catch(err => {
            log.error(`WebHook ${address} Failed. Error: ${err.message}`);
            log.debug(err.stack);
            throw err;
        })
}

async function postMultiPartFormDataWithFile({address, headers={}, timestamp, detectedAt, tones=[], matchAverages=[], filename,
                                                 recordingRelPath, detectorName, custom={}, isTest=false}){

    _fillEnvVarsHeaders(headers);
    const form = new FormData();
    form.append('timestamp', timestamp);
    if (detectedAt) form.append('detectedAt', detectedAt);
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

    return axios.post(address, form, {
        headers: {
            ...headers,
            ...form.getHeaders()
        }
    })
        .then(res => res.data)
        .catch(err => {
            log.error(`WebHook ${address} Failed to upload file (Multipart Form Data). Error: ${err.message}`);
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


module.exports = {postJson, postMultiPartFormDataWithFile};