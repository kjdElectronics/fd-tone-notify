const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { NotificationTestService } = require('../../service/NotificationTestService');
const log = require('../../util/logger');

const notificationTestService = new NotificationTestService();

/**
 * Test notifications
 * POST /api/notifications/test
 * 
 * Body options:
 * - {testAll: true} - Test all notifications for all detectors
 * - {detectorName, trigger, type, index} - Test single specific notification
 */
router.post('/test', authenticate, async (req, res) => {
    try {
        const { testAll, detectorName, trigger, type, index } = req.body;

        if (testAll) {
            log.info('API: Testing all notifications');
            const result = await notificationTestService.testAllNotifications();
            
            res.json({
                success: result.success,
                message: result.totalTested > 0 
                    ? `Tested ${result.detectorsWithNotifications} detector(s): ${result.successCount}/${result.totalTested} successful, ${result.totalNotificationsSent} total notifications sent`
                    : 'No notifications configured to test',
                results: result.results,
                totalTested: result.totalTested,
                successCount: result.successCount,
                totalNotificationsSent: result.totalNotificationsSent,
                detectorsWithNotifications: result.detectorsWithNotifications
            });
        } else {
            // Validate required parameters for single notification test
            if (!detectorName || !trigger || !type || index === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameters for single notification test',
                    required: ['detectorName', 'trigger', 'type', 'index']
                });
            }

            if (typeof index !== 'number' || index < 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Index must be a non-negative number'
                });
            }

            log.info(`API: Testing single notification - ${detectorName} ${type} ${trigger} [${index}]`);
            
            const result = await notificationTestService.testSingleNotification({
                detectorName,
                trigger,
                type,
                index
            });

            res.json({
                success: result.success,
                message: result.success 
                    ? `Successfully tested ${type} ${trigger} notification for ${detectorName}`
                    : `Failed to test ${type} ${trigger} notification for ${detectorName}`,
                result: result.result
            });
        }

    } catch (error) {
        log.error(`Notification test API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;