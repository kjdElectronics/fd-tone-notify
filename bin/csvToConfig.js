const config = require("config");
const log = require('../util/logger');
const csv = require('fast-csv');
const fs = require('fs');
const path = require('path');
const defaultConfig = require('../config/default.json');

const DEFAULT_DETECTOR = {
    "name": "",
    "tones": [],
    "matchThreshold": 6,
    "tolerancePercent": 0.02,
    "notifications": {
        "preRecording": {
            "pushbullet": [],
            "webhooks": [],
            "externalCommands": [],
            "emails": []
        },
        "postRecording": {
            "pushbullet": [],
            "webhooks": [],
            "externalCommands": [],
            "emails": []
        }
    }
}

async function csvToConfig({inputPath="./config/config.csv", outputPath="config-from-csv.json"}={}){
    const rows = await getRecords({inputPath});
    const config = Object.assign({}, defaultConfig);
    config.detection.detectors = [];
    rows.forEach(r => {
        const detector = JSON.parse(JSON.stringify(DEFAULT_DETECTOR));
        detector.name = r.name;
        detector.tones.push(Number(r.tone1));
        if(r.tone2)
            detector.tones.push(Number(r.tone2));
        if(r.preRecordingEmailList)
            detector.notifications.preRecording.emails.push({
                "to": r.preRecordingEmailList,
                "subject": r.preRecordingEmailSubject.replace("{name}", r.name),
                "text": "Tone Received %d"
            })
        if(r.postRecordingEmailList)
            detector.notifications.postRecording.emails.push({
                "to": r.postRecordingEmailList,
                "subject": r.postRecordingEmailSubject.replace("{name}", r.name),
                "text": "Tone Received %d"
            });
        config.detection.detectors.push(detector);
    });
    fs.writeFileSync(outputPath, JSON.stringify(config, null, 4));
}

async function getRecords({inputPath}){
    return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(path.resolve(__dirname, "../", inputPath))
            .pipe(csv.parse({ headers: true }))
            .on('error', error => reject(error))
            .on('data', row => rows.push(row))
            .on('end', rowCount => resolve(rows));
    } )
}

module.exports = {csvToConfig};