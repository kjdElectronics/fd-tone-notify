const mic = require('mic');
const config = require("config");
const log = require('../util/logger');
const {listenForMicInputEvents} = require("./AudioService");
const {decodeRawAudioBuffer} = require("../util/util");
const FileWriter = require('wav').FileWriter;
const {SilenceDetector} = require('../obj/SilenceDetector');
const {WavToMp3Service} = require('../service/WavToMp3Service');
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

        const mp3Path = notificationParams.filename.replace('.wav', '.mp3');
        WavToMp3Service.convertWavToMp3({inputPath: notificationParams.filename, outputPath: notificationParams})
            .then(savedPath =>{
                resolve(savedPath);
                notificationParams.filename = mp3Path;
            })
            .catch(err => {
                log.warning(`MP3 Conversion Failed. Using wav file (this may lead to larger than expected recordings since wav files have no compression)`);
                log.debug(err.stack);
                resolve(notificationParams.filename);
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
