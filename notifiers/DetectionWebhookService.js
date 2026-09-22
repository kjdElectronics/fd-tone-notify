const axios = require('axios');
const crypto = require('crypto');
const log = require('../util/logger');
const { version: fdtnVersion } = require('../package.json');

const REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_RETRY_DELAY_MS = 2000;

/**
 * System-wide, HMAC-signed webhook fired once per tone detection (mic, file,
 * or Rdio ingest), independent of any per-detector notification
 * configuration. This is the single integration point a hosted control plane
 * uses to learn about detections over HTTP.
 *
 * No-ops when FD_DETECTION_WEBHOOK_URL is not set. Never throws - a webhook
 * outage must never block or crash tone detection. On a network error or 5xx
 * response the request is retried exactly once after a short delay; failures
 * (including after the retry) are logged at warn and swallowed.
 *
 * @param {Object} detection
 * @param {string} [detection.detectorId] - Stable detector UUID, when known
 * @param {string} detection.detectorName
 * @param {number[]} detection.tones
 * @param {number[]} detection.matchAverages
 * @param {string} detection.timestamp - ISO 8601 detection timestamp
 * @param {Object} detection.source - Source context, e.g. { type: 'mic'|'file'|'rdio', ... }
 * @param {string} [detection.recordingRelativePath] - Recording filename relative to the recording directory, if a recording is being made
 * @param {Object} [options]
 * @param {number} [options.retryDelayMs=2000] - Delay before the single retry (test seam)
 * @returns {Promise<void>} Always resolves; never rejects.
 */
async function sendDetectionWebhook(detection, { retryDelayMs = DEFAULT_RETRY_DELAY_MS } = {}) {
    const url = process.env.FD_DETECTION_WEBHOOK_URL;
    if (!url || url.trim() === '') return; // Feature not enabled

    const secret = process.env.FD_DETECTION_WEBHOOK_SECRET || '';

    const payload = {
        event: 'detection',
        detectorId: detection.detectorId,
        detectorName: detection.detectorName,
        tones: detection.tones,
        matchAverages: detection.matchAverages,
        timestamp: detection.timestamp,
        source: detection.source,
        recordingRelativePath: detection.recordingRelativePath || null,
        fdtnVersion
    };
    const bodyString = JSON.stringify(payload);

    try {
        await _postOnce({ url, secret, bodyString });
    } catch (firstError) {
        if (!_isRetryable(firstError)) {
            log.warning(`Detection webhook to ${url} failed (not retryable): ${firstError.message}`);
            return;
        }
        await _sleep(retryDelayMs);
        try {
            await _postOnce({ url, secret, bodyString });
        } catch (secondError) {
            log.warning(`Detection webhook to ${url} failed after retry: ${secondError.message}`);
        }
    }
}

/**
 * Only retry on a network-level failure (no response) or a 5xx server error.
 * A 4xx response means the request itself is wrong (bad URL, auth, payload) -
 * retrying it would just fail again the same way.
 * @private
 */
function _isRetryable(error) {
    if (error.response) return error.response.status >= 500;
    return true;
}

/**
 * @private
 */
async function _postOnce({ url, secret, bodyString }) {
    const timestampMs = Date.now();
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestampMs}.${bodyString}`)
        .digest('hex');

    return axios.post(url, bodyString, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
            'Content-Type': 'application/json',
            'X-FDTN-Event': 'detection',
            'X-FDTN-Timestamp': String(timestampMs),
            'X-FDTN-Signature': `sha256=${signature}`
        }
    });
}

/**
 * @private
 */
function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendDetectionWebhook };
