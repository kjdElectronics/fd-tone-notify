<template>
  <div class="card">
    <h2 v-if="showTitle" class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
      <component :is="titleIcon" class="w-5 h-5 mr-2 text-fire-600" />
      {{ title }}
    </h2>
    
    <div class="flex items-center">
      <div class="p-2 rounded-lg" :class="getStatusBackgroundClass(systemStatus.overallStatus.value)">
        <CheckCircleIcon class="w-6 h-6" :class="getStatusIconClass(systemStatus.overallStatus.value)" />
      </div>
      <div class="ml-4">
        <p class="text-sm font-medium text-gray-600">System Status</p>
        <p class="text-lg font-semibold text-gray-900">
          {{ systemStatus.overallStatusText.value }}
        </p>
        <p v-if="showDescription" class="text-xs text-gray-500 mt-1">
          {{ getStatusDescription(systemStatus.overallStatus.value) }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useSystemStatus } from '../composables/useSystemStatus'
import { CheckCircleIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  showTitle: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Overall System Status'
  },
  titleIcon: {
    type: Object,
    default: null
  },
  showDescription: {
    type: Boolean,
    default: false
  }
})

const systemStatus = useSystemStatus()

function getStatusBackgroundClass(status) {
  switch (status) {
    case 'running':
      return 'bg-green-100'
    case 'warning':
      return 'bg-orange-100'
    case 'degraded':
      return 'bg-yellow-100'
    case 'stopped':
      return 'bg-red-100'
    default:
      return 'bg-gray-100'
  }
}

function getStatusIconClass(status) {
  switch (status) {
    case 'running':
      return 'text-green-600'
    case 'warning':
      return 'text-orange-600'
    case 'degraded':
      return 'text-yellow-600'
    case 'stopped':
      return 'text-red-600'
    default:
      return 'text-gray-600'
  }
}

function getStatusDescription(status) {
  switch (status) {
    case 'running':
      return 'Both manager and backend are operational'
    case 'warning':
      return 'Manager running, backend stopped'
    case 'degraded':
      return 'Backend running without manager'
    case 'stopped':
      return 'Both manager and backend are stopped'
    default:
      return 'Status unknown'
  }
}
</script>