const {calcRms, arrayAverage} = require("../util/util");
const log = require('../util/logger');
const {PitchDetector} = require('pitchy');
const EventEmitter = require('events');
const moment = require("moment");
const {SilenceDetector} = require("./SilenceDetector");
const config = require("config");
const garbageCollect = require("../util/gc");
const CLARITY_THRESHOLD = config.detection.clarityThreshold ? config.detection.clarityThreshold : 0.9;

const SAMPLE_SIZE = 200;
const MAX_BUFFER_SIZE = 2000; // Prevent unbounded buffer growth

class AudioProcessor extends EventEmitter{
    constructor({sampleRate, silenceAmplitude, frequencyScaleFactor}) {
        super();

        log.debug(`Clarity Threshold set to ${CLARITY_THRESHOLD}`);
        this._pitchyDetector = PitchDetector.forFloat32Array(this.sampleSize);
        this.sampleRate = sampleRate;
        this.silenceAmplitude = silenceAmplitude;
        this.frequencyScaleFactor = frequencyScaleFactor;

        this._silenceDetector = new SilenceDetector({silenceAmplitude: silenceAmplitude / 2, matchThreshold: 300});
        this._silence = false;
        this._silenceDetector.on('silenceDetected', () => {
            this._silence = true;
        });

        this._processingBuffer = [];
    }

    chunkAudioData(decodedData){
        // Filter non-zero values directly into processing buffer without intermediate arrays
        for (let i = 0; i < decodedData.length; i++) {
            if (decodedData[i] !== 0) {
                this._processingBuffer.push(decodedData[i]);
            }
        }
        
        // Prevent unbounded buffer growth - drop old data if buffer gets too large
        if (this._processingBuffer.length > MAX_BUFFER_SIZE) {
            const excessData = this._processingBuffer.length - MAX_BUFFER_SIZE;
            this._processingBuffer.splice(0, excessData); // Remove old data from beginning
            
            // Hint garbage collection when buffer overflow occurs to prevent accumulation
            if (Math.random() < 0.005) { // 0.5% chance to avoid excessive GC calls
                garbageCollect("Audio Processor 0.5%");
            }
        }
        
        if(this._processingBuffer.length < this.sampleSize){
            return []; //No complete data chunks
        }
        
        // Create chunks without copying remainder
        const SLICE_SIZE = this.sampleSize;
        const dataSlices = [];
        const completeChunks = Math.floor(this._processingBuffer.length / SLICE_SIZE);
        
        // Extract complete chunks
        for (let i = 0; i < completeChunks; i++) {
            const chunk = [];
            for (let j = 0; j < SLICE_SIZE; j++) {
                chunk[j] = this._processingBuffer[i * SLICE_SIZE + j];
            }
            dataSlices.push(chunk);
        }
        
        // Keep remainder by moving it to start of buffer (in-place)
        const remainder = this._processingBuffer.length % SLICE_SIZE;
        const consumedSamples = completeChunks * SLICE_SIZE;
        for (let i = 0; i < remainder; i++) {
            this._processingBuffer[i] = this._processingBuffer[consumedSamples + i];
        }
        this._processingBuffer.length = remainder;
        
        return dataSlices;
    }

    getPitchWithClarity(decoded, sampleRate=null){
        const rmsAmplitude = calcRms(decoded);
        this._silenceDetector.processRms(rmsAmplitude);
        if(!this._silence || rmsAmplitude > this.silenceAmplitude)
            this.emit('audio', decoded);

        let pitchResult = 0; //So silence resets match
        if(rmsAmplitude > this.silenceAmplitude) {
            this._silence = false;
            pitchResult = this._getPitch(decoded, sampleRate ? sampleRate : this.sampleRate);
            if (pitchResult) {
                const message = `Detected Avg Pitch: ${pitchResult.pitch}Hz. Clarity: ${pitchResult.clarity}`;
                log.silly(message);
                this.emit('pitchData', {pitch: pitchResult.pitch, clarity: pitchResult.clarity, rmsAmplitude, message,
                    dateString: moment().format('MMMM Do YYYY, H:mm:ss')});
                return {pitch: pitchResult.pitch, clarity: pitchResult.clarity, decoded};
            }
        }
        return {pitch: 0, clarity: 0, weight: 1, decoded}; //Silence or no pitch data
    }

    _getPitch(decoded, sampleRate){
        const [pitchyResult, clarity] = this._pitchyDetector.findPitch(decoded, sampleRate);
        if(clarity > CLARITY_THRESHOLD && pitchyResult !== 0) {
            return {pitch: pitchyResult * this.frequencyScaleFactor, clarity};
        }
        return null;
    }

    get sampleSize(){
        return SAMPLE_SIZE;
    }
}

module.exports = {AudioProcessor};
