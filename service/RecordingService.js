const mic = require('mic');
const config = require("config");
const log = require('../util/logger');
const {listenForMicInputEvents} = require("./AudioService");
const {decodeRawAudioBuffer} = require("../util/util");
const FileWriter = require('wav').FileWriter;
const {SilenceDetector} = require('../obj/SilenceDetector');
const {WavToMp3Service} = require('../service/WavToMp3Service');
const {sendPostRecordingNotifications} = require('../notifiers');
const path = require('path');

class RecordingService{
    constructor() {
        this._dataListenerCallbacks = [];

        this._setupMic();

        this.listenForMicInputEvents();

        this.isRecording = false;
        this._notificationParams = null;
    }

    recordFile(notificationParams){
        this.isRecording = true;
        this._notificationParams = notificationParams;

        const fullPath = notificationParams.filename ? notificationParams.filename : path.join(config.recording.directory, `${new Date().getTime()}.wav`);
        
        log.info(`Starting Recording ${fullPath}`);

        const micInputStream = this._micInstance.getAudioStream();
        const outputFileStream = new FileWriter(fullPath, {
            sampleRate: config.audio.sampleRate * config.audio.recordingScaleFactor,
            channels: config.audio.channels
        });

        const matchThreshold = notificationParams.matchThreshold ? notificationParams.matchThreshold : config.detection.defaultMatchThreshold;
        const silenceDetector = new SilenceDetector({
            silenceAmplitude: config.audio.silenceAmplitude,
            matchThreshold: matchThreshold * 10
        });
        // Store reference to data listener for cleanup
        const dataListener = async (rawBuffer) => {
            const decoded = decodeRawAudioBuffer(rawBuffer);
            silenceDetector.processValues({raw: decoded});
        };
        
        micInputStream.on('data', dataListener);
        micInputStream.pipe(outputFileStream);
        this._micInstance.start();

        const finishedRecordingCb = this._finishedRecordingCb;

        return new Promise((resolve, reject) => {
            //End Recording Callback with cleanup
            const cb = () => {
                // Clean up event listeners before finishing
                micInputStream.removeListener('data', dataListener);
                silenceDetector.removeAllListeners();
                
                finishedRecordingCb({resolve, reject, micInstance: this._micInstance, notificationParams, failSafeTimeout});
            };

            //Failsafe Timeout
            const failSafeTimeout = setTimeout(() => {
                log.warning(`Fail Safe End Recoding - Max Time Limit Reached after ${notificationParams.detector.maxRecordingLengthSec} seconds`);
                cb();
            }, notificationParams.detector.maxRecordingLengthSec * 1000);

            //Min Recording Length Timeout
            setTimeout(function(){
                log.debug(`Initial Recording Complete after ${notificationParams.detector.minRecordingLengthSec} seconds... Waiting for silence`);
                silenceDetector.on('silenceDetected', cb);
            }, notificationParams.detector.minRecordingLengthSec * 1000);
        });
    }

    _finishedRecordingCb({resolve, reject, micInstance, notificationParams, failSafeTimeout}){
        clearTimeout(failSafeTimeout);
        log.info("Stopping Recording...");
        const audioStream = micInstance.getAudioStream();

        audioStream.on("stopComplete", () => {
            log.info("Finished Recording");
            _mp3Conversion({notificationParams, resolve, reject});
        });

        micInstance.stop();
    }

    _setupMic(){
        this._micInstance = mic({
            rate: `${config.audio.sampleRate}`,
            channels: `${config.audio.channels}`,
            exitOnSilence: 0,
            device: config.audio.inputDevice,
            fileType: "wav"
        });
    }

    listenForMicInputEvents(){
        listenForMicInputEvents(this._micInstance.getAudioStream());
    }
    
    /**
     * Cleanup method to properly dispose of all resources and prevent memory leaks
     */
    dispose() {
        if(this.isRecording){
            log.info(`Recording Service: Still processing recording and notifications. Waiting for disposal until recording is complete.`);
            setTimeout(() => {
                this.isRecording = false;
                this.dispose();
            }, this._notificationParams.detector.maxRecordingLengthSec * 1000); //Failsafe timeout
        }

        log.debug('RecordingService: Starting disposal');
        
        try {
            // Remove listeners from mic input stream
            this._micInstance.getAudioStream()?.removeAllListeners();

            // Stop the mic instance if running
            if (this._micInstance) {
                try {
                    this._micInstance.stop();
                } catch (error) {
                    log.warning(`RecordingService: Error stopping mic instance: ${error.message}`);
                }
                this._micInstance = null;
            }
            
            // Clear data listener callbacks
            this._dataListenerCallbacks.length = 0;
            
            log.debug('RecordingService: Disposal complete');
        } catch (error) {
            log.error(`RecordingService: Error during disposal: ${error.message}`);
        }
    }
}

function  _mp3Conversion({notificationParams, resolve, reject}){
    const mp3Path = notificationParams.filename.replace('.wav', '.mp3');
    WavToMp3Service.convertWavToMp3({inputPath: notificationParams.filename, outputPath: mp3Path})
        .then(savedPath =>{
            resolve(savedPath);
            notificationParams.filename = mp3Path;
        })
        .catch(err => {
            log.warning(`MP3 Conversion Failed. Using wav file (this may lead to larger than expected recordings since wav files have no compression)`);
            log.debug(err.stack);
            resolve(notificationParams.filename);
        })
        .finally(r => {
            this.isRecording = false;
        })
}


module.exports = {RecordingService};
