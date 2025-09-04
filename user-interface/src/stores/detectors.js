import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../utils/api'
import { useNotificationStore } from './notifications'
import { useConfigStore } from './config'

export const useDetectorsStore = defineStore('detectors', () => {
  // State
  const detectors = ref([])
  const loading = ref(false)
  const error = ref(null)
  
  // Loading states for individual operations
  const creating = ref(false)
  const updating = ref(false)
  const deleting = ref(false)

  // Computed
  const detectorCount = computed(() => detectors.value.length)
  
  const hasDetectors = computed(() => detectors.value.length > 0)
  
  const isAnyOperationLoading = computed(() => 
    loading.value || creating.value || updating.value || deleting.value
  )

  // Actions
  async function fetchDetectors() {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.get('/detectors')
      
      if (response.data.success) {
        detectors.value = response.data.detectors || []
      } else {
        throw new Error(response.data.error || 'Failed to fetch detectors')
      }
    } catch (err) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch detectors'
      console.error('Failed to fetch detectors:', err)
    } finally {
      loading.value = false
    }
  }

  async function createDetector(detectorData) {
    creating.value = true
    error.value = null
    
    try {
      const response = await api.post('/detectors', detectorData)
      
      if (response.data.success) {
        // Add the new detector to the local state
        detectors.value.push(response.data.detector)
        
        // Mark config as changed
        const configStore = useConfigStore()
        configStore.markConfigChanged('detector')
        
        // Show success notification
        const notificationStore = useNotificationStore()
        notificationStore.addNotification({
          type: 'success',
          message: `Detector "${response.data.detector.name}" created successfully`
        })
        
        return response.data.detector
      } else {
        throw new Error(response.data.error || 'Failed to create detector')
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create detector'
      error.value = errorMessage
      
      // Show error notification
      const notificationStore = useNotificationStore()
      notificationStore.addNotification({
        type: 'error',
        message: errorMessage
      })
      
      throw err
    } finally {
      creating.value = false
    }
  }

  async function updateDetector(index, detectorData) {
    updating.value = true
    error.value = null
    
    // Store original detector for rollback
    const originalDetector = { ...detectors.value[index] }
    
    try {
      // Optimistic update
      detectors.value[index] = { ...originalDetector, ...detectorData }
      
      const response = await api.put(`/detectors/${index}`, detectorData)
      
      if (response.data.success) {
        // Update with server response
        detectors.value[index] = response.data.detector
        
        // Mark config as changed
        const configStore = useConfigStore()
        configStore.markConfigChanged('detector')
        
        // Show success notification
        const notificationStore = useNotificationStore()
        notificationStore.addNotification({
          type: 'success',
          message: `Detector "${response.data.detector.name}" updated successfully`
        })
        
        return response.data.detector
      } else {
        throw new Error(response.data.error || 'Failed to update detector')
      }
    } catch (err) {
      // Rollback optimistic update
      detectors.value[index] = originalDetector
      
      const errorMessage = err.response?.data?.error || err.message || 'Failed to update detector'
      error.value = errorMessage
      
      // Show error notification
      const notificationStore = useNotificationStore()
      notificationStore.addNotification({
        type: 'error',
        message: errorMessage
      })
      
      throw err
    } finally {
      updating.value = false
    }
  }

  async function deleteDetector(index) {
    deleting.value = true
    error.value = null
    
    // Store original detector and remove optimistically
    const originalDetector = detectors.value[index]
    const originalDetectors = [...detectors.value]
    
    try {
      // Optimistic delete
      detectors.value.splice(index, 1)
      
      const response = await api.delete(`/detectors/${index}`)
      
      if (response.data.success) {
        // Mark config as changed
        const configStore = useConfigStore()
        configStore.markConfigChanged('detector')
        
        // Show success notification
        const notificationStore = useNotificationStore()
        notificationStore.addNotification({
          type: 'success',
          message: `Detector "${originalDetector.name}" deleted successfully`
        })
        
        return response.data.deletedDetector
      } else {
        throw new Error(response.data.error || 'Failed to delete detector')
      }
    } catch (err) {
      // Rollback optimistic delete
      detectors.value = originalDetectors
      
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete detector'
      error.value = errorMessage
      
      // Show error notification
      const notificationStore = useNotificationStore()
      notificationStore.addNotification({
        type: 'error',
        message: errorMessage
      })
      
      throw err
    } finally {
      deleting.value = false
    }
  }

  async function createDetectorFromDiscovery(discoveryTones, discoveryName = null) {
    const detectorData = {
      name: discoveryName || `New Tone ${new Date().toLocaleString()}`,
      tones: discoveryTones
      // All other fields will use smart defaults from the server
    }
    
    return await createDetector(detectorData)
  }

  function findDetectorByName(name) {
    return detectors.value.find(detector => detector.name === name)
  }

  function findDetectorIndex(name) {
    return detectors.value.findIndex(detector => detector.name === name)
  }

  function clearError() {
    error.value = null
  }

  function reset() {
    detectors.value = []
    loading.value = false
    creating.value = false
    updating.value = false
    deleting.value = false
    error.value = null
  }

  // Validation helpers
  function validateDetector(detectorData) {
    const errors = []
    
    if (!detectorData.name || typeof detectorData.name !== 'string' || detectorData.name.trim() === '') {
      errors.push('Detector name is required')
    }
    
    if (!detectorData.tones || !Array.isArray(detectorData.tones) || detectorData.tones.length === 0) {
      errors.push('At least one tone frequency is required')
    }
    
    if (detectorData.tones && Array.isArray(detectorData.tones)) {
      for (let i = 0; i < detectorData.tones.length; i++) {
        const tone = detectorData.tones[i]
        if (typeof tone !== 'number' || tone < 100 || tone > 4000) {
          errors.push(`Tone ${i + 1} must be between 100 and 4000 Hz`)
        }
      }
    }
    
    if (detectorData.matchThreshold !== undefined && 
        (typeof detectorData.matchThreshold !== 'number' || detectorData.matchThreshold < 1)) {
      errors.push('Match threshold must be a positive number')
    }
    
    if (detectorData.tolerancePercent !== undefined && 
        (typeof detectorData.tolerancePercent !== 'number' || 
         detectorData.tolerancePercent < 0 || detectorData.tolerancePercent > 1)) {
      errors.push('Tolerance percent must be between 0 and 1')
    }
    
    return errors
  }

  return {
    // State
    detectors,
    loading,
    error,
    creating,
    updating,
    deleting,
    
    // Computed
    detectorCount,
    hasDetectors,
    isAnyOperationLoading,
    
    // Actions
    fetchDetectors,
    createDetector,
    updateDetector,
    deleteDetector,
    createDetectorFromDiscovery,
    findDetectorByName,
    findDetectorIndex,
    clearError,
    reset,
    validateDetector
  }
})