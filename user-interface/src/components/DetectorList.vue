<template>
  <div class="space-y-4">
    <!-- Header with search and add button -->
    <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
      <div class="flex-1 max-w-md">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search detectors..."
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-fire-500 focus:border-transparent"
        />
      </div>
      <button
        @click="$emit('add-detector')"
        class="btn-primary flex items-center"
        :disabled="detectorsStore.isAnyOperationLoading"
      >
        <PlusIcon class="w-4 h-4 mr-2" />
        Add Detector
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="detectorsStore.loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-fire-600 mx-auto"></div>
      <p class="mt-2 text-gray-600">Loading detectors...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="detectorsStore.error" class="alert-emergency">
      <h3 class="font-medium">Failed to load detectors</h3>
      <p class="text-sm mt-1">{{ detectorsStore.error }}</p>
      <div class="mt-2 flex gap-2">
        <button @click="detectorsStore.fetchDetectors()" class="btn-primary btn-sm">
          Retry
        </button>
        <button @click="detectorsStore.clearError()" class="btn-secondary btn-sm">
          Dismiss
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!detectorsStore.hasDetectors" class="text-center py-12">
      <SpeakerWaveIcon class="w-16 h-16 mx-auto text-gray-300 mb-4" />
      <h3 class="text-lg font-medium text-gray-900 mb-2">No detectors configured</h3>
      <p class="text-gray-600 mb-4">Get started by creating your first tone detector</p>
      <button
        @click="$emit('add-detector')"
        class="btn-primary"
      >
        <PlusIcon class="w-4 h-4 mr-2" />
        Create First Detector
      </button>
    </div>

    <!-- Detector Cards -->
    <div v-else class="space-y-3">
      <div 
        v-for="(detector, index) in filteredDetectors" 
        :key="`detector-${index}`"
        class="card hover:shadow-md transition-shadow"
      >
        <!-- Detector Header -->
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">{{ detector.name }}</h3>
            <div class="flex items-center mt-1">
              <span class="text-sm text-gray-600">
                {{ detector.tones.length }} {{ detector.tones.length === 1 ? 'tone' : 'tones' }}
              </span>
              <span class="mx-2 text-gray-400">•</span>
              <span class="text-sm text-gray-600">
                Threshold: {{ detector.matchThreshold }}
              </span>
              <span class="mx-2 text-gray-400">•</span>
              <span class="text-sm text-gray-600">
                {{ detector.isRecordingEnabled ? 'Recording enabled' : 'Recording disabled' }}
              </span>
              <template v-if="detector.talkgroupFilter">
                <span class="mx-2 text-gray-400">&bull;</span>
                <span class="text-sm text-purple-600 font-medium">
                  TG: {{ detector.talkgroupFilter }}
                </span>
                <span v-if="detector.talkgroupExclusive" class="ml-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                  Rdio Only
                </span>
              </template>
            </div>
          </div>
          
          <!-- Action Buttons -->
          <div class="flex items-center space-x-2 ml-4">
            <button
              @click="toggleExpanded(index)"
              :class="[
                'p-2 rounded-md transition-colors',
                expandedDetectors.has(index) 
                  ? 'bg-gray-100 text-gray-700' 
                  : 'text-gray-500 hover:bg-gray-50'
              ]"
              :title="expandedDetectors.has(index) ? 'Collapse' : 'Expand'"
            >
              <ChevronDownIcon 
                :class="[
                  'w-4 h-4 transition-transform',
                  expandedDetectors.has(index) ? 'rotate-180' : ''
                ]" 
              />
            </button>
            <button
              @click="$emit('edit-detector', { index, detector })"
              class="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              :disabled="detectorsStore.isAnyOperationLoading"
              title="Edit"
            >
              <PencilIcon class="w-4 h-4" />
            </button>
            <button
              @click="$emit('duplicate-detector', detector)"
              class="p-2 text-green-600 hover:bg-green-50 rounded-md transition-colors"
              :disabled="detectorsStore.isAnyOperationLoading"
              title="Duplicate"
            >
              <DocumentDuplicateIcon class="w-4 h-4" />
            </button>
            <button
              @click="confirmDelete(index, detector)"
              class="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
              :disabled="detectorsStore.isAnyOperationLoading"
              title="Delete"
            >
              <TrashIcon class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Tone Frequencies Display -->
        <div class="mb-3">
          <div class="flex flex-wrap gap-2">
            <span 
              v-for="(tone, toneIndex) in detector.tones" 
              :key="`tone-${index}-${toneIndex}`"
              class="inline-flex items-center px-2 py-1 bg-fire-100 text-fire-800 text-sm font-medium rounded-md"
            >
              {{ tone }} Hz
            </span>
          </div>
        </div>

        <!-- Expanded Details -->
        <div v-if="expandedDetectors.has(index)" class="border-t pt-3 space-y-3">
          <!-- Detection Settings -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-gray-50 p-3 rounded-lg">
              <label class="text-xs font-medium text-gray-700 uppercase tracking-wide">Match Threshold</label>
              <p class="text-sm font-semibold text-gray-900">{{ detector.matchThreshold }}</p>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg">
              <label class="text-xs font-medium text-gray-700 uppercase tracking-wide">Tolerance</label>
              <p class="text-sm font-semibold text-gray-900">{{ (detector.tolerancePercent * 100).toFixed(1) }}%</p>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg">
              <label class="text-xs font-medium text-gray-700 uppercase tracking-wide">Reset Timeout</label>
              <p class="text-sm font-semibold text-gray-900">{{ (detector.resetTimeoutMs / 1000).toFixed(1) }}s</p>
            </div>
          </div>

          <!-- Recording Settings -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-gray-50 p-3 rounded-lg">
              <label class="text-xs font-medium text-gray-700 uppercase tracking-wide">Recording</label>
              <p class="text-sm font-semibold" :class="detector.isRecordingEnabled ? 'text-green-600' : 'text-red-600'">
                {{ detector.isRecordingEnabled ? 'Enabled' : 'Disabled' }}
              </p>
            </div>
            <div v-if="detector.isRecordingEnabled" class="bg-gray-50 p-3 rounded-lg">
              <label class="text-xs font-medium text-gray-700 uppercase tracking-wide">Min Length</label>
              <p class="text-sm font-semibold text-gray-900">{{ detector.minRecordingLengthSec }}s</p>
            </div>
            <div v-if="detector.isRecordingEnabled" class="bg-gray-50 p-3 rounded-lg">
              <label class="text-xs font-medium text-gray-700 uppercase tracking-wide">Max Length</label>
              <p class="text-sm font-semibold text-gray-900">{{ detector.maxRecordingLengthSec }}s</p>
            </div>
          </div>

          <!-- Notifications Section (Using existing components from Testing page) -->
          <div class="border-t pt-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-md font-medium text-gray-900 flex items-center">
                <BellIcon class="w-4 h-4 mr-2 text-fire-600" />
                Notifications
              </h4>
              <div class="flex items-center space-x-2">
                <span class="text-xs text-gray-500">
                  Pre: {{ getPreNotificationsCount(detector) }} | Post: {{ getPostNotificationsCount(detector) }}
                </span>
              </div>
            </div>

            <!-- Notifications Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Pre-Recording Notifications -->
              <div class="space-y-3">
                <h5 class="font-medium text-gray-900 flex items-center">
                  <ClockIcon class="w-4 h-4 mr-1 text-green-600" />
                  Pre-Recording
                  <span class="ml-2 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs">
                    {{ getPreNotificationsCount(detector) }}
                  </span>
                </h5>
                
                <div v-if="getPreNotificationsCount(detector) === 0" class="text-sm text-gray-500 italic">
                  No pre-recording notifications configured
                </div>
                
                <div v-else class="space-y-2">
                  <NotificationGroup
                    v-for="(group, type) in detector.notifications?.preRecording || {}"
                    :key="`pre-${index}-${type}`"
                    :type="type"
                    :notifications="group"
                    timing="pre"
                    :show-test-button="false"
                  />
                </div>
              </div>

              <!-- Post-Recording Notifications -->
              <div class="space-y-3">
                <h5 class="font-medium text-gray-900 flex items-center">
                  <CheckCircleIcon class="w-4 h-4 mr-1 text-blue-600" />
                  Post-Recording
                  <span class="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                    {{ getPostNotificationsCount(detector) }}
                  </span>
                </h5>
                
                <div v-if="getPostNotificationsCount(detector) === 0" class="text-sm text-gray-500 italic">
                  No post-recording notifications configured
                </div>
                
                <div v-else class="space-y-2">
                  <NotificationGroup
                    v-for="(group, type) in detector.notifications?.postRecording || {}"
                    :key="`post-${index}-${type}`"
                    :type="type"
                    :notifications="group"
                    timing="post"
                    :show-test-button="false"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div 
      v-if="deleteConfirm.show" 
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
    >
      <div class="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Delete Detector</h3>
        <p class="text-gray-600 mb-6">
          Are you sure you want to delete "{{ deleteConfirm.detector?.name }}"? This action cannot be undone.
        </p>
        <div class="flex justify-end space-x-3">
          <button
            @click="cancelDelete"
            class="btn-secondary"
            :disabled="detectorsStore.deleting"
          >
            Cancel
          </button>
          <button
            @click="executeDelete"
            class="btn-danger"
            :disabled="detectorsStore.deleting"
          >
            <span v-if="detectorsStore.deleting">Deleting...</span>
            <span v-else>Delete</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDetectorsStore } from '../stores/detectors'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  ChevronDownIcon,
  SpeakerWaveIcon,
  BellIcon,
  ClockIcon,
  CheckCircleIcon
} from '@heroicons/vue/24/outline'
import NotificationGroup from './NotificationGroup.vue'

// Store
const detectorsStore = useDetectorsStore()

// Emits
const emit = defineEmits(['add-detector', 'edit-detector', 'duplicate-detector'])

// Reactive state
const searchQuery = ref('')
const expandedDetectors = ref(new Set())
const deleteConfirm = ref({
  show: false,
  index: null,
  detector: null
})

// Computed
const filteredDetectors = computed(() => {
  if (!searchQuery.value.trim()) {
    return detectorsStore.detectors
  }
  
  const query = searchQuery.value.toLowerCase()
  return detectorsStore.detectors.filter(detector => 
    detector.name.toLowerCase().includes(query) ||
    detector.tones.some(tone => tone.toString().includes(query))
  )
})

// Methods
function toggleExpanded(index) {
  if (expandedDetectors.value.has(index)) {
    expandedDetectors.value.delete(index)
  } else {
    expandedDetectors.value.add(index)
  }
}

function getPreNotificationsCount(detector) {
  const preNotifications = detector.notifications?.preRecording || {}
  return Object.values(preNotifications).reduce((total, group) => {
    return total + (Array.isArray(group) ? group.length : 0)
  }, 0)
}

function getPostNotificationsCount(detector) {
  const postNotifications = detector.notifications?.postRecording || {}
  return Object.values(postNotifications).reduce((total, group) => {
    return total + (Array.isArray(group) ? group.length : 0)
  }, 0)
}

function confirmDelete(index, detector) {
  deleteConfirm.value = {
    show: true,
    index,
    detector
  }
}

function cancelDelete() {
  deleteConfirm.value = {
    show: false,
    index: null,
    detector: null
  }
}

async function executeDelete() {
  try {
    await detectorsStore.deleteDetector(deleteConfirm.value.index)
    cancelDelete()
  } catch (error) {
    // Error handling is done in the store
  }
}

// Load detectors on mount
onMounted(() => {
  if (!detectorsStore.hasDetectors) {
    detectorsStore.fetchDetectors()
  }
})
</script>