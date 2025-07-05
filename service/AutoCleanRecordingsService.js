const { deleteAudioOlderThanDays } = require('../util/recording.cleaner');
const log = require('../util/logger');

class AutoCleanRecordingsService {
    constructor(recordingDirectory, autoDeleteOlderThanDays) {
        this.recordingDirectory = recordingDirectory;
        this.autoDeleteOlderThanDays = parseInt(autoDeleteOlderThanDays);
        this.cronInterval = null;
        this.isRunning = false;
        
        log.info(`AutoCleanRecordingsService initialized: directory=${this.recordingDirectory}, autoDeleteDays=${this.autoDeleteOlderThanDays}`);
    }
    
    /**
     * Start the auto-clean service with daily midnight scheduling
     */
    start() {
        if (this.isRunning) {
            log.warning('AutoCleanRecordingsService is already running');
            return;
        }
        
        this.isRunning = true;
        log.info('Starting AutoCleanRecordingsService');
        
        // Run initial cleanup
        this.runCleanup();
        
        // Schedule daily cleanup at midnight
        this.scheduleNextCleanup();
    }
    
    /**
     * Stop the auto-clean service
     */
    stop() {
        if (!this.isRunning) {
            log.warning('AutoCleanRecordingsService is not running');
            return;
        }
        
        this.isRunning = false;
        
        if (this.cronInterval) {
            clearTimeout(this.cronInterval);
            this.cronInterval = null;
        }
        
        log.info('AutoCleanRecordingsService stopped');
    }
    
    /**
     * Run the cleanup process immediately
     */
    runCleanup() {
        try {
            log.info('Running scheduled recording cleanup');
            deleteAudioOlderThanDays(this.autoDeleteOlderThanDays, this.recordingDirectory);
        } catch (error) {
            log.error(`AutoCleanRecordingsService cleanup failed: ${error.message}`);
        }
    }
    
    /**
     * Schedule the next cleanup at midnight
     */
    scheduleNextCleanup() {
        if (!this.isRunning) {
            return;
        }
        
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setDate(now.getDate() + 1);
        nextMidnight.setHours(0, 0, 0, 0);
        
        const timeUntilMidnight = nextMidnight.getTime() - now.getTime();
        
        log.debug(`Next recording cleanup scheduled for: ${nextMidnight.toISOString()}`);
        
        this.cronInterval = setTimeout(() => {
            this.runCleanup();
            this.scheduleNextCleanup(); // Schedule the next one
        }, timeUntilMidnight);
    }
    
    /**
     * Get the current status of the service
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            recordingDirectory: this.recordingDirectory,
            autoDeleteOlderThanDays: this.autoDeleteOlderThanDays,
            nextCleanupTime: this.cronInterval ? new Date(Date.now() + this.cronInterval._idleTimeout) : null
        };
    }
}

module.exports = AutoCleanRecordingsService;