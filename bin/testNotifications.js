const log = require('../util/logger');
const { NotificationTestService } = require('../service/NotificationTestService');

async function testNotifications(){
    const testService = new NotificationTestService();
    
    try {
        const result = await testService.testAllNotifications();
        
        if (result.success) {
            log.info(`TEST notifications completed successfully`);
            log.info(`Tested ${result.detectorsWithNotifications} detector(s): ${result.successCount}/${result.totalTested} successful, ${result.totalNotificationsSent} total notifications sent`);
            
            // Log individual results for detail
            result.results.forEach(testResult => {
                if (testResult.success) {
                    log.info(`✅ ${testResult.detector} - ${testResult.timing} (${testResult.notificationTypes.join(', ')})`);
                } else {
                    log.error(`❌ ${testResult.detector} - ${testResult.timing}: ${testResult.error}`);
                }
            });
        } else {
            log.warn('No notifications were configured to test');
        }
    } catch (error) {
        log.error(`Failed to test notifications: ${error.message}`);
        throw error;
    }
}

module.exports = {testNotifications};