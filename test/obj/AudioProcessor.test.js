const { expect } = require('chai');
const { AudioProcessor } = require('../../obj/AudioProcessor');

describe('AudioProcessor', function() {
    describe('chunkAudioData', function() {
        it('does not silently drop samples when a single call exceeds the internal buffer cap', function() {
            const processor = new AudioProcessor({ sampleRate: 44100, silenceAmplitude: 0.05, frequencyScaleFactor: 1 });

            // SAMPLE_SIZE is 200, the internal overflow cap is 2000 - feed more
            // than the cap in a single call, as happens when a whole decoded
            // audio file (or a large mic read) is processed in one shot.
            const sampleCount = 4400; // cleanly divisible by 200, well over the 2000 cap
            const decodedData = new Array(sampleCount);
            for (let i = 0; i < sampleCount; i++) {
                // Avoid exact zero, which chunkAudioData filters out
                decodedData[i] = 0.1 + (i % 50) * 0.001;
            }

            const chunks = processor.chunkAudioData(decodedData);
            const totalSamplesReturned = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

            expect(totalSamplesReturned).to.equal(sampleCount);
        });
    });
});
