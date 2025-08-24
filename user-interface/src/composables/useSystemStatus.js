import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useManagerSocketStore } from '../stores/manager-socket'
import { useSocketStore } from '../stores/socket'

/**
 * Unified system status composable
 * Provides consistent status logic across all components
 */
export function useSystemStatus() {
  const managerSocketStore = useManagerSocketStore()
  const socketStore = useSocketStore()
  
  // Live uptime tracking
  const liveUptime = ref(0)
  const uptimeStartTime = ref(null)
  let uptimeInterval = null

  // Overall system status logic
  const overallStatus = computed(() => {
    const isManagerRunning = managerSocketStore.connected
    const isBackendRunning = getBackendRunningStatus()
    
    if (isManagerRunning && isBackendRunning) {
      return 'running' // Green
    } else if (isManagerRunning && !isBackendRunning) {
      return 'warning' // Orange - Manager running but backend not
    } else if (!isManagerRunning && isBackendRunning) {
      return 'degraded' // Yellow - Backend running but unmanaged
    } else {
      return 'stopped' // Red - Both not running
    }
  })

  // Get backend running status from appropriate source
  function getBackendRunningStatus() {
    if (managerSocketStore.connected && managerSocketStore.managerStatus.processes.backend) {
      return managerSocketStore.managerStatus.processes.backend.running
    }
    return socketStore.backendStatus.running
  }

  // Manager status
  const managerStatus = computed(() => ({
    running: managerSocketStore.connected,
    status: managerSocketStore.connected ? 'running' : 'disconnected',
    text: managerSocketStore.connected ? 'Running' : 'Disconnected'
  }))

  // Backend status  
  const backendStatus = computed(() => {
    if (managerSocketStore.connected && managerSocketStore.managerStatus.processes.backend) {
      const managedStatus = managerSocketStore.managerStatus.processes.backend.status
      const managedRunning = managerSocketStore.managerStatus.processes.backend.running
      
      return {
        running: managedRunning,
        status: managedStatus,
        text: getBackendStatusText(managedStatus, managedRunning, true)
      }
    }
    
    // Fall back to direct connection status
    const isRunning = socketStore.backendStatus.running
    const isConnected = socketStore.connected
    
    return {
      running: isRunning,
      status: isConnected ? (isRunning ? 'running' : 'stopped') : 'disconnected',
      text: getBackendStatusText(null, isRunning, false, isConnected)
    }
  })

  function getBackendStatusText(managedStatus, isRunning, isManaged, isConnected = true) {
    if (isManaged) {
      if (managedStatus === 'running' && isRunning) return 'Running (Managed)'
      if (managedStatus === 'starting') return 'Starting'
      if (managedStatus === 'stopping') return 'Stopping'
      if (managedStatus === 'error') return 'Error'
      return 'Stopped (Managed)'
    }
    
    if (!isConnected) return 'Disconnected'
    if (isRunning) {
      return managerSocketStore.connected ? 'Running' : 'Running (Unmanaged)'
    }
    return 'Stopped'
  }

  // Status colors
  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'bg-green-500'
      case 'warning':
        return 'bg-orange-500'
      case 'degraded':
        return 'bg-yellow-500'
      case 'starting':
      case 'stopping':
        return 'bg-yellow-500'
      case 'error':
        return 'bg-red-500'
      case 'stopped':
      case 'disconnected':
        return 'bg-red-500'
      default:
        return 'bg-gray-400'
    }
  }

  const getStatusTextColor = (status) => {
    switch (status) {
      case 'running':
        return 'text-green-700'
      case 'warning':
        return 'text-orange-700'
      case 'degraded':
        return 'text-yellow-700'
      case 'starting':
      case 'stopping':
        return 'text-yellow-700'
      case 'error':
        return 'text-red-700'
      case 'stopped':
      case 'disconnected':
        return 'text-red-700'
      default:
        return 'text-gray-600'
    }
  }

  // Overall status text
  const overallStatusText = computed(() => {
    switch (overallStatus.value) {
      case 'running':
        return 'Running'
      case 'warning':
        return 'Manager Only'
      case 'degraded':
        return 'Unmanaged'
      case 'stopped':
        return 'Stopped'
      default:
        return 'Unknown'
    }
  })

  // WebSocket connection status
  const websocketStatus = computed(() => ({
    manager: {
      connected: managerSocketStore.connected,
      text: managerSocketStore.connected ? 'Connected' : 'Disconnected'
    },
    backend: {
      connected: socketStore.connected,
      text: socketStore.connected ? 'Connected' : 'Disconnected'
    }
  }))

  // Live uptime management
  function startUptimeTracking() {
    // Determine uptime start time based on backend status
    const backendStartTime = getBackendStartTime()
    if (backendStartTime) {
      uptimeStartTime.value = new Date(backendStartTime)
      updateLiveUptime()
      
      if (uptimeInterval) clearInterval(uptimeInterval)
      uptimeInterval = setInterval(updateLiveUptime, 1000)
    } else {
      liveUptime.value = 0
      uptimeStartTime.value = null
      if (uptimeInterval) {
        clearInterval(uptimeInterval)
        uptimeInterval = null
      }
    }
  }

  function getBackendStartTime() {
    if (managerSocketStore.connected && managerSocketStore.managerStatus.processes.backend?.startTime) {
      return managerSocketStore.managerStatus.processes.backend.startTime
    }
    // Fallback: estimate start time based on connection
    if (socketStore.backendStatus.running && socketStore.connected) {
      return new Date() // Best guess if we don't have actual start time
    }
    return null
  }

  function updateLiveUptime() {
    if (uptimeStartTime.value && getBackendRunningStatus()) {
      liveUptime.value = Math.floor((Date.now() - uptimeStartTime.value.getTime()) / 1000)
    } else {
      liveUptime.value = 0
    }
  }

  function formatUptime(seconds) {
    if (!seconds || seconds === 0) {
      // Check if backend is supposed to be running
      if (getBackendRunningStatus()) {
        return '0s' // Just started
      } else {
        return 'Down' // Backend is not running
      }
    }
    
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

  // Check if manager is available for control operations
  const isManagerAvailable = computed(() => managerSocketStore.connected)

  // Check if backend is running for button visibility
  const isBackendRunning = computed(() => getBackendRunningStatus())

  // Reactive uptime tracking based on status changes
  const uptimeDisplay = computed(() => formatUptime(liveUptime.value))

  onMounted(() => {
    startUptimeTracking()
    
    // Watch for backend status changes to restart uptime tracking
    watch([() => backendStatus.value.running, () => backendStatus.value.status], () => {
      startUptimeTracking()
    }, { immediate: false })
  })

  onUnmounted(() => {
    if (uptimeInterval) {
      clearInterval(uptimeInterval)
      uptimeInterval = null
    }
  })

  return {
    // Status
    overallStatus,
    overallStatusText,
    managerStatus,
    backendStatus,
    websocketStatus,
    
    // Utilities
    getStatusColor,
    getStatusTextColor,
    isManagerAvailable,
    isBackendRunning,
    
    // Uptime
    liveUptime,
    uptimeDisplay,
    formatUptime,
    startUptimeTracking
  }
}