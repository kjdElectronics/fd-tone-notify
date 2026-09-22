/**
 * The production Docker image serves the built Vue UI (a client-side,
 * history-mode SPA) as static files out of server/public. A direct or
 * reloaded request to a client-side route (e.g. GET /detectors, a page the
 * server itself has no route for) must still return the SPA's index.html so
 * vue-router can take over, instead of a bare 404. API routes must be
 * unaffected.
 */
const { expect } = require('chai');
const request = require('supertest');
const express = require('express');
const path = require('path');
const { configureRoutes } = require('../../../server/routes/router');

describe('router SPA fallback', function() {
    let app;

    beforeEach(function() {
        app = express();
        app.use(express.json());
        // Mirrors server/index.js: static assets are served before the API routes
        app.use('/', express.static(path.join(__dirname, '../../../server/public')));
        configureRoutes(app);
    });

    it('should return the SPA index.html for an unmatched non-API GET route', async function() {
        const response = await request(app)
            .get('/detectors')
            .expect(200);

        expect(response.headers['content-type']).to.match(/html/);
        expect(response.text).to.include('<!DOCTYPE html>');
    });

    it('should still return JSON (not the SPA fallback) for a known API route', async function() {
        const response = await request(app)
            .get('/api/health')
            .expect(200);

        expect(response.headers['content-type']).to.match(/json/);
        expect(response.body).to.have.property('success', true);
    });

    it('should not serve the SPA fallback for an unmatched API route', async function() {
        const response = await request(app)
            .get('/api/does-not-exist')
            .expect(404);

        expect(response.text).to.not.include('FD Tone Notify Backend Service');
    });
});
