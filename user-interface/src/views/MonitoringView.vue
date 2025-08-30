<template>
  <div class="p-6">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">Live Monitoring</h1>
      <p class="text-gray-600">Real-time tone detection monitoring and system logs</p>
    </div>

    <!-- Connection Status -->
    <div class="mb-6">
      <div class="card">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2">
              <div 
                class="w-3 h-3 rounded-full"
                :class="socketStore.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'"
              ></div>
              <span class="text-sm font-medium">
                {{ socketStore.connected ? 'Connected to Tone Detection Backend' : 'Disconnected' }}
              </span>
            </div>
            <div v-if="socketStore.systemStatus.lastUpdate" class="text-xs text-gray-500">
              Last update: {{ formatTime(socketStore.systemStatus.lastUpdate) }}
            </div>
          </div>
          <div class="flex items-center space-x-4">
            <div class="text-sm">
              <span class="text-gray-600">Total Detections:</span>
              <span class="font-semibold ml-1">{{ socketStore.systemStatus.statistics.totalDetections }}</span>
            </div>
            <button
              @click="clearLogs"
              class="btn-secondary text-xs"
            >
              Clear Logs
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Detections -->
    <div class="mb-6">
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <SpeakerWaveIcon class="w-5 h-5 mr-2 text-fire-600" />
          Recent Tone Detections
        </h2>
        <div v-if="socketStore.systemStatus.detections.length === 0" class="text-center py-8 text-gray-500">
          No tone detections yet. Waiting for activity...
        </div>
        <div v-else class="space-y-2 max-h-64 overflow-y-auto">
          <DetectionItem
            v-for="detection in socketStore.systemStatus.detections"
            :key="`detection-${detection.timestamp}`"
            :detection="detection"
            :showMatchAverages="false"
          />
        </div>
      </div>
    </div>

    <!-- Real-time Logs -->
    <div class="card">
      <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <DocumentTextIcon class="w-5 h-5 mr-2 text-fire-600" />
        Real-time System Logs
        <div class="ml-auto flex items-center space-x-2">
          <div class="flex items-center space-x-1">
            <label class="text-xs text-gray-600">Level:</label>
            <select
              v-model="selectedLogLevel"
              class="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              <option value="silly">SILLY (All)</option>
              <option value="debug">DEBUG+</option>
              <option value="info">INFO+</option>
              <option value="notice">NOTICE+</option>
              <option value="warning">WARNING+</option>
              <option value="error">ERROR+</option>
              <option value="alert">ALERT+</option>
              <option value="emergency">EMERGENCY</option>
            </select>
          </div>
          <button
            @click="scrollToBottom"
            class="btn-secondary text-xs"
          >
            Scroll to Bottom
          </button>
          <label class="flex items-center space-x-1">
            <input
              v-model="autoScroll"
              type="checkbox"
              class="rounded border-gray-300 text-fire-600 focus:ring-fire-500"
            />
            <span class="text-xs text-gray-600">Auto-scroll</span>
          </label>
        </div>
      </h2>
      
      <div 
        ref="logContainer"
        class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-96 overflow-y-auto"
      >
        <div v-if="allLogs.length === 0" class="text-gray-500">
          Waiting for log messages...
        </div>
        <div
          v-for="log in allLogs"
          :key="`log-${log.timestamp}-${log.id}`"
          class="mb-1"
          :class="getLogClass(log.level)"
        >
          <span class="text-gray-500">[{{ formatTime(log.timestamp) }}]</span>
          <span class="ml-2" :class="getLogTypeClass(log.level)">[{{ log.level?.toUpperCase() || 'INFO' }}]</span>
          <span class="ml-2" v-html="renderColorizedText(log.message || log.data || JSON.stringify(log), log.colorData)"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useSocketStore } from '../stores/socket'
import { useManagerSocketStore } from '../stores/manager-socket'
import DetectionItem from '../components/DetectionItem.vue'
import { 
  SpeakerWaveIcon, 
  DocumentTextIcon 
} from '@heroicons/vue/24/outline'

const socketStore = useSocketStore()
const managerSocketStore = useManagerSocketStore()
const logContainer = ref(null)
const autoScroll = ref(true)
const selectedLogLevel = ref(localStorage.getItem('logFilterLevel') || 'info')

// Winston log level hierarchy (based on CoralogixWinstonTransport.js)
const LOG_LEVELS = {
  silly: 0,
  debug: 1,
  info: 2,
  success: 2, // alias for info as defined in logger.js
  notice: 3,
  warning: 4,
  warn: 4, // alias for warning
  error: 5,
  err: 5, // alias for error
  alert: 6,
  emergency: 7,
  emerg: 7 // alias for emergency
}

// Generic log filtering function
function shouldShowLog(logLevel, filterLevel) {
  const logLevelNum = LOG_LEVELS[logLevel?.toLowerCase()] ?? LOG_LEVELS.info
  const filterLevelNum = LOG_LEVELS[filterLevel?.toLowerCase()] ?? LOG_LEVELS.info
  return logLevelNum >= filterLevelNum
}

// Combine all log-like events into a single stream with filtering
const allLogs = computed(() => {
  const logs = []
  
  // Add system logs from manager (unified logging)
  managerSocketStore.managerStatus.logs.forEach((log, index) => {
    const logEntry = {
      ...log,
      id: `log-${index}-${log.timestamp}`
    }
    
    // Apply log level filtering
    if (shouldShowLog(log.level || log.type, selectedLogLevel.value)) {
      logs.push(logEntry)
    }
  })
  
  // Add detection events as logs (always show detections as they're important)
  socketStore.systemStatus.detections.forEach((detection, index) => {
    // Get tones from the correct location based on detection type
    const tones = detection.detector?.tones || detection.tones || []
    const tonesDisplay = tones.length > 0 ? `${tones.join(', ')} Hz` : 'N/A Hz'
    
    logs.push({
      id: `detection-${index}-${detection.timestamp}`,
      timestamp: detection.timestamp,
      type: 'detection',
      level: 'info', // Treat detections as info level
      message: `Tone detected by ${detection.detector?.name || 'Unknown'}: ${tonesDisplay}`
    })
  })
  
  // Sort by timestamp (oldest first, newest at bottom)
  return logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-1000)
})

// Watch for new logs and auto-scroll if enabled
watch(allLogs, async (newLogs, oldLogs) => {
  if (autoScroll.value && newLogs.length > oldLogs.length) {
    await nextTick()
    scrollToBottom()
  }
}, { deep: true })

// Watch log level changes and save to localStorage
watch(selectedLogLevel, (newLevel) => {
  localStorage.setItem('logFilterLevel', newLevel)
}, { immediate: false })

function scrollToBottom() {
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

function formatTime(timestamp) {
  if (!timestamp) return 'N/A'
  return new Date(timestamp).toLocaleTimeString()
}

function getLogClass(level) {
  switch (level) {
    case 'emergency':
    case 'emerg':
      return 'text-red-300'
    case 'alert':
      return 'text-red-300'
    case 'error':
    case 'err':
      return 'text-red-400'
    case 'warning':
    case 'warn':
      return 'text-yellow-300'
    case 'notice':
      return 'text-blue-300'
    case 'info':
      return 'text-gray-300'
    case 'success':
      return 'text-green-300'
    case 'debug':
      return 'text-gray-400'
    case 'silly':
      return 'text-gray-500'
    case 'detection':
      return 'text-green-300'
    default:
      return 'text-gray-300'
  }
}

function getLogTypeClass(level) {
  switch (level) {
    case 'emergency':
    case 'emerg':
      return 'text-red-400 font-bold bg-red-900/20 px-1 rounded'
    case 'alert':
      return 'text-orange-400 font-bold bg-orange-900/20 px-1 rounded'
    case 'error':
    case 'err':
      return 'text-red-400 font-bold'
    case 'warning':
    case 'warn':
      return 'text-yellow-400 font-bold'
    case 'notice':
      return 'text-blue-400 font-bold'
    case 'info':
      return 'text-gray-400'
    case 'success':
      return 'text-green-400 font-bold'
    case 'debug':
      return 'text-gray-500'
    case 'silly':
      return 'text-gray-600'
    case 'detection':
      return 'text-green-400 font-bold'
    default:
      return 'text-gray-400'
  }
}

function clearLogs() {
  managerSocketStore.clearLogs()
  socketStore.systemStatus.detections.splice(0)
}

function renderColorizedText(text, colorData) {
  if (!text || !colorData || colorData.length === 0) {
    return text || ''
  }

  const colorMap = {
    'black': '#374151',
    'red': '#EF4444',
    'green': '#10B981',
    'yellow': '#F59E0B',
    'blue': '#3B82F6',
    'magenta': '#A855F7',
    'cyan': '#06B6D4',
    'white': '#D1D5DB',
    'brightBlack': '#6B7280',
    'brightRed': '#F87171',
    'brightGreen': '#34D399',
    'brightYellow': '#FBBF24',
    'brightBlue': '#60A5FA',
    'brightMagenta': '#C084FC',
    'brightCyan': '#22D3EE',
    'brightWhite': '#F3F4F6'
  }

  let result = ''
  let lastEnd = 0

  // Sort color data by start position
  const sortedColorData = [...colorData].sort((a, b) => a.start - b.start)

  sortedColorData.forEach(({ start, end, color, bold }) => {
    // Add text before this colored section
    if (start > lastEnd) {
      result += text.slice(lastEnd, start)
    }

    // Add the colored text
    const coloredText = text.slice(start, end)
    const styles = []
    
    if (color && colorMap[color]) {
      styles.push(`color: ${colorMap[color]}`)
    }
    if (bold) {
      styles.push('font-weight: bold')
    }

    if (styles.length > 0) {
      result += `<span style="${styles.join('; ')}">${coloredText}</span>`
    } else {
      result += coloredText
    }

    lastEnd = end
  })

  // Add any remaining text
  if (lastEnd < text.length) {
    result += text.slice(lastEnd)
  }

  return result
}

// Removed simulated logs - now using real logs from manager WebSocket
// All logs now come through the unified Winston logging system via manager WebSocket

onMounted(() => {
  // Connect to manager WebSocket on mount for real-time logs
  if (!managerSocketStore.connected) {
    managerSocketStore.connect()
  }
})

onUnmounted(() => {
  // Manager WebSocket connection is managed globally, no cleanup needed here
})
</script>