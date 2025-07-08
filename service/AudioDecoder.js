const fs = require('fs');
const path = require('path');
const WavDecoder = require('wav-decoder');
const log = require('../util/logger');

// Supported audio formats and their handlers
const SUPPORTED_FORMATS = {
    '.wav': '_decodeWav'
};

/**
 * Static audio decoder service that handles different audio formats
 * Currently supports WAV files, extensible for MP3 and other formats
 */
class AudioDecoder {

    /**
     * Decode audio file to normalized sample data
     * @param {string} filePath - Path to the audio file
     * @returns {Promise<Object>} - Decoded audio information
     */
    static async decodeFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Audio file does not exist: ${filePath}`);
        }

        const fileExtension = path.extname(filePath).toLowerCase();
        const handlerName = SUPPORTED_FORMATS[fileExtension];
        
        if (!handlerName) {
            throw new Error(`Unsupported audio format: ${fileExtension}. Supported formats: ${Object.keys(SUPPORTED_FORMATS).join(', ')}`);
        }

        log.debug(`Decoding audio file: ${filePath}`);
        return await AudioDecoder[handlerName](filePath);
    }

    /**
     * Decode WAV file using wav-decoder (consistent with test implementation)
     * @private
     */
    static async _decodeWav(filePath) {
        const fileBuffer = fs.readFileSync(filePath);
        const decoded = await WavDecoder.decode(fileBuffer);
        
        // Extract first channel for consistency (handles both mono and stereo)
        const audioData = decoded.channelData[0];
        
        // Log file characteristics
        const channels = decoded.channelData.length;
        if (channels > 1) {
            log.warning(`File channels (${channels}) differs from expected (1). Will use first channel only.`);
        }
        
        log.debug(`Decoded WAV: ${decoded.sampleRate}Hz, ${channels} channel(s), ${audioData.length} samples`);
        
        return {
            sampleRate: decoded.sampleRate,
            channels: channels,
            samples: audioData,
            duration: audioData.length / decoded.sampleRate,
            bitDepth: 16 // wav-decoder normalizes to float, but original is typically 16-bit
        };
    }

    /**
     * Create audio chunks from decoded data for streaming processing
     * @param {Float32Array} audioData - Decoded audio samples  
     * @param {number} sampleRate - Audio sample rate
     * @param {number} chunkDurationSeconds - Duration of each chunk in seconds
     * @param {string} filePath - Original file path for metadata
     * @returns {Array<Object>} - Array of audio chunks
     */
    static createChunks(audioData, sampleRate, chunkDurationSeconds, filePath) {
        const chunks = [];
        const samplesPerChunk = Math.floor(sampleRate * chunkDurationSeconds);
        let chunkIndex = 0;
        
        for (let i = 0; i < audioData.length; i += samplesPerChunk) {
            const chunkEnd = Math.min(i + samplesPerChunk, audioData.length);
            const chunkSamples = audioData.slice(i, chunkEnd);
            
            // Convert to Int16 format for compatibility with existing DetectionService
            const int16Array = new Int16Array(chunkSamples.length);
            for (let j = 0; j < chunkSamples.length; j++) {
                // Convert from float (-1.0 to 1.0) to int16 (-32768 to 32767)
                int16Array[j] = Math.max(-32768, Math.min(32767, Math.round(chunkSamples[j] * 32767)));
            }
            
            const timestamp = (i / sampleRate);
            const actualDuration = chunkSamples.length / sampleRate;
            const isLastChunk = chunkEnd >= audioData.length;
            
            const chunkData = {
                audioBuffer: Buffer.from(int16Array.buffer),
                timestamp: timestamp,
                duration: actualDuration,
                chunkIndex: chunkIndex,
                filePath: filePath
            };
            
            // Only add isLastChunk property to the last chunk
            if (isLastChunk) {
                chunkData.isLastChunk = true;
            }
            
            chunks.push(chunkData);
            
            chunkIndex++;
        }
        
        log.debug(`Created ${chunks.length} audio chunks from ${filePath}`);
        return chunks;
    }

    /**
     * Get supported audio formats
     * @returns {Array<string>} - Array of supported file extensions
     */
    static getSupportedFormats() {
        return Object.keys(SUPPORTED_FORMATS);
    }
}

module.exports = { AudioDecoder };