const log = require('./logger');

function garbageCollect(message = 'Garbage collected'){
    if (globalThis.global.gc) {
        globalThis.gc();
        log.debug(`Manual Garbage Collection: ${message}`);
    }
}
module.exports = garbageCollect;