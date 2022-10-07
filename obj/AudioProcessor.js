const {calcRms, arrayAverage} = require("../util/util");
const log = require('../util/logger');
const {PitchDetector} = require('pitchy');
const EventEmitter = require('events');
const moment = require("moment");
const {SilenceDetector} = require("./SilenceDetector");

const SAMPLE_SIZE = 200;

class AudioProcessor extends EventEmitter{
    constructor({sampleRate, silenceAmplitude, frequencyScaleFactor}) {
        super();

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
        const data = this._processingBuffer.concat(Array.from(decodedData).filter(v => v !== 0));
        if(data.length < this.sampleSize){
            this._processingBuffer = data;
            return []; //No complete data chunks
        }
        this._processingBuffer = []; //Reset buffer

        const SLICE_SIZE = this.sampleSize;
        const dataSlices = [];
        let currentSlice = [];
        data.forEach(dataItem => {
            currentSlice.push(dataItem);
            if(currentSlice.length >= SLICE_SIZE) {
                dataSlices.push(currentSlice);
                currentSlice = [];
            }
        });
        return dataSlices;
    }

    getPitchWithClarity(decoded){
        const rmsAmplitude = calcRms(decoded);
        this._silenceDetector.processRms(rmsAmplitude);
        if(!this._silence || rmsAmplitude > this.silenceAmplitude)
            this.emit('audio', decoded);

        let pitchResult = 0; //So silence resets match
        if(rmsAmplitude > this.silenceAmplitude) {
            this._silence = false;
            pitchResult = this._getPitch(decoded);
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

    _getPitch(decoded){
        const [pitchyResult, clarity] = this._pitchyDetector.findPitch(decoded, this.sampleRate);
        if(clarity > 0.90 && pitchyResult !== 0) {
            return {pitch: pitchyResult * this.frequencyScaleFactor, clarity};
        }
        return null;
    }

    get sampleSize(){
        return SAMPLE_SIZE;
    }
}

module.exports = {AudioProcessor};
