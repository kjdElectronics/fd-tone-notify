const {DetectionService} = require("../service/DetectionService");
const config = require("config");
const log = require('../util/logger');
const {configureWebSocketEvents} = require("../server");
const {startWebApp} = require('../server');
const {AudioService} = require('../service/AudioService');

async function fdToneNotify({webServer=false}={}){
    const audioInterface = new AudioService();
    const detectionService = new DetectionService({
        audioInterface,
        silenceAmplitude: config.audio.silenceAmplitude,
        sampleRate: config.audio.sampleRate,
        minRecordingLengthSec: config.audio.minRecordingLengthSec,
        maxRecordingLengthSec: config.audio.maxRecordingLengthSec,
        frequencyScaleFactor: config.audio.frequencyScaleFactor,
        recording: config.detection.hasOwnProperty("isRecordingEnabled") ? !!config.detection.isRecordingEnabled : null //Defaults to null to indicate not set
    });
    config.detection.detectors.forEach(detectorConfig => {
        const options = {
            name: detectorConfig.name,
            tones: detectorConfig.tones,
            resetTimeoutMs: detectorConfig.resetTimeoutMs ? detectorConfig.resetTimeoutMs : config.detection.defaultResetTimeoutMs,
            lockoutTimeoutMs: detectorConfig.lockoutTimeoutMs ? detectorConfig.lockoutTimeoutMs : config.detection.defaultLockoutTimeoutMs,
            minRecordingLengthSec: detectorConfig.minRecordingLengthSec ? detectorConfig.minRecordingLengthSec : config.detection.minRecordingLengthSec,
            maxRecordingLengthSec: detectorConfig.maxRecordingLengthSec ? detectorConfig.maxRecordingLengthSec : config.detection.maxRecordingLengthSec,
            matchThreshold: detectorConfig.matchThreshold ? detectorConfig.matchThreshold : config.detection.defaultMatchThreshold,
            tolerancePercent: detectorConfig.tolerancePercent ? detectorConfig.tolerancePercent : config.detection.defaultTolerancePercent,
            isRecordingEnabled: detectorConfig.hasOwnProperty("isRecordingEnabled") ? !!detectorConfig.isRecordingEnabled : null, //Defaults to null to indicate not set
            notifications: detectorConfig.notifications
        };
        log.info(`Adding Detector for ${options.name} with tones ${options.tones.map(v => `${v}Hz`).join(', ')}. `
                    + `Match Threshold: ${options.matchThreshold}, Tolerance: ${options.tolerancePercent * 100}%`);
        detectionService.addToneDetector(options);
    });

    audioInterface.start();
    if(webServer){
        log.info(`Starting Web App`);
        const app = startWebApp();
        configureWebSocketEvents({detectionService, wss: app.wss})
    }

    setInterval(() => log.silly("FD Tone Notify Heartbeat"), 60*60*1000);
}

module.exports = {fdToneNotify};