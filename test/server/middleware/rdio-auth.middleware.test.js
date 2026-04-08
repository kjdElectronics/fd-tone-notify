const { expect } = require('chai');
const sinon = require('sinon');
const bcrypt = require('bcrypt');

// Store original env value to restore later
const originalEnvValue = process.env.FD_RDIO_API_KEY_HASH;

describe('Rdio Auth Middleware', function() {
    let authenticateRdio;
    let req, res, next;
    let statusCode, jsonResponse, nextCalled;

    // Generate a bcrypt hash for testing
    const testApiKey = 'test-rdio-api-key-12345';
    const testApiKeyHash = bcrypt.hashSync(testApiKey, 10);

    beforeEach(function() {
        // Clear module cache to pick up env var changes
        delete require.cache[require.resolve('../../../server/middleware/rdio-auth.middleware')];

        statusCode = null;
        jsonResponse = null;
        nextCalled = false;

        req = {
            body: {},
            ip: '127.0.0.1'
        };
        res = {
            status: function(code) {
                statusCode = code;
                return this;
            },
            json: function(data) {
                jsonResponse = data;
                return this;
            }
        };
        next = function() {
            nextCalled = true;
        };
    });

    afterEach(function() {
        // Restore original env value
        if (originalEnvValue !== undefined) {
            process.env.FD_RDIO_API_KEY_HASH = originalEnvValue;
        } else {
            delete process.env.FD_RDIO_API_KEY_HASH;
        }
    });

    describe('when no API key hash is configured', function() {
        it('should allow request and call next()', function() {
            delete process.env.FD_RDIO_API_KEY_HASH;
            authenticateRdio = require('../../../server/middleware/rdio-auth.middleware').authenticateRdio;

            authenticateRdio(req, res, next);

            expect(nextCalled).to.be.true;
            expect(statusCode).to.be.null;
        });
    });

    describe('when API key hash is configured', function() {
        beforeEach(function() {
            process.env.FD_RDIO_API_KEY_HASH = testApiKeyHash;
            delete require.cache[require.resolve('../../../server/middleware/rdio-auth.middleware')];
            authenticateRdio = require('../../../server/middleware/rdio-auth.middleware').authenticateRdio;
        });

        it('should reject request with missing key field', function() {
            req.body = {};

            authenticateRdio(req, res, next);

            expect(nextCalled).to.be.false;
            expect(statusCode).to.equal(401);
            expect(jsonResponse).to.have.property('success', false);
            expect(jsonResponse).to.have.property('error').that.includes('Authentication required');
        });

        it('should reject request with invalid API key', function() {
            req.body = { key: 'wrong-api-key' };

            authenticateRdio(req, res, next);

            expect(nextCalled).to.be.false;
            expect(statusCode).to.equal(401);
            expect(jsonResponse).to.have.property('success', false);
            expect(jsonResponse).to.have.property('error', 'Invalid API key');
        });

        it('should allow request with valid API key', function() {
            req.body = { key: testApiKey };

            authenticateRdio(req, res, next);

            expect(nextCalled).to.be.true;
            expect(statusCode).to.be.null;
        });

        it('should reject request with empty string key', function() {
            req.body = { key: '' };

            authenticateRdio(req, res, next);

            expect(nextCalled).to.be.false;
            expect(statusCode).to.equal(401);
        });
    });
});
