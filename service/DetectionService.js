const {TonesDetector} = require("../obj/TonesDetector");
const { TonesDetectorConfig } = require('../obj/config/TonesDetectorConfig');
const log = require('../util/logger');
const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
const {AudioProcessor} = require("../obj/AudioProcessor");
const {decodeRawAudioBuffer} = require("../util/util");
const EventEmitter = require('events');
const {RecordingThread} = require("./RecordingThread");
const {sendPreRecordingNotifications} = require('../notifiers');
const {NotificationParams} = require('../obj/NotificationParams');
const path = require('path');
const config = require('config');
const {ErrorWithStatusCode} = require("../util/ErrorWithStatusCode");

const NO_DATA_INTERVAL_SEC = 30;
const THREAD_ROTATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

class DetectionService extends EventEmitter{
    constructor({audioInterface, sampleRate, recording: isRecordingEnabled, areNotificationsEnabled=true,
                    minRecordingLengthSec=30, maxRecordingLengthSec, frequencyScaleFactor=1,
                    silenceAmplitude=0.05, fileMode=false
                }) {
        super();

        this._audioInterface = audioInterface;
        this._fileMode = fileMode;
        
        if(audioInterface && !audioInterface.disabled) {
            this._audioInterface.onData( async (rawBuffer) => {
                let decoded = decodeRawAudioBuffer(rawBuffer);
                this.__processData(decoded);
                //Force Cleanup
                rawBuffer = null;
                decoded = null;
            });
        }
        else if(!fileMode) {
            log.warning(`Detection Service: No audioInterface. Should be used for testing only`);
        }

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
        
        // Only create RecordingThread if not in file mode (API file processing doesn't need recording) and recording is enabled
        if (!fileMode && this.isRecordingEnabled) {
            this._recordingThread = new RecordingThread({threadId: 0});
            this._initializeRecordingThreadRotation();
        } else {
            this._recordingThread = null;
            this._recordingThreadRotationTimer = null;
        }

        //Tone Detection Locks
        this._toneDetectionLocks = {};
    }

    /**
     * Returns true if the service is actively processing a tone detection.
     * @returns {boolean}
     */
    get isLocked(){
        return Object.keys(this._toneDetectionLocks).length > 0;
    }

    /**
     * Returns a promise that polls the service every 100 ms waiting for it to be finished processing
     * @returns {Promise<void>}
     */
    async waitForProcessingToComplete(){
        while(this.isLocked){
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    __getToneDetectionLock({tonesDetector}){
        const lockName = `${tonesDetector.name}-${uuidv4()}`;
        const lock = {
            name: lockName,
            release: () => {
                log.debug(`Detection Service: Releasing lock ${lockName}`);
                delete this._toneDetectionLocks[lockName];
            },
            toString: () => lockName,
        };

        this._toneDetectionLocks[lockName] = lock;
        log.debug(`Detection Service: Acquiring lock ${lock}`);

        return lock;
    }

    __processData(decodedData, sampleRate=null){
        let lock;
        if(this._fileMode) { //Only need this for file mode. In mic mode, timeouts handle it
            lock = this.__getToneDetectionLock({tonesDetector: {name: "PROCESSING_DATA_LOCK"}});
            log.debug(`Detection Service: Acquiring lock ${lock}`);
        }

        let dataChunks = this._audioProcessor.chunkAudioData(decodedData);
        dataChunks.forEach(chunk => {
            const {pitch, clarity} = this._audioProcessor.getPitchWithClarity(chunk, sampleRate);
            this.toneDetectors.forEach(tonesDetector => {
                tonesDetector.processValues({pitchValues:[pitch], raw: chunk})
            })
        });

        if(lock)
            lock.release();
        dataChunks = null;
    }

    addToneDetector(tonesDetectorConfig) {
        let logLevel = "debug";

        if(!(tonesDetectorConfig instanceof TonesDetectorConfig))
            throw new ErrorWithStatusCode({statusCode: 500, message: "Invalid config. Use the constructor instead."});

        const tonesDetector = new TonesDetector(tonesDetectorConfig);
        const calculatedIsRecordingEnabled = this._isRecordingEnabled(tonesDetectorConfig.isRecordingEnabled);

        const message = `Creating detector for${tonesDetector.name ? ` ${tonesDetector.name}` : ""} tone(s) ${tonesDetectorConfig.tones.map(v => `${v}Hz`).join(", ")} ` +
            `with tolerance ±${tonesDetector.tolerancePercent}, match threshold ${tonesDetector.matchThreshold}, ` +
            `reset timeout ${tonesDetector.resetTimeoutMs}ms, lockout timeout ${tonesDetector.lockoutTimeoutMs}ms, ` +
            `minimum recording length ${tonesDetector.minRecordingLengthSec} seconds, max recording length ${tonesDetector.maxRecordingLengthSec} seconds, ` +
            `and recoding is ${calculatedIsRecordingEnabled ? "enabled" : "disabled"}.`;
        if(!log[logLevel])
            log.debug(message);
        else
            log[logLevel](message);

        // Store detector context for the bound method
        tonesDetector._detectionServiceContext = {
            config: tonesDetectorConfig,
            isRecordingEnabled: calculatedIsRecordingEnabled
        };
        
        tonesDetector.on('toneDetected', this._handleTonesDetectorEvent.bind(this, tonesDetector));

        this.toneDetectors.push(tonesDetector);
        return tonesDetector;
    }

    /**
     * Dedicated method to handle tone detection events
     * @param {Object} tonesDetector - The tone detector that triggered the event
     * @param {Object} result - Detection result containing matchAverages and message
     */
    async _handleTonesDetectorEvent(tonesDetector, result) {
        const { config: tonesDetectorConfig, isRecordingEnabled: calculatedIsRecordingEnabled } = tonesDetector._detectionServiceContext;
        const lock = this.__getToneDetectionLock({tonesDetector});

        //The existing recording thread (we may need to create a new one)
        const recordingThread = this._recordingThread;
        try {

            // Only create new recording thread if not in file mode
            if (!this._fileMode && recordingThread) {
                this._recordingThread = new RecordingThread({threadId: recordingThread.threadId + 1});
            }

            log.debug(`Processing toneDetected event for ${tonesDetectorConfig.name}`);
            const {matchAverages, message} = result;
            
            // Use file timestamp in file mode, otherwise use current time
            const timestamp = this._fileMode && this._currentTimestamp !== undefined
                ? this._currentTimestamp * 1000 // Convert to milliseconds to match existing format
                : new Date().getTime();
            const filenameOnly = `${timestamp}-${tonesDetectorConfig.name}.wav`; //Include the name of the detector in the filename
            const recordingDirectory = config.recording.directory;
            const fullPath = path.join(recordingDirectory, filenameOnly);

            const notificationParams = new NotificationParams({
                detector: tonesDetector,
                timestamp,
                matchAverages,
                notifications: tonesDetectorConfig.notifications,
                filename: fullPath,
                message
            });

            let notificationPromise = null;
            if(this.areNotificationsEnabled && tonesDetectorConfig.notifications) { //Notifications enabled on the service and detector
                notificationPromise = sendPreRecordingNotifications(notificationParams)
                    .then(results => {
                        log.info(`All notifications for ${tonesDetectorConfig.name} have finished processing`);
                        return results;
                    });

                if(calculatedIsRecordingEnabled && recordingThread) {
                    //Start recording in new thread. Post recording notifications sent from new thread
                    log.notice(`Starting recorder & post recording notification processing. Thread Id: ${recordingThread.threadId}`);
                    recordingThread.sendMessage(notificationParams.toObj());
                }
            }

            if(notificationPromise)
                await notificationPromise;

            // Emit detection event with additional context for file mode
            const detectionData = notificationParams.toObj();
            if (this._fileMode) {
                detectionData.timestamp = this._currentTimestamp; // Use seconds for file mode
                detectionData.filePath = this._currentFilePath;
            }
            this.emit('toneDetected', detectionData);
        }
        catch (e) {
            log.error(`Error processing toneDetected event for ${tonesDetectorConfig.name}: ${e.message}`);
            throw e;
        }
        finally {
            if(recordingThread)
                setTimeout(() => {
                    log.info(`Detection Service: Cleaning Up Recording Thread ${recordingThread.threadId}`);
                    recordingThread.dispose()
                }, this.maxRecordingLengthSec * 1000 + 15000);
            lock.release();
        }
    }

    _isRecordingEnabled(detectorLevelIsRecordingEnabled) {
        if (detectorLevelIsRecordingEnabled === null) {
            if (this.isRecordingEnabled === null) //If not specified globally return true
                return true;
            return this.isRecordingEnabled; //Use specified global value
        } else
            return detectorLevelIsRecordingEnabled; //use specified detector value
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
        if (!this._fileMode) {
            throw new Error('processAudioData can only be used in file mode');
        }
        
        // Store the current timestamp for tone detection context
        this._currentTimestamp = audioData.timestamp;
        this._currentFilePath = audioData.filePath;
        
        // Process the audio buffer through the same pipeline
        const decoded = decodeRawAudioBuffer(audioData.audioBuffer);
        this.__processData(decoded, audioData?.sampleRate);

        this.emit('audioFileDataProcessed', {timestamp: audioData.timestamp});
    }

    /**
     * Initialize automatic RecordingThread rotation
     * This prevents memory leaks by replacing threads before they accumulate too much memory
     * @private
     */
    _initializeRecordingThreadRotation() {
        if (this._fileMode) return; // Only for live audio mode


        log.info('DetectionService: Initializing RecordingThread rotation');

        this._recordingThreadRotationTimer = setInterval(() => {
            this._rotateRecordingThread();
        }, THREAD_ROTATION_INTERVAL_MS);
    }

    /**
     * Rotate the RecordingThread to prevent memory leaks
     * Creates new thread, allows warmup period, then disposes old thread
     * @private
     */
    async _rotateRecordingThread() {
        if (this._fileMode || !this._recordingThread) return;

        const oldThread = this._recordingThread;
        const oldThreadId = oldThread.threadId;
        const newThreadId = oldThreadId + 1;

        log.info(`DetectionService: Starting RecordingThread rotation from thread ${oldThreadId} to ${newThreadId}`);

        try {
            // Create new RecordingThread
            const newThread = new RecordingThread({threadId: newThreadId});
            log.debug(`DetectionService: Created new RecordingThread ${newThreadId}`);

            // Give new thread 5 seconds to warm up
            setTimeout(() => {
                log.debug(`DetectionService: Warmup complete for RecordingThread ${newThreadId}, switching references`);

                // Switch to new thread
                this._recordingThread = newThread;

                // Dispose old thread after another timeout to ensure it's not in use
                setTimeout(() => {
                    log.info(`DetectionService: Disposing old RecordingThread ${oldThreadId}`);

                    if (oldThread && typeof oldThread.dispose === 'function') {
                        oldThread.dispose();
                    }

                    log.info(`DetectionService: RecordingThread rotation complete: ${oldThreadId} -> ${newThreadId}`);
                }, 2000);

            }, 5000); // 5 second warmup

        } catch (error) {
            log.error(`DetectionService: Failed to rotate RecordingThread: ${error.message}`);
            // Keep using old thread if rotation fails
        }
    }

    get currentTimeStamp(){
        if(!this._fileMode)
            throw new Error('currentTimeStamp can only be used in file mode');
        return this._currentTimestamp;
    }
    
    /**
     * Cleanup method to properly dispose of all resources and prevent memory leaks
     * CRITICAL: Must be called when service is no longer needed
     */
    dispose() {
        log.debug(`DetectionService: Disposing of ${this.toneDetectors.length} tone detectors and ${Object.keys(this._toneDetectionLocks).length} locks`);
        
        // Clear recording thread rotation timer
        if (this._recordingThreadRotationTimer) {
            clearInterval(this._recordingThreadRotationTimer);
            this._recordingThreadRotationTimer = null;
            log.debug('DetectionService: Recording thread rotation timer cleared');
        }
        
        // Release all locks
        Object.values(this._toneDetectionLocks).forEach(lock => {
            if (lock && typeof lock.release === 'function') {
                lock.release();
            }
        });
        this._toneDetectionLocks = {};
        
        // Dispose of all tone detectors
        this.toneDetectors.forEach(detector => {
            if (detector && typeof detector.dispose === 'function') {
                detector.dispose();
            } else {
                // Fallback cleanup for detectors without dispose method
                detector.removeAllListeners();
            }
        });
        
        // Clear tone detectors array
        this.toneDetectors.length = 0;
        
        // Dispose of audio processor
        if (this._audioProcessor) {
            this._audioProcessor.removeAllListeners();
            // Clear internal buffers if they exist
            if (this._audioProcessor._processingBuffer) {
                this._audioProcessor._processingBuffer.length = 0;
            }
        }
        
        // Dispose of recording thread
        if (this._recordingThread && typeof this._recordingThread.dispose === 'function') {
            this._recordingThread.dispose();
        }
        
        // Clear file mode state
        this._currentTimestamp = null;
        this._currentFilePath = null;
        
        // Remove all event listeners from this service
        this.removeAllListeners();
        
        log.debug('DetectionService: Disposal complete');
    }

}

module.exports = {DetectionService};