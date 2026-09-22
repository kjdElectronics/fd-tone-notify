/**
 * PUT /api/config calls createBackup() and markConfigChanged() but the
 * controller never imported them - a ReferenceError at runtime (caught and
 * turned into a 500) on every update. This locks in the fix.
 */
const { expect } = require('chai');
const sinon = require('sinon');
const request = require('supertest');
const express = require('express');

const configUtil = require('../../../server/util/config.file.util');
const authMiddleware = require('../../../server/middleware/auth.middleware');

const configStubs = {
    readConfigFile: configUtil.readConfigFile.isSinonProxy
        ? configUtil.readConfigFile
        : sinon.stub(configUtil, 'readConfigFile'),
    createBackup: configUtil.createBackup.isSinonProxy
        ? configUtil.createBackup
        : sinon.stub(configUtil, 'createBackup'),
    writeConfigFile: configUtil.writeConfigFile.isSinonProxy
        ? configUtil.writeConfigFile
        : sinon.stub(configUtil, 'writeConfigFile'),
    markConfigChanged: configUtil.markConfigChanged.isSinonProxy
        ? configUtil.markConfigChanged
        : sinon.stub(configUtil, 'markConfigChanged'),
};

// authenticate() is now a scope-taking factory (authenticate('read'|'admin'|
// 'ingest') returns the actual middleware - see auth.middleware.js) rather
// than a bare (req,res,next) middleware, so the stub must return a function
// too.
const authStub = authMiddleware.authenticate.isSinonProxy
    ? authMiddleware.authenticate
    : sinon.stub(authMiddleware, 'authenticate');
authStub.callsFake((requiredScope) => (req, res, next) => {
    req.user = { id: 'test-user', role: 'admin' };
    req.app = { wss: { broadcastLog: sinon.stub() } };
    next();
});

const configRoutes = require('../../../server/routes/config');

describe('Config Controller - PUT /api/config', function() {
    let app;

    beforeEach(function() {
        app = express();
        app.use(express.json());
        app.use('/api/config', configRoutes);

        configStubs.readConfigFile.resetHistory();
        configStubs.createBackup.resetHistory();
        configStubs.writeConfigFile.resetHistory();
        configStubs.markConfigChanged.resetHistory();

        configStubs.readConfigFile.resolves({ audio: {}, detection: { detectors: [] } });
        configStubs.createBackup.resolves();
        configStubs.writeConfigFile.resolves();
        configStubs.markConfigChanged.returns();
    });

    it('should update configuration successfully (createBackup/markConfigChanged must be reachable)', async function() {
        const response = await request(app)
            .put('/api/config')
            .send({ configuration: { FD_SAMPLE_RATE: '48000' } })
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(configStubs.createBackup.calledOnce).to.be.true;
        expect(configStubs.writeConfigFile.calledOnce).to.be.true;
        expect(configStubs.markConfigChanged.calledOnce).to.be.true;
    });
});
