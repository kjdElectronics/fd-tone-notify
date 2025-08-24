<template>
  <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
    <!-- Detector Header -->
    <div class="flex items-start justify-between mb-3">
      <div>
        <h3 class="text-lg font-medium text-gray-900">{{ detector.name }}</h3>
        <p class="text-sm text-gray-600">Detector #{{ index + 1 }}</p>
      </div>
      <div class="flex items-center space-x-2">
        <div class="bg-fire-100 text-fire-700 px-2 py-1 rounded text-xs font-medium">
          {{ detector.tones?.length || 0 }} tones
        </div>
        <div v-if="!notificationsExpanded" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
          {{ totalNotifications }} notifications
        </div>
      </div>
    </div>

    <!-- Tone Frequencies -->
    <div class="mb-4">
      <label class="text-sm font-medium text-gray-700 mb-2 block">Tone Frequencies</label>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="tone in detector.tones"
          :key="tone"
          class="relative group"
        >
          <span
            class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-mono cursor-help"
          >
            {{ tone }} Hz
          </span>
          
          <!-- Tooltip -->
          <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
            <div class="text-center">
              <div class="font-medium">Detection Range</div>
              <div>{{ getFrequencyRange(tone, detector.tolerancePercent || defaults?.defaultTolerancePercent).min }}Hz - {{ getFrequencyRange(tone, detector.tolerancePercent || defaults?.defaultTolerancePercent).max }}Hz</div>
              <div class="text-gray-300 mt-1">Tolerance: {{ ((detector.tolerancePercent || defaults?.defaultTolerancePercent) * 100).toFixed(1) }}%</div>
            </div>
            <!-- Tooltip arrow -->
            <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Detection Settings -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-center">
      <div>
        <label class="text-xs font-medium text-gray-500">Match Threshold</label>
        <p class="text-sm font-semibold">
          {{ detector.matchThreshold || defaults?.defaultMatchThreshold || 'Default' }}
        </p>
      </div>
      <div>
        <label class="text-xs font-medium text-gray-500">Tolerance</label>
        <p class="text-sm font-semibold">
          {{ ((detector.tolerancePercent || defaults?.defaultTolerancePercent)*100).toFixed(1) || 'Default' }}%
        </p>
      </div>
      <div>
        <label class="text-xs font-medium text-gray-500">Reset Timeout</label>
        <p class="text-sm font-semibold">
          {{ formatTimeout(detector.resetTimeoutMs || defaults?.defaultResetTimeoutMs) }}
        </p>
      </div>
      <div>
        <label class="text-xs font-medium text-gray-500">Lockout Timeout</label>
        <p class="text-sm font-semibold">
          {{ formatTimeout(detector.lockoutTimeoutMs || defaults?.defaultLockoutTimeoutMs) }}
        </p>
      </div>
    </div>

    <!-- Notifications Section -->
    <div class="border-t pt-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-md font-medium text-gray-900 flex items-center">
          <BellIcon class="w-4 h-4 mr-2 text-fire-600" />
          Notifications
        </h4>
        <div class="flex items-center space-x-2">
          <span class="text-xs text-gray-500">
            Pre: {{ preNotificationsCount }} | Post: {{ postNotificationsCount }}
          </span>
          <button
            @click="toggleNotifications"
            class="text-fire-600 hover:text-fire-700 text-sm font-medium"
          >
            {{ notificationsExpanded ? 'Collapse' : 'Expand' }}
          </button>
        </div>
      </div>

      <!-- Expanded Notifications -->
      <div v-if="notificationsExpanded" class="space-y-4">
        <!-- Help Text -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
          <div class="font-medium text-blue-800 mb-1">Notification Timing</div>
          <div class="text-blue-700 space-y-1">
            <div><strong>Pre-Recording:</strong> Triggered immediately when tone is detected, before recording completes</div>
            <div><strong>Post-Recording:</strong> Triggered after recording is finished and available</div>
          </div>
        </div>

        <!-- Notifications Grid (Responsive) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Pre-Recording Notifications -->
          <div class="space-y-3">
            <h5 class="font-medium text-gray-900 flex items-center">
              <ClockIcon class="w-4 h-4 mr-1 text-green-600" />
              Pre-Recording Notifications
              <span class="ml-2 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs">
                {{ preNotificationsCount }}
              </span>
            </h5>
            
            <div v-if="preNotificationsCount === 0" class="text-sm text-gray-500 italic">
              No pre-recording notifications configured
            </div>
            
            <div v-else class="space-y-2">
              <NotificationGroup
                v-for="(group, type) in detector.notifications?.preRecording || {}"
                :key="`pre-${type}`"
                :type="type"
                :notifications="group"
                timing="pre"
                :show-test-button="showTestButtons"
                @test="$emit('test-notification', { detector, type, timing: 'pre', notifications: group })"
              />
            </div>
          </div>

          <!-- Post-Recording Notifications -->
          <div class="space-y-3">
            <h5 class="font-medium text-gray-900 flex items-center">
              <CheckCircleIcon class="w-4 h-4 mr-1 text-blue-600" />
              Post-Recording Notifications
              <span class="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                {{ postNotificationsCount }}
              </span>
            </h5>
            
            <div v-if="postNotificationsCount === 0" class="text-sm text-gray-500 italic">
              No post-recording notifications configured
            </div>
            
            <div v-else class="space-y-2">
              <NotificationGroup
                v-for="(group, type) in detector.notifications?.postRecording || {}"
                :key="`post-${type}`"
                :type="type"
                :notifications="group"
                timing="post"
                :show-test-button="showTestButtons"
                @test="$emit('test-notification', { detector, type, timing: 'post', notifications: group })"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { 
  BellIcon, 
  ClockIcon, 
  CheckCircleIcon 
} from '@heroicons/vue/24/outline'
import NotificationGroup from './NotificationGroup.vue'

const props = defineProps({
  detector: {
    type: Object,
    required: true
  },
  index: {
    type: Number,
    required: true
  },
  defaults: {
    type: Object,
    default: () => ({})
  },
  expandNotifications: {
    type: Boolean,
    default: false
  },
  showTestButtons: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['test-notification'])

const notificationsExpanded = ref(props.expandNotifications)

// Computed properties for notification counts
const preNotificationsCount = computed(() => {
  const preNotifications = props.detector.notifications?.preRecording || {}
  return Object.values(preNotifications).reduce((total, group) => {
    return total + (Array.isArray(group) ? group.length : 0)
  }, 0)
})

const postNotificationsCount = computed(() => {
  const postNotifications = props.detector.notifications?.postRecording || {}
  return Object.values(postNotifications).reduce((total, group) => {
    return total + (Array.isArray(group) ? group.length : 0)
  }, 0)
})

const totalNotifications = computed(() => {
  return preNotificationsCount.value + postNotificationsCount.value
})

// Helper functions
function formatTimeout(ms) {
  if (!ms) return 'N/A'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function getFrequencyRange(frequency, tolerance = 0.05) {
  const range = frequency * tolerance
  return {
    min: Math.round(frequency - range),
    max: Math.round(frequency + range)
  }
}

function toggleNotifications() {
  notificationsExpanded.value = !notificationsExpanded.value
}
</script>