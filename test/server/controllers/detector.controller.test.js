/**
 * Integration tests for detector controller
 * 
 * These tests focus on API integration with mocked config file operations
 * to verify validation logic and HTTP responses work correctly.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const request = require('supertest');
const express = require('express');

// Setup stubs BEFORE importing modules to handle middleware/route dependencies
const configUtil = require('../../../server/util/config.file.util');
const authMiddleware = require('../../../server/middleware/auth.middleware');

// Create global stubs for config operations to handle destructured imports
const globalConfigStubs = {
    readConfigFile: sinon.stub(configUtil, 'readConfigFile'),
    createBackup: sinon.stub(configUtil, 'createBackup'),
    writeConfigFile: sinon.stub(configUtil, 'writeConfigFile'),
    markConfigChanged: sinon.stub(configUtil, 'markConfigChanged')
};

// Stub the authentication middleware globally before routes are imported
const authStub = sinon.stub(authMiddleware, 'authenticate');
authStub.callsFake((req, res, next) => {
    req.user = { id: 'test-user', role: 'admin' };
    req.app = { wss: { broadcastLog: sinon.stub() } };
    next();
});

// NOW import the routes after middleware is stubbed
const detectorRoutes = require('../../../server/routes/detector');

// Import test fixtures
const {
    mockConfigData,
    validDetectorData,
    emailValidationTestCases,
    invalidDetectorTestCases,
    mockAuthMiddleware,
    expectedResponseFormat
} = require('../../fixtures/detector-test-data');

describe('Detector Controller Integration Tests', function() {
    let app;

    // Setup test Express app
    beforeEach(function() {
        app = express();
        app.use(express.json());
        app.use('/detectors', detectorRoutes);

        // Reset and configure global stubs with fresh data for each test
        globalConfigStubs.readConfigFile.resetHistory();
        globalConfigStubs.createBackup.resetHistory();
        globalConfigStubs.writeConfigFile.resetHistory();
        globalConfigStubs.markConfigChanged.resetHistory();
        
        // Set up mock behavior with fresh config data
        globalConfigStubs.readConfigFile.resolves(JSON.parse(JSON.stringify(mockConfigData)));
        globalConfigStubs.createBackup.resolves();
        globalConfigStubs.writeConfigFile.resolves();
        globalConfigStubs.markConfigChanged.returns();
    });

    afterEach(function() {
        sinon.restore();
    });

    describe('GET /detectors', function() {
        it('should return all detectors from config', async function() {
            const response = await request(app)
                .get('/detectors')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('detectors');
            expect(response.body).to.have.property('count', 1);
            expect(response.body).to.have.property('timestamp');
            expect(response.body.detectors).to.be.an('array');
            expect(response.body.detectors[0]).to.have.property('name', 'Existing Test Detector');

            // Verify config file was read
            expect(globalConfigStubs.readConfigFile.calledOnce).to.be.true;
        });

        it('should handle config read error gracefully', async function() {
            globalConfigStubs.readConfigFile.rejects(new Error('Config file not found'));

            const response = await request(app)
                .get('/detectors')
                .expect(500);

            expect(response.body).to.have.property('success', false);
            expect(response.body).to.have.property('error', 'Failed to retrieve detectors');
            expect(response.body).to.have.property('details', 'Config file not found');
        });

        it('should return empty array when no detectors configured', async function() {
            const emptyConfig = { detection: { detectors: [] } };
            globalConfigStubs.readConfigFile.resolves(emptyConfig);

            const response = await request(app)
                .get('/detectors')
                .expect(200);

            expect(response.body.detectors).to.be.an('array').that.is.empty;
            expect(response.body.count).to.equal(0);
        });
    });

    describe('POST /detectors - Email Validation Tests', function() {
        emailValidationTestCases.forEach(testCase => {
            if (testCase.shouldFail) {
                it(testCase.name, async function() {
                    const response = await request(app)
                        .post('/detectors')
                        .send(testCase.emailData)
                        .expect(400);

                    expect(response.body).to.have.property('success', false);
                    expect(response.body).to.have.property('error', 'Validation failed');
                    expect(response.body).to.have.property('details').that.is.an('array');
                    
                    const errorMessages = response.body.details.join(' ');
                    expect(errorMessages).to.include(testCase.expectedError);

                    // Verify config file operations were NOT called due to validation failure
                    expect(globalConfigStubs.createBackup.called).to.be.false;
                    expect(globalConfigStubs.writeConfigFile.called).to.be.false;
                });
            } else {
                it(testCase.name, async function() {
                    const response = await request(app)
                        .post('/detectors')
                        .send(testCase.emailData)
                        .expect(200);

                    expect(response.body).to.have.property('success', true);
                    expect(response.body).to.have.property('detector');

                    // Verify config file operations were called
                    expect(globalConfigStubs.createBackup.calledOnce).to.be.true;
                    expect(globalConfigStubs.readConfigFile.calledOnce).to.be.true;
                    expect(globalConfigStubs.writeConfigFile.calledOnce).to.be.true;
                    expect(globalConfigStubs.markConfigChanged.calledOnce).to.be.true;
                });
            }
        });
    });

    describe('POST /detectors - General Validation Tests', function() {
        invalidDetectorTestCases.forEach(testCase => {
            it(testCase.name, async function() {
                const response = await request(app)
                    .post('/detectors')
                    .send(testCase.data)
                    .expect(400);

                expect(response.body).to.have.property('success', false);
                expect(response.body).to.have.property('error', 'Validation failed');
                expect(response.body).to.have.property('details').that.is.an('array');
                
                const errorMessages = response.body.details.join(' ');
                expect(errorMessages).to.include(testCase.expectedError);
            });
        });

        it('should create valid detector successfully', async function() {
            const response = await request(app)
                .post('/detectors')
                .send(validDetectorData)
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('message', 'Detector created successfully');
            expect(response.body).to.have.property('detector');
            expect(response.body).to.have.property('timestamp');

            // Verify the created detector has expected properties
            const createdDetector = response.body.detector;
            expect(createdDetector).to.have.property('name', validDetectorData.name);
            expect(createdDetector).to.have.property('tones').that.deep.equals(validDetectorData.tones);

            // Verify all config operations were called in correct order
            expect(globalConfigStubs.createBackup.calledOnce).to.be.true;
            expect(globalConfigStubs.readConfigFile.calledOnce).to.be.true;
            expect(globalConfigStubs.writeConfigFile.calledOnce).to.be.true;
            expect(globalConfigStubs.markConfigChanged.calledOnce).to.be.true;

            // Verify the write operation was called with updated config
            const writeCall = globalConfigStubs.writeConfigFile.getCall(0);
            const updatedConfig = writeCall.args[0];
            expect(updatedConfig.detection.detectors).to.have.length(2); // Original + new
            expect(updatedConfig.detection.detectors[1]).to.have.property('name', validDetectorData.name);
        });

        it('should reject duplicate detector names', async function() {
            const duplicateDetector = {
                ...validDetectorData,
                name: 'Existing Test Detector' // Same as in mock data
            };

            const response = await request(app)
                .post('/detectors')
                .send(duplicateDetector)
                .expect(400);

            expect(response.body).to.have.property('success', false);
            expect(response.body).to.have.property('error', 'Detector name already exists');
            expect(response.body.details).to.include('Existing Test Detector');
        });

        it('should handle config write failure', async function() {
            globalConfigStubs.writeConfigFile.rejects(new Error('Disk full'));

            const response = await request(app)
                .post('/detectors')
                .send(validDetectorData)
                .expect(500);

            expect(response.body).to.have.property('success', false);
            expect(response.body).to.have.property('error', 'Failed to create detector');
            expect(response.body).to.have.property('details', 'Disk full');
        });
    });

    describe('PUT /detectors/:id', function() {
        it('should update existing detector successfully', async function() {
            const updateData = {
                name: 'Updated Test Detector',
                matchThreshold: 10
            };

            const response = await request(app)
                .put('/detectors/0')
                .send(updateData)
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('message', 'Detector updated successfully');
            expect(response.body).to.have.property('detector');

            const updatedDetector = response.body.detector;
            expect(updatedDetector).to.have.property('name', updateData.name);
            expect(updatedDetector).to.have.property('matchThreshold', updateData.matchThreshold);

            // Verify config operations
            expect(globalConfigStubs.createBackup.calledOnce).to.be.true;
            expect(globalConfigStubs.writeConfigFile.calledOnce).to.be.true;
        });

        it('should reject update with invalid email', async function() {
            const updateData = {
                notifications: {
                    preRecording: {
                        emails: [{
                            to: 'no@t',
                            subject: 'Test'
                        }]
                    }
                }
            };

            const response = await request(app)
                .put('/detectors/0')
                .send(updateData)
                .expect(400);

            expect(response.body).to.have.property('success', false);
            expect(response.body).to.have.property('error', 'Validation failed');
            
            const errorMessages = response.body.details.join(' ');
            expect(errorMessages).to.include('"no@t" is not valid');
        });

        it('should return 404 for non-existent detector index', async function() {
            const response = await request(app)
                .put('/detectors/999')
                .send({ name: 'Test' })
                .expect(404);

            expect(response.body).to.have.property('success', false);
            expect(response.body).to.have.property('error', 'Detector not found');
        });
    });

    describe('DELETE /detectors/:id', function() {
        it('should delete detector successfully', async function() {
            const response = await request(app)
                .delete('/detectors/0')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('message', 'Detector deleted successfully');
            expect(response.body).to.have.property('deletedDetector');
            expect(response.body.deletedDetector).to.have.property('name', 'Existing Test Detector');

            // Verify config operations
            expect(globalConfigStubs.createBackup.calledOnce).to.be.true;
            expect(globalConfigStubs.writeConfigFile.calledOnce).to.be.true;
            expect(globalConfigStubs.markConfigChanged.calledOnce).to.be.true;
        });

        it('should return 404 for non-existent detector index', async function() {
            const response = await request(app)
                .delete('/detectors/999')
                .expect(404);

            expect(response.body).to.have.property('success', false);
            expect(response.body).to.have.property('error', 'Detector not found');
        });
    });

    describe('Integration Edge Cases', function() {
        it('should handle malformed JSON in request body', async function() {
            const response = await request(app)
                .post('/detectors')
                .send('malformed json')
                .expect(400);

            // Express should handle JSON parsing errors before our controller
        });

        it('should handle empty request body', async function() {
            const response = await request(app)
                .post('/detectors')
                .send({})
                .expect(400);

            expect(response.body).to.have.property('success', false);
            expect(response.body).to.have.property('error', 'Validation failed');
        });

        it('should handle null request body', async function() {
            const response = await request(app)
                .post('/detectors')
                .send(null)
                .expect(400);

            expect(response.body).to.have.property('success', false);
            expect(response.body).to.have.property('error', 'Validation failed');
            // Express converts null to {}, so we get the empty object validation errors
            expect(response.body.details).to.include('Detector name is required and must be a non-empty string');
        });
    });

    describe('Mock Verification', function() {
        it('should verify all mocks are properly configured', function() {
            // Verify all required stubs exist
            expect(globalConfigStubs.readConfigFile).to.be.a('function');
            expect(globalConfigStubs.createBackup).to.be.a('function');
            expect(globalConfigStubs.writeConfigFile).to.be.a('function');
            expect(globalConfigStubs.markConfigChanged).to.be.a('function');
        });

        it('should verify mock data structure is valid', function() {
            expect(mockConfigData).to.have.property('detection');
            expect(mockConfigData.detection).to.have.property('detectors').that.is.an('array');
            expect(validDetectorData).to.have.property('name');
            expect(validDetectorData).to.have.property('tones').that.is.an('array');
        });
    });
});