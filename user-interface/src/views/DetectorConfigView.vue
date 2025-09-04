<template>
  <div class="p-6">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">Detector Configuration</h1>
      <p class="text-gray-600">Manage tone detector configurations and settings</p>
    </div>

    <!-- Configuration Changed Banner -->
    <div v-if="configStore.needsRestart" class="alert-warning mb-6">
      <div class="flex items-center">
        <ExclamationTriangleIcon class="w-5 h-5 mr-2" />
        <div>
          <h3 class="font-medium">Configuration Changes Pending</h3>
          <p class="text-sm mt-1">Detector changes will not take effect until the backend is restarted.</p>
        </div>
      </div>
    </div>

    <!-- Detector Management -->
    <div class="space-y-6">
      <!-- Audio Configuration (Read-only) -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <SpeakerWaveIcon class="w-5 h-5 mr-2 text-fire-600" />
          Audio Configuration
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Sample Rate</label>
            <p class="text-lg font-semibold text-gray-900">{{ systemConfig.audio?.sampleRate || 'N/A' }} Hz</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Channels</label>
            <p class="text-lg font-semibold text-gray-900">{{ systemConfig.audio?.channels || 'N/A' }}</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Frequency Scale Factor</label>
            <p class="text-lg font-semibold text-gray-900">{{ systemConfig.audio?.frequencyScaleFactor || 'N/A' }}</p>
          </div>
        </div>
      </div>

      <!-- Default Detection Settings (Read-only) -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CogIcon class="w-5 h-5 mr-2 text-fire-600" />
          Default Detection Settings
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Match Threshold</label>
            <p class="text-lg font-semibold text-gray-900">{{ systemConfig.detection?.defaultMatchThreshold || 'N/A' }}</p>
            <p class="text-xs text-gray-500">Used for new detectors</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Tolerance</label>
            <p class="text-lg font-semibold text-gray-900">{{ formatPercent(systemConfig.detection?.defaultTolerancePercent) }}</p>
            <p class="text-xs text-gray-500">Default frequency tolerance</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Reset Timeout</label>
            <p class="text-lg font-semibold text-gray-900">{{ formatTimeout(systemConfig.detection?.defaultResetTimeoutMs) }}</p>
            <p class="text-xs text-gray-500">Default reset timeout</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <label class="text-sm font-medium text-gray-700">Lockout Timeout</label>
            <p class="text-lg font-semibold text-gray-900">{{ formatTimeout(systemConfig.detection?.defaultLockoutTimeoutMs) }}</p>
            <p class="text-xs text-gray-500">Default lockout timeout</p>
          </div>
        </div>
      </div>

      <!-- Tone Detectors Management -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900 flex items-center">
            <SpeakerWaveIcon class="w-5 h-5 mr-2 text-fire-600" />
            Tone Detectors
          </h2>
          <div class="flex items-center space-x-2">
            <span class="text-sm text-gray-600">Total:</span>
            <span class="font-semibold">{{ detectorsStore.detectorCount }}</span>
          </div>
        </div>
        
        <!-- Detector List Component -->
        <DetectorList
          v-if="!showInlineEdit"
          @add-detector="showInlineEditor()"
          @edit-detector="showInlineEditor($event.index, $event.detector)"
          @duplicate-detector="duplicateDetector"
        />
        
        <!-- Inline Detector Editor -->
        <DetectorInlineEdit
          v-if="showInlineEdit"
          :detector="editingDetector"
          :detector-index="editingDetectorIndex"
          @cancel="hideInlineEditor"
          @saved="handleDetectorSaved"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDetectorsStore } from '../stores/detectors'
import { useNotificationStore } from '../stores/notifications'
import { useConfigStore } from '../stores/config'
import api from '../utils/api'
import DetectorList from '../components/DetectorList.vue'
import DetectorInlineEdit from '../components/DetectorInlineEdit.vue'
import { 
  SpeakerWaveIcon, 
  CogIcon,
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'

// Stores
const detectorsStore = useDetectorsStore()
const notificationStore = useNotificationStore()
const configStore = useConfigStore()

// State
const systemConfig = ref({})
const showInlineEdit = ref(false)
const editingDetector = ref(null)
const editingDetectorIndex = ref(null)

// Load system configuration for read-only display
async function loadSystemConfig() {
  try {
    const response = await api.get('/config')
    
    if (response.data.success) {
      systemConfig.value = response.data.configuration || {}
    }
  } catch (error) {
    console.error('Failed to load system configuration:', error)
    notificationStore.addNotification({
      type: 'error',
      message: 'Failed to load system configuration'
    })
  }
}

// Inline editor management
function showInlineEditor(index = null, detector = null) {
  editingDetectorIndex.value = index
  editingDetector.value = detector
  showInlineEdit.value = true
}

function hideInlineEditor() {
  showInlineEdit.value = false
  editingDetector.value = null
  editingDetectorIndex.value = null
}

function handleDetectorSaved() {
  // Configuration change tracking is handled by the detectors store
  // Hide the inline editor after successful save
  hideInlineEditor()
}

function duplicateDetector(originalDetector) {
  // Create a copy of the detector with a new name
  const duplicatedDetector = {
    ...originalDetector,
    name: `${originalDetector.name} (Copy)`,
    notifications: originalDetector.notifications ? {
      preRecording: { ...originalDetector.notifications.preRecording },
      postRecording: { ...originalDetector.notifications.postRecording }
    } : undefined
  }
  
  showInlineEditor(null, duplicatedDetector)
}

// Helper functions
function formatTimeout(ms) {
  if (!ms && ms !== 0) return 'N/A'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatPercent(value) {
  if (!value && value !== 0) return 'N/A'
  return `${(value * 100).toFixed(1)}%`
}

// Initialize
onMounted(async () => {
  await Promise.all([
    loadSystemConfig(),
    detectorsStore.fetchDetectors()
  ])
})
</script>