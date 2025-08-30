const log = require('../util/logger');
const {sendPostRecordingNotifications} = require("../notifiers");
const {sendPreRecordingNotifications} = require("../notifiers");
const {TonesDetector} = require("../obj/TonesDetector");
const {NotificationParams} = require("../obj/NotificationParams");
const {TonesDetectorConfig} = require("../obj/config/TonesDetectorConfig");
const fs = require('fs');
const config = require("config");

/**
 * Result object constructor for notification test results
 */
class NotificationTestResult {
    constructor(detector, timing, success, notificationTypes = [], error = null) {
        this.detector = detector;
        this.timing = timing;
        this.success = success;
        this.timestamp = new Date().toISOString();
        this.notificationTypes = notificationTypes;
        if (error) this.error = error;
    }
}

class NotificationTestService {
    constructor() {
        // Create test file if it doesn't exist
        this._ensureTestFile();
    }

    /**
     * Check if a detector has any notifications configured for a specific timing
     * @param {Object} notifications - The notifications object from detector config
     * @param {string} timing - 'preRecording' or 'postRecording'
     * @returns {boolean} True if there are notifications configured
     */
    _hasNotifications(notifications, timing) {
        const timingNotifications = notifications?.[timing];
        if (!timingNotifications) return false;

        // Check each notification type (pushbullet, webhooks, emails, externalCommands)
        return Object.values(timingNotifications).some(notificationArray => 
            Array.isArray(notificationArray) && notificationArray.length > 0
        );
    }

    /**
     * Get the types of notifications configured for a specific timing
     * @param {Object} notifications - The notifications object from detector config
     * @param {string} timing - 'preRecording' or 'postRecording'
     * @returns {Array} Array of notification types that have configurations
     */
    _getNotificationTypes(notifications, timing) {
        const timingNotifications = notifications?.[timing];
        if (!timingNotifications) return [];

        const types = [];
        Object.entries(timingNotifications).forEach(([type, notificationArray]) => {
            if (Array.isArray(notificationArray) && notificationArray.length > 0) {
                types.push(`${type} (${notificationArray.length})`);
            }
        });
        return types;
    }

    _ensureTestFile() {
        const testFilePath = 'test-empty-recording.wav';
        if (!fs.existsSync(testFilePath)) {
            fs.writeFileSync(testFilePath, "data");
        }
    }

    /**
     * Test notifications for a specific timing (preRecording or postRecording)
     * @param {Object} params - NotificationParams object
     * @param {string} timing - 'preRecording' or 'postRecording'
     * @param {Array} notificationTypes - Array of notification type descriptions
     * @returns {Promise<NotificationTestResult>}
     */
    async _sendTestNotification(params, timing, notificationTypes) {
        const notificationSender = timing === 'preRecording' 
            ? sendPreRecordingNotifications 
            : sendPostRecordingNotifications;

        try {
            await notificationSender(params);
            log.info(`TEST ${timing} notifications sent for ${params.detector.name}`);
            return new NotificationTestResult(params.detector.name, timing, true, notificationTypes);
        } catch (err) {
            log.error(`Failed to send TEST ${timing} notifications for ${params.detector.name}: ${err.message}`);
            return new NotificationTestResult(params.detector.name, timing, false, notificationTypes, err.message);
        }
    }

    /**
     * Test all notifications for all configured detectors
     * @returns {Promise<{success: boolean, results: Array, totalTested: number}>}
     */
    async testAllNotifications() {
        const results = [];
        const detectors = config.detection.detectors.map(d => new TonesDetector(new TonesDetectorConfig(d)));
        
        log.info(`Starting TEST notifications for ${detectors.length} detectors`);
        
        const timestamp = new Date().getTime();
        
        for (let i = 0; i < detectors.length; i++) {
            const detector = detectors[i];
            const detectorConfig = config.detection.detectors[i];
            
            // Check what notifications are configured for this detector
            const hasPreNotifications = this._hasNotifications(detectorConfig.notifications, 'preRecording');
            const hasPostNotifications = this._hasNotifications(detectorConfig.notifications, 'postRecording');

            // Only test if there are actual notifications configured
            if (!hasPreNotifications && !hasPostNotifications) {
                log.debug(`Skipping ${detector.name} - no notifications configured`);
                continue;
            }

            const params = new NotificationParams({
                detector,
                timestamp,
                notifications: detector.notifications,
                filename: "test-empty-recording.wav",
                attachFile: false,
                message: "TEST NOTIFICATION",
                isTest: true
            });

            // Test pre-recording notifications (only if configured)
            if (hasPreNotifications) {
                const preNotificationTypes = this._getNotificationTypes(detectorConfig.notifications, 'preRecording');
                const preResult = await this._sendTestNotification(params, 'preRecording', preNotificationTypes);
                results.push(preResult);
            }

            // Test post-recording notifications (only if configured)
            if (hasPostNotifications) {
                params.attachFile = true;
                const postNotificationTypes = this._getNotificationTypes(detectorConfig.notifications, 'postRecording');
                const postResult = await this._sendTestNotification(params, 'postRecording', postNotificationTypes);
                results.push(postResult);
            }
        }

        const successCount = results.filter(r => r.success).length;
        const success = results.length > 0; // Success if we had any notifications to test
        
        // Count actual notifications sent, not just detector/timing combinations
        const totalNotificationsSent = results.reduce((total, result) => {
            return total + (result.notificationTypes ? result.notificationTypes.length : 0);
        }, 0);

        log.info(`TEST notifications completed: ${successCount}/${results.length} successful, ${totalNotificationsSent} total notifications sent`);

        return {
            success,
            results,
            totalTested: results.length,
            successCount,
            totalNotificationsSent,
            detectorsWithNotifications: [...new Set(results.map(r => r.detector))].length
        };
    }

    /**
     * Test a single specific notification
     * @param {Object} params - Test parameters
     * @param {string} params.detectorName - Name of the detector to test
     * @param {string} params.trigger - 'preRecording' or 'postRecording'  
     * @param {string} params.type - Notification type ('pushbullet', 'webhook', 'email', etc.)
     * @param {number} params.index - Index of the specific notification to test
     * @returns {Promise<{success: boolean, result: Object}>}
     */
    async testSingleNotification({ detectorName, trigger, type, index }) {
        const detectorConfig = config.detection.detectors.find(d => d.name === detectorName);
        if (!detectorConfig) {
            throw new Error(`Detector "${detectorName}" not found`);
        }

        const timestamp = new Date().getTime();

        // Validate trigger
        if (trigger !== 'preRecording' && trigger !== 'postRecording') {
            throw new Error(`Invalid trigger "${trigger}". Must be "preRecording" or "postRecording"`);
        }

        // Get the specific notifications for this type and trigger
        const notifications = detectorConfig.notifications?.[trigger]?.[type];
        if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
            throw new Error(`No ${type} ${trigger} notifications configured for detector "${detectorName}"`);
        }

        if (index < 0 || index >= notifications.length) {
            throw new Error(`Invalid index ${index}. Must be between 0 and ${notifications.length - 1}`);
        }

        // Create a modified detector config with only the specific notification
        const singleNotificationConfig = {
            ...detectorConfig,
            notifications: {
                [trigger]: {
                    [type]: [notifications[index]]
                }
            }
        };

        const testDetector = new TonesDetector(new TonesDetectorConfig(singleNotificationConfig));
        const params = new NotificationParams({
            detector: testDetector,
            timestamp,
            notifications: testDetector.notifications,
            filename: "test-empty-recording.wav",
            attachFile: trigger === 'postRecording', //Attach if post
            message: "TEST SINGLE NOTIFICATION",
            isTest: true
        });

        try {
            const notificationSender = trigger === 'preRecording' 
                ? sendPreRecordingNotifications 
                : sendPostRecordingNotifications;
            
            await notificationSender(params);
            
            const result = new NotificationTestResult(
                detectorName, 
                trigger, 
                true, 
                [`${type} (1)`]
            );
            result.index = index;
            result.type = type;

            log.info(`TEST single ${type} ${trigger} notification sent for ${detectorName} (index ${index})`);
            return { success: true, result };

        } catch (err) {
            const result = new NotificationTestResult(
                detectorName, 
                trigger, 
                false, 
                [`${type} (1)`], 
                err.message
            );
            result.index = index;
            result.type = type;

            log.error(`Failed to send TEST single ${type} ${trigger} notification for ${detectorName} (index ${index}): ${err.message}`);
            return { success: false, result };
        }
    }
}

module.exports = { NotificationTestService };