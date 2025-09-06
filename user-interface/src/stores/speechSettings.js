import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Pinia store for managing speech announcement settings
 * Handles localStorage persistence and reactive state management
 */
export const useSpeechSettingsStore = defineStore('speechSettings', () => {
  // Reactive state
  const announcementsEnabled = ref(false)
  
  // Storage key constant
  const STORAGE_KEY = 'speech-announcements-enabled'

  /**
   * Toggle speech announcements on/off
   * Automatically persists to localStorage
   */
  function toggleAnnouncements() {
    announcementsEnabled.value = !announcementsEnabled.value
    saveToStorage()
  }

  /**
   * Set speech announcement enabled state
   * @param {Object} config - Configuration object
   * @param {boolean} config.enabled - Whether announcements should be enabled
   */
  function setSpeechEnabled({ enabled }) {
    if (typeof enabled !== 'boolean') {
      throw new Error('enabled parameter must be a boolean')
    }
    
    announcementsEnabled.value = enabled
    saveToStorage()
  }

  /**
   * Save current settings to localStorage
   */
  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(announcementsEnabled.value))
    } catch (error) {
      console.warn('Failed to save speech settings to localStorage:', error)
    }
  }

  /**
   * Load settings from localStorage
   * Called automatically on store initialization
   */
  function loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (typeof parsed === 'boolean') {
          announcementsEnabled.value = parsed
        }
      }
    } catch (error) {
      console.warn('Failed to load speech settings from localStorage:', error)
      // Reset to default on parse error
      announcementsEnabled.value = false
      saveToStorage()
    }
  }

  /**
   * Reset settings to default values
   */
  function resetToDefaults() {
    announcementsEnabled.value = false
    saveToStorage()
  }

  /**
   * Check if announcements are currently enabled
   * @returns {boolean} Current enabled state
   */
  function isEnabled() {
    return announcementsEnabled.value
  }

  // Initialize from localStorage on store creation
  loadFromStorage()

  // Return store interface
  return {
    // State
    announcementsEnabled,
    
    // Actions
    toggleAnnouncements,
    setSpeechEnabled,
    loadFromStorage,
    resetToDefaults,
    isEnabled
  }
})