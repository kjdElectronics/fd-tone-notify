const {DetectionService} = require("../service/DetectionService");
const {AllToneDetectionService} = require("../service/AllToneDetectionService");
const config = require("config");
const log = require('../util/logger');
const {configureWebSocketEvents} = require("../server");
const {startWebApp} = require('../server');
const {AudioService} = require('../service/AudioService');
const { initRecordingAutoCleaningService} = require('../util/recording.cleaner');
const {TonesDetectorConfig} = require("../obj/config/TonesDetectorConfig");

async function fdToneNotify({webServer=false}={}){
    const audioInterface = new AudioService({disabled: config?.audio?.disabled});
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
        let isRecordingEnabled = detectorConfig.hasOwnProperty("isRecordingEnabled") ? !!detectorConfig.isRecordingEnabled : null;
        if(isRecordingEnabled === null)
            isRecordingEnabled = config.detection.isRecordingEnabled;

        const options = {
            name: detectorConfig.name,
            tones: detectorConfig.tones,
            resetTimeoutMs: detectorConfig.resetTimeoutMs ? detectorConfig.resetTimeoutMs : config.detection.defaultResetTimeoutMs,
            lockoutTimeoutMs: detectorConfig.lockoutTimeoutMs ? detectorConfig.lockoutTimeoutMs : config.detection.defaultLockoutTimeoutMs,
            minRecordingLengthSec: detectorConfig.minRecordingLengthSec ? detectorConfig.minRecordingLengthSec : config.detection.minRecordingLengthSec,
            maxRecordingLengthSec: detectorConfig.maxRecordingLengthSec ? detectorConfig.maxRecordingLengthSec : config.detection.maxRecordingLengthSec,
            matchThreshold: detectorConfig.matchThreshold ? detectorConfig.matchThreshold : config.detection.defaultMatchThreshold,
            tolerancePercent: detectorConfig.tolerancePercent ? detectorConfig.tolerancePercent : config.detection.defaultTolerancePercent,
            isRecordingEnabled: isRecordingEnabled,
            notifications: detectorConfig.notifications
        };
        log.info(`Adding Detector for ${options.name} with tones ${options.tones.map(v => `${v}Hz`).join(', ')}. `
                    + `Match Threshold: ${options.matchThreshold}, Tolerance: ${options.tolerancePercent * 100}%`);
        detectionService.addToneDetector(new TonesDetectorConfig(options));
    });

    // Initialize AllToneDetectionService if enabled
    let allToneDetectionService = null;
    if (config.allToneDetector && config.allToneDetector.enabled) {
        log.info(`Initializing All Tone Detector - Range: ${config.allToneDetector.startFreq}Hz to ${config.allToneDetector.endFreq}Hz`);
        allToneDetectionService = new AllToneDetectionService({
            startFreq: config.allToneDetector.startFreq,
            endFreq: config.allToneDetector.endFreq,
            sampleRate: config.audio.sampleRate,
            tolerancePercent: config.allToneDetector.tolerancePercent,
            rangeOverlapModifier: config.allToneDetector.rangeOverlapModifier,
            matchThreshold: config.allToneDetector.matchThreshold,
            audioInterface: audioInterface,
            frequencyScaleFactor: config.audio.frequencyScaleFactor,
            silenceAmplitude: config.audio.silenceAmplitude,
            logLevel: process.env.FD_LOG_LEVEL || "info"
        });
    }

    //Init the Auto Cleaning Service to get rid of old recordings (Cofnig driven from env vars)
    initRecordingAutoCleaningService();

    if(!audioInterface.disabled)
        audioInterface.start();

    if(webServer){
        log.info(`Starting Web App`);
        const app = await startWebApp();
        configureWebSocketEvents({detectionService, allToneDetectionService, wss: app.wss})
    }

    setInterval(() => log.silly("FD Tone Notify Heartbeat"), 60*60*1000);
}

module.exports = {fdToneNotify};