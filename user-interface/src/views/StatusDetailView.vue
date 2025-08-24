<template>
  <div class="p-6">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">System Status Details</h1>
      <p class="text-gray-600">Advanced technical information and comprehensive system status</p>
    </div>

    <!-- Loading State -->
    <div v-if="loading && !statusData.timestamp" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-fire-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading detailed status...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error && !statusData.timestamp" class="alert-emergency mb-6">
      <h3 class="font-medium">Failed to load status details</h3>
      <p class="text-sm mt-1">{{ error }}</p>
      <button @click="loadStatus" class="mt-2 btn-primary">Retry</button>
    </div>

    <!-- Status Details -->
    <div v-else class="space-y-6">
      <!-- Overall System Status -->

      
      <!-- Additional Status Information -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Status Details</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600 mb-2">Last Updated</p>
            <p class="text-sm">{{ formatTime(statusData.timestamp) }}</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <SystemStatusCard
                :show-title="true"
                :title-icon="ServerIcon"
                :show-description="true"
            />
          </div>
        </div>
      </div>

      <!-- Manager Status -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CogIcon class="w-5 h-5 mr-2 text-fire-600" />
          Process Manager
        </h2>
        <div v-if="statusData.manager" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600 mb-2">Status</p>
            <div class="flex items-center space-x-2">
              <div class="w-3 h-3 rounded-full bg-green-500"></div>
              <span class="text-sm capitalize">{{ statusData.manager.status || 'Running' }}</span>
            </div>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600 mb-2">Uptime</p>
            <p class="text-sm">{{ formatUptime(liveUptimes.manager || statusData.manager.uptime) }}</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600 mb-2">Started</p>
            <p class="text-sm">{{ formatTime(statusData.manager.startTime) }}</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600 mb-2">Node Version</p>
            <p class="text-sm">{{ statusData.manager.nodeVersion || 'N/A' }}</p>
          </div>
        </div>
      </div>

      <!-- Process Details -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CommandLineIcon class="w-5 h-5 mr-2 text-fire-600" />
          Managed Processes
        </h2>
        <div v-if="statusData.processDetails && statusData.processDetails.length > 0" class="space-y-4">
          <div 
            v-for="process in statusData.processDetails" 
            :key="process.name"
            class="border border-gray-200 rounded-lg p-4"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center space-x-3">
                <div 
                  class="w-4 h-4 rounded-full"
                  :class="getStatusColor(process.status)"
                ></div>
                <h3 class="font-medium text-gray-900 capitalize">{{ process.name }} Process</h3>
              </div>
              <span 
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getStatusBadgeClass(process.status)"
              >
                {{ process.status }}
              </span>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p class="text-gray-600">PID</p>
                <p class="font-mono">{{ process.pid || 'N/A' }}</p>
              </div>
              <div>
                <p class="text-gray-600">Running</p>
                <p>{{ process.healthy ? 'Yes' : 'No' }}</p>
              </div>
              <div>
                <p class="text-gray-600">Uptime</p>
                <p>{{ formatUptime(liveUptimes[process.name] || process.uptime) }}</p>
              </div>
              <div>
                <p class="text-gray-600">Last Update</p>
                <p>{{ formatTime(process.lastUpdate) }}</p>
              </div>
            </div>
            
            <div v-if="process.errorMessage" class="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-sm text-red-800">
                <span class="font-medium">Error:</span> {{ process.errorMessage }}
              </p>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8 text-gray-500">
          No process details available
        </div>
      </div>

      <!-- Process Summary -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <ChartBarIcon class="w-5 h-5 mr-2 text-fire-600" />
          Process Summary
        </h2>
        <div v-if="statusData.summary" class="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div class="bg-gray-50 p-4 rounded-lg text-center">
            <p class="text-2xl font-bold text-gray-900">{{ statusData.summary.total || 0 }}</p>
            <p class="text-sm text-gray-600">Total</p>
          </div>
          <div class="bg-green-50 p-4 rounded-lg text-center">
            <p class="text-2xl font-bold text-green-600">{{ statusData.summary.running || 0 }}</p>
            <p class="text-sm text-gray-600">Running</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg text-center">
            <p class="text-2xl font-bold text-gray-600">{{ statusData.summary.stopped || 0 }}</p>
            <p class="text-sm text-gray-600">Stopped</p>
          </div>
          <div class="bg-yellow-50 p-4 rounded-lg text-center">
            <p class="text-2xl font-bold text-yellow-600">{{ statusData.summary.starting || 0 }}</p>
            <p class="text-sm text-gray-600">Starting</p>
          </div>
          <div class="bg-orange-50 p-4 rounded-lg text-center">
            <p class="text-2xl font-bold text-orange-600">{{ statusData.summary.stopping || 0 }}</p>
            <p class="text-sm text-gray-600">Stopping</p>
          </div>
          <div class="bg-red-50 p-4 rounded-lg text-center">
            <p class="text-2xl font-bold text-red-600">{{ statusData.summary.error || 0 }}</p>
            <p class="text-sm text-gray-600">Error</p>
          </div>
        </div>
      </div>

      <!-- Memory Usage -->
      <div v-if="statusData.manager && statusData.manager.memory" class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CpuChipIcon class="w-5 h-5 mr-2 text-fire-600" />
          Memory Usage
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600 mb-2">RSS</p>
            <p class="text-sm font-mono">{{ formatBytes(statusData.manager.memory.rss) }}</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600 mb-2">Heap Total</p>
            <p class="text-sm font-mono">{{ formatBytes(statusData.manager.memory.heapTotal) }}</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600 mb-2">Heap Used</p>
            <p class="text-sm font-mono">{{ formatBytes(statusData.manager.memory.heapUsed) }}</p>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600 mb-2">External</p>
            <p class="text-sm font-mono">{{ formatBytes(statusData.manager.memory.external) }}</p>
          </div>
        </div>
      </div>

      <!-- Raw Data (Collapsible) -->
      <div class="card">
        <details>
          <summary class="text-lg font-semibold text-gray-900 mb-4 cursor-pointer hover:text-gray-700">
            Raw Status Data (Advanced)
          </summary>
          <div class="mt-4">
            <pre class="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-96 font-mono">{{ JSON.stringify(statusData, null, 2) }}</pre>
          </div>
        </details>
      </div>

      <!-- Refresh Controls -->
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-medium text-gray-900">Auto Refresh</h3>
            <p class="text-sm text-gray-600">Automatically update status information</p>
          </div>
          <div class="flex items-center space-x-4">
            <label class="flex items-center space-x-2">
              <input
                v-model="autoRefresh"
                type="checkbox"
                class="rounded border-gray-300 text-fire-600 focus:ring-fire-500"
              />
              <span class="text-sm text-gray-700">Enable</span>
            </label>
            <button
              @click="loadStatus"
              :disabled="loading"
              class="btn-primary"
            >
              {{ loading ? 'Refreshing...' : 'Refresh Now' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useManagerSocketStore } from '../stores/manager-socket'
import { useNotificationStore } from '../stores/notifications'
import SystemStatusCard from '../components/SystemStatusCard.vue'
import {
  ServerIcon,
  CogIcon,
  CommandLineIcon,
  ChartBarIcon,
  CpuChipIcon
} from '@heroicons/vue/24/outline'

const managerSocketStore = useManagerSocketStore()
const notificationStore = useNotificationStore()

const loading = ref(true)
const error = ref(null)
const statusData = ref({})
const autoRefresh = ref(true)
let refreshInterval = null
let uptimeInterval = null

// Live uptime tracking for processes
const liveUptimes = ref({})

async function loadStatus() {
  // Don't show loading if we already have data (prevents flashing)
  if (!statusData.value.timestamp) {
    loading.value = true
  }
  error.value = null
  
  try {
    const response = await fetch('http://localhost:3001/status')
    
    if (!response.ok) {
      throw new Error(`Failed to fetch status: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to load status')
    }
    
    // Only update if data has actually changed to prevent unnecessary re-renders
    const newDataString = JSON.stringify(result.data)
    const currentDataString = JSON.stringify(statusData.value)
    
    if (newDataString !== currentDataString) {
      statusData.value = result.data
    }
    
  } catch (err) {
    // Only show error if we don't have existing data
    if (!statusData.value.timestamp) {
      error.value = err.message
    }
    console.error('Failed to load status:', err)
    
    // Fallback to manager socket store data if available
    if (managerSocketStore.connected) {
      const fallbackData = {
        overall: managerSocketStore.managerStatus.overall,
        healthy: managerSocketStore.managerStatus.overall === 'healthy',
        timestamp: new Date().toISOString(),
        manager: managerSocketStore.managerStatus.manager,
        processDetails: Object.entries(managerSocketStore.managerStatus.processes).map(([name, data]) => ({
          name,
          ...data
        }))
      }
      
      const fallbackString = JSON.stringify(fallbackData)
      const currentDataString = JSON.stringify(statusData.value)
      
      if (fallbackString !== currentDataString) {
        statusData.value = fallbackData
      }
      error.value = null
    }
  } finally {
    loading.value = false
  }
}

function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval)
  
  refreshInterval = setInterval(() => {
    if (autoRefresh.value && !loading.value) {
      loadStatus()
    }
  }, 5000) // Refresh every 5 seconds
}

function startUptimeTracking() {
  if (uptimeInterval) clearInterval(uptimeInterval)
  
  uptimeInterval = setInterval(() => {
    if (statusData.value.processDetails) {
      statusData.value.processDetails.forEach(process => {
        if (process.status === 'running' && process.startTime) {
          const startTime = new Date(process.startTime)
          const currentUptime = Math.floor((Date.now() - startTime.getTime()) / 1000)
          liveUptimes.value[process.name] = currentUptime
        } else {
          liveUptimes.value[process.name] = 0
        }
      })
    }
    
    // Update manager uptime if available
    if (statusData.value.manager?.startTime) {
      const startTime = new Date(statusData.value.manager.startTime)
      const currentUptime = Math.floor((Date.now() - startTime.getTime()) / 1000)
      liveUptimes.value.manager = currentUptime
    }
  }, 1000) // Update every second for responsiveness
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

function stopUptimeTracking() {
  if (uptimeInterval) {
    clearInterval(uptimeInterval)
    uptimeInterval = null
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'running':
    case 'healthy':
      return 'bg-green-500'
    case 'starting':
    case 'stopping':
    case 'warning':
      return 'bg-yellow-500'
    case 'error':
      return 'bg-red-500'
    case 'stopped':
      return 'bg-gray-400'
    default:
      return 'bg-gray-300'
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'running':
      return 'bg-green-100 text-green-800'
    case 'starting':
    case 'stopping':
      return 'bg-yellow-100 text-yellow-800'
    case 'error':
      return 'bg-red-100 text-red-800'
    case 'stopped':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function formatTime(timestamp) {
  if (!timestamp) return 'Never'
  return new Date(timestamp).toLocaleString()
}

function formatUptime(seconds) {
  if (!seconds || seconds === 0) return 'Down'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  // Always show seconds for responsiveness
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  } else {
    return `${secs}s`
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

// Watch autoRefresh to start/stop interval
watch(autoRefresh, (newVal) => {
  if (newVal) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
})

onMounted(() => {
  loadStatus()
  if (autoRefresh.value) {
    startAutoRefresh()
  }
  startUptimeTracking()
})

onUnmounted(() => {
  stopAutoRefresh()
  stopUptimeTracking()
})
</script>