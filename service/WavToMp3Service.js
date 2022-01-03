const ffmpeg = require('fluent-ffmpeg');
const log = require('../util/logger');


class WavToMp3Service{
    static convertWavToMp3({inputPath, outputPath}){
        return new Promise((resolve, reject) => {
            ffmpeg({
                source: inputPath,
            })
                .on('error', (err) => {
                    log.warning('MP3 Conversion Error: ' + err.message);
                    reject(err);
                })
                .on('progress', (progress) => {
                    log.debug('MP3 Conversion Processing: ' + progress.targetSize + ' KB converted');
                })
                .on('end', () => {
                    log.info('MP3 Processing finished !');
                    resolve(outputPath);
                })
                .save(outputPath);//path where you want to save your file
        });

    }
}

module.exports = {WavToMp3Service};