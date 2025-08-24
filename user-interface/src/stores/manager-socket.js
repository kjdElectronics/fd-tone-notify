import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { useNotificationStore } from './notifications'

export const useManagerSocketStore = defineStore('manager-socket', () => {
  const socket = ref(null)
  const connected = ref(false)
  const managerStatus = reactive({
    processes: {
      backend: { status: 'unknown', pid: null, running: false },
      ui: { status: 'unknown', pid: null, running: false }
    },
    manager: {
      status: 'unknown',
      uptime: 0,
      startTime: null
    },
    overall: 'unknown',
    logs: []
  })
  
  let reconnectTimeout = null
  let reconnectAttempts = 0
  const maxReconnectAttempts = 10

  function connect() {
    if (socket.value) {
      disconnect()
    }

    console.log('Attempting to connect to Manager WebSocket at ws://localhost:3001/ws')

    socket.value = new WebSocket('ws://localhost:3001/ws')

    socket.value.onopen = (event) => {
      connected.value = true
      reconnectAttempts = 0
      console.log('Manager WebSocket connected successfully:', event)
      
      useNotificationStore().addNotification({
        type: 'success',
        message: 'Connected to process manager'
      })
    }

    socket.value.onclose = (event) => {
      connected.value = false
      console.log('Manager WebSocket disconnected:', event.code, event.reason)
      
      // Update manager status
      managerStatus.manager.status = 'disconnected'
      
      // Attempt to reconnect if not intentionally closed
      if (event.code !== 1000) {
        scheduleReconnect()
      }
    }

    socket.value.onerror = (error) => {
      console.error('Manager WebSocket error:', error)
      connected.value = false
      managerStatus.manager.status = 'error'

      // Show error notification only for initial connection attempts
      if (reconnectAttempts === 0) {
        useNotificationStore().addNotification({
          type: 'warning',
          message: 'Cannot connect to process manager'
        })
      }
    }

    socket.value.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('Manager WebSocket message received:', message.type, message.data)
        handleManagerMessage(message)
      } catch (error) {
        console.error('Failed to parse Manager WebSocket message:', error, event.data)
      }
    }
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.log('Max Manager reconnect attempts reached. Giving up.')
      useNotificationStore().addNotification({
        type: 'error',
        message: 'Cannot connect to process manager. Please check if manager is running.'
      })
      return
    }

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
    }
    
    reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 5000) // Exponential backoff, max 5s
    
    console.log(`Scheduling Manager reconnect attempt ${reconnectAttempts}/${maxReconnectAttempts} in ${delay}ms`)
    
    reconnectTimeout = setTimeout(() => {
      connect()
    }, delay)
  }

  function disconnect() {
    reconnectAttempts = 0
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    
    if (socket.value) {
      socket.value.close(1000, 'Intentional disconnect')
      socket.value = null
    }
    connected.value = false
  }

  function handleManagerMessage(message) {
    const { type, data } = message
    const timestamp = new Date().toISOString()
    
    switch (type) {
      case 'welcome':
        console.log('Manager welcome message:', data.message)
        break
        
      case 'status':
        // Update manager status with received data
        if (data.processes) {
          Object.entries(data.processes).forEach(([processName, processData]) => {
            managerStatus.processes[processName] = {
              status: processData.status,
              pid: processData.pid,
              running: processData.status === 'running',
              lastUpdate: processData.lastUpdate,
              startTime: processData.startTime,
              errorMessage: processData.errorMessage
            }
          })
        }
        
        if (data.manager) {
          managerStatus.manager = {
            status: 'running',
            uptime: data.manager.uptime,
            startTime: data.manager.startTime
          }
        }
        
        managerStatus.overall = data.overall || 'unknown'
        break
        
      case 'statusUpdate':
        // Handle real-time status updates
        const { processName, status: processStatus, systemStatus } = data
        
        if (managerStatus.processes[processName]) {
          managerStatus.processes[processName] = {
            status: processStatus.status,
            pid: processStatus.pid,
            running: processStatus.status === 'running',
            lastUpdate: processStatus.lastUpdate,
            startTime: processStatus.startTime,
            errorMessage: processStatus.errorMessage
          }
        }
        
        // Update overall system status
        if (systemStatus) {
          managerStatus.overall = systemStatus.overall
          if (systemStatus.manager) {
            managerStatus.manager.uptime = systemStatus.manager.uptime
          }
        }
        
        // Show notifications for important status changes
        if (processName === 'backend') {
          if (processStatus.status === 'running') {
            useNotificationStore().addNotification({
              type: 'success',
              message: 'Backend server is now running'
            })
            
            // Trigger backend WebSocket reconnection when backend is running
            triggerBackendReconnection('running')
          } else if (processStatus.status === 'starting') {
            // Also trigger reconnection when backend starts starting up
            triggerBackendReconnection('starting')
          } else if (processStatus.status === 'stopped') {
            useNotificationStore().addNotification({
              type: 'info',
              message: 'Backend server has stopped'
            })
          } else if (processStatus.status === 'error') {
            useNotificationStore().addNotification({
              type: 'error',
              message: `Backend server error: ${processStatus.errorMessage || 'Unknown error'}`
            })
          }
        }
        break
        
      case 'pong':
        // Handle ping/pong for connection health
        break
        
      case 'heartbeat':
        // Handle heartbeat from manager
        console.debug('Manager heartbeat received:', data.message, 'at', data.timestamp)
        break
        
      case 'log':
        // Handle log messages from the unified logging system
        managerStatus.logs.push({
          timestamp: data.timestamp || timestamp,
          level: data.level || 'info',
          message: data.message || '',
          colorData: data.colorData || [],
          metadata: data.metadata || {}
        })
        
        // Keep only last 1000 log entries (more than backend since this includes all processes)
        if (managerStatus.logs.length > 1000) {
          managerStatus.logs = managerStatus.logs.slice(-1000)
        }
        break
        
      default:
        console.log('Unknown Manager WebSocket message type:', type, data)
        break
    }
  }

  function sendMessage(message) {
    if (socket.value && connected.value && socket.value.readyState === WebSocket.OPEN) {
      socket.value.send(JSON.stringify(message))
    }
  }

  function requestStatus() {
    sendMessage({ type: 'getStatus' })
  }

  function ping() {
    sendMessage({ type: 'ping', data: { timestamp: new Date().toISOString() } })
  }

  function triggerBackendReconnection(status = 'starting') {
    // Dispatch a global event to trigger backend reconnection
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('backend-status-changed', {
        detail: { status }
      })
      window.dispatchEvent(event)
    }
  }

  function clearLogs() {
    managerStatus.logs.splice(0)
  }

  // Auto-ping every 30 seconds to keep connection alive
  setInterval(() => {
    if (connected.value) {
      ping()
    }
  }, 30000)

  return {
    socket,
    connected,
    managerStatus,
    connect,
    disconnect,
    sendMessage,
    requestStatus,
    ping,
    clearLogs
  }
})