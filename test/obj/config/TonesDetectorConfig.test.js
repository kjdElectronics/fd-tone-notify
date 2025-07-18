const { expect } = require('chai');
const { TonesDetectorConfig } = require('../../../obj/config/TonesDetectorConfig');
const { ErrorWithStatusCode } = require('../../../util/ErrorWithStatusCode');

describe('TonesDetectorConfig', function() {
    describe('Constructor', function() {
        it('should create valid TonesDetectorConfig with required fields', function() {
            const config = new TonesDetectorConfig({
                name: 'Test Detector',
                tones: [800, 1200]
            });

            expect(config.name).to.equal('Test Detector');
            expect(config.tones).to.deep.equal([800, 1200]);
            expect(config.matchThreshold).to.equal(6);
            expect(config.tolerancePercent).to.equal(0.02);
        });

        it('should create valid TonesDetectorConfig with all fields', function() {
            const config = new TonesDetectorConfig({
                name: 'Test Detector',
                tones: [800, 1200, 400],
                matchThreshold: 8,
                tolerancePercent: 0.05,
                resetTimeoutMs: 5000,
                lockoutTimeoutMs: 3000,
                minRecordingLengthSec: 45,
                maxRecordingLengthSec: 60,
                isRecordingEnabled: true,
                notifications: {
                    preRecording: {
                        emails: [{
                            to: 'test@example.com',
                            subject: 'Test',
                            text: 'Test message'
                        }]
                    }
                }
            });

            expect(config.name).to.equal('Test Detector');
            expect(config.tones).to.deep.equal([800, 1200, 400]);
            expect(config.matchThreshold).to.equal(8);
            expect(config.tolerancePercent).to.equal(0.05);
            expect(config.resetTimeoutMs).to.equal(5000);
            expect(config.lockoutTimeoutMs).to.equal(3000);
            expect(config.minRecordingLengthSec).to.equal(45);
            expect(config.maxRecordingLengthSec).to.equal(60);
            expect(config.isRecordingEnabled).to.be.true;
            expect(config.notifications).to.exist;
        });

        it('should throw error for missing name', function() {
            expect(() => {
                new TonesDetectorConfig({
                    tones: [800, 1200]
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for empty tones array', function() {
            expect(() => {
                new TonesDetectorConfig({
                    name: 'Test Detector',
                    tones: []
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for invalid tone frequency', function() {
            expect(() => {
                new TonesDetectorConfig({
                    name: 'Test Detector',
                    tones: [800, -100]
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for tone frequency too high', function() {
            expect(() => {
                new TonesDetectorConfig({
                    name: 'Test Detector',
                    tones: [800, 25000]
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for invalid matchThreshold', function() {
            expect(() => {
                new TonesDetectorConfig({
                    name: 'Test Detector',
                    tones: [800, 1200],
                    matchThreshold: 0
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error for invalid tolerancePercent', function() {
            expect(() => {
                new TonesDetectorConfig({
                    name: 'Test Detector',
                    tones: [800, 1200],
                    tolerancePercent: 1.5
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should throw error when maxRecordingLengthSec < minRecordingLengthSec', function() {
            expect(() => {
                new TonesDetectorConfig({
                    name: 'Test Detector',
                    tones: [800, 1200],
                    minRecordingLengthSec: 60,
                    maxRecordingLengthSec: 30
                });
            }).to.throw(ErrorWithStatusCode).with.property('statusCode', 400);
        });

        it('should auto-calculate maxRecordingLengthSec when not provided', function() {
            const config = new TonesDetectorConfig({
                name: 'Test Detector',
                tones: [800, 1200],
                minRecordingLengthSec: 40
            });

            expect(config.maxRecordingLengthSec).to.equal(60); // 40 * 1.5
        });
    });


    describe('toJSON', function() {
        it('should convert to plain object', function() {
            const config = new TonesDetectorConfig({
                name: 'Test Detector',
                tones: [800, 1200],
                matchThreshold: 8,
                isRecordingEnabled: true
            });

            const obj = config.toJSON();
            expect(obj).to.have.property('name', 'Test Detector');
            expect(obj).to.have.property('tones').that.deep.equals([800, 1200]);
            expect(obj).to.have.property('matchThreshold', 8);
            expect(obj).to.have.property('isRecordingEnabled', true);
        });
    });

});