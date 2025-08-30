<template>
  <div id="app" class="min-h-screen">
    <!-- Show login if not authenticated -->
    <LoginView v-if="!authStore.isAuthenticated" />
    
    <!-- Main application layout -->
    <div v-else class="flex h-screen bg-gray-50">
      <!-- Sidebar Navigation -->
      <aside class="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div class="p-6 border-b border-gray-200">
          <div class="flex items-center space-x-3 mb-4">
            <div class="w-8 h-8 bg-fire-600 rounded flex items-center justify-center">
              <span class="text-white font-bold text-sm">🔥</span>
            </div>
            <div>
              <h1 class="text-lg font-semibold text-gray-900">FD Tone Notify</h1>
              <p class="text-xs text-gray-500">Configuration & Monitoring</p>
            </div>
          </div>
          
          <!-- Status Indicators -->
          <div class="space-y-3">
            <!-- Manager Status -->
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <div 
                  class="w-3 h-3 rounded-full animate-pulse"
                  :class="systemStatus.getStatusColor(systemStatus.managerStatus.value.status)"
                ></div>
                <span class="text-sm font-medium" :class="systemStatus.getStatusTextColor(systemStatus.managerStatus.value.status)">
                  Manager
                </span>
              </div>
              <span class="text-xs text-gray-500">{{ systemStatus.managerStatus.value.text }}</span>
            </div>
            
            <!-- Backend Status -->
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <div 
                  class="w-3 h-3 rounded-full animate-pulse"
                  :class="systemStatus.getStatusColor(systemStatus.backendStatus.value.status)"
                ></div>
                <span class="text-sm font-medium" :class="systemStatus.getStatusTextColor(systemStatus.backendStatus.value.status)">
                  Backend
                </span>
              </div>
              <span class="text-xs text-gray-500">{{ systemStatus.backendStatus.value.text }}</span>
            </div>
            
            <!-- SSL Status Lights (only show if certificates need attention) -->
            <div v-if="sslStatus.needsSSLSetup.value" class="space-y-2 pt-2 border-t border-gray-200">
              <div class="text-xs text-gray-500 font-medium">SSL Certificate Setup</div>
              
              <!-- Backend SSL Status -->
              <div 
                v-if="sslStatus.backendSSLStatus.value === 'invalid'" 
                class="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-1"
                @click="openSSLSetupUrl(sslStatus.getBackendSSLUrl())"
              >
                <div class="flex items-center space-x-2">
                  <div class="w-3 h-3 rounded-full bg-red-500"></div>
                  <span class="text-sm font-medium text-red-700">Backend SSL</span>
                </div>
                <span class="text-xs text-red-600">Setup Required</span>
              </div>
              
              <!-- Manager SSL Status -->
              <div 
                v-if="sslStatus.managerSSLStatus.value === 'invalid'" 
                class="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-1"
                @click="openSSLSetupUrl(sslStatus.getManagerSSLUrl())"
              >
                <div class="flex items-center space-x-2">
                  <div class="w-3 h-3 rounded-full bg-red-500"></div>
                  <span class="text-sm font-medium text-red-700">Manager SSL</span>
                </div>
                <span class="text-xs text-red-600">Setup Required</span>
              </div>
            </div>
            
            
            <!-- Control Buttons -->
            <div class="flex space-x-2">
              <button
                v-if="!systemStatus.isBackendRunning.value"
                @click="systemStatus.isManagerAvailable.value ? startBackend() : showManualStartModal()"
                :disabled="controlLoading"
                class="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-xs font-medium py-1 px-2 rounded transition-colors"
              >
                <InformationCircleIcon v-if="!systemStatus.isManagerAvailable.value" class="w-3 h-3 inline mr-1" />
                <div v-else-if="controlLoading" class="w-3 h-3 inline mr-1 animate-spin border border-white border-t-transparent rounded-full"></div>
                <ArrowPathIcon v-else class="w-3 h-3 inline mr-1" />
                {{ systemStatus.isManagerAvailable.value ? (controlLoading ? 'Starting...' : 'Start Backend') : 'Manual Start' }}
              </button>
              
              <template v-else>
                <button
                  @click="showStopServerModal"
                  :disabled="stopping || !systemStatus.isManagerAvailable.value"
                  class="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-xs font-medium py-1 px-2 rounded transition-colors"
                >
                  <StopIcon v-if="!stopping" class="w-3 h-3 inline mr-1" />
                  <div v-else class="w-3 h-3 inline mr-1 animate-spin border border-white border-t-transparent rounded-full"></div>
                  {{ stopping ? 'Stopping...' : 'Stop' }}
                </button>
                
                <button
                  @click="restartBackend"
                  :disabled="restarting || !systemStatus.isManagerAvailable.value"
                  class="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white text-xs font-medium py-1 px-2 rounded transition-colors"
                >
                  <ArrowPathIcon v-if="!restarting" class="w-3 h-3 inline mr-1" />
                  <div v-else class="w-3 h-3 inline mr-1 animate-spin border border-white border-t-transparent rounded-full"></div>
                  {{ restarting ? 'Restarting...' : 'Restart' }}
                </button>
              </template>
            </div>
          </div>
        </div>
        
        <nav class="flex-1 p-4 space-y-2">
          <router-link
            v-for="item in navigation"
            :key="item.path"
            :to="item.path"
            class="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            :class="$route.path === item.path 
              ? 'bg-fire-100 text-fire-700' 
              : 'text-gray-600 hover:bg-gray-100'"
          >
            <component :is="item.icon" class="w-5 h-5" />
            <span>{{ item.name }}</span>
          </router-link>
        </nav>
        
        <div class="p-4 border-t border-gray-200">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <div 
                class="w-3 h-3 rounded-full"
                :class="systemStatus.getStatusColor(systemStatus.overallStatus.value)"
              ></div>
              <span class="text-sm text-gray-600">
                {{ systemStatus.overallStatusText.value }}
              </span>
            </div>
            <button
              @click="logout"
              class="text-xs text-gray-500 hover:text-gray-700"
              title="Logout"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>
      
      <!-- Main content area -->
      <main class="flex-1 overflow-auto">
        <router-view />
      </main>
    </div>
    
    <!-- Global notifications -->
    <NotificationToast />
    
    <!-- Manual Start Modal -->
    <ManualStartModal 
      :show="showManualModal"
      :connectionStatus="socketStore.connected ? 'connected' : 'disconnected'"
      @close="closeManualStartModal"
    />
    
    <!-- Stop Server Modal -->
    <StopServerModal 
      :show="showStopModal"
      @close="closeStopModal"
      @stop="stopBackend"
    />
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'
import { useAuthStore } from './stores/auth'
import { useSocketStore } from './stores/socket'
import { useManagerSocketStore } from './stores/manager-socket'
import { useNotificationStore } from './stores/notifications'
import { useSystemStatus } from './composables/useSystemStatus'
import { useSSLStatus } from './composables/useSSLStatus'
import LoginView from './views/LoginView.vue'
import NotificationToast from './components/NotificationToast.vue'
import api from './utils/api'

// Import icons (you'll need to install @heroicons/vue)
import {
  HomeIcon,
  CogIcon,
  ChartBarIcon,
  DocumentTextIcon,
  SpeakerWaveIcon,
  WrenchScrewdriverIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowPathIcon,
  StopIcon
} from '@heroicons/vue/24/outline'
import ManualStartModal from './components/ManualStartModal.vue'
import StopServerModal from './components/StopServerModal.vue'

const authStore = useAuthStore()
const socketStore = useSocketStore()
const managerSocketStore = useManagerSocketStore()
const notificationStore = useNotificationStore()
const systemStatus = useSystemStatus()
const sslStatus = useSSLStatus()

const controlLoading = ref(false)
const showManualModal = ref(false)
const showStopModal = ref(false)
const restarting = ref(false)
const stopping = ref(false)

const navigation = [
  { name: 'Dashboard', path: '/', icon: HomeIcon },
  { name: 'Live Monitoring', path: '/monitoring', icon: ChartBarIcon },
  { name: 'Detector Config', path: '/detectors', icon: SpeakerWaveIcon },
  { name: 'System Config', path: '/config', icon: CogIcon },
  { name: 'File Analysis', path: '/analysis', icon: DocumentTextIcon },
  { name: 'Testing', path: '/testing', icon: WrenchScrewdriverIcon },
  { name: 'Status Details', path: '/status', icon: ExclamationTriangleIcon },
]

// Clean code with unified status system - old computed properties removed

// Modal management
function showManualStartModal() {
  showManualModal.value = true
}

function closeManualStartModal() {
  showManualModal.value = false
}

function showStopServerModal() {
  showStopModal.value = true
}

function closeStopModal() {
  showStopModal.value = false
  stopping.value = false // Reset stopping state when modal closes
}

// Helper function to generate manager API URLs with correct protocol and hostname
function getManagerApiUrl(endpoint) {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http'
  return `${protocol}://${window.location.hostname}:3001${endpoint}`
}

// Backend control functions
async function startBackend() {
  if (controlLoading.value) return
  
  try {
    controlLoading.value = true
    
    notificationStore.addNotification({
      type: 'info',
      message: 'Starting backend server...'
    })
    
    const response = await fetch(getManagerApiUrl('/backend/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to start backend: ${response.statusText}`)
    }
    
    notificationStore.addNotification({
      type: 'success',
      message: 'Backend server started successfully'
    })
    
  } catch (error) {
    console.error('Start failed:', error)
    controlLoading.value = false
    
    notificationStore.addNotification({
      type: 'error',
      message: 'Failed to start backend: ' + error.message
    })
  }
  
  // Let the status monitor handle clearing the loading state
  setTimeout(() => {
    controlLoading.value = false
  }, 2000)
}

async function restartBackend() {
  if (restarting.value) return
  
  try {
    restarting.value = true
    
    notificationStore.addNotification({
      type: 'info',
      message: 'Initiating backend restart...'
    })
    
    // Check if backend is managed by process manager
    if (systemStatus.isManagerAvailable.value) {
      // Use manager API for managed restart
      const response = await fetch(getManagerApiUrl('/backend/restart'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) {
        throw new Error(`Manager restart failed: ${response.statusText}`)
      }
      
      // Manager handles the restart - just wait for status updates
      restarting.value = false
      
    } else {
      // Fall back to direct restart for non-managed backend
      socketStore.setRestartingState()
      
      // Call restart API
      await api.post('/system/restart')
      
      // Disconnect current WebSocket
      socketStore.disconnect()
      
      // Wait a moment for the backend to shut down
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Start monitoring for reconnection
      let reconnectAttempts = 0
      const maxAttempts = 30 // 30 seconds maximum
      
      const checkReconnection = async () => {
        reconnectAttempts++
        
        try {
          // Try to reconnect
          socketStore.connect()
          
          // Wait a bit to see if connection succeeds
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          if (socketStore.connected && socketStore.backendStatus.running) {
            notificationStore.addNotification({
              type: 'success',
              message: 'Backend restarted successfully'
            })
            restarting.value = false
            return
          }
        } catch (error) {
          console.log('Reconnection attempt failed:', error)
        }
        
        if (reconnectAttempts < maxAttempts) {
          setTimeout(checkReconnection, 1000)
        } else {
          notificationStore.addNotification({
            type: 'error',
            message: 'Backend restart may have failed. Please check manually.'
          })
          restarting.value = false
        }
      }
      
      // Start checking for reconnection
      setTimeout(checkReconnection, 3000)
    }
    
  } catch (error) {
    console.error('Restart failed:', error)
    restarting.value = false
    
    notificationStore.addNotification({
      type: 'error',
      message: 'Failed to restart backend: ' + (error.response?.data?.message || error.message)
    })
  }
}

async function stopBackend() {
  if (stopping.value) return
  
  try {
    stopping.value = true
    
    notificationStore.addNotification({
      type: 'warning',
      message: 'Stopping backend server...'
    })
    
    // Check if backend is managed by process manager
    if (systemStatus.isManagerAvailable.value) {
      // Use manager API for managed stop
      const response = await fetch(getManagerApiUrl('/backend/stop'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) {
        throw new Error(`Manager stop failed: ${response.statusText}`)
      }
      
      // Close the modal
      closeStopModal()
      
      notificationStore.addNotification({
        type: 'info',
        message: 'Backend server has been stopped by manager.'
      })
      
    } else {
      // Fall back to direct stop for non-managed backend
      await api.post('/system/stop')
      
      // Close the modal
      closeStopModal()
      
      // Disconnect WebSocket since server will be stopping
      socketStore.disconnect()
      
      notificationStore.addNotification({
        type: 'info',
        message: 'Backend server has been stopped. Manual restart required.'
      })
    }
    
  } catch (error) {
    console.error('Stop failed:', error)
    stopping.value = false
    
    notificationStore.addNotification({
      type: 'error',
      message: 'Failed to stop backend: ' + (error.response?.data?.message || error.message)
    })
  }
}

function logout() {
  authStore.logout()
  socketStore.disconnect()
}

// SSL certificate setup function
function openSSLSetupUrl(url) {
  // Open SSL setup page in a new tab
  window.open(url, '_blank')
}

onMounted(() => {
  // Initialize socket connections if authenticated
  if (authStore.isAuthenticated) {
    // Try to connect to manager first (for process management)
    managerSocketStore.connect()
    
    // Connect to backend (for tone detection data)
    socketStore.connect()
  }
})
</script>