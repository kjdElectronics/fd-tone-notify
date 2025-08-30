const {DetectionService} = require("./DetectionService");
const EventEmitter = require('events');
const log = require('../util/logger');
const {TonesDetectorConfig} = require("../obj/config/TonesDetectorConfig");
const {decodeRawAudioBuffer} = require("../util/util");

class AllToneDetectionService extends EventEmitter{
    //rangeOverlapModifier is a value between 1-2 that determines how much
    // overlap is between detection ranges. Default recommend value=1.8
    constructor({startFreq, endFreq, sampleRate, tolerancePercent, rangeOverlapModifier=1.8, logLevel="silly",
                    audioInterface, matchThreshold=8, frequencyScaleFactor=1, silenceAmplitude, fileMode=false, detectionTimeoutMs=3000}) {
        super();

        this.startFreq = startFreq;
        this.endFreq = endFreq;
        this.tolerancePercent = tolerancePercent;
        this.matchThreshold = matchThreshold;
        this.rangeOverlapModifier = rangeOverlapModifier;

        this.detectionTimeoutMs = detectionTimeoutMs;

        this.detectionService = new DetectionService({
            sampleRate,
            audioInterface,
            frequencyScaleFactor,
            silenceAmplitude,
            areNotificationsEnabled: false,
            fileMode
        });

        this.fileMode = fileMode;
        this._matches = [];
        this._detectors = [];
        this._timeout = null;
        this._lastDetectionTimestamp = null; // Track when the first tone in a sequence was detected

        this.logLevel = logLevel;

        this._initDetectors();
        if(this.fileMode)
            this._initFileModeReset();
    }

    /**
     * Returns a promise that polls the service every 100 ms waiting for it to be finished processing
     * @returns {Promise<void>}
     */
    async waitForProcessingToComplete(){
        while(this.detectionService.isLocked){
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        while(this._timeout !== null){
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        while(this._matches.length !== 0){
            await new Promise(resolve => setTimeout(resolve, 25));
            //Cleanup
            this._emitMutiToneDetected();
        }
    }

    _initDetectors(){
        let freq = this.startFreq;
        log.info(`Initializing Generic Tone Detector for frequencies between ` +
            `${this.startFreq}Hz and ${this.endFreq}Hz with tolerance ±${ this.tolerancePercent * 100} `);
        while(freq < this.endFreq){
            const detector = this.detectionService.addToneDetector(new TonesDetectorConfig({
                name: "Generic Tone Detector for " + freq + "Hz",
                tones: [freq],
                matchThreshold: this.matchThreshold,
                tolerancePercent: this.tolerancePercent,
                logLevel: this.logLevel //Defaults to silly Suppress logs from the detectors
            }));
            freq = this.rangeOverlapModifier * (freq * this.tolerancePercent) + freq;

            this._detectors.push(detector);
            detector.on("toneDetected", args => {
                clearTimeout(this._timeout);
                const {matchAverages} = args;
                
                // If this is the first tone in a sequence, record the timestamp
                if (this.fileMode ) {
                    this._lastDetectionTimestamp = this.detectionService.currentTimeStamp;
                }

                
                this._matches.push(matchAverages[0]);
                if(!this.fileMode) //Only need the timeout when not in filemode
                    this._timeout = this._setResetTimeout();
            });
        }
    }

    _initFileModeReset(){
        this.detectionService.on('audioFileDataProcessed', args => {
            const timestamp = args.timestamp;
            if(this._lastDetectionTimestamp == null)
                return; //Nothing to do
            const diff = timestamp - this._lastDetectionTimestamp;
            const timeoutSeconds = this.detectionTimeoutMs / 1000
            if(diff > timeoutSeconds)
                this._emitMutiToneDetected();
        })
    }

    _setResetTimeout(){
        return setTimeout(() => {
            this._emitMutiToneDetected();
        }, this.detectionTimeoutMs);
    }

    _emitMutiToneDetected(){
        let multiToneMatch = this._matches.map(f => Math.round(f));
        multiToneMatch = this._condenseMatches(multiToneMatch); //Filter adjacent similar values
        if (multiToneMatch.length > 1) {//Multi Tone Match Found
            const detectionTimestamp = this._lastDetectionTimestamp;
            log.crit(`ALL TONE DETECTOR MUTLI-TONE DETECTED: ${multiToneMatch.map(f => `${f}Hz`).join(", ")} at ${detectionTimestamp}s`);

            // Include timestamp information in the event
            this.emit('multiToneDetected', {
                tones: multiToneMatch,
                timestamp: detectionTimestamp
            });
        }
        this._matches = [];
        this._lastDetectionTimestamp = null; // Reset for next sequence
        clearTimeout(this._timeout);
        this._timeout = null;
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

    /**
     * Process audio data directly (for file mode)
     * @param {Object} audioData - Audio data object
     * @param {number} audioData.timestamp - Timestamp in seconds
     * @param {string} audioData.filePath - Path to the audio file being processed
     * @param {Buffer} audioData.audioBuffer - Raw audio buffer data
     * @param {number} [audioData.duration] - Duration of the audio chunk (optional)
     * @param {number} [audioData.chunkIndex] - Index of the audio chunk (optional)
     */
    processAudioData(audioData) {
        this.detectionService.processAudioData(audioData);
    }

    //Method used for testing
    __processData(data){
        this.detectionService.__processData(data);
    }
}

module.exports = {AllToneDetectionService};
