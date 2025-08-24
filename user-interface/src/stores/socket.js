import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { useNotificationStore } from './notifications'
import { useManagerSocketStore } from './manager-socket'

export const useSocketStore = defineStore('socket', () => {
  const socket = ref(null)
  const connected = ref(false)
  const backendStatus = reactive({
    running: false,
    lastHeartbeat: null,
    restarting: false
  })
  let heartbeatCheckInterval = null
  let reconnectTimeout = null
  let reconnectAttempts = 0
  const maxReconnectAttempts = 5
  const systemStatus = reactive({
    status: 'unknown',
    detections: [],
    logs: [],
    lastUpdate: null,
    statistics: {
      totalDetections: 0,
      activeDetectors: 0,
      uptime: 0
    }
  })

  function connect() {
    if (socket.value) {
      disconnect()
    }

    // Use WSS if UI is served over HTTPS, otherwise use WS
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${window.location.hostname}:3000/api/websocket`;
    
    console.log(`Attempting to connect to WebSocket at ${wsUrl}`)

    // Connect to main tone detection backend WebSocket
    socket.value = new WebSocket(wsUrl)

    socket.value.onopen = (event) => {
      connected.value = true
      reconnectAttempts = 0 // Reset reconnect attempts on successful connection
      console.log('WebSocket connected successfully to tone detection backend:', event)
      
      // Check if this was a restart scenario or managed by process manager
      const wasRestarting = backendStatus.restarting
      const managerStore = useManagerSocketStore()
      const isBackendManaged = managerStore.connected
      
      // Mark backend as running on initial connection
      backendStatus.running = true
      backendStatus.restarting = false
      backendStatus.lastHeartbeat = new Date().toISOString()
      
      // Add connection log entry
      let message = 'Connected to tone detection backend'
      if (wasRestarting) {
        message = 'Reconnected after backend restart'
      } else if (isBackendManaged) {
        message = 'Connected to managed backend server'
      }
      
      systemStatus.logs.push({
        timestamp: new Date().toISOString(),
        type: 'info',
        message: message,
        level: 'info'
      })
      
      // Start heartbeat checking
      startHeartbeatCheck()

      // Show appropriate notification
      if (wasRestarting) {
        useNotificationStore().addNotification({
          type: 'success',
          message: 'Backend restart completed successfully'
        })
      } else if (isBackendManaged) {
        useNotificationStore().addNotification({
          type: 'success',
          message: 'Connected to managed backend'
        })
      } else {
        useNotificationStore().addNotification({
          type: 'success',
          message: 'Connected to backend successfully'
        })
      }
    }

    socket.value.onclose = (event) => {
      connected.value = false
      backendStatus.running = false
      console.log('WebSocket disconnected from tone detection backend:', event.code, event.reason)
      
      // Add disconnection log entry
      systemStatus.logs.push({
        timestamp: new Date().toISOString(),
        type: 'warning',
        message: `Disconnected from tone detection backend (code: ${event.code})`,
        level: 'warning'
      })
      
      // Attempt to reconnect if not intentionally closed
      if (event.code !== 1000) {
        scheduleReconnect()
      }
    }

    socket.value.onerror = (error) => {
      console.error('WebSocket error details:', {
        error,
        readyState: socket.value ? socket.value.readyState : 'no socket',
        url: socket.value ? socket.value.url : 'no url'
      })
      connected.value = false
      backendStatus.running = false

      // Show error notification only for initial connection attempts
      if (reconnectAttempts === 0) {
        useNotificationStore().addNotification({
          type: 'error',
          message: 'Failed to connect to backend'
        })
      }
    }

    // Handle WebSocket messages from main backend
    socket.value.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('WebSocket message received:', message.type, message.data)
        handleMainBackendMessage(message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error, event.data)
      }
    }

  }

  function scheduleReconnect() {
    // Check if manager is available and backend is being managed
    const managerStore = useManagerSocketStore()
    const isBackendManaged = managerStore.connected && managerStore.managerStatus.processes.backend
    
    // If backend is managed, check manager status for smarter reconnection
    let maxAttempts = maxReconnectAttempts
    let maxDelay = 10000
    
    if (isBackendManaged) {
      const backendManagerStatus = managerStore.managerStatus.processes.backend.status
      
      if (backendManagerStatus === 'starting' || backendManagerStatus === 'stopping') {
        maxAttempts = 15 // More attempts during managed transitions
        maxDelay = 3000  // Shorter delays
      } else if (backendManagerStatus === 'error') {
        // Don't retry if manager says backend is in error state
        console.log('Backend is in error state according to manager. Not attempting reconnection.')
        return
      } else if (backendManagerStatus === 'stopped') {
        // For stopped backend, wait a bit longer but still retry (could be transitioning)
        maxAttempts = 10
        maxDelay = 5000
        console.log('Backend is stopped according to manager. Retrying with reduced frequency in case of restart.')
      }
    } else if (backendStatus.restarting) {
      maxAttempts = 20
      maxDelay = 3000
    }
    
    if (reconnectAttempts >= maxAttempts) {
      console.log(`Max reconnect attempts reached (${maxAttempts}). Giving up.`)
      
      if (backendStatus.restarting) {
        backendStatus.restarting = false
        useNotificationStore().addNotification({
          type: 'error',
          message: 'Backend restart appears to have failed. Please check manually.'
        })
      } else if (!isBackendManaged) {
        useNotificationStore().addNotification({
          type: 'error',
          message: 'Cannot connect to backend. Please check if the backend is running.'
        })
      }
      return
    }

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
    }
    
    reconnectAttempts++
    
    // Use shorter delays during restart scenarios or managed transitions
    let delay
    if (backendStatus.restarting || isBackendManaged) {
      delay = Math.min(1500 + (reconnectAttempts * 500), maxDelay) // Linear increase during managed operations
    } else {
      delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxDelay) // Exponential backoff normally
    }
    
    const status = backendStatus.restarting ? ' (restart in progress)' : 
                   isBackendManaged ? ' (managed by process manager)' : ''
    console.log(`Scheduling reconnect attempt ${reconnectAttempts}/${maxAttempts} in ${delay}ms${status}`)
    
    reconnectTimeout = setTimeout(() => {
      connect()
    }, delay)
  }

  function disconnect() {
    // Clear reconnect attempts
    reconnectAttempts = 0
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    
    if (socket.value) {
      socket.value.close(1000, 'Intentional disconnect') // Normal closure
      socket.value = null
    }
    connected.value = false
    backendStatus.running = false
    stopHeartbeatCheck()
  }

  function startHeartbeatCheck() {
    stopHeartbeatCheck() // Clear any existing interval
    
    heartbeatCheckInterval = setInterval(() => {
      if (backendStatus.lastHeartbeat) {
        const now = new Date()
        const lastHeartbeat = new Date(backendStatus.lastHeartbeat)
        const timeSinceHeartbeat = now - lastHeartbeat
        
        // Mark as not running if no heartbeat in 15 seconds
        if (timeSinceHeartbeat > 15000) {
          backendStatus.running = false
        }
      }
    }, 2000) // Check every 2 seconds
  }

  function stopHeartbeatCheck() {
    if (heartbeatCheckInterval) {
      clearInterval(heartbeatCheckInterval)
      heartbeatCheckInterval = null
    }
  }

  function handleMainBackendMessage(message) {
    const { type, data } = message
    const timestamp = new Date().toISOString()
    
    switch (type) {
      case 'toneDetected':
        // Handle tone detection events
        systemStatus.detections.push({
          ...data,
          timestamp: timestamp
        })
        
        // Keep only last 100 detections
        if (systemStatus.detections.length > 100) {
          systemStatus.detections = systemStatus.detections.slice(-100)
        }
        
        systemStatus.statistics.totalDetections++
        backendStatus.running = true
        backendStatus.lastHeartbeat = timestamp
        
        // Show notification for new detection
        useNotificationStore().addNotification({
          type: 'success',
          message: `Tone detected: ${data.detector?.name || 'Unknown'}`
        })
        break
        
      case 'data':
        // Handle audio data events (indicates backend is active)
        backendStatus.running = true
        backendStatus.lastHeartbeat = timestamp
        break
        
      case 'pitchData':
        // Handle pitch analysis data (indicates backend is active)
        backendStatus.running = true
        backendStatus.lastHeartbeat = timestamp
        break
        
      case 'log':
        // Handle log messages
        systemStatus.logs.push({
          ...data,
          timestamp: timestamp
        })
        
        // Keep only last 500 log entries
        if (systemStatus.logs.length > 500) {
          systemStatus.logs = systemStatus.logs.slice(-500)
        }
        break
        
      case 'heartbeat':
        // Handle heartbeat from main backend
        backendStatus.running = true
        backendStatus.lastHeartbeat = timestamp
        break
        
      case 'shutdown':
        // Handle server shutdown notification
        console.log('Server shutdown notification received:', data)
        backendStatus.running = false
        backendStatus.restarting = true
        
        systemStatus.logs.push({
          timestamp: timestamp,
          type: 'warning',
          message: data.message || 'Server is shutting down',
          level: 'warning'
        })
        
        // Show notification about restart
        useNotificationStore().addNotification({
          type: 'info',
          message: 'Backend is restarting...'
        })
        break
        
      default:
        // Log any unknown message types for debugging
        console.log('Unknown WebSocket message type:', type, data)
        
        // Still treat any message as a sign of life
        backendStatus.running = true
        backendStatus.lastHeartbeat = timestamp
        break
    }
    
    systemStatus.lastUpdate = timestamp
  }

  function emitEvent(event, data) {
    if (socket.value && connected.value && socket.value.readyState === WebSocket.OPEN) {
      socket.value.send(JSON.stringify({ event, data }))
    }
  }

  function setRestartingState() {
    backendStatus.restarting = true
    backendStatus.running = false
    reconnectAttempts = 0 // Reset attempts for restart scenario
  }

  // Function to trigger reconnection from external sources
  function triggerReconnection() {
    if (!connected.value) {
      console.log('External trigger for backend WebSocket reconnection.')
      reconnectAttempts = 0 // Reset attempts
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
      }
      
      // Small delay to let backend initialize
      setTimeout(() => {
        connect()
      }, 1000)
    }
  }

  // Enhanced reconnection for managed restarts
  function handleManagedRestart() {
    console.log('Handling managed backend restart - preparing for reconnection.')
    backendStatus.restarting = true
    reconnectAttempts = 0
    
    // If currently connected, the disconnect will trigger scheduleReconnect
    // If not connected, start trying to reconnect immediately
    if (!connected.value) {
      setTimeout(() => {
        connect()
      }, 2000) // Give backend a moment to restart
    }
  }

  // Global event listener for backend status changes
  if (typeof window !== 'undefined') {
    window.addEventListener('backend-status-changed', (event) => {
      const { status } = event.detail
      console.log(`Backend status changed to ${status} (connected: ${connected.value})`)
      
      if (status === 'starting') {
        handleManagedRestart()
      } else if (status === 'running' && !connected.value) {
        console.log('Backend is running but WebSocket not connected. Triggering immediate reconnection.')
        triggerReconnection()
      }
    })
  }

  return {
    socket,
    connected,
    backendStatus,
    systemStatus,
    connect,
    disconnect,
    emitEvent,
    setRestartingState,
    triggerReconnection,
    handleManagedRestart
  }
})