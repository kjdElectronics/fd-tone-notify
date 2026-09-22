const crypto = require('crypto');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// In-memory UI session store for POST /api/auth/login. Sessions do not
// survive a process restart and are not shared across instances - fine for
// the single-backend-process deployments this project targets today. A
// multi-instance deployment would need to move this to shared storage
// (e.g. Redis) instead.
const sessions = new Map(); // token -> expiresAt (ms epoch)

/**
 * Create a new session and return its opaque token. This is what
 * POST /api/auth/login now returns instead of the plaintext password.
 * @returns {string}
 */
function createSession() {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    return token;
}

/**
 * @param {string} token
 * @returns {boolean} true if the token is a live, unexpired session
 */
function isValidSession(token) {
    if (!token || !sessions.has(token)) return false;

    const expiresAt = sessions.get(token);
    if (Date.now() > expiresAt) {
        sessions.delete(token);
        return false;
    }
    return true;
}

/**
 * @param {string} token
 */
function revokeSession(token) {
    sessions.delete(token);
}

/**
 * Test-only helper to reset session state between test cases.
 */
function _clearAllSessions() {
    sessions.clear();
}

module.exports = { createSession, isValidSession, revokeSession, _clearAllSessions };
