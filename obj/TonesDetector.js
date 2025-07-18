const {ToneDetector, MATCH_STATES} = require("./ToneDetector");
const EventEmitter = require('events');
const chalk = require('chalk');
const log = require('../util/logger');
const {SilenceDetector} = require("./SilenceDetector");
const { TonesDetectorConfig } = require('./config/TonesDetectorConfig');

class TonesDetector extends EventEmitter{
    constructor(config) {
        super();
        
        if (!(config instanceof TonesDetectorConfig)) {
            throw new Error('TonesDetector constructor requires a TonesDetectorConfig instance');
        }

        this.name = config.name || '';
        this.tones = config.tones;
        this.tolerancePercent = config.tolerancePercent;
        this.matchThreshold = config.matchThreshold;
        this.notifications = config.notifications;

        this.__buildToneDetectors();

        // Use default silenceAmplitude since it's not part of TonesDetectorConfig
        this._silenceDetector = new SilenceDetector({silenceAmplitude: 0.05, matchThreshold: this.matchThreshold});
        this._silenceDetector.on('toneDetected', () =>{
            this.emit('silenceDetected');
        });

        this.lockoutTimeoutMs = config.lockoutTimeoutMs;
        this._isLockedOut = false;
        this._unLockoutTimeout = null;

        this.resetTimeoutMs = config.resetTimeoutMs;
        this._fullResetTimeout = null;

        //Not used here but accessed by the RecordingService
        this.minRecordingLengthSec = config.minRecordingLengthSec;
        this.maxRecordingLengthSec = config.maxRecordingLengthSec;
        if(this.maxRecordingLengthSec < this.minRecordingLengthSec){
            log.alert(`For tone ${this.name} the minRecordingLengthSec is ${this.minRecordingLengthSec} and the maxRecordingLengthSec ` +
                `is ${config.maxRecordingLengthSec}. This is invalid and maxRecordingLengthSec will default to 1.5x minRecordingLengthSec.`);
            this.maxRecordingLengthSec = this.minRecordingLengthSec * 1.5;
        }
    }

    __buildToneDetectors(){
        this._detectors = this.tones.map(tone =>
            new ToneDetector({
                tone,
                tolerancePercent: this.tolerancePercent,
                matchThreshold: this.matchThreshold}
            ));
    }

    processValues({pitchValues, raw}){
        const scaledValues = pitchValues.filter(v => v !== null);
        scaledValues.forEach(v => this.processValue(v));
        this._silenceDetector.processValues({raw});
    }

    processValue(value){
        for (let i = 0; i < this._detectors.length; i++) {
            const detector = this._detectors[i];
            if(detector.state === MATCH_STATES.MATCH)
                continue; //Tone already detected on this detector
            detector.processValue(value);
            if(detector.state !== MATCH_STATES.MATCH)
                break;
            //The processed value just triggered a match
            this._resetAndStartFullResetTimeout(); //Timeout after specified period without matching next tone in sequence
            if(i === this._detectors.length - 1)
                this.toneDetected(); //All detectors have matched
        }
    }

    toneDetected(){
        this._clearFullResetTimeout();
        if(this._isLockedOut){
            log.debug(`Detector ${this.fullName} is LOCKED OUT. Duplicate tone ignored`);
            this.__buildToneDetectors(); //Rebuild tone detectors
            return;
        }
        //Tone Detected
        this._isLockedOut = true;
        this._unLockoutTimeout = setTimeout(() => this._isLockedOut = false, this.lockoutTimeoutMs);

        const matchAvgs = this._detectors.map(d => d.matchAvg);
        const message = `${this.__matchString()}: Detector ${this.fullName} Detected. ` +
            `Match Averages: ${matchAvgs.map(avg => `${avg}Hz`).join(', ')} `;
        log[this.__matchLogLevel()](chalk.green(message));

        this.__buildToneDetectors(); //Reset tone detectors only. Do not reset lockout
        this.emit('toneDetected', {matchAverages: matchAvgs, message});
    }

    toObj(){
        return {
            name: this.name,
            tones: this.tones,
            tolerancePercent:  this.tolerancePercent,
            matchThreshold:  this.matchThreshold,
            notifications:  this.notifications,
            minRecordingLengthSec:  this.minRecordingLengthSec,
            maxRecordingLengthSec:  this.maxRecordingLengthSec,
        }
    }

    get fullName(){
        return `${this.name ? this.name : ""} ${this.tones.map(f => `${f}Hz`).join(',')}`;
    }

    _resetAndStartFullResetTimeout(){
        if(this._fullResetTimeout) {
            log.debug(`Detector ${this.fullName} has matched a tone. Restarting the full reset timeout`);
            clearTimeout(this._fullResetTimeout);
        }
        this._fullResetTimeout = setTimeout(() => this._fullReset(), this.resetTimeoutMs)
    }

    _fullReset(){
        if(this.tones.length > 1) {
            const matchCount = this._detectors.filter(d => d.state === MATCH_STATES.MATCH).length;
            log.warning(`Detector ${this.fullName} reset after matching ${matchCount} tone${matchCount !== 1 ? 's': ''} ` +
                `without getting full match. Time allowed for full match ${this.resetTimeoutMs}ms`);
        }
        this.__buildToneDetectors();
        this._isLockedOut = false;
        clearTimeout(this._unLockoutTimeout);
    }

    _clearFullResetTimeout(){
        clearTimeout(this._fullResetTimeout);
        this._fullResetTimeout = null;
    }

    __matchString(){
        if(this.tones.length === 1)
            return "Single Tone Matched";
        return "MULTI TONE MATCH";
    }

    __matchLogLevel(){
        if(this.tones.length === 1)
            return "notice";
        return "alert";
    }
}

module.exports = {TonesDetector};