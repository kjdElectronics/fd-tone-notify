<template>
  <div class="p-6">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">File Analysis</h1>
      <p class="text-gray-600">Upload and analyze audio files to detect tones using existing detectors</p>
    </div>

    <!-- File Upload Section -->
    <div class="card mb-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <DocumentArrowUpIcon class="w-5 h-5 mr-2 text-fire-600" />
        Audio File Upload
      </h2>

      <!-- Drag & Drop Zone -->
      <div
        @drop="handleDrop"
        @dragover.prevent
        @dragenter.prevent
        @dragleave="isDragOver = false"
        @dragover="isDragOver = true"
        :class="[
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
          isDragOver 
            ? 'border-fire-500 bg-fire-50' 
            : selectedFile 
              ? 'border-green-500 bg-green-50' 
              : 'border-gray-300 hover:border-gray-400'
        ]"
      >
        <div v-if="!selectedFile">
          <CloudArrowUpIcon class="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <div class="space-y-2">
            <p class="text-lg font-medium text-gray-900">
              Drop your audio file here
            </p>
            <p class="text-sm text-gray-600">
              or 
              <button
                @click="triggerFileInput"
                class="text-fire-600 hover:text-fire-700 font-medium"
              >
                browse to upload
              </button>
            </p>
            <p class="text-xs text-gray-500">
              Supported formats: WAV, MP3 (max 50MB)
            </p>
          </div>
        </div>

        <!-- Selected File Display -->
        <div v-else class="space-y-3">
          <CheckCircleIcon class="w-12 h-12 mx-auto text-green-500" />
          <div>
            <p class="font-medium text-gray-900">{{ selectedFile.name }}</p>
            <p class="text-sm text-gray-600">{{ formatFileSize(selectedFile.size) }}</p>
          </div>
          <button
            @click="clearFile"
            class="text-sm text-red-600 hover:text-red-700"
          >
            Remove file
          </button>
        </div>
      </div>

      <!-- Hidden File Input -->
      <input
        ref="fileInput"
        type="file"
        accept=".wav,.mp3"
        @change="handleFileSelect"
        class="hidden"
      />

      <!-- Processing Options -->
      <div class="mt-6 space-y-4">
        <div class="flex items-center space-x-2">
          <input
            v-model="enableAllToneDetector"
            id="enableAllToneDetector"
            type="checkbox"
            class="rounded border-gray-300 text-fire-600 focus:ring-fire-500"
          />
          <label for="enableAllToneDetector" class="text-sm font-medium text-gray-700">
            All Tone Detector (Discover new tones in uploaded files - Slower)
          </label>
        </div>

        <div class="flex items-center space-x-2">
          <input
            v-model="processNotifications"
            id="processNotifications"
            type="checkbox"
            class="rounded border-gray-300 text-fire-600 focus:ring-fire-500"
          />
          <label for="processNotifications" class="text-sm font-medium text-gray-700">
            Process notifications (send alerts if tones are detected)
          </label>
        </div>

        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-600">
            Will use {{ detectorCount }} configured detector{{ detectorCount !== 1 ? 's' : '' }} from system config
          </p>
          
          <button
            @click="analyzeFile"
            :disabled="!selectedFile || isAnalyzing"
            class="btn-primary"
            :class="{ 'opacity-50 cursor-not-allowed': !selectedFile || isAnalyzing }"
          >
            <span v-if="isAnalyzing" class="flex items-center">
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Analyzing...
            </span>
            <span v-else>Analyze File</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Analysis Results -->
    <div v-if="analysisResults" class="card mb-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <ChartBarIcon class="w-5 h-5 mr-2 text-fire-600" />
        Analysis Results
      </h2>

      <!-- Analysis Summary -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-green-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-green-600">{{ analysisResults.detections?.length || 0 }}</div>
          <div class="text-sm text-green-800">Configured Detections</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-gray-600">{{ analysisResults.allToneDetections?.length || 0 }}</div>
          <div class="text-sm text-gray-800">Discovered Tones</div>
        </div>
        <div class="bg-blue-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-blue-600">{{ analysisResults.duration ? Number(analysisResults.duration).toFixed(2) : 'N/A' }}s</div>
          <div class="text-sm text-blue-800">File Duration</div>
        </div>
        <div class="bg-purple-50 p-4 rounded-lg">
          <div class="text-2xl font-bold text-purple-600">{{ analysisResults.processingTimeMs || 'N/A' }}ms</div>
          <div class="text-sm text-purple-800">Processing Time</div>
        </div>
      </div>

      <!-- Detection Results -->
      <div v-if="analysisResults.detections && analysisResults.detections.length > 0">
        <h3 class="font-medium text-gray-900 mb-3">Detected Tones</h3>
        <div class="space-y-3">
          <DetectionItem
            v-for="(detection, index) in formattedDetections"
            :key="index"
            :detection="detection"
            :showMatchAverages="true"
          />
        </div>
      </div>

      <!-- Discovered Tones Results -->
      <div v-if="analysisResults.allToneDetections && analysisResults.allToneDetections.length > 0" class="mt-8">
        <h3 class="font-medium text-gray-900 mb-3">Discovered Tones (All Tone Detector)</h3>
        <div class="space-y-3">
          <DetectionItem
            v-for="(detection, index) in formattedAllToneDetections"
            :key="`all-tone-${index}`"
            :detection="detection"
            :showMatchAverages="true"
          />
        </div>
      </div>

      <div v-else-if="(!analysisResults.detections || analysisResults.detections.length === 0) && (!analysisResults.allToneDetections || analysisResults.allToneDetections.length === 0)" class="text-center py-8 text-gray-500">
        <ExclamationTriangleIcon class="w-12 h-12 mx-auto mb-2 text-gray-300" />
        <p>No tones detected in the uploaded file</p>
        <p class="text-sm">The file was analyzed but no matching tone patterns were found</p>
      </div>

      <!-- Processing Log -->
      <div v-if="analysisResults.logs && analysisResults.logs.length > 0" class="mt-6">
        <h3 class="font-medium text-gray-900 mb-3">Processing Log</h3>
        <div class="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm max-h-32 overflow-y-auto">
          <div v-for="(log, index) in analysisResults.logs" :key="index" class="mb-1">
            {{ log }}
          </div>
        </div>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="analysisError" class="card mb-6">
      <div class="flex items-start space-x-3">
        <ExclamationTriangleIcon class="w-6 h-6 text-red-500 mt-1" />
        <div>
          <h3 class="font-medium text-red-900">Analysis Failed</h3>
          <p class="text-sm text-red-700 mt-1">{{ analysisError }}</p>
          <button
            @click="analysisError = null"
            class="text-sm text-red-600 hover:text-red-700 mt-2"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>

    <!-- Coming Soon Features -->
    <div class="card">
      <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <CogIcon class="w-5 h-5 mr-2 text-fire-600" />
        Additional Features
      </h2>
      <div class="space-y-2 text-sm text-gray-500">
        <p>• All Tone Detector analysis (frequency spectrum scanning)</p>
        <p>• Visual frequency analysis charts</p>
        <p>• Custom detector creation from analysis</p>
        <p>• Batch file processing</p>
        <p>• Export detection results</p>
      </div>
      <div class="mt-4 inline-flex items-center px-3 py-1 bg-fire-100 text-fire-700 rounded-lg text-sm">
        <span class="w-2 h-2 bg-fire-500 rounded-full mr-2"></span>
        Coming Soon
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useNotificationStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import api from '../utils/api'
import DetectionItem from '../components/DetectionItem.vue'
import { 
  DocumentArrowUpIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CogIcon
} from '@heroicons/vue/24/outline'

const notificationStore = useNotificationStore()
const authStore = useAuthStore()

// Reactive data
const selectedFile = ref(null)
const isDragOver = ref(false)
const enableAllToneDetector = ref(true)
const processNotifications = ref(false)
const isAnalyzing = ref(false)
const analysisResults = ref(null)
const analysisError = ref(null)
const fileInput = ref(null)
const detectorCount = ref(0)

// Format detections for the DetectionItem component
const formattedDetections = computed(() => {
  if (!analysisResults.value?.detections) return []
  
  return analysisResults.value.detections.map(detection => ({
    ...detection,
    type: 'configured',
    detector: {
      name: detection.detector,
      tones: detection.tones
    }
  }))
})

const formattedAllToneDetections = computed(() => {
  if (!analysisResults.value?.allToneDetections) return []
  
  return analysisResults.value.allToneDetections.map(detection => ({
    ...detection,
    type: 'discovery',
    detector: {
      name: detection.detector || 'All Tone Detector'
    }
  }))
})

// Load detector count from config
async function loadDetectorConfig() {
  try {
    const response = await api.get('/config')
    if (response.data.success) {
      detectorCount.value = response.data.detectors?.length || 0
    }
  } catch (error) {
    console.error('Failed to load detector config:', error)
  }
}

// File handling functions
function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    validateAndSetFile(file)
  }
}

function handleDrop(event) {
  event.preventDefault()
  isDragOver.value = false
  
  const files = event.dataTransfer.files
  if (files.length > 0) {
    validateAndSetFile(files[0])
  }
}

function validateAndSetFile(file) {
  // Check file type
  const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-wav']
  const validExtensions = ['.wav', '.mp3']
  
  const hasValidType = validTypes.includes(file.type)
  const hasValidExtension = validExtensions.some(ext => 
    file.name.toLowerCase().endsWith(ext)
  )
  
  if (!hasValidType && !hasValidExtension) {
    notificationStore.addNotification({
      type: 'error',
      message: 'Please select a valid audio file (WAV or MP3)'
    })
    return
  }
  
  // Check file size (50MB limit)
  const maxSize = 50 * 1024 * 1024 // 50MB in bytes
  if (file.size > maxSize) {
    notificationStore.addNotification({
      type: 'error',
      message: 'File size must be less than 50MB'
    })
    return
  }
  
  selectedFile.value = file
  // Clear previous results
  analysisResults.value = null
  analysisError.value = null
  
  notificationStore.addNotification({
    type: 'success',
    message: `File "${file.name}" selected successfully`
  })
}

function clearFile() {
  selectedFile.value = null
  analysisResults.value = null
  analysisError.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

// Analysis function
async function analyzeFile() {
  if (!selectedFile.value) {
    notificationStore.addNotification({
      type: 'error',
      message: 'Please select a file first'
    })
    return
  }
  
  isAnalyzing.value = true
  analysisError.value = null
  
  try {
    // Create FormData for file upload using the existing API format
    const formData = new FormData()
    formData.append('file', selectedFile.value) // API expects 'file' not 'audioFile'
    formData.append('enableNotifications', processNotifications.value.toString())
    formData.append('enableAllToneDetector', enableAllToneDetector.value.toString())
    
    // Make API request to existing detections endpoint
    const response = await api.post('/detections', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${authStore.token}`
      },
      timeout: 300000 // 5 minute timeout for file processing
    })
    
    if (response.data.success) {
      // Transform the response to match our UI expectations
      analysisResults.value = {
        success: true,
        detections: response.data.detections || [],
        allToneDetections: response.data.allToneDetections || [],
        duration: response.data.durationSeconds,
        filename: response.data.filename,
        processed: response.data.processed,
        requestId: response.data.requestId,
        processingTimeMs: response.data.processingTimeMs
      }
      
      const detectionCount = response.data.detections?.length || 0
      const allToneCount = response.data.allToneDetections?.length || 0
      const totalCount = detectionCount + allToneCount
      notificationStore.addNotification({
        type: 'success',
        message: `Analysis complete! Found ${detectionCount} configured detection${detectionCount !== 1 ? 's' : ''} and ${allToneCount} discovered tone${allToneCount !== 1 ? 's' : ''}`
      })
    } else {
      throw new Error(response.data.error || 'Analysis failed')
    }
    
  } catch (error) {
    console.error('File analysis failed:', error)
    
    let errorMessage = 'Failed to analyze file'
    if (error.response?.data?.error) {
      errorMessage = error.response.data.error
    } else if (error.message) {
      errorMessage = error.message
    }
    
    analysisError.value = errorMessage
    
    notificationStore.addNotification({
      type: 'error',
      message: `Analysis failed: ${errorMessage}`
    })
  } finally {
    isAnalyzing.value = false
  }
}

// Utility functions
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatTime(timestamp) {
  if (!timestamp) return 'N/A'
  return new Date(timestamp).toLocaleTimeString()
}

// Load detector config on mount
onMounted(() => {
  loadDetectorConfig()
})
</script>