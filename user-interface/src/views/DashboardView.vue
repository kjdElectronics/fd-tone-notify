<template>
  <div class="p-6">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p class="text-gray-600">System overview and real-time status</p>
    </div>

    <!-- Getting Started - next-step guidance while the system isn't fully set up yet -->
    <div v-if="showGettingStarted" class="card mb-8 border-fire-200 bg-fire-50">
      <h2 class="text-lg font-semibold text-gray-900 mb-3 flex items-center">
        <RocketLaunchIcon class="w-5 h-5 mr-2 text-fire-600" />
        Getting Started
      </h2>
      <ul class="space-y-2">
        <li v-if="!detectorsStore.hasDetectors" class="flex items-center justify-between bg-white rounded-lg p-3">
          <span class="text-sm text-gray-700">No detectors yet</span>
          <router-link to="/detectors" class="btn-primary btn-sm">Create your first detector</router-link>
        </li>
        <li v-if="!apiKeysStore.hasIngestKeys" class="flex items-center justify-between bg-white rounded-lg p-3">
          <span class="text-sm text-gray-700">No sources connected</span>
          <router-link to="/sources" class="btn-primary btn-sm">Connect a server</router-link>
        </li>
      </ul>
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
          
          <DetectionItem
            v-for="detection in recentDetections"
            :key="detection.id || detection.detectedAt"
            :detection="detection"
            :showMatchAverages="false"
          />
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
import { computed, onMounted } from 'vue'
import { useSocketStore } from '../stores/socket'
import { useSystemStatus } from '../composables/useSystemStatus'
import { useDetectorsStore } from '../stores/detectors'
import { useApiKeysStore } from '../stores/apiKeys'
import SystemStatusCard from '../components/SystemStatusCard.vue'
import DetectionItem from '../components/DetectionItem.vue'
import {
  CheckCircleIcon,
  SpeakerWaveIcon,
  BellIcon,
  ClockIcon,
  RocketLaunchIcon
} from '@heroicons/vue/24/outline'

const socketStore = useSocketStore()
const systemStatus = useSystemStatus()
const detectorsStore = useDetectorsStore()
const apiKeysStore = useApiKeysStore()

const recentDetections = computed(() => {
  // Show most recent detections first (reverse order)
  return socketStore.systemStatus.detections.slice().reverse().slice(0, 5)
})

// Next-step guidance while the system isn't fully set up yet. Hidden once
// both a detector exists and a source is connected.
const showGettingStarted = computed(() => {
  return !detectorsStore.hasDetectors || !apiKeysStore.hasIngestKeys
})

onMounted(() => {
  if (!detectorsStore.hasDetectors) {
    detectorsStore.fetchDetectors()
  }
  if (apiKeysStore.keys.length === 0) {
    apiKeysStore.fetchKeys()
  }
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