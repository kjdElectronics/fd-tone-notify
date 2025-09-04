import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useConfigStore = defineStore('config', () => {
  // State
  const configChanged = ref(false)
  const lastChangeTimestamp = ref(null)
  const changeType = ref(null) // 'detector', 'system', 'notification', etc.

  // Computed
  const needsRestart = computed(() => configChanged.value)
  
  const restartButtonText = computed(() => {
    return configChanged.value ? 'Restart to Apply Changes' : 'Restart'
  })

  // Actions
  function markConfigChanged(type = 'unknown') {
    configChanged.value = true
    lastChangeTimestamp.value = new Date().toISOString()
    changeType.value = type
  }

  function markConfigApplied() {
    configChanged.value = false
    lastChangeTimestamp.value = null
    changeType.value = null
  }

  function reset() {
    configChanged.value = false
    lastChangeTimestamp.value = null
    changeType.value = null
  }

  return {
    // State
    configChanged,
    lastChangeTimestamp,
    changeType,
    
    // Computed
    needsRestart,
    restartButtonText,
    
    // Actions
    markConfigChanged,
    markConfigApplied,
    reset
  }
})