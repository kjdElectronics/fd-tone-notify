<template>
  <div class="border border-gray-200 rounded-lg p-3">
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center">
        <component :is="getTypeIcon(type)" class="w-4 h-4 mr-2" :class="getTypeColor(type)" />
        <span class="font-medium text-sm capitalize">{{ getTypeName(type) }}</span>
        <span class="ml-2 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs">
          {{ notifications.length }}
        </span>
      </div>
      <button
        v-if="showTestButton && notifications.length > 0"
        @click="$emit('test')"
        class="text-xs bg-fire-600 hover:bg-fire-700 text-white px-2 py-1 rounded transition-colors"
      >
        Test
      </button>
    </div>
    
    <div v-if="notifications.length === 0" class="text-xs text-gray-500 italic">
      No {{ getTypeName(type).toLowerCase() }} notifications configured
    </div>
    
    <div v-else class="space-y-2">
      <div
        v-for="(notification, index) in notifications"
        :key="`${type}-${index}`"
        class="bg-gray-50 rounded p-2 text-xs"
      >
        <div class="font-medium text-gray-700 mb-1">{{ getTypeName(type) }} #{{ index + 1 }}</div>
        <div class="space-y-1">
          <div
            v-for="(value, key) in notification"
            :key="key"
            class="flex justify-between"
          >
            <span class="text-gray-600 capitalize">{{ formatKey(key) }}:</span>
            <span class="text-gray-900 font-mono">{{ formatValue(value) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { 
  EnvelopeIcon, 
  DevicePhoneMobileIcon,
  CommandLineIcon,
  GlobeAltIcon
} from '@heroicons/vue/24/outline'

const props = defineProps({
  type: {
    type: String,
    required: true
  },
  notifications: {
    type: Array,
    required: true
  },
  timing: {
    type: String,
    required: true // 'pre' or 'post'
  },
  showTestButton: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['test'])

// Type mapping functions
function getTypeIcon(type) {
  switch (type) {
    case 'emails':
      return EnvelopeIcon
    case 'pushbullet':
      return DevicePhoneMobileIcon
    case 'externalCommands':
      return CommandLineIcon
    case 'webhooks':
      return GlobeAltIcon
    default:
      return GlobeAltIcon
  }
}

function getTypeColor(type) {
  switch (type) {
    case 'emails':
      return 'text-green-600'
    case 'pushbullet':
      return 'text-blue-600'
    case 'externalCommands':
      return 'text-purple-600'
    case 'webhooks':
      return 'text-orange-600'
    default:
      return 'text-gray-600'
  }
}

function getTypeName(type) {
  switch (type) {
    case 'emails':
      return 'Email'
    case 'pushbullet':
      return 'Pushbullet'
    case 'externalCommands':
      return 'External Commands'
    case 'webhooks':
      return 'Webhooks'
    default:
      return type.charAt(0).toUpperCase() + type.slice(1)
  }
}

function formatKey(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
}

function formatValue(value) {
  if (typeof value === 'string' && value.length > 30) {
    return value.substring(0, 30) + '...'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}
</script>