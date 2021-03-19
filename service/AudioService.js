const mic = require('mic');
const config = require("config");
const log = require('../util/logger');
const NO_DATA_INTERVAL_SEC = 30;

class AudioService{
    constructor() {
        this._dataListenerCallbacks = [];

        this._setupMic();

        this.listenForMicInputEvents();
        this._setNoDataInterval();
    }

    start(){
        this._micInstance.start();
    }

    restart(){
        log.warning('Restarting mic instance');
        this._micInstance.stop();
        this._setupMic();
        this._rebindDataListenerCallbacks();
        this.listenForMicInputEvents();

        this.start();
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

    _resetNoDataInterval(){
        clearInterval(this._noDataInterval);
        this._setNoDataInterval();
    }

    _setNoDataInterval(){
        this._noDataInterval = setInterval(() => {
                log.alert(`No Mic Data for ${NO_DATA_INTERVAL_SEC} Seconds`);
                this.restart();
            }, NO_DATA_INTERVAL_SEC * 1000);
    }

    onData(callback){
        this._dataListenerCallbacks.push(callback);
        this._micInputStream.on('data', callback);
    }

    _rebindDataListenerCallbacks(){
        this._dataListenerCallbacks.forEach(cb =>  this._micInputStream.on('data', cb));
    }

    listenForMicInputEvents(){
        this.onData(() => {
            this._resetNoDataInterval();
        });
        listenForMicInputEvents(this._micInputStream);
    }
}

function listenForMicInputEvents(micInputStream){
    micInputStream.on('error', function(err) {
        log.alert("Error in Mic Input Stream: " + err);
        process.exit(1);
    });

    micInputStream.on('processExitComplete', function() {
        log.alert("Got SIGNAL processExitComplete");
    });

    micInputStream.on('startComplete', function() {
        log.info("Mic Instance Has Started");
    });

    micInputStream.on('stopComplete', function() {
        log.alert("Mic Instance Has STOPPED");
    });

    micInputStream.on('resumeComplete', function() {
        log.alert("Mic Instance Has resumed");
    });
}


module.exports = {AudioService, listenForMicInputEvents};