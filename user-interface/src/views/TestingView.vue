<template>
  <div class="p-6">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">Testing & Notifications</h1>
      <p class="text-gray-600">Test detector notifications and verify configuration settings</p>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-fire-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading detector configuration...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="alert-emergency mb-6">
      <h3 class="font-medium">Failed to load detector configuration</h3>
      <p class="text-sm mt-1">{{ error }}</p>
      <button @click="loadConfig" class="mt-2 btn-primary">Retry</button>
    </div>

    <!-- Testing Interface -->
    <div v-else class="space-y-6">
      <!-- Test All Notifications -->
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-gray-900 flex items-center">
              <BeakerIcon class="w-5 h-5 mr-2 text-fire-600" />
              Global Test Controls
            </h2>
            <p class="text-sm text-gray-600 mt-1">
              Test all configured notifications across all detectors
            </p>
          </div>
          <div class="flex space-x-3">
            <button
              @click="testAllNotifications"
              :disabled="testing || !hasNotifications"
              class="btn-primary flex items-center"
            >
              <BeakerIcon class="w-4 h-4 mr-2" />
              {{ testing ? 'Testing...' : 'Test All Notifications' }}
            </button>
          </div>
        </div>
        
        <div v-if="!hasNotifications" class="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          <div class="flex items-center">
            <ExclamationTriangleIcon class="w-4 h-4 mr-2" />
            No notifications are configured on any detectors
          </div>
        </div>
      </div>

      <!-- Detection Statistics -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <ChartBarIcon class="w-5 h-5 mr-2 text-fire-600" />
          Notification Statistics
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-green-50 p-4 rounded-lg text-center">
            <div class="text-2xl font-bold text-green-600">{{ totalDetectors }}</div>
            <div class="text-sm text-green-600">Total Detectors</div>
          </div>
          <div class="bg-blue-50 p-4 rounded-lg text-center">
            <div class="text-2xl font-bold text-blue-600">{{ totalPreNotifications }}</div>
            <div class="text-sm text-blue-600">Pre-Recording</div>
          </div>
          <div class="bg-purple-50 p-4 rounded-lg text-center">
            <div class="text-2xl font-bold text-purple-600">{{ totalPostNotifications }}</div>
            <div class="text-sm text-purple-600">Post-Recording</div>
          </div>
          <div class="bg-orange-50 p-4 rounded-lg text-center">
            <div class="text-2xl font-bold text-orange-600">{{ totalNotifications }}</div>
            <div class="text-sm text-orange-600">Total Notifications</div>
          </div>
        </div>
      </div>

      <!-- Detector Cards with Expanded Notifications -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900 flex items-center">
            <SpeakerWaveIcon class="w-5 h-5 mr-2 text-fire-600" />
            Detector Notifications
          </h2>
          <div class="flex items-center space-x-2">
            <span class="text-sm text-gray-600">Total:</span>
            <span class="font-semibold">{{ config.detection?.detectors?.length || 0 }}</span>
          </div>
        </div>

        <div v-if="!config.detection?.detectors || config.detection.detectors.length === 0" class="text-center py-8 text-gray-500">
          No tone detectors configured
        </div>

        <div v-else class="space-y-6">
          <DetectorCard
            v-for="(detector, index) in config.detection.detectors"
            :key="`detector-${index}`"
            :detector="detector"
            :index="index"
            :defaults="config.detection"
            :expand-notifications="true"
            :show-test-buttons="true"
            @test-notification="handleTestNotification"
          />
        </div>
      </div>

      <!-- Test Results -->
      <div v-if="testResults.length > 0" class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <ClipboardDocumentListIcon class="w-5 h-5 mr-2 text-fire-600" />
          Test Results
        </h2>
        <div class="space-y-2 max-h-64 overflow-y-auto">
          <div
            v-for="(result, index) in testResults"
            :key="index"
            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
          >
            <div class="flex items-center">
              <div 
                :class="result.success ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'"
                class="w-2 h-2 rounded-full mr-3"
              ></div>
              <span class="font-medium">{{ result.detector }}</span>
              <span class="mx-2 text-gray-400">|</span>
              <span>{{ result.type }} ({{ result.timing }})</span>
            </div>
            <div class="text-xs text-gray-500">
              {{ new Date(result.timestamp).toLocaleTimeString() }}
            </div>
          </div>
        </div>
        <div class="mt-4 pt-4 border-t">
          <button
            @click="clearTestResults"
            class="text-sm text-gray-600 hover:text-gray-800"
          >
            Clear Results
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useNotificationStore } from '../stores/notifications'
import api from '../utils/api'
import DetectorCard from '../components/DetectorCard.vue'
import { 
  SpeakerWaveIcon,
  BeakerIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'

const notificationStore = useNotificationStore()

// Reactive data
const loading = ref(true)
const testing = ref(false)
const error = ref(null)
const config = ref({})
const testResults = ref([])

// Computed statistics
const totalDetectors = computed(() => {
  return config.value.detection?.detectors?.length || 0
})

const totalPreNotifications = computed(() => {
  return config.value.detection?.detectors?.reduce((total, detector) => {
    const preNotifications = detector.notifications?.preRecording || {}
    return total + Object.values(preNotifications).reduce((subtotal, group) => {
      return subtotal + (Array.isArray(group) ? group.length : 0)
    }, 0)
  }, 0) || 0
})

const totalPostNotifications = computed(() => {
  return config.value.detection?.detectors?.reduce((total, detector) => {
    const postNotifications = detector.notifications?.postRecording || {}
    return total + Object.values(postNotifications).reduce((subtotal, group) => {
      return subtotal + (Array.isArray(group) ? group.length : 0)
    }, 0)
  }, 0) || 0
})

const totalNotifications = computed(() => {
  return totalPreNotifications.value + totalPostNotifications.value
})

const hasNotifications = computed(() => {
  return totalNotifications.value > 0
})

// Load configuration from backend
async function loadConfig() {
  loading.value = true
  error.value = null
  
  try {
    // Use authenticated API to get config
    const response = await api.get('/config')
    
    if (response.data.success) {
      config.value = response.data.configuration
      
      notificationStore.addNotification({
        type: 'success',
        message: 'Configuration loaded successfully'
      })
    } else {
      throw new Error(response.data.error || 'Failed to load configuration')
    }
  } catch (err) {
    error.value = err.response?.data?.error || err.message || 'Failed to load configuration'
    console.error('Failed to load config:', err)
    
    notificationStore.addNotification({
      type: 'error',
      message: 'Failed to load detector configuration'
    })
  } finally {
    loading.value = false
  }
}

// Test all notifications
async function testAllNotifications() {
  if (!hasNotifications.value) return
  
  testing.value = true
  
  try {
    // TODO: Replace with actual API call when implemented
    // Simulate API call for now
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Add simulated test results
    const detectors = config.value.detection?.detectors || []
    detectors.forEach((detector, detectorIndex) => {
      // Test pre-recording notifications
      const preNotifications = detector.notifications?.preRecording || {}
      Object.entries(preNotifications).forEach(([type, notifications]) => {
        if (Array.isArray(notifications) && notifications.length > 0) {
          testResults.value.unshift({
            detector: detector.name,
            type: type,
            timing: 'pre-recording',
            success: Math.random() > 0.2, // 80% success rate for demo
            timestamp: new Date().toISOString()
          })
        }
      })
      
      // Test post-recording notifications
      const postNotifications = detector.notifications?.postRecording || {}
      Object.entries(postNotifications).forEach(([type, notifications]) => {
        if (Array.isArray(notifications) && notifications.length > 0) {
          testResults.value.unshift({
            detector: detector.name,
            type: type,
            timing: 'post-recording',
            success: Math.random() > 0.2, // 80% success rate for demo
            timestamp: new Date().toISOString()
          })
        }
      })
    })
    
    notificationStore.addNotification({
      type: 'info',
      message: `Tested ${totalNotifications.value} notifications across ${totalDetectors.value} detectors`
    })
  } catch (err) {
    console.error('Failed to test notifications:', err)
    notificationStore.addNotification({
      type: 'error',
      message: 'Failed to test notifications'
    })
  } finally {
    testing.value = false
  }
}

// Handle individual notification test
async function handleTestNotification({ detector, type, timing, notifications }) {
  try {
    // TODO: Replace with actual API call when implemented
    // Simulate API call for now
    await new Promise(resolve => setTimeout(resolve, 500))
    
    testResults.value.unshift({
      detector: detector.name,
      type: type,
      timing: timing,
      success: Math.random() > 0.1, // 90% success rate for individual tests
      timestamp: new Date().toISOString()
    })
    
    notificationStore.addNotification({
      type: 'info',
      message: `Tested ${type} ${timing} notifications for ${detector.name}`
    })
  } catch (err) {
    console.error('Failed to test notification:', err)
    notificationStore.addNotification({
      type: 'error',
      message: `Failed to test ${type} notifications`
    })
  }
}

// Clear test results
function clearTestResults() {
  testResults.value = []
}

onMounted(() => {
  loadConfig()
})
</script>