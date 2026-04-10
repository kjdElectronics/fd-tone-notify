const {DetectionService} = require("./DetectionService");
const EventEmitter = require('events');
const log = require('../util/logger');
const {TonesDetectorConfig} = require("../obj/config/TonesDetectorConfig");
const {decodeRawAudioBuffer} = require("../util/util");

class AllToneDetectionService extends EventEmitter{
    //rangeOverlapModifier is a value between 1-2 that determines how much
    // overlap is between detection ranges. Default recommend value=1.8
    constructor({startFreq, endFreq, sampleRate, tolerancePercent, rangeOverlapModifier=1.8, logLevel="silly",
                    audioInterface, matchThreshold=8, frequencyScaleFactor=1, silenceAmplitude, fileMode=false, detectionTimeoutMs=3000,
                    sourceContext=null}) {
        super();

        this.startFreq = startFreq;
        this.endFreq = endFreq;
        this.tolerancePercent = tolerancePercent;
        this.matchThreshold = matchThreshold;
        this.rangeOverlapModifier = rangeOverlapModifier;

        this.detectionTimeoutMs = detectionTimeoutMs;
        this._sourceContext = sourceContext;

        this.detectionService = new DetectionService({
            sampleRate,
            audioInterface,
            frequencyScaleFactor,
            silenceAmplitude,
            areNotificationsEnabled: false,
            fileMode,
            recording: false, //No recording for all tone detector
            sourceContext
        });

        this.fileMode = fileMode;
        this._matches = [];
        this._detectors = [];
        this._timeout = null;
        this._lastDetectionTimestamp = null; // Track when the first tone in a sequence was detected
        
        // Memory management - limit matches array to prevent unbounded growth
        this.MAX_MATCHES = 25;

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
            detector.on("toneDetected", this._handleDetectorToneDetected.bind(this));
        }
    }

    /**
     * Dedicated method to handle tone detection events without closure capture
     * @param {Object} args - Tone detection arguments
     */
    _handleDetectorToneDetected(args) {
        clearTimeout(this._timeout);
        const {matchAverages} = args;
        
        // If this is the first tone in a sequence, record the timestamp
        if (this.fileMode ) {
            this._lastDetectionTimestamp = this.detectionService.currentTimeStamp;
        }

        this._matches.push(matchAverages[0]);
        
        // Prevent unbounded matches array growth
        if (this._matches.length > this.MAX_MATCHES) {
            this._matches.splice(0, this._matches.length - this.MAX_MATCHES);
            log.warning(`AllToneDetectionService: Matches array overflow, dropped ${this._matches.length - this.MAX_MATCHES} old matches`);
        }
        
        if(!this.fileMode) //Only need the timeout when not in filemode
            this._timeout = this._setResetTimeout();
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
            const detectedAt = this._sourceContext && this._sourceContext.epochBaseSeconds
                ? new Date(Math.round(this._sourceContext.epochBaseSeconds * 1000)).toISOString()
                : new Date().toISOString();
            log.crit(`ALL TONE DETECTOR MUTLI-TONE DETECTED: ${multiToneMatch.map(f => `${f}Hz`).join(", ")} at ${detectedAt}`);

            this.emit('multiToneDetected', {
                tones: multiToneMatch,
                timestamp: detectionTimestamp,
                detectedAt,
                sourceContext: this._sourceContext || null
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
    
    /**
     * Cleanup method to properly dispose of all resources and prevent memory leaks
     * CRITICAL: Must be called when service is no longer needed
     */
    dispose() {
        log.debug(`AllToneDetectionService: Disposing of ${this._detectors.length} detectors`);
        
        // Clear timeout
        if (this._timeout) {
            clearTimeout(this._timeout);
            this._timeout = null;
        }
        
        // Remove all detector event listeners to prevent memory leaks
        this._detectors.forEach(detector => {
            detector.removeAllListeners();
        });
        
        // Clear detector arrays to free memory
        this._detectors.length = 0;
        this._matches.length = 0;
        
        // Dispose of detection service
        if (this.detectionService && typeof this.detectionService.dispose === 'function') {
            this.detectionService.dispose();
        }
        
        // Remove all event listeners from this service
        this.removeAllListeners();
        
        log.debug('AllToneDetectionService: Disposal complete');
    }
}

module.exports = {AllToneDetectionService};
