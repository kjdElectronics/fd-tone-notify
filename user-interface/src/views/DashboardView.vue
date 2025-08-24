<template>
  <div class="p-6">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p class="text-gray-600">System overview and real-time status</p>
    </div>

    <!-- Status Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <SystemStatusCard />

      <div class="card">
        <div class="flex items-center">
          <div class="p-2 bg-blue-100 rounded-lg">
            <SpeakerWaveIcon class="w-6 h-6 text-blue-600" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-600">Active Detectors</p>
            <p class="text-lg font-semibold text-gray-900">
              {{ socketStore.systemStatus.statistics.activeDetectors || 0 }}
            </p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center">
          <div class="p-2 bg-fire-100 rounded-lg">
            <BellIcon class="w-6 h-6 text-fire-600" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-600">Total Detections</p>
            <p class="text-lg font-semibold text-gray-900">
              {{ socketStore.systemStatus.statistics.totalDetections || 0 }}
            </p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center">
          <div class="p-2 bg-purple-100 rounded-lg">
            <ClockIcon class="w-6 h-6 text-purple-600" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-600">Backend Uptime</p>
            <p class="text-lg font-semibold text-gray-900">
              {{ systemStatus.uptimeDisplay.value }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Recent Detections -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Recent Detections</h2>
        <div class="space-y-3">
          <div 
            v-if="recentDetections.length === 0"
            class="text-center py-8 text-gray-500"
          >
            <SpeakerWaveIcon class="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No recent detections</p>
            <p class="text-sm">Detections will appear here in real-time</p>
          </div>
          
          <div
            v-for="detection in recentDetections"
            :key="detection.id || detection.timestamp"
            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div class="flex items-center space-x-3">
              <div class="w-3 h-3 bg-fire-500 rounded-full pulse-fire"></div>
              <div>
                <p class="font-medium text-gray-900">
                  {{ detection.detector?.name || 'Unknown Detector' }}
                </p>
                <p class="text-sm text-gray-500">
                  Tones: {{ (detection.detector?.tones || []).map(t => `${t}Hz`).join(', ') }}
                </p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm text-gray-600">
                {{ formatTime(detection.timestamp) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- System Information -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">WebSocket Connections</h2>
        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-gray-600">Manager WebSocket</span>
            <span :class="systemStatus.websocketStatus.value.manager.connected ? 'status-online' : 'status-offline'">
              {{ systemStatus.websocketStatus.value.manager.text }}
            </span>
          </div>
          
          <div class="flex justify-between">
            <span class="text-gray-600">Backend WebSocket</span>
            <span :class="systemStatus.websocketStatus.value.backend.connected ? 'status-online' : 'status-offline'">
              {{ systemStatus.websocketStatus.value.backend.text }}
            </span>
          </div>
          
          <div class="flex justify-between">
            <span class="text-gray-600">Backend Last Update</span>
            <span class="text-gray-900">
              {{ socketStore.systemStatus.lastUpdate 
                ? formatTime(socketStore.systemStatus.lastUpdate)
                : 'Never' }}
            </span>
          </div>
          
          <div class="flex justify-between">
            <span class="text-gray-600">UI Version</span>
            <span class="text-gray-900">1.0.0</span>
          </div>
        </div>

        <div class="mt-6 pt-4 border-t border-gray-200">
          <h3 class="text-sm font-medium text-gray-900 mb-2">Quick Actions</h3>
          <div class="space-y-2">
            <router-link 
              to="/detectors" 
              class="block w-full text-left px-3 py-2 text-sm text-fire-600 hover:bg-fire-50 rounded-lg transition-colors"
            >
              Configure Detectors →
            </router-link>
            <router-link 
              to="/monitoring" 
              class="block w-full text-left px-3 py-2 text-sm text-fire-600 hover:bg-fire-50 rounded-lg transition-colors"
            >
              Live Monitoring →
            </router-link>
            <router-link 
              to="/analysis" 
              class="block w-full text-left px-3 py-2 text-sm text-fire-600 hover:bg-fire-50 rounded-lg transition-colors"
            >
              Analyze Audio Files →
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSocketStore } from '../stores/socket'
import { useSystemStatus } from '../composables/useSystemStatus'
import SystemStatusCard from '../components/SystemStatusCard.vue'
import {
  CheckCircleIcon,
  SpeakerWaveIcon,
  BellIcon,
  ClockIcon
} from '@heroicons/vue/24/outline'

const socketStore = useSocketStore()
const systemStatus = useSystemStatus()

const recentDetections = computed(() => {
  return socketStore.systemStatus.detections.slice(0, 5)
})

function formatTime(timestamp) {
  if (!timestamp) return 'Never'
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

function formatUptime(seconds) {
  if (!seconds) return 'Down'
  
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

// Status helper functions removed - now handled by SystemStatusCard component
</script>