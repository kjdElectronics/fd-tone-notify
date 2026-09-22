/**
 * docs/api.md documents file-upload tone detection as
 * `POST /api/detect-tones`, but server/routes/router.js has only ever
 * mounted that router (server/routes/detection.js) at `/api/detections` -
 * a doc/route mismatch the docs used to call out under "Known gaps". This
 * locks in the fix: the same router is now mounted at both paths in
 * server/routes/router.js's configureRoutes(), so the documented path
 * actually works, without removing the original one.
 *
 * NOTE on stubbing: like server/routes/system.js (see
 * system.restart.test.js's note), server/routes/detection.js destructures
 * `authenticate` from auth.middleware ONCE at require time. Several other
 * suites globally stub authMiddleware.authenticate as a bypass, and since
 * mocha requires every spec file before running any test, that stub may
 * already be in place by the time detection.js is first required, depending
 * on file load order. Force a fresh require here (after restoring the real
 * authenticate, if stubbed) so this suite deterministically exercises the
 * real auth behavior on the alias's GET route, exactly like
 * auth.middleware.test.js and system.restart.test.js already do.
 */
const { expect } = require('chai');
const request = require('supertest');
const express = require('express');

const authMiddleware = require('../../../server/middleware/auth.middleware');
if (authMiddleware.authenticate.isSinonProxy) {
    authMiddleware.authenticate.restore();
}

const detectionRoutesPath = require.resolve('../../../server/routes/detection');
delete require.cache[detectionRoutesPath];
const detectionRoutes = require(detectionRoutesPath);

describe('POST /api/detect-tones (alias for /api/detections)', function() {
    let app;

    beforeEach(function() {
        app = express();
        app.use(express.json());
        // Mirrors server/routes/router.js's configureRoutes(): the same
        // router mounted at both the original and documented paths.
        app.use('/api/detections', detectionRoutes);
        app.use('/api/detect-tones', detectionRoutes);
    });

    // A disallowed file type is rejected synchronously by multer's
    // fileFilter (upload.middleware.js), well before the detection pipeline
    // itself runs - a fast, deterministic way to exercise the alias's 400
    // path via supertest without invoking real audio processing.
    const rejectedFile = { buffer: Buffer.from('not audio'), name: 'notes.txt' };

    it('is unauthenticated, same as the original /api/detections path (rejected file -> 400, not 401)', async function() {
        const response = await request(app)
            .post('/api/detect-tones')
            .attach('file', rejectedFile.buffer, rejectedFile.name)
            .expect(400);

        expect(response.body.success).to.be.false;
        expect(response.body).to.have.property('requestId');
    });

    it('behaves identically to POST /api/detections for the same (rejected file) request', async function() {
        const [aliasResponse, originalResponse] = await Promise.all([
            request(app).post('/api/detect-tones').attach('file', rejectedFile.buffer, rejectedFile.name),
            request(app).post('/api/detections').attach('file', rejectedFile.buffer, rejectedFile.name)
        ]);

        expect(aliasResponse.status).to.equal(originalResponse.status);
        expect(aliasResponse.body.success).to.equal(originalResponse.body.success);
        expect(aliasResponse.body.error).to.equal(originalResponse.body.error);
    });

    it('GET /api/detect-tones requires auth, same as GET /api/detections', async function() {
        await request(app).get('/api/detect-tones').expect(401);
        await request(app).get('/api/detections').expect(401);
    });
});
