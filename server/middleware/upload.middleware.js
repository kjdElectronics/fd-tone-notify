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

// Configure multer for Rdio Scanner uploads (accepts 'audio' field name, broader MIME types)
const rdioUpload = multer({
    dest: './temp-uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept common audio formats that Rdio Scanner may send
        const allowedMimeTypes = [
            'audio/wav', 'audio/x-wav', 'audio/wave',
            'audio/mpeg', 'audio/mp3',
            'audio/ogg', 'audio/flac',
            'audio/x-m4a', 'audio/mp4'
        ];
        const allowedExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.m4a'];
        const ext = path.extname(file.originalname).toLowerCase();

        if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported audio format. Supported: WAV, MP3, OGG, FLAC, M4A'), false);
        }
    }
});

module.exports = { upload, rdioUpload };