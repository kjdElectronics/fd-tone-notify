/**
 * POST /api/system/restart relaunches the backend via bin/restart-helper.js,
 * which in turn spawns `node index.js <restartArgs>`. index.js's
 * validateOptions() requires --legacy to be set for --web-server to be
 * accepted at all (see index.js) - the restart route was building its args
 * without --legacy, so the relaunched process exited immediately with a
 * validation error instead of coming back up (see docs/api.md's former
 * "Known bug" note). This locks in the fix: the helper is always spawned
 * with --legacy included alongside --web-server.
 *
 * NOTE on stubbing: server/routes/system.js destructures both `spawn`
 * (from child_process) and `authenticate` (from auth.middleware) ONCE at
 * require time, so stubbing child_process.spawn/authMiddleware.authenticate
 * only has an effect on a *fresh* require of server/routes/system.js - and
 * router.spa-fallback.test.js already requires it (indirectly, via the full
 * router) elsewhere in this suite, which may load and cache the real,
 * unstubbed module before this file's stubs are even created, depending on
 * mocha's file load order. The require cache entry is explicitly cleared
 * below, after stubbing, to force a fresh require that captures these
 * stubs regardless of what any other file already did.
 */
const { expect } = require('chai');
const sinon = require('sinon');
const request = require('supertest');
const express = require('express');

const authMiddleware = require('../../../server/middleware/auth.middleware');
const authStub = authMiddleware.authenticate.isSinonProxy
    ? authMiddleware.authenticate
    : sinon.stub(authMiddleware, 'authenticate');
authStub.callsFake((req, res, next) => next());

const childProcess = require('child_process');
const spawnStub = childProcess.spawn.isSinonProxy
    ? childProcess.spawn
    : sinon.stub(childProcess, 'spawn');

const systemRoutesPath = require.resolve('../../../server/routes/system');
delete require.cache[systemRoutesPath];
const systemRoutes = require(systemRoutesPath);

describe('POST /api/system/restart', function() {
    let app;
    let processExitStub;

    beforeEach(function() {
        app = express();
        app.use(express.json());
        app.use('/api/system', systemRoutes);

        spawnStub.resetHistory();
        spawnStub.returns({ pid: 12345, on: sinon.stub(), unref: sinon.stub() });

        // Stubbed fresh per-test (safe here, unlike above: the call this
        // guards against only ever happens synchronously inside this same
        // test's clock.tick() below, never after this test's afterEach).
        processExitStub = sinon.stub(process, 'exit');
    });

    afterEach(function() {
        processExitStub.restore();
    });

    it('spawns the restart helper with --legacy included', async function() {
        // The route schedules a real setTimeout -> process.exit(0) chain
        // ~1.5s after responding, to actually perform the shutdown half of
        // the restart. Fake timers keep that setTimeout call from ever
        // reaching Node's real timer queue, so there is no risk of it firing
        // for real later in the suite and killing the whole test process -
        // the pending fake timer is simply discarded when the clock is
        // restored below, and clock.tick() runs it synchronously here
        // instead, while processExitStub is guaranteed to still be live.
        const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
            const response = await request(app)
                .post('/api/system/restart')
                .expect(200);

            expect(response.body.success).to.be.true;
            expect(spawnStub.calledOnce).to.be.true;
            const [command, args] = spawnStub.firstCall.args;
            expect(command).to.equal('node');
            expect(args).to.include('--legacy');
            expect(args).to.include('--web-server');

            // Verify the shutdown chain actually runs (under the fake
            // clock, so process.exit is never really invoked).
            clock.tick(2000);
            expect(processExitStub.calledWith(0)).to.be.true;
        } finally {
            clock.restore();
        }
    });
});
