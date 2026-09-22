const log = require('../../util/logger');
const config = require('config');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

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
 * Mark configuration as changed (for restart notification)
 */
function markConfigChanged(req) {
    // Broadcast to WebSocket clients if available
    if (req.app.wss && req.app.wss.broadcastLog) {
        req.app.wss.broadcastLog('info', 'Detector configuration updated - restart required to apply changes', {
            configChanged: true,
            type: 'detector_config_change'
        });
    }
}

// Helper functions for config file operations

/**
 * Assign a stable UUID v4 id (via crypto.randomUUID()) to any detector in the
 * given array that is missing one. Mutates the detectors in place.
 * @param {Array} detectors - Array of detector config objects
 * @returns {boolean} true if any detector was assigned a new id
 */
function assignDetectorIds(detectors) {
    if (!Array.isArray(detectors)) return false;

    let changed = false;
    detectors.forEach(detector => {
        if (detector && !detector.id) {
            detector.id = crypto.randomUUID();
            changed = true;
        }
    });
    return changed;
}

async function readConfigFile() {
    try {
        const configPath = getConfigFilePath();
        const data = await fs.readFile(configPath, 'utf8');
        const configData = JSON.parse(data);

        // Self-heal: assign stable ids to any detectors missing one, and
        // persist immediately so the ids are stable on the next read/boot.
        const detectors = configData.detection && configData.detection.detectors;
        if (assignDetectorIds(detectors)) {
            log.info(`Assigned stable id(s) to detector(s) missing one; persisting config`);
            await writeConfigFile(configData);
        }

        return configData;
    } catch (error) {
        log.warning(`Failed to read config file: ${error.message}`);
        return {};
    }
}

async function writeConfigFile(configData) {
    const configPath = getConfigFilePath();
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
    log.debug(`Config written to ${configPath}`);
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
                log.warning(`Config file not found for backup: ${configPath}`);
            }

            try {
                await fs.access(secretsPath);
                await fs.copyFile(secretsPath, path.join(backupDir, 'secrets.json'));
                log.debug(`Secrets file backed up: secrets.json`);
            } catch (error) {
                log.warning(`Secrets file not found for backup: ${secretsPath}`);
            }

            log.info(`Configuration backup created: ${backupDir}`);
        } catch (error) {
            log.warning(`Failed to backup some files: ${error.message}`);
        }
    } catch (error) {
        log.error(`Failed to create backup directory: ${error.message}`);
        throw error; // Re-throw to prevent config save if backup fails
    }
}

module.exports = {markConfigChanged, readConfigFile, writeConfigFile, createBackup, getSecretsFilePath, getConfigFilePath, assignDetectorIds}