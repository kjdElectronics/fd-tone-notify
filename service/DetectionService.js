const {TonesDetector} = require("../obj/TonesDetector");
const log = require('../util/logger');
const chalk = require('chalk');
const {AudioProcessor} = require("../obj/AudioProcessor");
const {decodeRawAudioBuffer} = require("../util/util");
const EventEmitter = require('events');
const {RecordingThread} = require("./RecordingThread");
const {sendPreRecordingNotifications} = require('../notifiers');
const {NotificationParams} = require('../obj/NotificationParams');
const path = require('path');
const config = require('config');

const NO_DATA_INTERVAL_SEC = 30;

class DetectionService extends EventEmitter{
    constructor({audioInterface, sampleRate, recording: isRecordingEnabled, areNotificationsEnabled=true,
                    minRecordingLengthSec=30, maxRecordingLengthSec, frequencyScaleFactor=1,
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
        this.maxRecordingLengthSec = maxRecordingLengthSec ? maxRecordingLengthSec : minRecordingLengthSec * 1.5;
        if(this.maxRecordingLengthSec < this.minRecordingLengthSec){
            log.alert(`The global minRecordingLengthSec is ${this.minRecordingLengthSec} and the maxRecordingLengthSec ` +
                `is ${maxRecordingLengthSec}. This is invalid and maxRecordingLengthSec will default to 1.5x minRecordingLengthSec.`);
            this.maxRecordingLengthSec = this.minRecordingLengthSec * 1.5;
        }

        this.isRecordingEnabled = isRecordingEnabled === undefined ? null : isRecordingEnabled ;
        this.areNotificationsEnabled = areNotificationsEnabled;

        this.toneDetectors = [];
        this._recordingThread = new RecordingThread({threadId: 0});
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

    addToneDetector({name, tones= [], tolerancePercent, isRecordingEnabled,
                        matchThreshold, logLevel="debug", notifications, resetTimeoutMs, lockoutTimeoutMs, minRecordingLengthSec, maxRecordingLengthSec}){
        const tonesDetector = new TonesDetector({
            name,
            tones: tones,
            matchThreshold,
            tolerancePercent,
            notifications,
            resetTimeoutMs,
            lockoutTimeoutMs,
            minRecordingLengthSec: minRecordingLengthSec ? minRecordingLengthSec : this.minRecordingLengthSec,
            maxRecordingLengthSec: maxRecordingLengthSec ? maxRecordingLengthSec : this.maxRecordingLengthSec
        });

        if(isRecordingEnabled === undefined)
            isRecordingEnabled = null;
        const calculatedIsRecordingEnabled = this._isRecordingEnabled(isRecordingEnabled);

        const message = `Creating detector for${tonesDetector.name ? ` ${tonesDetector.name}` : ""} tone(s) ${tones.map(v => `${v}Hz`).join(", ")} ` +
            `with tolerance ±${tonesDetector.tolerancePercent}, match threshold ${tonesDetector.matchThreshold}, ` +
            `reset timeout ${tonesDetector.resetTimeoutMs}ms, lockout timeout ${tonesDetector.lockoutTimeoutMs}ms, ` +
            `minimum recording length ${tonesDetector.minRecordingLengthSec} seconds, max recording length ${tonesDetector.maxRecordingLengthSec} seconds, ` +
            `and recoding is ${calculatedIsRecordingEnabled ? "enabled" : "disabled"}.`;
        if(!log[logLevel])
            log.debug(message);
        else
            log[logLevel](message);

        tonesDetector.on('toneDetected', async (result) =>{
            const recordingThread = this._recordingThread;
            this._recordingThread = new RecordingThread({threadId: recordingThread.threadId + 1});

            log.debug(`Processing toneDetected event for ${name}`);
            const {matchAverages, message} = result;
            const timestamp = new Date().getTime();
            const filenameOnly = `${timestamp}-${name}.wav`; //Include the name of the detector in the filename
            const recordingDirectory = config.recording.directory;
            const fullPath = path.join(recordingDirectory, filenameOnly);

            const notificationParams = new NotificationParams({
                detector: tonesDetector,
                timestamp,
                matchAverages,
                notifications,
                filename: fullPath,
                message
            });

            let notificationPromise = null;
            if(this.areNotificationsEnabled && notifications) { //Notifications enabled on the service and detector
                notificationPromise = sendPreRecordingNotifications(notificationParams)
                    .then(results => {
                        log.info(`All notifications for ${name} have finished processing`);
                        return results;
                    });

                if(calculatedIsRecordingEnabled) {
                    //Start recording in new thread. Post recording notifications sent from new thread
                    log.debug(`Starting recorder & post recording notification processing. Thread Id: ${recordingThread.threadId}`);
                    recordingThread.sendMessage(notificationParams.toObj());
                }
            }

            if(notificationPromise)
                await notificationPromise;
            this.emit('toneDetected', notificationParams.toObj());
        });

        this.toneDetectors.push(tonesDetector);
        return tonesDetector;
    }

    _isRecordingEnabled(detectorLevelIsRecordingEnabled) {
        if (detectorLevelIsRecordingEnabled === null) {
            if (this.isRecordingEnabled === null) //If not specified globally return true
                return true;
            return this.isRecordingEnabled; //Use specified global value
        } else
            return detectorLevelIsRecordingEnabled; //use specified detector value
    }

}

module.exports = {DetectionService};