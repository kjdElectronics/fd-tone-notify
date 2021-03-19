function calcRms(decodedSignal){
    const n = decodedSignal.length;
    const x2 = decodedSignal.reduce((acc, value) => acc + value ** 2);
    return Math.sqrt((1/n) * x2);
}

function arrayAverage(array) {
    return array.reduce((a, b) => (a + b)) / array.length;
}

function decodeRawAudioBuffer (buffer) {
    return Array.from(
        { length: buffer.length / 2 },
        (v, i) => buffer.readInt16LE(i * 2) / (2 ** 15 )
    );
}

module.exports = {calcRms, arrayAverage, decodeRawAudioBuffer};