<template>
  <div class="p-6">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">Detector Configuration</h1>
      <p class="text-gray-600">View current tone detector configurations and audio settings</p>
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

    <!-- Configuration Display -->
    <div v-else class="space-y-6">
      <!-- Audio Configuration -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <SpeakerWaveIcon class="w-5 h-5 mr-2 text-fire-600" />
          Audio Configuration
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Sample Rate</label>
            <p class="text-lg font-semibold text-gray-900">{{ config.audio?.sampleRate || 'N/A' }} Hz</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Channels</label>
            <p class="text-lg font-semibold text-gray-900">{{ config.audio?.channels || 'N/A' }}</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Frequency Scale Factor</label>
            <p class="text-lg font-semibold text-gray-900">{{ config.audio?.frequencyScaleFactor || 'N/A' }}</p>
          </div>
        </div>
      </div>

      <!-- Default Detection Settings -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CogIcon class="w-5 h-5 mr-2 text-fire-600" />
          Default Detection Settings
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Match Threshold</label>
            <p class="text-lg font-semibold text-gray-900">{{ config.detection?.defaultMatchThreshold || 'N/A' }}</p>
            <p class="text-xs text-gray-500">Minimum match score for detection</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Tolerance</label>
            <p class="text-lg font-semibold text-gray-900">{{ (config.detection?.defaultTolerancePercent * 100) || 'N/A' }}%</p>
            <p class="text-xs text-gray-500">Frequency tolerance percentage</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Reset Timeout</label>
            <p class="text-lg font-semibold text-gray-900">{{ formatTimeout(config.detection?.defaultResetTimeoutMs) }}</p>
            <p class="text-xs text-gray-500">Time before reset detection</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Lockout Timeout</label>
            <p class="text-lg font-semibold text-gray-900">{{ formatTimeout(config.detection?.defaultLockoutTimeoutMs) }}</p>
            <p class="text-xs text-gray-500">Minimum time between detections</p>
          </div>
        </div>
      </div>

      <!-- Tone Detectors -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900 flex items-center">
            <SpeakerWaveIcon class="w-5 h-5 mr-2 text-fire-600" />
            Configured Tone Detectors
          </h2>
          <div class="flex items-center space-x-2">
            <span class="text-sm text-gray-600">Total:</span>
            <span class="font-semibold">{{ config.detection?.detectors?.length || 0 }}</span>
          </div>
        </div>

        <div v-if="!config.detection?.detectors || config.detection.detectors.length === 0" class="text-center py-8 text-gray-500">
          No tone detectors configured
        </div>

        <div v-else class="space-y-4">
          <DetectorCard
            v-for="(detector, index) in config.detection.detectors"
            :key="`detector-${index}`"
            :detector="detector"
            :index="index"
            :defaults="config.detection"
            :expand-notifications="false"
            :show-test-buttons="false"
          />
        </div>
      </div>

      <!-- Refresh Button -->
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-medium text-gray-900">Configuration Status</h3>
            <p class="text-sm text-gray-600">
              Last updated: {{ lastUpdated ? formatTime(lastUpdated) : 'Never' }}
            </p>
          </div>
          <button
            @click="loadConfig"
            :disabled="loading"
            class="btn-primary"
          >
            {{ loading ? 'Refreshing...' : 'Refresh Configuration' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useNotificationStore } from '../stores/notifications'
import api from '../utils/api'
import DetectorCard from '../components/DetectorCard.vue'
import { 
  SpeakerWaveIcon, 
  CogIcon 
} from '@heroicons/vue/24/outline'

const notificationStore = useNotificationStore()

// Reactive data
const loading = ref(true)
const error = ref(null)
const config = ref({})
const lastUpdated = ref(null)

// Load configuration from main backend
async function loadConfig() {
  loading.value = true
  error.value = null
  
  try {
    // Use authenticated API to get config
    const response = await api.get('/config')
    
    if (response.data.success) {
      config.value = response.data.configuration
      lastUpdated.value = new Date().toISOString()
      
      notificationStore.addNotification({
        type: 'success',
        message: 'Detector configuration loaded successfully'
      })
    } else {
      throw new Error(response.data.error || 'Failed to load configuration')
    }
  } catch (err) {
    error.value = err.response?.data?.error || err.message || 'Failed to load configuration'
    console.error('Failed to load detector config:', err)
    
    notificationStore.addNotification({
      type: 'error',
      message: 'Failed to load detector configuration'
    })
  } finally {
    loading.value = false
  }
}

// Helper functions
function formatTimeout(ms) {
  if (!ms) return 'N/A'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(timestamp) {
  if (!timestamp) return 'N/A'
  return new Date(timestamp).toLocaleString()
}

onMounted(() => {
  loadConfig()
})
</script>