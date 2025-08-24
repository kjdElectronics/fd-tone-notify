const logger = require('../util/logger');

/**
 * StatusMonitor tracks the health and status of managed processes
 * and provides status information to the API server and WebSocket clients.
 */
class StatusMonitor {
    constructor() {
        this.processStatuses = {};
        this.statusUpdateListeners = [];
        this.startTime = new Date();
    }

    /**
     * Update the status of a process
     */
    updateStatus(processName, status, pid = null, errorMessage = null) {
        const previousStatus = this.processStatuses[processName]?.status;
        
        this.processStatuses[processName] = {
            status: status,
            pid: pid,
            lastUpdate: new Date().toISOString(),
            errorMessage: errorMessage,
            startTime: status === 'running' && previousStatus !== 'running' 
                ? new Date().toISOString() 
                : this.processStatuses[processName]?.startTime || null
        };

        // Notify listeners of status change
        this.notifyStatusUpdate(processName, this.processStatuses[processName]);
    }

    /**
     * Get status of a specific process
     */
    getProcessStatus(processName) {
        return this.processStatuses[processName] || {
            status: 'unknown',
            pid: null,
            lastUpdate: null,
            errorMessage: null,
            startTime: null
        };
    }

    /**
     * Get comprehensive system status - single source of truth
     */
    getStatus() {
        const processes = { ...this.processStatuses };
        const managerUptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
        
        // Calculate overall system health
        let overallStatus = 'healthy';
        let runningCount = 0;
        const totalCount = Object.keys(processes).length;
        
        Object.values(processes).forEach(process => {
            if (process.status === 'error') {
                overallStatus = 'error';
            } else if (process.status === 'running') {
                runningCount++;
            } else { //Not running (some other status)
                overallStatus = 'warning';
            }
        });

        // Build process details with uptime
        const processDetails = Object.entries(processes).map(([name, status]) => ({
            name: name,
            status: status.status,
            pid: status.pid,
            nodeEnv: process.env.NODE_ENV,
            healthy: status.status === 'running',
            uptime: this.getProcessUptime(name),
            lastUpdate: status.lastUpdate,
            startTime: status.startTime,
            errorMessage: status.errorMessage
        }));

        return {
            // Overall system health
            healthy: overallStatus === 'healthy',
            overall: overallStatus,
            timestamp: new Date().toISOString(),
            
            // Manager status
            manager: {
                status: 'running',
                uptime: managerUptime,
                startTime: this.startTime.toISOString(),
                memory: process.memoryUsage(),
                nodeVersion: process.version
            },
            
            // Process information
            processes: processes, // Raw process data for internal use
            processDetails: processDetails, // Enhanced process data for external use
            
            // Summary statistics
            summary: {
                total: totalCount,
                running: runningCount,
                stopped: Object.values(processes).filter(p => p.status === 'stopped').length,
                error: Object.values(processes).filter(p => p.status === 'error').length,
                starting: Object.values(processes).filter(p => p.status === 'starting').length,
                stopping: Object.values(processes).filter(p => p.status === 'stopping').length
            }
        };
    }

    /**
     * Get process uptime in seconds
     */
    getProcessUptime(processName) {
        const status = this.getProcessStatus(processName);
        if (!status.startTime || status.status !== 'running') {
            return 0;
        }
        
        return Math.floor((Date.now() - new Date(status.startTime).getTime()) / 1000);
    }

    /**
     * Add a listener for status updates
     */
    onStatusUpdate(listener) {
        this.statusUpdateListeners.push(listener);
    }


    /**
     * Notify all listeners of a status update
     */
    notifyStatusUpdate(processName, statusData) {
        const updateEvent = {
            processName: processName,
            status: statusData,
            timestamp: new Date().toISOString(),
            systemStatus: this.getStatus()
        };

        this.statusUpdateListeners.forEach(listener => {
            try {
                listener(updateEvent);
            } catch (error) {
                logger.error('Error in status update listener:', error);
            }
        });
    }
}

module.exports = StatusMonitor;