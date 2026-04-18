<template>
  <div class="space-y-6 border-t border-gray-200 pt-6 mt-6">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-medium text-gray-900">
        {{ isNewDetector ? 'Create New Detector' : `Edit "${originalDetector?.name}"` }}
      </h3>
      <div class="flex items-center space-x-2">
        <button
          @click="handleCancel"
          class="btn-secondary"
          :disabled="isSubmitting"
        >
          Cancel
        </button>
        <button
          @click="handleSave"
          class="btn-primary"
          :disabled="isSubmitting || !isFormValid"
        >
          <span v-if="isSubmitting">
            {{ isNewDetector ? 'Creating...' : 'Saving...' }}
          </span>
          <span v-else>
            {{ isNewDetector ? 'Create Detector' : 'Save Changes' }}
          </span>
        </button>
      </div>
    </div>

    <!-- Form Content - Top Section: Basic Info and Detection Settings -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      <!-- Basic Information -->
      <div class="card">
        <h4 class="text-md font-medium text-gray-900 mb-4">Basic Information</h4>
        
        <!-- Detector Name -->
        <div class="mb-4">
          <label for="detector-name" class="form-label">
            Detector Name <span class="text-red-500">*</span>
          </label>
          <input
            id="detector-name"
            v-model="form.name"
            type="text"
            class="form-input"
            :class="{ 'border-red-500': validationErrors.name }"
            placeholder="e.g., Fire Department District 1"
            required
          />
          <p v-if="validationErrors.name" class="form-error">{{ validationErrors.name }}</p>
        </div>

        <!-- Talkgroup Filter (Rdio Scanner) -->
        <div class="mb-4">
          <label for="talkgroup-filter" class="form-label flex items-center">
            Talkgroup Filter (Rdio Scanner)
            <span class="relative group ml-1">
              <InformationCircleIcon class="w-4 h-4 text-gray-400 cursor-help" />
              <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none w-64 z-10">
                Matches against the talkgroupLabel field from the Rdio Scanner API. Case-insensitive. Leave empty to skip Rdio Scanner processing for this detector.
                <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </span>
          </label>
          <input
            id="talkgroup-filter"
            v-model="form.talkgroupFilter"
            type="text"
            class="form-input"
            placeholder="e.g., Fire Dispatch"
          />
        </div>

        <!-- Talkgroup Exclusive -->
        <div class="mb-4">
          <label class="flex items-center space-x-3 cursor-pointer">
            <input
              v-model="form.talkgroupExclusive"
              type="checkbox"
              class="form-checkbox"
            />
            <span class="form-label mb-0 flex items-center">
              Talkgroup Exclusive
              <span class="relative group ml-1">
                <InformationCircleIcon class="w-4 h-4 text-gray-400 cursor-help" />
                <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none w-64 z-10">
                  When enabled, this detector only processes audio from Rdio Scanner calls matching the talkgroup filter above. It will be excluded from live microphone monitoring. This prevents false positives when departments share the same tones on different channels.
                  <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                </div>
              </span>
            </span>
          </label>
        </div>

        <!-- Tone Frequencies -->
        <div>
          <label class="form-label">
            Tone Frequencies (Hz) <span class="text-red-500">*</span>
          </label>
          <div class="space-y-3">
            <div 
              v-for="(tone, index) in form.tones" 
              :key="`tone-${index}`"
              class="flex items-center space-x-3"
            >
              <div class="flex-1">
                <input
                  v-model.number="form.tones[index]"
                  type="number"
                  min="100"
                  max="4000"
                  step="0.1"
                  class="form-input"
                  :class="{ 'border-red-500': validationErrors.tones && validationErrors.tones[index] }"
                  :placeholder="`Tone ${index + 1} frequency`"
                />
                <p v-if="validationErrors.tones && validationErrors.tones[index]" class="form-error text-xs">
                  {{ validationErrors.tones[index] }}
                </p>
              </div>
              <button
                type="button"
                @click="removeTone(index)"
                class="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                :disabled="form.tones.length <= 1"
                title="Remove tone"
              >
                <TrashIcon class="w-4 h-4" />
              </button>
            </div>
            
            <button
              type="button"
              @click="addTone"
              class="btn-secondary btn-sm"
            >
              <PlusIcon class="w-4 h-4 mr-1" />
              Add Tone
            </button>
          </div>
          <p class="form-help">
            Enter tone frequencies between 100-4000 Hz. Multiple tones will be detected in sequence.
          </p>
        </div>
      </div>

      <!-- Detection Settings -->
      <div class="card">
        <h4 class="text-md font-medium text-gray-900 mb-4">Detection Settings</h4>
        
        <div class="space-y-4">
          <!-- Match Threshold -->
          <div>
            <label for="match-threshold" class="form-label">
              Match Threshold
              <span class="text-sm font-normal text-gray-500">({{ form.matchThreshold }})</span>
            </label>
            <input
              id="match-threshold"
              v-model.number="form.matchThreshold"
              type="range"
              min="1"
              max="20"
              step="1"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <div class="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 (Sensitive)</span>
              <span>20 (Strict)</span>
            </div>
          </div>

          <!-- Tolerance Percent -->
          <div>
            <label for="tolerance" class="form-label">
              Frequency Tolerance
              <span class="text-sm font-normal text-gray-500">({{ (form.tolerancePercent * 100).toFixed(1) }}%)</span>
            </label>
            <input
              id="tolerance"
              v-model.number="form.tolerancePercent"
              type="range"
              min="0.01"
              max="0.10"
              step="0.01"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <div class="flex justify-between text-xs text-gray-500 mt-1">
              <span>1% (Precise)</span>
              <span>10% (Loose)</span>
            </div>
          </div>

          <!-- Reset Timeout -->
          <div>
            <label for="reset-timeout" class="form-label">
              Reset Timeout
              <span class="text-sm font-normal text-gray-500">({{ (form.resetTimeoutMs / 1000).toFixed(1) }}s)</span>
            </label>
            <input
              id="reset-timeout"
              v-model.number="form.resetTimeoutMs"
              type="range"
              min="1000"
              max="30000"
              step="1000"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <div class="flex justify-between text-xs text-gray-500 mt-1">
              <span>1s</span>
              <span>30s</span>
            </div>
          </div>

          <!-- Lockout Timeout -->
          <div>
            <label for="lockout-timeout" class="form-label">
              Lockout Timeout
              <span class="text-sm font-normal text-gray-500">({{ (form.lockoutTimeoutMs / 1000).toFixed(1) }}s)</span>
            </label>
            <input
              id="lockout-timeout"
              v-model.number="form.lockoutTimeoutMs"
              type="range"
              min="1000"
              max="60000"
              step="1000"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <div class="flex justify-between text-xs text-gray-500 mt-1">
              <span>1s</span>
              <span>60s</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Recording Settings -->
      <div class="card">
        <h4 class="text-md font-medium text-gray-900 mb-4">Recording Settings</h4>
        
        <!-- Recording Enabled -->
        <div class="mb-4">
          <label class="flex items-center space-x-3 cursor-pointer">
            <input
              v-model="form.isRecordingEnabled"
              type="checkbox"
              class="form-checkbox"
            />
            <span class="form-label mb-0">Enable audio recording</span>
          </label>
          <p class="form-help">
            When enabled, audio will be recorded when this detector triggers
          </p>
        </div>

        <!-- Recording Length Settings (only show if recording enabled) -->
        <div v-if="form.isRecordingEnabled" class="space-y-4">
          <div>
            <label for="min-recording" class="form-label">
              Minimum Length (seconds)
            </label>
            <input
              id="min-recording"
              v-model.number="form.minRecordingLengthSec"
              type="number"
              min="10"
              max="300"
              class="form-input"
            />
          </div>
          
          <div>
            <label for="max-recording" class="form-label">
              Maximum Length (seconds)
            </label>
            <input
              id="max-recording"
              v-model.number="form.maxRecordingLengthSec"
              type="number"
              min="15"
              max="600"
              class="form-input"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Section: Notifications in Two-Column Layout -->
    <div class="card">
      <h4 class="text-md font-medium text-gray-900 mb-6 flex items-center">
        <BellIcon class="w-5 h-5 mr-2 text-fire-600" />
        Notifications
      </h4>
      
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Pre-Recording Notifications (Left) -->
        <div class="space-y-4">
          <h5 class="font-medium text-gray-900 flex items-center">
            <ClockIcon class="w-4 h-4 mr-1 text-green-600" />
            Pre-Recording Notifications
          </h5>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <div class="text-blue-700">
              <strong>Pre-Recording:</strong> Triggered immediately when tone is detected, before recording completes
            </div>
          </div>
          
          <!-- Pre-Recording Notification Types -->
          <div class="space-y-4">
            <!-- Email Notifications -->
            <NotificationTypeEditor
              title="Email Notifications"
              type="email"
              v-model="form.notifications.preRecording.emails"
              :template="{
                to: '',
                bcc: '',
                subject: 'Tone Detected',
                text: 'Tone detected for detector %d'
              }"
            />

            <!-- Pushbullet Notifications -->
            <NotificationTypeEditor
              title="Pushbullet Notifications"
              type="pushbullet"
              v-model="form.notifications.preRecording.pushbullet"
              :template="{
                title: 'Tone Detected',
                channelTag: '',
                body: 'Tone detected for detector %d'
              }"
            />

            <!-- Webhook Notifications -->
            <NotificationTypeEditor
              title="Webhook Notifications"
              type="webhook"
              v-model="form.notifications.preRecording.webhooks"
              :template="{
                address: '',
                headers: {}
              }"
            />

            <!-- External Command Notifications -->
            <NotificationTypeEditor
              title="External Commands"
              type="externalCommand"
              v-model="form.notifications.preRecording.externalCommands"
              :template="{
                command: '',
                description: ''
              }"
            />
          </div>
        </div>

        <!-- Post-Recording Notifications (Right) -->
        <div class="space-y-4">
          <h5 class="font-medium text-gray-900 flex items-center">
            <CheckCircleIcon class="w-4 h-4 mr-1 text-blue-600" />
            Post-Recording Notifications
          </h5>
          <div class="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
            <div class="text-green-700">
              <strong>Post-Recording:</strong> Triggered after recording. <i><u>Recording attached when supported</u></i>
            </div>
          </div>
          
          <!-- Post-Recording Notification Types -->
          <div class="space-y-4">
            <!-- Email Notifications -->
            <NotificationTypeEditor
              title="Email Notifications"
              type="email"
              v-model="form.notifications.postRecording.emails"
              :template="{
                to: '',
                bcc: '',
                subject: 'Tone Detected',
                text: 'Tone detected for detector %d'
              }"
            />

            <!-- Pushbullet Notifications -->
            <NotificationTypeEditor
              title="Pushbullet Notifications"
              type="pushbullet"
              v-model="form.notifications.postRecording.pushbullet"
              :template="{
                title: 'Tone Detected',
                channelTag: '',
                body: 'Tone detected for detector %d'
              }"
            />

            <!-- Webhook Notifications -->
            <NotificationTypeEditor
              title="Webhook Notifications"
              type="webhook"
              v-model="form.notifications.postRecording.webhooks"
              :template="{
                address: '',
                headers: {}
              }"
            />

            <!-- External Command Notifications -->
            <NotificationTypeEditor
              title="External Commands"
              type="externalCommand"
              v-model="form.notifications.postRecording.externalCommands"
              :template="{
                command: '',
                description: ''
              }"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useDetectorsStore } from '../stores/detectors'
import NotificationTypeEditor from './NotificationTypeEditor.vue'
import {
  PlusIcon,
  TrashIcon,
  BellIcon,
  ClockIcon,
  CheckCircleIcon,
  InformationCircleIcon
} from '@heroicons/vue/24/outline'

// Props
const props = defineProps({
  detector: {
    type: Object,
    default: null
  },
  detectorIndex: {
    type: Number,
    default: null
  }
})

// Emits
const emit = defineEmits(['cancel', 'saved'])

// Store
const detectorsStore = useDetectorsStore()

// Form state
const form = ref({
  name: '',
  talkgroupFilter: '',
  talkgroupExclusive: false,
  tones: [0],
  matchThreshold: 6,
  tolerancePercent: 0.02,
  resetTimeoutMs: 5000,
  lockoutTimeoutMs: 7000,
  isRecordingEnabled: true,
  minRecordingLengthSec: 30,
  maxRecordingLengthSec: 45,
  notifications: {
    preRecording: {
      pushbullet: [],
      webhooks: [],
      externalCommands: [],
      emails: []
    },
    postRecording: {
      pushbullet: [],
      webhooks: [],
      externalCommands: [],
      emails: []
    }
  }
})

const originalDetector = ref(null)
const isSubmitting = ref(false)
const validationErrors = ref({})

// Computed
const isNewDetector = computed(() => props.detector === null)

const isFormValid = computed(() => {
  return form.value.name.trim() !== '' && 
         form.value.tones.length > 0 && 
         form.value.tones.every(tone => tone >= 100 && tone <= 4000) &&
         Object.keys(validationErrors.value).length === 0
})

// Methods
function initializeForm() {
  if (props.detector) {
    // Edit mode - populate form with existing detector
    originalDetector.value = props.detector
    form.value = {
      name: props.detector.name,
      talkgroupFilter: props.detector.talkgroupFilter || '',
      talkgroupExclusive: props.detector.talkgroupExclusive ?? false,
      tones: [...props.detector.tones],
      matchThreshold: props.detector.matchThreshold,
      tolerancePercent: props.detector.tolerancePercent,
      resetTimeoutMs: props.detector.resetTimeoutMs,
      lockoutTimeoutMs: props.detector.lockoutTimeoutMs,
      isRecordingEnabled: props.detector.isRecordingEnabled,
      minRecordingLengthSec: props.detector.minRecordingLengthSec,
      maxRecordingLengthSec: props.detector.maxRecordingLengthSec,
      notifications: props.detector.notifications ? {
        preRecording: { ...props.detector.notifications.preRecording },
        postRecording: { ...props.detector.notifications.postRecording }
      } : form.value.notifications
    }
  } else {
    originalDetector.value = null
  }
  
  // Validate form initially
  validateForm()
}

function addTone() {
  form.value.tones.push(0)
}

function removeTone(index) {
  if (form.value.tones.length > 1) {
    form.value.tones.splice(index, 1)
  }
}

function updateNotifications(newNotifications) {
  form.value.notifications = newNotifications
}

function validateForm() {
  const errors = {}
  
  // Name validation
  if (!form.value.name.trim()) {
    errors.name = 'Detector name is required'
  } else if (form.value.name.length > 100) {
    errors.name = 'Name must be less than 100 characters'
  }
  
  // Tones validation
  if (form.value.tones.length === 0) {
    errors.tones = ['At least one tone is required']
  } else {
    const toneErrors = []
    form.value.tones.forEach((tone, index) => {
      if (!tone || tone < 100 || tone > 4000) {
        toneErrors[index] = 'Must be between 100-4000 Hz'
      }
    })
    if (toneErrors.length > 0) {
      errors.tones = toneErrors
    }
  }
  
  // Recording length validation
  if (form.value.isRecordingEnabled) {
    if (form.value.minRecordingLengthSec >= form.value.maxRecordingLengthSec) {
      errors.recording = 'Minimum length must be less than maximum length'
    }
  }
  
  validationErrors.value = errors
  return Object.keys(errors).length === 0
}

async function handleSave() {
  if (!validateForm() || isSubmitting.value) return
  
  isSubmitting.value = true
  
  try {
    const detectorData = { ...form.value }
    
    if (isNewDetector.value) {
      await detectorsStore.createDetector(detectorData)
    } else {
      await detectorsStore.updateDetector(props.detectorIndex, detectorData)
    }
    
    emit('saved')
  } catch (error) {
    // Error handling is done in the store
  } finally {
    isSubmitting.value = false
  }
}

function handleCancel() {
  emit('cancel')
}

// Auto-set talkgroupExclusive when talkgroupFilter changes
watch(
  () => form.value.talkgroupFilter,
  (newFilter, oldFilter) => {
    // Only auto-set to true when going from blank to non-blank
    if (newFilter && newFilter.trim() !== '' && (!oldFilter || oldFilter.trim() === '')) {
      form.value.talkgroupExclusive = true
    }
  }
)

// Watch for form changes to validate
watch(
  () => form.value,
  () => validateForm(),
  { deep: true }
)

// Initialize form on mount
onMounted(() => {
  initializeForm()
})
</script>

<style scoped>
.slider::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: #dc2626;
  cursor: pointer;
}

.slider::-moz-range-thumb {
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: #dc2626;
  cursor: pointer;
  border: none;
}
</style>