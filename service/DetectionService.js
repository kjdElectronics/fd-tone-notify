const {TonesDetector} = require("../obj/TonesDetector");
const log = require('../util/logger');
const chalk = require('chalk');
const {AudioProcessor} = require("../obj/AudioProcessor");
const {decodeRawAudioBuffer} = require("../util/util");
const EventEmitter = require('events');
const {RecordingThread} = require("./RecordingThread");
const {sendPreRecordingNotifications} = require('../notifiers');
const {NotificationParams} = require('../obj/NotificationParams');

const NO_DATA_INTERVAL_SEC = 30;

class DetectionService extends EventEmitter{
    constructor({audioInterface, sampleRate, recording: isRecordingEnabled = true, areNotificationsEnabled=true,
                    minRecordingLengthSec=30, frequencyScaleFactor=1,
                    silenceAmplitude=0.05,
                }) {
        super();

        this._audioInterface = audioInterface;
        if(audioInterface) {
            this._audioInterface.onData( async (rawBuffer) => {
                const decoded = decodeRawAudioBuffer(rawBuffer);
                this.__processData(decoded);
            });
        }
        else
            log.warning(`Detection Service: No audioInterface. Should be used for testing only`);

        this._audioProcessor = new AudioProcessor({sampleRate, silenceAmplitude, frequencyScaleFactor});
        this._audioProcessor.on('pitchData', data => this.emit('pitchData', data)); //Forward event
        this._audioProcessor.on('audio', data => this.emit('audio', data)); //Forward event

        this.frequencyScaleFactor = frequencyScaleFactor;
        this.minRecordingLengthSec = minRecordingLengthSec;

        this.isRecordingEnabled = isRecordingEnabled;
        this.areNotificationsEnabled = areNotificationsEnabled;

        this.toneDetectors = [];
        this._recordingThread = new RecordingThread();
    }

    __processData(decodedData){
        const dataChunks = this._audioProcessor.chunkAudioData(decodedData);
        dataChunks.forEach(chunk => {
            const {pitch, clarity} = this._audioProcessor.getPitchWithClarity(chunk);
            this.toneDetectors.forEach(tonesDetector => {
                tonesDetector.processValues({pitchValues:[pitch], raw: chunk})
            })
        });
    }

    addToneDetector({name, tones= [], tolerancePercent= 0.02,
                        matchThreshold= 6, logLevel="debug", notifications, resetTimeoutMs=7000}){
        const tonesDetector = new TonesDetector({
            name,
            tones: tones,
            matchThreshold: matchThreshold,
            tolerancePercent: tolerancePercent,
            notifications,
            resetTimeoutMs
        });

        const message = `Creating detector for tone(s) ${tones.map(v => `${v}Hz`).join(", ")} ` +
            `with tolerance ±${tolerancePercent}`;
        if(!log[logLevel])
            log.debug(message);
        else
            log[logLevel](message);

        tonesDetector.on('toneDetected', async (result) =>{
            log.debug(`Processing toneDetected event for ${name}`);
            const {matchAverages, message} = result;
            const timestamp = new Date().getTime();
            const filename = `${timestamp}.wav`;

            const notificationParams = new NotificationParams({
                detector: tonesDetector,
                timestamp,
                matchAverages,
                notifications,
                filename,
                message
            });

            let notificationPromise = null;
            if(this.areNotificationsEnabled && notifications) { //Notifications enabled on the service and detector
                notificationPromise = sendPreRecordingNotifications(notificationParams)
                    .then(results => {
                        log.info(`All notifications for ${name} have finished processing`);
                        return results;
                    });

                if(this.isRecordingEnabled) {
                    //Start recording in new thread. Post recording notifications sent from new thread
                    log.debug(`Starting recorder & post recording notification processing`);
                    this._recordingThread.sendMessage(notificationParams.toObj());
                }
            }

            if(notificationPromise)
                await notificationPromise;
            this.emit('toneDetected', notificationParams.toObj());
        });

        this.toneDetectors.push(tonesDetector);
        return tonesDetector;
    }
}

module.exports = {DetectionService};