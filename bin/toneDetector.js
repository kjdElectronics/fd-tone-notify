const mic = require('mic');
const {AllToneDetectionService} = require("../service/AllToneDetectionService");
const config = require("config");
const log = require('../util/logger');
const {listenForMicInputErrorEvents} = require("../util/util");
const {configureWebSocketEvents} = require("../server");
const {startWebApp} = require('../server');
const {AudioService} = require('../service/AudioService');

function toneDetector({webServer=false}={}){
    const audioInterface = new AudioService();

    const allTonesDetector = new AllToneDetectionService({
        audioInterface,
        sampleRate: config.audio.sampleRate,
        startFreq: 300,
        endFreq: 4000,
        tolerancePercent: config.detection.defaultTolerancePercent,
        matchThreshold: config.detection.defaultMatchThreshold,
        frequencyScaleFactor: config.audio.frequencyScaleFactor,
        silenceAmplitude: config.audio.silenceAmplitude
    });

    audioInterface.start();
    if(webServer){
        log.info(`Starting Web App`);
        const app = startWebApp();
        configureWebSocketEvents({detectionService: allTonesDetector.detectionService, wss: app.wss})
    }

    setInterval(() => log.silly("All Tone Detector Heartbeat"), 60*60*1000);

}

module.exports = {toneDetector};