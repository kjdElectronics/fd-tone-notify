/**
 * Test fixtures for detector controller integration tests
 */

/**
 * Mock configuration data for testing
 */
const mockConfigData = {
    detection: {
        detectors: [
            {
                name: 'Existing Test Detector',
                tones: [1200.5, 1400.0],
                matchThreshold: 6,
                tolerancePercent: 0.02,
                resetTimeoutMs: 5000,
                lockoutTimeoutMs: 7000,
                isRecordingEnabled: true,
                minRecordingLengthSec: 30,
                maxRecordingLengthSec: 45,
                notifications: {
                    preRecording: {
                        emails: [{
                            to: 'test@example.com',
                            subject: 'Tone Alert',
                            text: 'Tone detected for detector %d'
                        }],
                        pushbullet: [],
                        webhooks: [],
                        externalCommands: []
                    },
                    postRecording: {
                        emails: [],
                        pushbullet: [],
                        webhooks: [],
                        externalCommands: []
                    }
                }
            }
        ],
        defaultMatchThreshold: 6,
        defaultTolerancePercent: 0.02,
        defaultResetTimeoutMs: 5000,
        defaultLockoutTimeoutMs: 7000,
        isRecordingEnabled: true,
        minRecordingLengthSec: 30,
        maxRecordingLengthSec: 45
    },
    audio: {
        sampleRate: 44100,
        channels: 1,
        frequencyScaleFactor: 1.0
    }
};

/**
 * Valid detector data for testing creation
 */
const validDetectorData = {
    name: 'New Test Detector',
    tones: [1500.0, 1800.5],
    matchThreshold: 8,
    tolerancePercent: 0.03,
    resetTimeoutMs: 6000,
    lockoutTimeoutMs: 8000,
    isRecordingEnabled: true,
    minRecordingLengthSec: 25,
    maxRecordingLengthSec: 50,
    notifications: {
        preRecording: {
            emails: [{
                to: 'alert@firestation.com',
                subject: 'Fire Department Alert',
                text: 'Emergency tone detected for %d'
            }],
            pushbullet: [],
            webhooks: [],
            externalCommands: []
        },
        postRecording: {
            emails: [{
                to: 'admin@firestation.com, chief@firestation.com',
                bcc: 'backup@firestation.com',
                subject: 'Alert Completed',
                text: 'Alert sequence completed for %d'
            }],
            pushbullet: [],
            webhooks: [],
            externalCommands: []
        }
    }
};

/**
 * Test cases for email validation issues
 */
const emailValidationTestCases = [
    {
        name: 'should reject email "no@t" as invalid',
        emailData: {
            name: 'Test Detector',
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
        expectedError: '"no@t" is not valid',
        shouldFail: true
    },
    {
        name: 'should reject email "user@x" as invalid',
        emailData: {
            name: 'Test Detector',
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
        expectedError: '"user@x" is not valid',
        shouldFail: true
    },
    {
        name: 'should reject email "test@localhost" as invalid',
        emailData: {
            name: 'Test Detector',
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
        expectedError: '"test@localhost" is not valid',
        shouldFail: true
    },
    {
        name: 'should reject invalid email format "invalid-email"',
        emailData: {
            name: 'Test Detector',
            tones: [1200],
            notifications: {
                preRecording: {
                    emails: [{
                        to: 'invalid-email',
                        subject: 'Test'
                    }]
                }
            }
        },
        expectedError: '"invalid-email" is not valid',
        shouldFail: true
    },
    {
        name: 'should reject email with missing local part "@domain.com"',
        emailData: {
            name: 'Test Detector',
            tones: [1200],
            notifications: {
                preRecording: {
                    emails: [{
                        to: '@domain.com',
                        subject: 'Test'
                    }]
                }
            }
        },
        expectedError: '"@domain.com" is not valid',
        shouldFail: true
    },
    {
        name: 'should reject email with missing domain "user@"',
        emailData: {
            name: 'Test Detector',
            tones: [1200],
            notifications: {
                preRecording: {
                    emails: [{
                        to: 'user@',
                        subject: 'Test'
                    }]
                }
            }
        },
        expectedError: '"user@" is not valid',
        shouldFail: true
    },
    {
        name: 'should accept valid email "test@example.com"',
        emailData: {
            name: 'Test Detector',
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
        name: 'should accept valid email with subdomain "user@mail.example.org"',
        emailData: {
            name: 'Test Detector',
            tones: [1200],
            notifications: {
                preRecording: {
                    emails: [{
                        to: 'user@mail.example.org',
                        subject: 'Test'
                    }]
                }
            }
        },
        shouldFail: false
    },
    {
        name: 'should accept multiple valid emails',
        emailData: {
            name: 'Test Detector',
            tones: [1200],
            notifications: {
                preRecording: {
                    emails: [{
                        to: 'admin@example.com, user@test.org',
                        bcc: 'backup@example.net',
                        subject: 'Test'
                    }]
                }
            }
        },
        shouldFail: false
    },
    {
        name: 'should reject duplicate emails',
        emailData: {
            name: 'Test Detector',
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
        expectedError: 'contains duplicate addresses',
        shouldFail: true
    }
];

/**
 * Invalid detector data for testing validation errors
 */
const invalidDetectorTestCases = [
    {
        name: 'should reject detector without name',
        data: {
            tones: [1200]
        },
        expectedError: 'Detector name is required'
    },
    {
        name: 'should reject detector without tones',
        data: {
            name: 'Test Detector'
        },
        expectedError: 'Tones array is required'
    },
    {
        name: 'should reject detector with invalid tone frequency',
        data: {
            name: 'Test Detector',
            tones: [50] // Below minimum 100 Hz
        },
        expectedError: 'must be a number between 100 and 4000 Hz'
    },
    {
        name: 'should reject detector with negative match threshold',
        data: {
            name: 'Test Detector',
            tones: [1200],
            matchThreshold: -1
        },
        expectedError: 'Match threshold must be a positive number'
    },
    {
        name: 'should reject detector with invalid tolerance',
        data: {
            name: 'Test Detector',
            tones: [1200],
            tolerancePercent: 1.5 // Above maximum 1.0
        },
        expectedError: 'Tolerance percent must be a number between 0 and 1'
    },
    {
        name: 'should reject detector with min recording > max recording',
        data: {
            name: 'Test Detector',
            tones: [1200],
            minRecordingLengthSec: 50,
            maxRecordingLengthSec: 30
        },
        expectedError: 'Minimum recording length must be less than maximum recording length'
    }
];

/**
 * Mock authentication middleware that bypasses auth for testing
 */
const mockAuthMiddleware = (req, res, next) => {
    // Simulate authenticated request
    req.user = { id: 'test-user', role: 'admin' };
    next();
};

/**
 * Expected response format for successful operations
 * Note: expect.any() should be used in test files, not fixtures
 */
const expectedResponseFormat = {
    success: true,
    message: 'string',
    timestamp: 'string'
};

module.exports = {
    mockConfigData,
    validDetectorData,
    emailValidationTestCases,
    invalidDetectorTestCases,
    mockAuthMiddleware,
    expectedResponseFormat
};