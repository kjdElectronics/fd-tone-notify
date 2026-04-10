const {DetectionService} = require("../service/DetectionService");
const {AllToneDetectionService} = require("../service/AllToneDetectionService");
const config = require("config");
const log = require('../util/logger');
const {configureWebSocketEvents} = require("../server");
const {startWebApp} = require('../server');
const {AudioService} = require('../service/AudioService');
const { initRecordingAutoCleaningService} = require('../util/recording.cleaner');
const {TonesDetectorConfig} = require("../obj/config/TonesDetectorConfig");

// Global service references for graceful cleanup
let globalServices = {
    audioInterface: null,
    detectionService: null,
    allToneDetectionService: null,
    autoCleaningService: null
};

async function fdToneNotify({webServer=false}={}){
    const audioInterface = new AudioService({disabled: config?.audio?.disabled});
    const detectionService = new DetectionService({
        audioInterface,
        silenceAmplitude: config.audio.silenceAmplitude,
        sampleRate: config.audio.sampleRate,
        minRecordingLengthSec: config.audio.minRecordingLengthSec,
        maxRecordingLengthSec: config.audio.maxRecordingLengthSec,
        frequencyScaleFactor: config.audio.frequencyScaleFactor,
        recording: config.detection.hasOwnProperty("isRecordingEnabled") ? !!config.detection.isRecordingEnabled : null, //Defaults to null to indicate not set
        sourceContext: { source: 'live' }
    });

    // Store global references for cleanup
    globalServices.audioInterface = audioInterface;
    globalServices.detectionService = detectionService;
    config.detection.detectors.forEach(detectorConfig => {
        // Skip talkgroup-exclusive detectors from live audio monitoring
        if (detectorConfig.talkgroupExclusive) {
            log.info(`Skipping detector '${detectorConfig.name}' for live audio (talkgroup exclusive)`);
            return;
        }

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
            logLevel: process.env.FD_LOG_LEVEL || "info",
            sourceContext: { source: 'live' }
        });
        
        // Store global reference for cleanup
        globalServices.allToneDetectionService = allToneDetectionService;
    }

    //Init the Auto Cleaning Service to get rid of old recordings (Config driven from env vars)
    const autoCleaningService = initRecordingAutoCleaningService();
    globalServices.autoCleaningService = autoCleaningService;

    if(!audioInterface.disabled)
        audioInterface.start();

    if(webServer){
        log.info(`Starting Web App`);
        const app = await startWebApp();
        configureWebSocketEvents({detectionService, allToneDetectionService, wss: app.wss})
    }

    // Setup graceful shutdown handlers
    setupGracefulShutdown();

    setInterval(() => log.silly("FD Tone Notify Heartbeat"), 60*60*1000);
}

/**
 * Setup graceful shutdown handlers for the main backend services
 */
function setupGracefulShutdown() {
    let shuttingDown = false;

    const gracefulShutdown = async (signal) => {
        if (shuttingDown) {
            log.warning(`Already shutting down, ignoring ${signal}`);
            return;
        }

        shuttingDown = true;
        log.info(`Received ${signal}. Starting graceful shutdown of backend services...`);

        try {
            // Notify WebSocket clients about shutdown
            const { getWebSocketServer } = require('../server');
            const wss = getWebSocketServer();
            if (wss) {
                wss.clients.forEach(client => {
                    if (client.readyState === 1) { // WebSocket.OPEN
                        try {
                            client.send(JSON.stringify({
                                type: 'shutdown',
                                data: { message: 'Server is shutting down' }
                            }));
                        } catch (error) {
                            log.warning(`Failed to send shutdown notification to WebSocket client: ${error.message}`);
                        }
                    }
                });
            }

            // Give clients a moment to receive the shutdown message
            await new Promise(resolve => setTimeout(resolve, 500));

            // Dispose of services in reverse order of initialization
            if (globalServices.allToneDetectionService && typeof globalServices.allToneDetectionService.dispose === 'function') {
                log.debug('Disposing AllToneDetectionService');
                globalServices.allToneDetectionService.dispose();
            }

            if (globalServices.detectionService && typeof globalServices.detectionService.dispose === 'function') {
                log.debug('Disposing DetectionService');
                globalServices.detectionService.dispose();
            }

            if (globalServices.audioInterface && typeof globalServices.audioInterface.dispose === 'function') {
                log.debug('Disposing AudioService');
                globalServices.audioInterface.dispose();
            }

            if (globalServices.autoCleaningService && typeof globalServices.autoCleaningService.dispose === 'function') {
                log.debug('Disposing AutoCleanRecordingsService');
                globalServices.autoCleaningService.dispose();
            }

            log.info('Graceful shutdown completed');
            process.exit(0);

        } catch (error) {
            log.error(`Error during graceful shutdown: ${error.message}`);
            process.exit(1);
        }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        log.error('Uncaught Exception:', error);
        gracefulShutdown('Uncaught Exception');
    });

    process.on('unhandledRejection', (reason, promise) => {
        log.error('Unhandled Rejection at:', promise, 'reason:', reason);
        gracefulShutdown('Unhandled Rejection');
    });
}

module.exports = {fdToneNotify};