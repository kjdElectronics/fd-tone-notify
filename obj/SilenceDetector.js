const EventEmitter = require('events');
const {calcRms} = require("../util/util");
const log = require('../util/logger');

class SilenceDetector extends EventEmitter{
    constructor({silenceAmplitude, matchThreshold}) {
        super();
        this.matchThreshold = matchThreshold;
        this.silenceAmplitude = silenceAmplitude;

        this._silenceMatchCount = 0;
    }

    processValues({raw}){
        let rmsAmplitude = calcRms(raw);
        this.processRms(rmsAmplitude);
    }

    processRms(rmsAmplitude){
        if(isNaN(rmsAmplitude))
            rmsAmplitude = 0;

        if(rmsAmplitude <= this.silenceAmplitude) {
            this._silenceMatchCount++;
        }
        else
            this._silenceMatchCount = 0;
        if(this._silenceMatchCount >= this.matchThreshold)
            this.silenceDetected();
    }

    silenceDetected(){
        this.emit('silenceDetected');
    }
}

module.exports = {SilenceDetector};