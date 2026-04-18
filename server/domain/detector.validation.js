/**
 * Domain validation logic for detector configuration
 * 
 * This module contains all validation logic for detector data,
 * separated from the controller for better organization and testability.
 */

/**
 * Validate email addresses (supports comma-separated strings)
 * @param {string} emailString - Comma or semicolon separated email addresses
 * @param {string} fieldName - Name of the field for error messages
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateEmails(emailString, fieldName = 'Email') {
    const errors = [];
    
    if (!emailString || typeof emailString !== 'string') {
        return errors; // Empty emails are allowed
    }
    
    // Email regex pattern (RFC 5322 compliant) - requires proper domain with TLD
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    
    // Split by comma or semicolon, trim each email
    const emails = emailString
        .split(/[,;]/)
        .map(email => email.trim())
        .filter(email => email.length > 0);
    
    // Validate each email
    emails.forEach((email, index) => {
        if (!emailRegex.test(email)) {
            errors.push(`${fieldName} address "${email}" is not valid`);
        }
    });
    
    // Check for duplicates (case insensitive)
    const uniqueEmails = new Set();
    const duplicates = [];
    emails.forEach(email => {
        const lowerEmail = email.toLowerCase();
        if (uniqueEmails.has(lowerEmail)) {
            duplicates.push(email);
        } else {
            uniqueEmails.add(lowerEmail);
        }
    });
    
    if (duplicates.length > 0) {
        errors.push(`${fieldName} contains duplicate addresses: ${duplicates.join(', ')}`);
    }
    
    return errors;
}

/**
 * Validate pushbullet notification configuration
 * @param {Object} pushbulletConfig - Pushbullet notification configuration
 * @param {string} timing - 'preRecording' or 'postRecording'
 * @param {number} index - Index of the notification for error messages
 * @returns {string[]} Array of error messages, empty if valid
 */
function validatePushbulletNotification(pushbulletConfig, timing, index) {
    const errors = [];
    
    if (!pushbulletConfig || typeof pushbulletConfig !== 'object') {
        errors.push(`${timing} pushbullet notification ${index + 1} must be an object`);
        return errors;
    }
    
    // Validate title (optional but should be string if present)
    if (pushbulletConfig.title !== undefined && typeof pushbulletConfig.title !== 'string') {
        errors.push(`${timing} pushbullet notification ${index + 1} 'title' must be a string`);
    }
    
    // Validate body (optional but should be string if present)
    if (pushbulletConfig.body !== undefined && typeof pushbulletConfig.body !== 'string') {
        errors.push(`${timing} pushbullet notification ${index + 1} 'body' must be a string`);
    }
    
    // Validate channelTag (optional but should be string if present)
    if (pushbulletConfig.channelTag !== undefined && typeof pushbulletConfig.channelTag !== 'string') {
        errors.push(`${timing} pushbullet notification ${index + 1} 'channelTag' must be a string`);
    }
    
    return errors;
}

/**
 * Validate webhook notification configuration
 * @param {Object} webhookConfig - Webhook notification configuration
 * @param {string} timing - 'preRecording' or 'postRecording'
 * @param {number} index - Index of the notification for error messages
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateWebhookNotification(webhookConfig, timing, index) {
    const errors = [];
    
    if (!webhookConfig || typeof webhookConfig !== 'object') {
        errors.push(`${timing} webhook notification ${index + 1} must be an object`);
        return errors;
    }
    
    // Validate address (required for webhook notifications)
    if (!webhookConfig.address || typeof webhookConfig.address !== 'string' || webhookConfig.address.trim() === '') {
        errors.push(`${timing} webhook notification ${index + 1} must have an 'address' field`);
    } else {
        // Basic URL validation
        try {
            new URL(webhookConfig.address);
        } catch (error) {
            errors.push(`${timing} webhook notification ${index + 1} 'address' must be a valid URL`);
        }
    }
    
    // Validate headers (optional but should be object if present)
    if (webhookConfig.headers !== undefined) {
        if (typeof webhookConfig.headers !== 'object' || Array.isArray(webhookConfig.headers)) {
            errors.push(`${timing} webhook notification ${index + 1} 'headers' must be an object`);
        }
    }
    
    return errors;
}

/**
 * Validate external command notification configuration
 * @param {Object} commandConfig - External command notification configuration
 * @param {string} timing - 'preRecording' or 'postRecording'
 * @param {number} index - Index of the notification for error messages
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateExternalCommandNotification(commandConfig, timing, index) {
    const errors = [];
    
    if (!commandConfig || typeof commandConfig !== 'object') {
        errors.push(`${timing} external command notification ${index + 1} must be an object`);
        return errors;
    }
    
    // Validate command (required for external command notifications)
    if (!commandConfig.command || typeof commandConfig.command !== 'string' || commandConfig.command.trim() === '') {
        errors.push(`${timing} external command notification ${index + 1} must have a 'command' field`);
    }
    
    // Validate description (optional but should be string if present)
    if (commandConfig.description !== undefined && typeof commandConfig.description !== 'string') {
        errors.push(`${timing} external command notification ${index + 1} 'description' must be a string`);
    }
    
    return errors;
}

/**
 * Validate email notification configuration
 * @param {Object} emailConfig - Email notification configuration
 * @param {string} timing - 'preRecording' or 'postRecording'
 * @param {number} index - Index of the notification for error messages
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateEmailNotification(emailConfig, timing, index) {
    const errors = [];
    
    if (!emailConfig || typeof emailConfig !== 'object') {
        errors.push(`${timing} email notification ${index + 1} must be an object`);
        return errors;
    }
    
    // Validate 'to' field (required for email notifications)
    if (!emailConfig.to || typeof emailConfig.to !== 'string' || emailConfig.to.trim() === '') {
        errors.push(`${timing} email notification ${index + 1} must have a 'to' field`);
    } else {
        const toErrors = validateEmails(emailConfig.to, `${timing} email notification ${index + 1} 'to'`);
        errors.push(...toErrors);
    }
    
    // Validate 'bcc' field (optional)
    if (emailConfig.bcc) {
        const bccErrors = validateEmails(emailConfig.bcc, `${timing} email notification ${index + 1} 'bcc'`);
        errors.push(...bccErrors);
    }
    
    // Validate subject (optional but should be string if present)
    if (emailConfig.subject !== undefined && typeof emailConfig.subject !== 'string') {
        errors.push(`${timing} email notification ${index + 1} 'subject' must be a string`);
    }
    
    // Validate text (optional but should be string if present)
    if (emailConfig.text !== undefined && typeof emailConfig.text !== 'string') {
        errors.push(`${timing} email notification ${index + 1} 'text' must be a string`);
    }
    
    return errors;
}

/**
 * Validate notification configuration
 * @param {Object} notifications - Notification configuration object
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateNotifications(notifications) {
    const errors = [];
    
    if (!notifications || typeof notifications !== 'object') {
        return errors; // No notifications is valid
    }
    
    // Validate both preRecording and postRecording notifications
    ['preRecording', 'postRecording'].forEach(timing => {
        const timingNotifications = notifications[timing];
        if (!timingNotifications || typeof timingNotifications !== 'object') {
            return;
        }
        
        // Validate email notifications
        if (timingNotifications.emails && Array.isArray(timingNotifications.emails)) {
            timingNotifications.emails.forEach((emailConfig, index) => {
                const emailErrors = validateEmailNotification(emailConfig, timing, index);
                errors.push(...emailErrors);
            });
        }
        
        // Validate pushbullet notifications
        if (timingNotifications.pushbullet && Array.isArray(timingNotifications.pushbullet)) {
            timingNotifications.pushbullet.forEach((pushbulletConfig, index) => {
                const pushbulletErrors = validatePushbulletNotification(pushbulletConfig, timing, index);
                errors.push(...pushbulletErrors);
            });
        }
        
        // Validate webhook notifications
        if (timingNotifications.webhooks && Array.isArray(timingNotifications.webhooks)) {
            timingNotifications.webhooks.forEach((webhookConfig, index) => {
                const webhookErrors = validateWebhookNotification(webhookConfig, timing, index);
                errors.push(...webhookErrors);
            });
        }
        
        // Validate external command notifications
        if (timingNotifications.externalCommands && Array.isArray(timingNotifications.externalCommands)) {
            timingNotifications.externalCommands.forEach((commandConfig, index) => {
                const commandErrors = validateExternalCommandNotification(commandConfig, timing, index);
                errors.push(...commandErrors);
            });
        }
    });
    
    return errors;
}

/**
 * Validate tone frequencies
 * @param {number[]} tones - Array of tone frequencies
 * @param {boolean} isRequired - Whether tones are required
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateTones(tones, isRequired = true) {
    const errors = [];
    
    if (isRequired && (!tones || !Array.isArray(tones) || tones.length === 0)) {
        errors.push('Tones array is required and must contain at least one tone');
        return errors;
    }
    
    if (tones && Array.isArray(tones)) {
        for (let i = 0; i < tones.length; i++) {
            const tone = tones[i];
            if (typeof tone !== 'number' || tone < 100 || tone > 4000) {
                errors.push(`Tone at index ${i} must be a number between 100 and 4000 Hz`);
            }
        }
    }
    
    return errors;
}

/**
 * Validate detector thresholds and timeouts
 * @param {Object} detectorData - Detector configuration data
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateDetectorSettings(detectorData) {
    const errors = [];
    
    // Threshold validation
    if (detectorData.matchThreshold !== undefined) {
        if (typeof detectorData.matchThreshold !== 'number' || detectorData.matchThreshold < 1) {
            errors.push('Match threshold must be a positive number');
        }
    }
    
    // Tolerance validation
    if (detectorData.tolerancePercent !== undefined) {
        if (typeof detectorData.tolerancePercent !== 'number' || detectorData.tolerancePercent < 0 || detectorData.tolerancePercent > 1) {
            errors.push('Tolerance percent must be a number between 0 and 1');
        }
    }
    
    // Timeout validations
    if (detectorData.resetTimeoutMs !== undefined) {
        if (typeof detectorData.resetTimeoutMs !== 'number' || detectorData.resetTimeoutMs < 0) {
            errors.push('Reset timeout must be a non-negative number');
        }
    }
    
    if (detectorData.lockoutTimeoutMs !== undefined) {
        if (typeof detectorData.lockoutTimeoutMs !== 'number' || detectorData.lockoutTimeoutMs < 0) {
            errors.push('Lockout timeout must be a non-negative number');
        }
    }
    
    return errors;
}

/**
 * Validate recording settings
 * @param {Object} detectorData - Detector configuration data
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateRecordingSettings(detectorData) {
    const errors = [];
    
    // Recording length validations
    if (detectorData.minRecordingLengthSec !== undefined) {
        if (typeof detectorData.minRecordingLengthSec !== 'number' || detectorData.minRecordingLengthSec < 1) {
            errors.push('Minimum recording length must be at least 1 second');
        }
    }
    
    if (detectorData.maxRecordingLengthSec !== undefined) {
        if (typeof detectorData.maxRecordingLengthSec !== 'number' || detectorData.maxRecordingLengthSec < 1) {
            errors.push('Maximum recording length must be at least 1 second');
        }
    }
    
    // Validate min < max for recording lengths
    if (detectorData.minRecordingLengthSec !== undefined && detectorData.maxRecordingLengthSec !== undefined) {
        if (detectorData.minRecordingLengthSec >= detectorData.maxRecordingLengthSec) {
            errors.push('Minimum recording length must be less than maximum recording length');
        }
    }
    
    return errors;
}

/**
 * Main detector validation function
 * @param {Object} detectorData - Detector configuration data to validate
 * @param {boolean} isUpdate - Whether this is an update operation (allows partial data)
 * @returns {string[]} Array of error messages, empty if valid
 */
function validateDetector(detectorData, isUpdate = false) {
    const errors = [];
    
    // Handle null/undefined input
    if (!detectorData || typeof detectorData !== 'object') {
        errors.push('Detector data is required and must be an object');
        return errors;
    }
    
    // Name validation (required for new detectors)
    if (!isUpdate && (!detectorData.name || typeof detectorData.name !== 'string' || detectorData.name.trim() === '')) {
        errors.push('Detector name is required and must be a non-empty string');
    }
    
    // Name length validation (if name is provided)
    if (detectorData.name && typeof detectorData.name === 'string' && detectorData.name.length > 100) {
        errors.push('Detector name must be less than 100 characters');
    }
    
    // Validate tones
    const toneErrors = validateTones(detectorData.tones, !isUpdate);
    errors.push(...toneErrors);
    
    // Validate detector settings (thresholds, timeouts)
    const settingsErrors = validateDetectorSettings(detectorData);
    errors.push(...settingsErrors);
    
    // Validate recording settings
    const recordingErrors = validateRecordingSettings(detectorData);
    errors.push(...recordingErrors);
    
    // Validate talkgroupFilter
    if (detectorData.talkgroupFilter !== undefined && detectorData.talkgroupFilter !== null && detectorData.talkgroupFilter !== '') {
        if (typeof detectorData.talkgroupFilter !== 'string') {
            errors.push('Talkgroup filter must be a string');
        } else if (detectorData.talkgroupFilter.length > 255) {
            errors.push('Talkgroup filter must be 255 characters or less');
        }
    }

    // Validate talkgroupExclusive
    if (detectorData.talkgroupExclusive !== undefined && detectorData.talkgroupExclusive !== null) {
        if (typeof detectorData.talkgroupExclusive !== 'boolean') {
            errors.push('Talkgroup exclusive must be a boolean');
        }
    }

    // Validate notifications
    if (detectorData.notifications) {
        const notificationErrors = validateNotifications(detectorData.notifications);
        errors.push(...notificationErrors);
    }

    return errors;
}

module.exports = {
    validateEmails,
    validateNotifications,
    validateDetector,
    validateTones,
    validateDetectorSettings,
    validateRecordingSettings,
    validateEmailNotification,
    validatePushbulletNotification,
    validateWebhookNotification,
    validateExternalCommandNotification
};