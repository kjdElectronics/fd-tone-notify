const log = require('../util/logger');

/**
 * Simple in-memory detection store
 * Stores raw WebSocket detection data exactly as sent to frontend
 */
class DetectionStore {
  constructor() {
    this.detections = [];
    this.maxDetections = 50;
    this.ttlHours = 3;
    
    // Cleanup expired detections every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000);
    
    log.info('DetectionStore initialized: max=50, ttl=3h');
  }

  /**
   * Add a detection (raw WebSocket message data)
   * @param {object} detection - Raw detection data from WebSocket event
   */
  addDetection(detection) {
    try {
      // Add timestamp if not present
      detection.timestamp = new Date(); //For the in memory store we always want current time. For file detections this can be the sec elapsed in the file
      
      // Add to array
      this.detections.push(detection);
      
      // Maintain size limit (FIFO)
      if (this.detections.length > this.maxDetections) {
        this.detections.shift();
      }
      
      log.debug(`Detection stored: ${detection.type}, total: ${this.detections.length}`);
      
    } catch (error) {
      log.error('Failed to store detection:', error);
    }
  }

  /**
   * Get recent detections
   * @param {number} limit - Max detections to return
   * @returns {Array} Recent detections
   */
  getRecentDetections(limit = 50) {
    // Don't run cleanup here - let scheduled cleanup handle it
    return this.detections.slice(-Math.min(limit, this.detections.length));
  }

  /**
   * Remove expired detections
   */
  cleanup() {
    const before = this.detections.length;
    const cutoff = new Date(Date.now() - (this.ttlHours * 60 * 60 * 1000));
    
    this.detections = this.detections.filter(detection => {
      const detectionTime = new Date(detection.timestamp);
      return detectionTime > cutoff;
    });
    
    const removed = before - this.detections.length;
    if (removed > 0) {
      log.debug(`Cleaned up ${removed} expired detections`);
    }
  }

  /**
   * Clear all detections
   */
  clear() {
    this.detections = [];
    log.info('All detections cleared');
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      count: this.detections.length,
      maxDetections: this.maxDetections,
      ttlHours: this.ttlHours
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    log.info('DetectionStore shutdown');
  }
}

// Global instance
let globalStore = null;

function getDetectionStore() {
  if (!globalStore) {
    globalStore = new DetectionStore();
  }
  return globalStore;
}

module.exports = { DetectionStore, getDetectionStore };