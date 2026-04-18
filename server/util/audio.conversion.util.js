const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const log = require('../../util/logger');

const WAV_SAMPLE_RATE = 44100;
const WAV_CHANNELS = 1;

/**
 * Convert an uploaded audio file to WAV format (mono, 44.1kHz) suitable for
 * the tone-detection pipeline. If the source is already WAV (by original
 * filename extension), the file is renamed instead of re-encoded.
 */
function convertAudioToWav(inputPath, outputPath, originalFilename, requestId) {
    const ext = path.extname(originalFilename || '').toLowerCase();

    if (ext === '.wav') {
        log.debug(`Rdio Scanner: audio is already WAV, renaming (${requestId})`);
        fs.renameSync(inputPath, outputPath);
        return Promise.resolve(outputPath);
    }

    log.info(`Rdio Scanner: converting ${ext || 'unknown format'} to WAV via FFmpeg (${requestId})`);

    return new Promise((resolve, reject) => {
        ffmpeg({ source: inputPath })
            .toFormat('wav')
            .audioFrequency(WAV_SAMPLE_RATE)
            .audioChannels(WAV_CHANNELS)
            .on('error', (err) => {
                log.error(`Rdio Scanner: FFmpeg conversion error: ${err.message} (${requestId})`);
                reject(err);
            })
            .on('end', () => {
                log.info(`Rdio Scanner: audio converted to WAV successfully (${requestId})`);
                resolve(outputPath);
            })
            .save(outputPath);
    });
}

/**
 * Delete a file if it exists, swallowing and logging any errors. Used in
 * cleanup paths where a failure to unlink should never bubble up.
 */
function safeDeleteFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        log.warning(`Rdio Scanner: failed to clean up file ${filePath}: ${error.message}`);
    }
}

module.exports = {
    convertAudioToWav,
    safeDeleteFile,
};
