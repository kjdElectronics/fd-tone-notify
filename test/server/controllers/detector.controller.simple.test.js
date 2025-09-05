/**
 * Simplified integration tests for detector controller validation
 * These tests focus specifically on the validation logic by testing the controller functions directly
 */

const { expect } = require('chai');
const sinon = require('sinon');

// Setup stubs BEFORE importing controller to handle destructured imports
const configUtil = require('../../../server/util/config.file.util');

// Setup global stubs that will affect destructured imports
const configStubs = {
    readConfigFile: sinon.stub(configUtil, 'readConfigFile'),
    createBackup: sinon.stub(configUtil, 'createBackup'),
    writeConfigFile: sinon.stub(configUtil, 'writeConfigFile'),
    markConfigChanged: sinon.stub(configUtil, 'markConfigChanged')
};

// NOW import the controller after stubs are in place
const detectorController = require('../../../server/controllers/detector.controller');

// Import test fixtures
const { mockConfigData } = require('../../fixtures/detector-test-data');

describe('Detector Controller Validation Tests (Direct)', function() {
    let mockReq, mockRes;

    beforeEach(function() {
        // Default mock behavior - reset for each test to avoid state issues
        configStubs.readConfigFile.resolves(JSON.parse(JSON.stringify(mockConfigData)));
        configStubs.createBackup.resolves();
        configStubs.writeConfigFile.resolves();
        configStubs.markConfigChanged.returns();

        // Setup mock request and response objects
        mockReq = {
            body: {},
            app: { wss: { broadcastLog: sinon.stub() } },
            user: { id: 'test-user' },
            ip: '127.0.0.1'
        };

        mockRes = {
            status: sinon.stub().returnsThis(),
            json: sinon.stub().returnsThis()
        };
    });

    afterEach(function() {
        sinon.restore();
    });

    describe('Email Validation in Controller', function() {
        const emailValidationTestCases = [
            {
                name: 'should reject email "no@t" as invalid',
                detectorData: {
                    name: 'Email Test Detector 1',
                    tones: [1200],
                    notifications: {
                        preRecording: {
                            emails: [{
                                to: 'no@t',
                                subject: 'Test'
                            }]
                        }
                    }
                },
                shouldFail: true,
                expectedError: '"no@t" is not valid'
            },
            {
                name: 'should reject email "user@x" as invalid',
                detectorData: {
                    name: 'Email Test Detector 2',
                    tones: [1200],
                    notifications: {
                        preRecording: {
                            emails: [{
                                to: 'user@x',
                                subject: 'Test'
                            }]
                        }
                    }
                },
                shouldFail: true,
                expectedError: '"user@x" is not valid'
            },
            {
                name: 'should reject email "test@localhost" as invalid',
                detectorData: {
                    name: 'Email Test Detector 3',
                    tones: [1200],
                    notifications: {
                        preRecording: {
                            emails: [{
                                to: 'test@localhost',
                                subject: 'Test'
                            }]
                        }
                    }
                },
                shouldFail: true,
                expectedError: '"test@localhost" is not valid'
            },
            {
                name: 'should accept valid email "test@example.com"',
                detectorData: {
                    name: 'Valid Email Test Detector - ' + Date.now(),
                    tones: [1200],
                    notifications: {
                        preRecording: {
                            emails: [{
                                to: 'test@example.com',
                                subject: 'Test'
                            }]
                        }
                    }
                },
                shouldFail: false
            },
            {
                name: 'should reject duplicate emails',
                detectorData: {
                    name: 'Email Test Detector 5',
                    tones: [1200],
                    notifications: {
                        preRecording: {
                            emails: [{
                                to: 'test@example.com, Test@Example.com',
                                subject: 'Test'
                            }]
                        }
                    }
                },
                shouldFail: true,
                expectedError: 'contains duplicate addresses'
            }
        ];

        emailValidationTestCases.forEach(testCase => {
            it(testCase.name, async function() {
                // Reset mock configuration for each test to avoid state pollution
                configStubs.readConfigFile.resolves(JSON.parse(JSON.stringify(mockConfigData)));
                
                // Reset all stub histories
                configStubs.createBackup.resetHistory();
                configStubs.writeConfigFile.resetHistory();
                configStubs.markConfigChanged.resetHistory();
                mockRes.status.resetHistory();
                mockRes.json.resetHistory();
                
                mockReq.body = testCase.detectorData;

                await detectorController.createDetector(mockReq, mockRes);

                if (testCase.shouldFail) {
                    // Should return 400 status
                    expect(mockRes.status.calledWith(400)).to.be.true;
                    
                    // Check that response contains validation error
                    expect(mockRes.json.calledOnce).to.be.true;
                    const response = mockRes.json.getCall(0).args[0];
                    
                    expect(response).to.have.property('success', false);
                    expect(response).to.have.property('error', 'Validation failed');
                    expect(response).to.have.property('details').that.is.an('array');
                    
                    const errorMessages = response.details.join(' ');
                    expect(errorMessages).to.include(testCase.expectedError);
                    
                    // Verify config operations were NOT called due to validation failure
                    expect(configStubs.createBackup.called).to.be.false;
                    expect(configStubs.writeConfigFile.called).to.be.false;
                } else {
                    // Should return 200 status for valid data
                    expect(mockRes.status.calledWith(400)).to.be.false;
                    expect(mockRes.json.calledOnce).to.be.true;
                    const response = mockRes.json.getCall(0).args[0];
                    
                    expect(response).to.have.property('success', true);
                    
                    // Verify config operations were called
                    expect(configStubs.createBackup.calledOnce).to.be.true;
                    expect(configStubs.writeConfigFile.calledOnce).to.be.true;
                }
            });
        });
    });

    describe('General Validation Tests', function() {
        const validationTestCases = [
            {
                name: 'should reject detector without name',
                data: { tones: [1200] },
                expectedError: 'Detector name is required'
            },
            {
                name: 'should reject detector without tones',
                data: { name: 'General Test Detector 1' },
                expectedError: 'Tones array is required'
            },
            {
                name: 'should reject detector with invalid tone frequency',
                data: {
                    name: 'General Test Detector 2',
                    tones: [50] // Below minimum 100 Hz
                },
                expectedError: 'must be a number between 100 and 4000 Hz'
            }
        ];

        validationTestCases.forEach(testCase => {
            it(testCase.name, async function() {
                mockReq.body = testCase.data;

                await detectorController.createDetector(mockReq, mockRes);

                // Should return 400 status
                expect(mockRes.status.calledWith(400)).to.be.true;
                
                const response = mockRes.json.getCall(0).args[0];
                expect(response).to.have.property('success', false);
                expect(response).to.have.property('error', 'Validation failed');
                
                const errorMessages = response.details.join(' ');
                expect(errorMessages).to.include(testCase.expectedError);
            });
        });
    });

    describe('Successful Operations', function() {
        it('should create valid detector successfully', async function() {
            const validDetector = {
                name: 'Valid Test Detector',
                tones: [1200.5, 1400.0],
                matchThreshold: 8,
                notifications: {
                    preRecording: {
                        emails: [{
                            to: 'valid@example.com',
                            subject: 'Test Alert'
                        }]
                    }
                }
            };

            mockReq.body = validDetector;

            await detectorController.createDetector(mockReq, mockRes);

            // Should return success
            expect(mockRes.json.calledOnce).to.be.true;
            const response = mockRes.json.getCall(0).args[0];
            
            expect(response).to.have.property('success', true);
            expect(response).to.have.property('detector');
            expect(response).to.have.property('message', 'Detector created successfully');

            // Verify config operations were called
            expect(configStubs.createBackup.calledOnce).to.be.true;
            expect(configStubs.readConfigFile.callCount).gte(1);
            expect(configStubs.writeConfigFile.calledOnce).to.be.true;
            expect(configStubs.markConfigChanged.calledOnce).to.be.true;
        });
    });
});