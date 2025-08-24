const config = require('config');
const fs = require('fs').promises;
const path = require('path');
const log = require('../../util/logger');

// Paths for configuration files
const PROJECT_ROOT = path.join(__dirname, '../..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');

// Determine which config file to use based on NODE_ENV
function getConfigFilePath() {
    const nodeEnv = process.env.NODE_ENV || 'default';
    return path.join(CONFIG_DIR, `${nodeEnv}.json`);
}

// Get secrets file path (can be overridden by command line args)
function getSecretsFilePath() {
    // Check if a custom secrets path was provided (this would need to be stored globally)
    // For now, default to secrets.json
    return path.join(CONFIG_DIR, 'secrets.json');
}

/**
 * Get system configuration for UI
 */
async function getConfiguration(req, res) {
    try {
        // Read current config file and secrets
        const configData = await readConfigFile();
        const secretsData = await readSecretsFile();

        res.json({
            success: true,
            configuration: configData,
            secrets: secretsData,
            configFile: getConfigFilePath(),
            secretsFile: getSecretsFilePath(),
            lastModified: new Date().toISOString()
        });
    } catch (error) {
        log.error(`API configuration error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to read configuration',
            details: error.message
        });
    }
}

/**
 * Update system configuration
 */
async function updateConfig(req, res) {
    try {
        const { configuration, restartBackend = false } = req.body;

        if (!configuration) {
            return res.status(400).json({
                success: false,
                error: 'Configuration data is required'
            });
        }

        // Validate configuration
        const validationErrors = validateConfigurationData(configuration);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validationErrors
            });
        }

        // Create backup
        await createBackup();

        // Read current config and secrets
        const configData = await readConfigFile();
        const secretsData = await readSecretsFile();

        // Update config data with new values
        updateConfigFromData(configData, configuration);
        
        // Update secrets data with new values
        updateSecretsFromData(secretsData, configuration);

        // Write updated files
        await writeConfigFile(configData);
        await writeSecretsFile(secretsData);

        log.info('Configuration updated successfully');

        // Broadcast to WebSocket clients if available
        if (req.app.wss && req.app.wss.broadcastLog) {
            req.app.wss.broadcastLog('info', 'System configuration updated', {
                updatedKeys: Object.keys(configuration)
            });
        }

        res.json({
            success: true,
            message: 'Configuration updated successfully',
            timestamp: new Date().toISOString(),
            updatedKeys: Object.keys(configuration)
        });

        // Note: Restart functionality would need to be implemented separately
        if (restartBackend) {
            log.info('Backend restart requested but not implemented');
        }

    } catch (error) {
        log.error(`Failed to update configuration: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration',
            details: error.message
        });
    }
}

// Helper functions for config file operations

async function readConfigFile() {
    try {
        const configPath = getConfigFilePath();
        const data = await fs.readFile(configPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        log.warn(`Failed to read config file: ${error.message}`);
        return {};
    }
}

async function readSecretsFile() {
    try {
        const secretsPath = getSecretsFilePath();
        const data = await fs.readFile(secretsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        log.warn(`Failed to read secrets file: ${error.message}`);
        return {};
    }
}

async function writeConfigFile(configData) {
    const configPath = getConfigFilePath();
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
    log.debug(`Config written to ${configPath}`);
}

async function writeSecretsFile(secretsData) {
    const secretsPath = getSecretsFilePath();
    await fs.writeFile(secretsPath, JSON.stringify(secretsData, null, 2));
    log.debug(`Secrets written to ${secretsPath}`);
}

//TODO - This is Horrible
function updateConfigFromData(configData, configurationData) {
    // Audio settings
    if (configurationData.FD_INPUT_DEVICE !== undefined) {
        configData.audio = configData.audio || {};
        configData.audio.inputDevice = configurationData.FD_INPUT_DEVICE || configData.audio.inputDevice;
    }
    if (configurationData.FD_SAMPLE_RATE !== undefined) {
        configData.audio = configData.audio || {};
        configData.audio.sampleRate = parseInt(configurationData.FD_SAMPLE_RATE) || configData.audio.sampleRate;
    }
    if (configurationData.FD_CHANNELS !== undefined) {
        configData.audio = configData.audio || {};
        configData.audio.channels = parseInt(configurationData.FD_CHANNELS) || configData.audio.channels;
    }
    if (configurationData.FD_FREQ_SCALE_FACTOR !== undefined) {
        configData.audio = configData.audio || {};
        configData.audio.frequencyScaleFactor = parseFloat(configurationData.FD_FREQ_SCALE_FACTOR) || configData.audio.frequencyScaleFactor;
    }
    if (configurationData.FD_SILENCE_AMPLITUDE !== undefined) {
        configData.audio = configData.audio || {};
        configData.audio.silenceAmplitude = parseFloat(configurationData.FD_SILENCE_AMPLITUDE) || configData.audio.silenceAmplitude;
    }
    if (configurationData.FD_RECORDING_SCALE_FACTOR !== undefined) {
        configData.audio = configData.audio || {};
        configData.audio.recordingScaleFactor = parseFloat(configurationData.FD_RECORDING_SCALE_FACTOR) || configData.audio.recordingScaleFactor;
    }
    
    // Recording settings
    if (configurationData.FD_RECORDING_DIRECTORY !== undefined) {
        configData.recording = configData.recording || {};
        configData.recording.directory = configurationData.FD_RECORDING_DIRECTORY || configData.recording.directory;
    }
    if (configurationData.FD_MIN_RECORDING_LENGTH_SEC !== undefined) {
        configData.detection = configData.detection || {};
        configData.detection.minRecordingLengthSec = parseInt(configurationData.FD_MIN_RECORDING_LENGTH_SEC) || configData.detection.minRecordingLengthSec;
    }
    if (configurationData.FD_AUTO_DELETE_RECORDINGS_OLDER_THAN_DAYS !== undefined) {
        configData.recording = configData.recording || {};
        configData.recording.autoDeleteOlderThanDays = parseInt(configurationData.FD_AUTO_DELETE_RECORDINGS_OLDER_THAN_DAYS) || configData.recording.autoDeleteOlderThanDays;
    }
    if (configurationData.FD_MAX_RECORDING_LENGTH_SEC !== undefined) {
        configData.detection = configData.detection || {};
        configData.detection.maxRecordingLengthSec = parseInt(configurationData.FD_MAX_RECORDING_LENGTH_SEC) || configData.detection.maxRecordingLengthSec;
    }
    
    // Detection settings
    if (configurationData.FD_DEFAULT_MATCH_THRESHOLD !== undefined) {
        configData.detection = configData.detection || {};
        configData.detection.defaultMatchThreshold = parseInt(configurationData.FD_DEFAULT_MATCH_THRESHOLD) || configData.detection.defaultMatchThreshold;
    }
    if (configurationData.FD_CLARITY_THRESHOLD !== undefined) {
        configData.detection = configData.detection || {};
        configData.detection.clarityThreshold = parseFloat(configurationData.FD_CLARITY_THRESHOLD) || configData.detection.clarityThreshold;
    }
    if (configurationData.FD_DEFAULT_TOLERANCE_PERCENT !== undefined) {
        configData.detection = configData.detection || {};
        configData.detection.defaultTolerancePercent = parseFloat(configurationData.FD_DEFAULT_TOLERANCE_PERCENT) || configData.detection.defaultTolerancePercent;
    }
    if (configurationData.FD_DEFAULT_RESET_TIMEOUT_MS !== undefined) {
        configData.detection = configData.detection || {};
        configData.detection.defaultResetTimeoutMs = parseInt(configurationData.FD_DEFAULT_RESET_TIMEOUT_MS) || configData.detection.defaultResetTimeoutMs;
    }
    if (configurationData.FD_DEFAULT_LOCKOUT_TIMEOUT_MS !== undefined) {
        configData.detection = configData.detection || {};
        configData.detection.defaultLockoutTimeoutMs = parseInt(configurationData.FD_DEFAULT_LOCKOUT_TIMEOUT_MS) || configData.detection.defaultLockoutTimeoutMs;
    }
    if (configurationData.FD_IS_RECORDING_ENABLED !== undefined) {
        configData.detection = configData.detection || {};
        configData.detection.isRecordingEnabled = Boolean(configurationData.FD_IS_RECORDING_ENABLED);
    }
    
    // Email settings
    if (configurationData.FD_EMAIL_FROM !== undefined) {
        configData.email = configData.email || {};
        configData.email.from = configurationData.FD_EMAIL_FROM || configData.email.from;
    }
    if (configurationData.FD_SMTP_HOST !== undefined) {
        configData.email = configData.email || {};
        configData.email.host = configurationData.FD_SMTP_HOST || configData.email.host;
    }
    if (configurationData.FD_SMTP_PORT !== undefined) {
        configData.email = configData.email || {};
        configData.email.port = parseInt(configurationData.FD_SMTP_PORT) || configData.email.port;
    }
    if (configurationData.FD_SMTP_SECURE !== undefined) {
        configData.email = configData.email || {};
        configData.email.secure = Boolean(configurationData.FD_SMTP_SECURE);
    }
    
    // Coralogix settings
    if (configurationData.FD_CORALOGIX_APPLICATION_NAME !== undefined) {
        configData.coralogix = configData.coralogix || {};
        configData.coralogix.applicationName = configurationData.FD_CORALOGIX_APPLICATION_NAME || configData.coralogix.applicationName;
    }
    if (configurationData.FD_CORALOGIX_SUBSYSTEM_NAME !== undefined) {
        configData.coralogix = configData.coralogix || {};
        configData.coralogix.subsystemName = configurationData.FD_CORALOGIX_SUBSYSTEM_NAME || configData.coralogix.subsystemName;
    }
}

function updateSecretsFromData(secretsData, configurationData) {
    const secretKeys = [
        'FD_SMTP_USERNAME', 'FD_SMTP_PASSWORD', 'FD_PUSHBULLET_API_KEY', 
        'FD_CORALOGIX_PRIVATE_KEY', 'UI_PASSWORD', 'AWS_ACCESS_KEY_ID', 
        'AWS_SECRET_ACCESS_KEY_ID', 'BUCKET_NAME'
    ];
    
    for (const key of secretKeys) {
        if (configurationData[key] !== undefined && configurationData[key] !== '') {
            secretsData[key] = configurationData[key];
        }
    }
}

function validateConfigurationData(configData) {
    const errors = [];
    
    // Validate sample rate
    if (configData.FD_SAMPLE_RATE && (isNaN(configData.FD_SAMPLE_RATE) || configData.FD_SAMPLE_RATE < 8000)) {
        errors.push('FD_SAMPLE_RATE must be a number >= 8000');
    }
    
    // Validate channels
    if (configData.FD_CHANNELS && ![1, 2].includes(parseInt(configData.FD_CHANNELS))) {
        errors.push('FD_CHANNELS must be 1 or 2');
    }
    
    // Validate port
    if (configData.FD_PORT) {
        const port = parseInt(configData.FD_PORT);
        if (isNaN(port) || port < 1024 || port > 65535) {
            errors.push('FD_PORT must be a number between 1024 and 65535');
        }
    }
    
    // Validate email format
    if (configData.FD_EMAIL_FROM && !isValidEmail(configData.FD_EMAIL_FROM)) {
        errors.push('FD_EMAIL_FROM must be a valid email address');
    }
    
    // Validate SMTP port
    if (configData.FD_SMTP_PORT) {
        const port = parseInt(configData.FD_SMTP_PORT);
        if (isNaN(port) || port < 1 || port > 65535) {
            errors.push('FD_SMTP_PORT must be a number between 1 and 65535');
        }
    }
    
    // Validate recording lengths
    if (configData.FD_MIN_RECORDING_LENGTH_SEC) {
        const minLength = parseInt(configData.FD_MIN_RECORDING_LENGTH_SEC);
        if (isNaN(minLength) || minLength < 1) {
            errors.push('FD_MIN_RECORDING_LENGTH_SEC must be a positive number');
        }
    }
    
    if (configData.FD_MAX_RECORDING_LENGTH_SEC) {
        const maxLength = parseInt(configData.FD_MAX_RECORDING_LENGTH_SEC);
        if (isNaN(maxLength) || maxLength < 1) {
            errors.push('FD_MAX_RECORDING_LENGTH_SEC must be a positive number');
        }
    }
    
    // Validate thresholds
    if (configData.FD_CLARITY_THRESHOLD) {
        const clarity = parseFloat(configData.FD_CLARITY_THRESHOLD);
        if (isNaN(clarity) || clarity < 0 || clarity > 1) {
            errors.push('FD_CLARITY_THRESHOLD must be a number between 0 and 1');
        }
    }
    
    return errors;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

async function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(CONFIG_DIR, 'backup', timestamp);
    
    try {
        await fs.mkdir(backupDir, { recursive: true });
        
        // Backup config files
        try {
            const configPath = getConfigFilePath();
            const secretsPath = getSecretsFilePath();
            
            // Only backup if files exist
            try {
                await fs.access(configPath);
                await fs.copyFile(configPath, path.join(backupDir, path.basename(configPath)));
                log.debug(`Config file backed up: ${path.basename(configPath)}`);
            } catch (error) {
                log.warn(`Config file not found for backup: ${configPath}`);
            }
            
            try {
                await fs.access(secretsPath);
                await fs.copyFile(secretsPath, path.join(backupDir, 'secrets.json'));
                log.debug(`Secrets file backed up: secrets.json`);
            } catch (error) {
                log.warn(`Secrets file not found for backup: ${secretsPath}`);
            }
            
            log.info(`Configuration backup created: ${backupDir}`);
        } catch (error) {
            log.warn(`Failed to backup some files: ${error.message}`);
        }
    } catch (error) {
        log.error(`Failed to create backup directory: ${error.message}`);
        throw error; // Re-throw to prevent config save if backup fails
    }
}

module.exports = { getConfiguration, updateConfig };