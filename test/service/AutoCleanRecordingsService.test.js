const AutoCleanRecordingsService = require('../../service/AutoCleanRecordingsService');
const fs = require('fs');
const path = require('path');
const expect = require('chai').expect;

describe('AutoCleanRecordingsService', function() {
    const testRecordingsDir = './test-auto-clean-recordings';
    let service;
    
    beforeEach(function() {
        // Create test recordings directory
        if (!fs.existsSync(testRecordingsDir)) {
            fs.mkdirSync(testRecordingsDir);
        }
    });

    afterEach(function() {
        // Stop service if running
        if (service && service.isRunning) {
            service.stop();
        }
        
        // Clean up test recordings directory
        if (fs.existsSync(testRecordingsDir)) {
            const files = fs.readdirSync(testRecordingsDir);
            files.forEach(file => {
                fs.unlinkSync(path.join(testRecordingsDir, file));
            });
            fs.rmdirSync(testRecordingsDir);
        }
    });

    it('should initialize with correct parameters', function() {
        service = new AutoCleanRecordingsService(testRecordingsDir, 5);
        
        expect(service.recordingDirectory).to.equal(testRecordingsDir);
        expect(service.autoDeleteOlderThanDays).to.equal(5);
        expect(service.isRunning).to.be.false;
        expect(service.cronInterval).to.be.null;
    });

    it('should start and stop service correctly', function() {
        service = new AutoCleanRecordingsService(testRecordingsDir, 5);
        
        // Start service
        service.start();
        expect(service.isRunning).to.be.true;
        expect(service.cronInterval).to.not.be.null;
        
        // Stop service
        service.stop();
        expect(service.isRunning).to.be.false;
        expect(service.cronInterval).to.be.null;
    });

    it('should not start twice', function() {
        service = new AutoCleanRecordingsService(testRecordingsDir, 5);
        
        service.start();
        const firstInterval = service.cronInterval;
        
        // Try to start again
        service.start();
        expect(service.cronInterval).to.equal(firstInterval);
    });

    it('should handle stop when not running', function() {
        service = new AutoCleanRecordingsService(testRecordingsDir, 5);
        
        // Try to stop without starting
        expect(() => service.stop()).to.not.throw();
        expect(service.isRunning).to.be.false;
    });

    it('should run cleanup manually', function() {
        // Create test files with old timestamps
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10); // 10 days ago
        
        const oldWavFile = path.join(testRecordingsDir, 'old-recording.wav');
        fs.writeFileSync(oldWavFile, 'dummy content');
        fs.utimesSync(oldWavFile, oldDate, oldDate);
        
        // Verify file exists
        expect(fs.existsSync(oldWavFile)).to.be.true;
        
        service = new AutoCleanRecordingsService(testRecordingsDir, 7);
        
        // Run cleanup manually
        service.runCleanup();
        
        // Verify file was deleted
        expect(fs.existsSync(oldWavFile)).to.be.false;
    });

    it('should get correct status', function() {
        service = new AutoCleanRecordingsService(testRecordingsDir, 5);
        
        let status = service.getStatus();
        expect(status.isRunning).to.be.false;
        expect(status.recordingDirectory).to.equal(testRecordingsDir);
        expect(status.autoDeleteOlderThanDays).to.equal(5);
        expect(status.nextCleanupTime).to.be.null;
        
        service.start();
        status = service.getStatus();
        expect(status.isRunning).to.be.true;
        expect(status.nextCleanupTime).to.not.be.null;
    });

    it('should handle cleanup errors gracefully', function() {
        // Create service with non-existent directory
        service = new AutoCleanRecordingsService('./non-existent-directory', 7);
        
        // Should not throw when cleanup fails
        expect(() => service.runCleanup()).to.not.throw();
    });

    it('should handle string autoDeleteOlderThanDays parameter', function() {
        service = new AutoCleanRecordingsService(testRecordingsDir, '5');
        
        expect(service.autoDeleteOlderThanDays).to.equal(5);
        expect(typeof service.autoDeleteOlderThanDays).to.equal('number');
    });
});