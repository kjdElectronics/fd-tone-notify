const mic = require('mic');
const config = require("config");
const log = require('../util/logger');
const {listenForMicInputEvents} = require("./AudioService");
const {decodeRawAudioBuffer} = require("../util/util");
const FileWriter = require('wav').FileWriter;
const {SilenceDetector} = require('../obj/SilenceDetector');
const {sendPostRecordingNotifications} = require('../notifiers');

class RecordingService{
    constructor() {
        this._dataListenerCallbacks = [];

        this._setupMic();

        this.listenForMicInputEvents();
    }

    recordFile(notificationParams){
        const filename = notificationParams.filename ? notificationParams.filename : `${new Date().getTime()}.wav`;
        log.info(`Starting Recording ${filename}`);

        const micInputStream = this._micInstance.getAudioStream();
        const outputFileStream = new FileWriter(`./${filename}`, {
            sampleRate: config.audio.sampleRate * config.audio.recordingScaleFactor,
            channels: config.audio.channels
        });

        const matchThreshold = notificationParams.matchThreshold ? notificationParams.matchThreshold : config.detection.defaultMatchThreshold;
        const silenceDetector = new SilenceDetector({
            silenceAmplitude: config.audio.silenceAmplitude,
            matchThreshold: matchThreshold * 10
        });
        micInputStream.on('data', async (rawBuffer) => {
            const decoded = decodeRawAudioBuffer(rawBuffer);
            silenceDetector.processValues({raw: decoded});
        });

        micInputStream.pipe(outputFileStream);
        this._micInstance.start();

        const finishedRecordingCb = this._finishedRecordingCb;

        return new Promise((resolve, reject) => {
            //End Recording Callback
            const cb = () => finishedRecordingCb({resolve, reject, micInstance: this._micInstance, notificationParams, failSafeTimeout});

            //Failsafe Timeout
            const failSafeTimeout = setTimeout(() => {
                log.warning("Fail Safe End Recoding - Max Time Limit Reached");
                cb();
            }, config.detection.minRecordingLengthSec * 1.5 * 1000);

            //Min Recording Length Timeout
            setTimeout(function(){
                log.debug("Initial Recording Complete... Waiting for silence");
                silenceDetector.on('silenceDetected', cb);
            }, config.detection.minRecordingLengthSec * 1000);
        });
    }

    _finishedRecordingCb({resolve, reject, micInstance, notificationParams, failSafeTimeout}){
        clearTimeout(failSafeTimeout);
        log.info("Stopping Recording...");
        micInstance.stop();
        log.info("Finished Recording");
        resolve(notificationParams.filename);
        //return this.sendNotifications(notificationParams); //TODO Send notifications in exec
    }

    //TODO Do this another place
    async sendNotifications(notificationParams) {
        return await sendPostRecordingNotifications(notificationParams)
            .then(result => {
                log.info(`Finished sending post recording notifications for ${notificationParams.detector.name}`);
                return result;
            })
            .catch(err => {
                log.error(`Error sending post recording notifications`);
                log.debug(err.stack);
            });
    }

    _setupMic(){
        this._micInstance = mic({
            rate: `${config.audio.sampleRate}`,
            channels: `${config.audio.channels}`,
            exitOnSilence: 0,
            device: config.audio.inputDevice,
            fileType: "wav"
        });
        this._micInputStream = this._micInstance.getAudioStream();
    }

    listenForMicInputEvents(){
        listenForMicInputEvents(this._micInputStream);
    }
}


module.exports = {RecordingService};
