const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const upload = multer({
    dest: './temp-uploads/', // Temporary directory for uploads
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only WAV files for now
        if (file.mimetype === 'audio/wav' || path.extname(file.originalname).toLowerCase() === '.wav') {
            cb(null, true);
        } else {
            cb(new Error('Only WAV files are supported'), false);
        }
    }
});

// Ensure temp directory exists
if (!fs.existsSync('./temp-uploads/')) {
    fs.mkdirSync('./temp-uploads/', { recursive: true });
}

module.exports = { upload };