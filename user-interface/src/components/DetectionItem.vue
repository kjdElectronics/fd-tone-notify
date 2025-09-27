<template>
  <div 
    :class="[
      'flex items-center justify-between p-4 rounded-lg',
      detection.type === 'discovery' 
        ? 'bg-gray-50 border border-gray-200' 
        : 'bg-green-50 border border-green-200'
    ]"
  >
    <div class="flex items-center space-x-3">
      <div 
        :class="[
          'w-2 h-2 rounded-full',
          detection.type === 'discovery' ? 'bg-gray-500' : 'bg-green-500'
        ]"
      ></div>
      <div>
        <div 
          :class="[
            'font-medium',
            detection.type === 'discovery' ? 'text-gray-700' : 'text-gray-900'
          ]"
        >
          {{ getDetectorName() }}
          <span v-if="detection.type === 'discovery'" class="text-gray-500 text-sm">(Discovery)</span>
        </div>
        <div class="text-sm text-gray-600">
          Tones: {{ getTonesDisplay() }}
        </div>
        <div v-if="showMatchAverages && detection.matchAverages" class="text-sm text-gray-500">
          Match: {{ getMatchDisplay() }}
        </div>
      </div>
    </div>
    <div class="flex items-center space-x-3">
      <!-- Create Detector Button for Discovery -->
      <button
        v-if="detection.type === 'discovery'"
        @click="handleCreateDetector"
        class="btn-secondary btn-sm"
        :disabled="isCreatingDetector"
      >
        <PlusIcon v-if="!isCreatingDetector" class="w-3 h-3 mr-1" />
        <span v-if="isCreatingDetector" class="w-3 h-3 mr-1 animate-spin rounded-full border border-gray-500 border-t-transparent"></span>
        {{ isCreatingDetector ? 'Creating...' : 'Create Detector' }}
      </button>
      
      <div class="text-xs text-gray-500">
        {{ formatTime(detection.timestamp) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useDetectorsStore } from '../stores/detectors'
import { PlusIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  detection: {
    type: Object,
    required: true
  },
  showMatchAverages: {
    type: Boolean,
    default: false
  }
})

// Store and state
const detectorsStore = useDetectorsStore()
const isCreatingDetector = ref(false)

// Methods
async function handleCreateDetector() {
  if (isCreatingDetector.value || props.detection.type !== 'discovery') return
  
  isCreatingDetector.value = true
  
  try {
    // Extract tones from discovery detection
    const discoveryTones = props.detection.detector?.tones || props.detection.tones || []
    
    if (discoveryTones.length === 0) {
      throw new Error('No tones found in discovery detection')
    }
    
    // Create detector using the store method
    await detectorsStore.createDetectorFromDiscovery(discoveryTones)
    
  } catch (error) {
    console.error('Failed to create detector from discovery:', error)
    // Error notification is handled by the store
  } finally {
    isCreatingDetector.value = false
  }
}

function getDetectorName() {
  if (props.detection.type === 'discovery') {
    return props.detection.detector?.name || 'All Tone Detector'
  }
  return props.detection.detector?.name || 'Unknown Detector'
}

function getTonesDisplay() {
  // For configured detectors, tones are in detection.detector.tones
  // For discovery detections, tones are in detection.tones
  const tones =  props.detection?.matchAverages || props.detection.detector?.tones || props.detection.tones

  if (!tones || !Array.isArray(tones) || tones.length === 0) {
    return 'N/A'
  }
  
  return `${tones.join(', ')} Hz`
}

function getMatchDisplay() {
  if (!props.detection.matchAverages || !Array.isArray(props.detection.matchAverages)) {
    return 'N/A'
  }
  
  return `${props.detection.matchAverages.map(m => parseFloat(m).toFixed(1)).join(', ')} Hz`
}

function formatTime(timestamp) {
  if (!timestamp) return 'N/A'
  
  // Check if timestamp is in file format (MM:SS.mmm) vs live detection format (milliseconds)
  if (typeof timestamp === 'string' && /^\d{2}:\d{2}\.\d{3}$/.test(timestamp)) {
    // File timestamp format - return as is (e.g., "00:02.000")
    return timestamp
  }
  
  // Live detection timestamp - convert to readable time
  return new Date(timestamp).toLocaleTimeString()
}
</script>