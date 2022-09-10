const { Worker, SHARE_ENV } = require('worker_threads');
const fork = require('child_process').fork;
const log = require('../util/logger');
const path = require("path");

const recordAndNotify = require('../bin/recordAndNotify'); // Require but do not use to force pkg to include
const PATH_PREFIX = __dirname.replace("service", "");
const RECORD_NOTIFY_PATH = path.join(PATH_PREFIX, "bin/recordAndNotify.js");
const FORK_OPTIONS = {
    stdio: [ 'pipe', 'pipe', 'pipe', 'ipc' ],
    silent: true
};


class RecordingThread{
    constructor({threadId}) {
        this.threadId = threadId;
        this.__initThread();
    }

    __initThread(){
        if(this.__useAltRecording) {
            log.silly('Initializing Alternative Recording Thread (Fork)')
            this.__startedForkedThread();
        }
        else{ //Use Alt
            this.__startWorkerThread();
        }
    }

    __startWorkerThread(){
        this._recordingWorker = new Worker(RECORD_NOTIFY_PATH, {env: SHARE_ENV, workerData: {worker: true}});
        this._recordingWorker.on("message", incoming => log.debug(`Message from Recording Worker ${this.threadId}: ${incoming}`));
        this._recordingWorker.on("error", code => new Error(`Recording Worker ${this.threadId} error with exit code ${code}`));
        this._recordingWorker.on("exit", code => {
                log.debug(`Worker thread ${this.threadId} stopped with exit code ${code}.`);
            }
        );
    }

    __startedForkedThread(){
        this._child = fork(RECORD_NOTIFY_PATH, [], FORK_OPTIONS);
        this._child.on("message", incoming => log.debug(`Message from Recording Fork ${this.threadId}: ${incoming}`));
        this._child.stdout.on("data", data => console.log(data.toString().replace(/(\r\n|\n|\r)/gm, "")));
        this._child.on("error", code => new Error(`Recording Worker ${this.threadId} error with exit code ${code}`));
        this._child.on("exit", code => {
                log.debug(`Worker process ${this.threadId} stopped with exit code ${code}.`);
            }
        );
    }

    get __useAltRecording(){
        return process.arch.includes("arm") && process.pkg && process.pkg.entrypoint;
    }

    sendMessage(message){
        if(this._recordingWorker)
            this._recordingWorker.postMessage(message);
        else if(this._child)
            this._child.send(message);
        else {
            const message = "Unable to send message to thread. No thread exists";
            log.error(message);
            throw new Error(message);
        }
    }
}

module.exports = {RecordingThread};