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
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Voice Alerts Testing Card -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 flex items-center">
                <SpeakerWaveIcon class="w-5 h-5 mr-2 text-fire-600" />
                Voice Alerts Testing
              </h2>
              <p class="text-sm text-gray-600 mt-1">
                Test speech announcements for all detectors
              </p>
            </div>
            <button
              @click="testAllVoiceAlerts"
              :disabled="(speechSynthesis.isSupported.value && !speechSettings.isEnabled())"
              class="btn-primary flex items-center"
              :class="{ 'cursor-pointer': !(speechSynthesis.isSupported.value && !speechSettings.isEnabled()), 'opacity-50 cursor-not-allowed': (speechSynthesis.isSupported.value && !speechSettings.isEnabled()) }"
            >
              <SpeakerWaveIcon class="w-4 h-4 mr-2" />
              {{ voiceTesting ? 'Speaking...' : 'Test All Voice Alerts' }}
            </button>
          </div>
          
          <!-- Voice status messages -->
          <div v-if="!speechSynthesis.isSupported.value" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <div class="flex items-center">
              <ExclamationTriangleIcon class="w-4 h-4 mr-2" />
              Voice alerts not supported in this browser
            </div>
          </div>
          
          <!-- Only show blue warning when speech is supported but disabled -->
          <div v-else-if="speechSynthesis.isSupported.value && !speechSettings.isEnabled()" class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <div class="flex items-center">
              <SpeakerWaveIcon class="w-4 h-4 mr-2" />
              Enable voice alerts in the sidebar to test announcements
            </div>
          </div>
          
          <!-- Show detector warning only when speech is enabled but no detectors -->
          <div v-else-if="speechSettings.isEnabled() && totalDetectors === 0" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <div class="flex items-center">
              <ExclamationTriangleIcon class="w-4 h-4 mr-2" />
              No detectors configured for voice testing
            </div>
          </div>
          
          <!-- Show success state when everything is ready -->
          <div v-else-if="speechSettings.isEnabled() && totalDetectors > 0" class="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            <div class="flex items-center">
              <SpeakerWaveIcon class="w-4 h-4 mr-2" />
              Ready to test {{ totalDetectors }} detector{{ totalDetectors === 1 ? '' : 's' }}
            </div>
          </div>
        </div>
        
        <!-- Notification Testing Card -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 flex items-center">
                <BeakerIcon class="w-5 h-5 mr-2 text-fire-600" />
                Notification Testing
              </h2>
              <p class="text-sm text-gray-600 mt-1">
                Test all configured notifications across detectors
              </p>
            </div>
            <button
              @click="testAllNotifications"
              :disabled="testing || !hasNotifications"
              class="btn-primary flex items-center"
              :class="{ 'cursor-pointer': !(testing || !hasNotifications), 'opacity-50 cursor-not-allowed': (testing || !hasNotifications) }"
            >
              <BeakerIcon class="w-4 h-4 mr-2" />
              {{ testing ? 'Testing...' : 'Test All Notifications' }}
            </button>
          </div>
          
          <div v-if="!hasNotifications" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <div class="flex items-center">
              <ExclamationTriangleIcon class="w-4 h-4 mr-2" />
              No notifications are configured on any detectors
            </div>
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
import { useSpeechSettingsStore } from '../stores/speechSettings'
import { useSpeechSynthesis } from '../composables/useSpeechSynthesis'
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
const speechSettings = useSpeechSettingsStore()
const speechSynthesis = useSpeechSynthesis()

// Reactive data
const loading = ref(true)
const testing = ref(false)
const voiceTesting = ref(false)
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

const canTestVoiceAlerts = computed(() => {
  // Button should be enabled if speech is supported and enabled (regardless of detector count)
  // This allows testing even with no detectors to show appropriate feedback
  return speechSynthesis.isSupported.value && speechSettings.isEnabled()
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

// Test all voice alerts
async function testAllVoiceAlerts() {
  console.log('testAllVoiceAlerts called')
  console.log('canTestVoiceAlerts:', canTestVoiceAlerts.value)
  console.log('speechSynthesis.isSupported:', speechSynthesis.isSupported.value)
  console.log('speechSettings.isEnabled():', speechSettings.isEnabled())
  
  if (!canTestVoiceAlerts.value) {
    console.log('Cannot test voice alerts - prerequisites not met')
    return
  }
  
  voiceTesting.value = true
  
  try {
    // Extract detector names from configuration
    const detectors = config.value.detection?.detectors || []
    console.log('Available detectors:', detectors)
    
    const detectorNames = detectors.map(detector => detector.name).filter(name => name)
    console.log('Detector names:', detectorNames)
    
    if (detectorNames.length === 0) {
      // If no detectors, announce a test message instead
      const testMessage = 'Voice alerts are working. No detectors configured.'
      console.log('No detectors found, using test message:', testMessage)
      
      await speechSynthesis.speakText({ 
        text: testMessage,
        rate: 1.0,
        pitch: 1.0 
      })
      
      notificationStore.addNotification({
        type: 'info',
        message: 'Voice alerts test completed - no detectors configured'
      })
    } else {
      // Concatenate names with periods for natural pauses
      const speechText = detectorNames.join('. ') + '.'
      console.log('Speaking text:', speechText)
      
      // Speak all detector names in one call
      await speechSynthesis.speakText({ 
        text: speechText,
        rate: 1.0,
        pitch: 1.0 
      })
      
      notificationStore.addNotification({
        type: 'success',
        message: `Successfully announced ${detectorNames.length} detector names`
      })
    }
    
    // Add success result to test results
    testResults.value.unshift({
      detector: 'All Detectors',
      type: 'voice-alert',
      timing: 'announcement',
      success: true,
      timestamp: new Date().toISOString(),
      detectorCount: detectorNames.length
    })
    
  } catch (err) {
    console.error('Failed to test voice alerts:', err)
    
    // Add failure result to test results
    testResults.value.unshift({
      detector: 'All Detectors',
      type: 'voice-alert',
      timing: 'announcement',
      success: false,
      timestamp: new Date().toISOString(),
      error: err.message
    })
    
    notificationStore.addNotification({
      type: 'error',
      message: err.message || 'Failed to test voice alerts'
    })
  } finally {
    voiceTesting.value = false
  }
}

// Test all notifications
async function testAllNotifications() {
  if (!hasNotifications.value) return
  
  testing.value = true
  
  try {
    const response = await api.post('/notifications/test', { testAll: true })
    
    if (response.data.success) {
      // Add API results to test results display
      response.data.results.forEach(result => {
        testResults.value.unshift({
          detector: result.detector,
          type: 'all',
          timing: result.timing,
          success: result.success,
          timestamp: result.timestamp,
          error: result.error
        })
      })
      
      notificationStore.addNotification({
        type: 'success',
        message: response.data.message
      })
    } else {
      throw new Error(response.data.error || 'Unknown error')
    }
  } catch (err) {
    console.error('Failed to test notifications:', err)
    notificationStore.addNotification({
      type: 'error',
      message: err.response?.data?.error || err.message || 'Failed to test notifications'
    })
  } finally {
    testing.value = false
  }
}

// Handle individual notification test
async function handleTestNotification({ detector, type, timing, notifications }) {
  try {
    // Convert timing to API format
    const trigger = timing === 'pre' ? 'preRecording' : 'postRecording'
    
    // Test all notifications of this type for this detector
    const promises = notifications.map((notification, index) => {
      return api.post('/notifications/test', {
        detectorName: detector.name,
        trigger: trigger,
        type: type,
        index: index
      })
    })
    
    const responses = await Promise.allSettled(promises)
    
    responses.forEach((response, index) => {
      if (response.status === 'fulfilled' && response.value.data.success) {
        testResults.value.unshift({
          detector: detector.name,
          type: type,
          timing: timing,
          success: true,
          timestamp: response.value.data.result.timestamp,
          index: index
        })
      } else {
        const error = response.status === 'rejected' 
          ? response.reason.message 
          : response.value.data.error
          
        testResults.value.unshift({
          detector: detector.name,
          type: type,
          timing: timing,
          success: false,
          timestamp: new Date().toISOString(),
          index: index,
          error: error
        })
      }
    })
    
    const successCount = responses.filter(r => 
      r.status === 'fulfilled' && r.value.data.success
    ).length
    
    notificationStore.addNotification({
      type: successCount > 0 ? 'success' : 'error',
      message: `Tested ${successCount}/${notifications.length} ${type} ${timing} notifications for ${detector.name}`
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