const fs = require('fs');
const path = require('path');
const { deleteAudioOlderThanDays } = require('../../util/recording.cleaner');
const expect = require('chai').expect;

describe('Recording Cleaner', function() {
    const testRecordingsDir = './test-recordings';
    
    beforeEach(function() {
        // Create test recordings directory
        if (!fs.existsSync(testRecordingsDir)) {
            fs.mkdirSync(testRecordingsDir);
        }
    });

    afterEach(function() {
        // Clean up test recordings directory
        if (fs.existsSync(testRecordingsDir)) {
            const files = fs.readdirSync(testRecordingsDir);
            files.forEach(file => {
                fs.unlinkSync(path.join(testRecordingsDir, file));
            });
            fs.rmdirSync(testRecordingsDir);
        }
    });

    it('should delete audio files older than specified days', function() {
        // Create test files with old timestamps
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10); // 10 days ago
        
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 3); // 3 days ago
        
        const oldWavFile = path.join(testRecordingsDir, 'old-recording.wav');
        const oldMp3File = path.join(testRecordingsDir, 'old-recording.mp3');
        const recentWavFile = path.join(testRecordingsDir, 'recent-recording.wav');
        const nonAudioFile = path.join(testRecordingsDir, 'readme.txt');
        
        // Create dummy files
        fs.writeFileSync(oldWavFile, 'dummy wav content');
        fs.writeFileSync(oldMp3File, 'dummy mp3 content');
        fs.writeFileSync(recentWavFile, 'dummy recent wav content');
        fs.writeFileSync(nonAudioFile, 'dummy text content');
        
        // Set file timestamps
        fs.utimesSync(oldWavFile, oldDate, oldDate);
        fs.utimesSync(oldMp3File, oldDate, oldDate);
        fs.utimesSync(recentWavFile, recentDate, recentDate);
        fs.utimesSync(nonAudioFile, oldDate, oldDate);
        
        // Verify files exist before cleanup
        expect(fs.existsSync(oldWavFile)).to.be.true;
        expect(fs.existsSync(oldMp3File)).to.be.true;
        expect(fs.existsSync(recentWavFile)).to.be.true;
        expect(fs.existsSync(nonAudioFile)).to.be.true;
        
        // Run the cleanup function with 7 days threshold on test directory
        deleteAudioOlderThanDays(7, testRecordingsDir);
        
        // Verify old audio files were deleted
        expect(fs.existsSync(oldWavFile)).to.be.false;
        expect(fs.existsSync(oldMp3File)).to.be.false;
        
        // Verify recent audio file was NOT deleted
        expect(fs.existsSync(recentWavFile)).to.be.true;
        
        // Verify non-audio file was NOT deleted
        expect(fs.existsSync(nonAudioFile)).to.be.true;
    });

    it('should throw error when recordings directory does not exist', function() {
        // Should throw an error when directory doesn't exist
        expect(() => deleteAudioOlderThanDays(7, './non-existent-directory')).to.throw('Recording Cleaner: Recordings directory does not exist: ./non-existent-directory. Unable to clean files');
    });

    it('should use default value of 7 days when no parameter provided', function() {
        // Create test files with 8-day old timestamps to verify default 7-day threshold
        const veryOldDate = new Date();
        veryOldDate.setDate(veryOldDate.getDate() - 8); // 8 days ago
        
        const oldTestFile = path.join(testRecordingsDir, 'very-old-recording.wav');
        fs.writeFileSync(oldTestFile, 'dummy content');
        fs.utimesSync(oldTestFile, veryOldDate, veryOldDate);
        
        // Verify file exists before cleanup
        expect(fs.existsSync(oldTestFile)).to.be.true;
        
        // Run cleanup with default 7-day threshold
        deleteAudioOlderThanDays(undefined, testRecordingsDir);
        
        // Verify file older than 7 days was deleted
        expect(fs.existsSync(oldTestFile)).to.be.false;
    });
    
    it('should handle zero days parameter to keep all recordings', function() {
        // Create test file with old timestamp
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 30); // 30 days ago
        
        const oldTestFile = path.join(testRecordingsDir, 'old-recording.wav');
        fs.writeFileSync(oldTestFile, 'dummy content');
        fs.utimesSync(oldTestFile, oldDate, oldDate);
        
        // Verify file exists before cleanup
        expect(fs.existsSync(oldTestFile)).to.be.true;
        
        // Run cleanup with 0 days (should keep all files)
        deleteAudioOlderThanDays(0, testRecordingsDir);
        
        // Verify file was NOT deleted
        expect(fs.existsSync(oldTestFile)).to.be.true;
    });
});