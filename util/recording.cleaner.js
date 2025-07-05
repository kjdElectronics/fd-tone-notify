const fs = require('fs');
const path = require('path');
const log = require('./logger');
const AutoCleanRecordingsService = require("../service/AutoCleanRecordingsService");
const config = require('config');

/**
 * Starts the AutoCleanRecordingsService. This will automatically run the cleaning of old recordings every day
 */
function initRecordingAutoCleaningService() {

    // Initialize recording cleanup
    const recordingDirectory = config.recording.directory;
    const autoDeleteDays = config.recording.autoDeleteOlderThanDays;

    // Start auto-cleanup service if auto-delete is enabled. An initial cleanup will run automatically
    if (autoDeleteDays > 0) {
        const autoCleanService = new AutoCleanRecordingsService(recordingDirectory, autoDeleteDays);
        autoCleanService.start();
        log.info(`AutoCleanRecordingsService started with ${autoDeleteDays} day retention`);
    } else {
        log.info('Auto-delete is disabled (0 days). Recordings will be retained forever.');
    }
}

/**
 * Deletes audio files older than the specified number of days
 * @param {number} deleteAudioOlderThanDays - Number of days (default: 7)
 * @param {string} audioDirectory - Directory path (default: './recordings')
 */
function deleteAudioOlderThanDays(deleteAudioOlderThanDays = 7, audioDirectory = './recordings') {
    if(typeof deleteAudioOlderThanDays !== 'number' || deleteAudioOlderThanDays < 0)
        throw new Error('deleteAudioOlderThanDays must be a positive number');

    // If deleteAudioOlderThanDays is 0, skip deletion entirely
    if(deleteAudioOlderThanDays === 0){
        log.info('Auto-delete is disabled (0 days). Recordings will be retained forever.');
        return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - deleteAudioOlderThanDays);
    
    // Check if recordings directory exists
    if (!fs.existsSync(audioDirectory)) {
        log.error(`Recording Cleaner: Recordings directory does not exist: ${audioDirectory}`);
        throw new Error(`Recording Cleaner: Recordings directory does not exist: ${audioDirectory}. Unable to clean files`);
    }
    
    try {
        const files = fs.readdirSync(audioDirectory);
        let deletedCount = 0;
        
        files.forEach(file => {
            const filePath = path.join(audioDirectory, file);
            
            // Check if it's a file and has audio extension
            if (fs.statSync(filePath).isFile() && isAudioFile(file)) {
                const fileStats = fs.statSync(filePath);
                
                if (fileStats.mtime < cutoffDate) {
                    try {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                        log.info(`Deleted old audio file: ${file}`);
                    } catch (err) {
                        log.error(`Failed to delete audio file ${file}: ${err.message}`);
                    }
                }
            }
        });
        
        if (deletedCount > 0) {
            log.info(`Recording cleaner deleted ${deletedCount} audio files older than ${deleteAudioOlderThanDays} days`);
        } else {
            log.info(`No audio files found older than ${deleteAudioOlderThanDays} days`);
        }
    } catch (err) {
        log.error(`Error reading recordings directory: ${err.message}`);
        throw err;
    }
}

/**
 * Checks if a file is an audio file based on its extension
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if it's an audio file
 */
function isAudioFile(filename) {
    const audioExtensions = ['.wav', '.mp3', '.m4a', '.ogg', '.flac'];
    const ext = path.extname(filename).toLowerCase();
    return audioExtensions.includes(ext);
}

module.exports = {
    deleteAudioOlderThanDays,
    initRecordingAutoCleaningService
};