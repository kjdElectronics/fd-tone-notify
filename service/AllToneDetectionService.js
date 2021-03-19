const {DetectionService} = require("./DetectionService");
const EventEmitter = require('events');
const log = require('../util/logger');

class AllToneDetectionService extends EventEmitter{
    //rangeOverlapModifier is a value between 1-2 that determines how much
    // overlap is between detection ranges. Default recommend value=1.8
    constructor({startFreq, endFreq, sampleRate, tolerancePercent, rangeOverlapModifier=1.8, logLevel="silly",
                    audioInterface, matchThreshold=8, frequencyScaleFactor=1, silenceAmplitude}) {
        super();

        this.startFreq = startFreq;
        this.endFreq = endFreq;
        this.tolerancePercent = tolerancePercent;
        this.matchThreshold = matchThreshold;
        this.rangeOverlapModifier = rangeOverlapModifier;

        this.detectionService = new DetectionService({
            sampleRate,
            audioInterface,
            frequencyScaleFactor,
            silenceAmplitude,
            areNotificationsEnabled: false
        });

        this._matches = [];
        this._detectors = [];
        this._timeout = null;

        this.logLevel = logLevel;

        this._initDetectors();
    }

    _initDetectors(){
        let freq = this.startFreq;
        log.info(`Initializing Generic Tone Detector for frequencies between ` +
            `${this.startFreq}Hz and ${this.endFreq}Hz with tolerance ±${ this.tolerancePercent * 100} `);
        while(freq < this.endFreq){
            const detector = this.detectionService.addToneDetector({
                tones: [freq],
                matchThreshold: this.matchThreshold,
                tolerancePercent: this.tolerancePercent,
                logLevel: this.logLevel //Defaults to silly Suppress logs from the detectors
            });
            freq = this.rangeOverlapModifier * (freq * this.tolerancePercent) + freq;

            this._detectors.push(detector);
            detector.on("toneDetected", args => {
                clearTimeout(this._timeout);
                const {matchAverages} = args;
                this._matches.push(matchAverages[0]);
                this._timeout = this._setResetTimeout();
            });
        }
    }

    _setResetTimeout(){
        return setTimeout(() => {
            let multiToneMatch = this._matches.map(f => Math.round(f));
            multiToneMatch = this._condenseMatches(multiToneMatch); //Filter adjacent similar values
            if (multiToneMatch.length > 1) {//Multi Tone Match Found
                log.crit(`ALL TONE DETECTOR MUTLI-TONE DETECTED: ${multiToneMatch.map(f => `${f}Hz`).join(", ")}`);
                this.emit('multiToneDetected', multiToneMatch);
            }
            this._matches = [];
        }, 3000);
    }

    _condenseMatches(values){
        let result = [];
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            if(i === 0){
                result.push(value);
                continue;
            }
            if(this._valueIsWithinTolerance({value: result[result.length-1], testValue: value })) {
                result[result.length-1] = Math.round((result[result.length-1] + value ) / 2);
                continue;
            }
            result.push(value);
        }
        return result;
    }

    _valueIsWithinTolerance({value, testValue}){
        const upperLimit = value + (value * (this.tolerancePercent * 1.25));
        const lowerLimit = value - (value * (this.tolerancePercent * 1.25));
        return testValue >= lowerLimit && testValue <= upperLimit;
    }

    //Method used for testing
    __processData(data){
        this.detectionService.__processData(data);
    }
}

module.exports = {AllToneDetectionService};
