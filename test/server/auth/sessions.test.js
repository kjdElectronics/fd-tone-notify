/**
 * In-memory UI session store backing POST /api/auth/login. Replaces the old
 * placeholder auth that returned the plaintext password as the "token" -
 * createSession() hands back an opaque random token instead.
 */
const { expect } = require('chai');
const sinon = require('sinon');
const sessions = require('../../../server/auth/sessions');

describe('server/auth/sessions', function() {
    afterEach(function() {
        sessions._clearAllSessions();
        if (Date.now.restore) Date.now.restore();
    });

    it('createSession returns an opaque token, not the password or anything derived from it', function() {
        const token = sessions.createSession();

        expect(token).to.be.a('string').with.length.greaterThan(20);
    });

    it('isValidSession is true for a freshly created session', function() {
        const token = sessions.createSession();

        expect(sessions.isValidSession(token)).to.be.true;
    });

    it('isValidSession is false for a token that was never issued', function() {
        expect(sessions.isValidSession('not-a-real-token')).to.be.false;
    });

    it('two sessions get different tokens', function() {
        const a = sessions.createSession();
        const b = sessions.createSession();

        expect(a).to.not.equal(b);
    });

    it('revokeSession invalidates a session immediately', function() {
        const token = sessions.createSession();

        sessions.revokeSession(token);

        expect(sessions.isValidSession(token)).to.be.false;
    });

    it('a session expires after 24 hours', function() {
        const realNow = Date.now();
        const nowStub = sinon.stub(Date, 'now').returns(realNow);

        const token = sessions.createSession();
        expect(sessions.isValidSession(token)).to.be.true;

        nowStub.returns(realNow + 24 * 60 * 60 * 1000 + 1);
        expect(sessions.isValidSession(token)).to.be.false;
    });
});
