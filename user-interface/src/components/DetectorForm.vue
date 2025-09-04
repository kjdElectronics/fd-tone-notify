<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div class="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b">
        <h2 class="text-xl font-semibold text-gray-900">
          {{ isEditMode ? 'Edit Detector' : 'Create New Detector' }}
        </h2>
        <button
          @click="$emit('close')"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <XMarkIcon class="w-6 h-6" />
        </button>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSubmit" class="flex flex-col max-h-[calc(90vh-80px)]">
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          <!-- Basic Information -->
          <div class="space-y-4">
            <h3 class="text-lg font-medium text-gray-900">Basic Information</h3>
            
            <!-- Detector Name -->
            <div>
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
                Enter tone frequencies between 100-3000 Hz. Multiple tones will be detected in sequence.
              </p>
            </div>
          </div>

          <!-- Detection Settings -->
          <div class="space-y-4">
            <h3 class="text-lg font-medium text-gray-900">Detection Settings</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <p class="form-help">
                  Higher values reduce false positives but may miss weak signals
                </p>
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
                <p class="form-help">
                  Allowable deviation from target frequencies
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div class="space-y-4">
            <h3 class="text-lg font-medium text-gray-900">Recording Settings</h3>
            
            <!-- Recording Enabled -->
            <div>
              <label class="flex items-center space-x-3 cursor-pointer">
                <input
                  v-model="form.isRecordingEnabled"
                  type="checkbox"
                  class="form-checkbox"
                />
                <span class="form-label mb-0">Enable audio recording for this detector</span>
              </label>
              <p class="form-help">
                When enabled, audio will be recorded when this detector triggers
              </p>
            </div>

            <!-- Recording Length Settings (only show if recording enabled) -->
            <div v-if="form.isRecordingEnabled" class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="min-recording" class="form-label">
                  Minimum Recording Length (seconds)
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
                  Maximum Recording Length (seconds)
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

          <!-- Notifications -->
          <div class="space-y-4">
            <h3 class="text-lg font-medium text-gray-900">Notifications</h3>
            
            <NotificationBuilder 
              v-model="form.notifications"
              @update:modelValue="updateNotifications"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between p-6 border-t bg-gray-50">
          <div class="text-sm text-gray-600">
            <span class="text-red-500">*</span> Required fields
          </div>
          <div class="flex items-center space-x-3">
            <button
              type="button"
              @click="$emit('close')"
              class="btn-secondary"
              :disabled="isSubmitting"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="btn-primary"
              :disabled="isSubmitting || !isFormValid"
            >
              <span v-if="isSubmitting">
                {{ isEditMode ? 'Updating...' : 'Creating...' }}
              </span>
              <span v-else>
                {{ isEditMode ? 'Update Detector' : 'Create Detector' }}
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useDetectorsStore } from '../stores/detectors'
import NotificationBuilder from './NotificationBuilder.vue'
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon
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
const emit = defineEmits(['close', 'saved'])

// Store
const detectorsStore = useDetectorsStore()

// Form state
const form = ref({
  name: '',
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

const isSubmitting = ref(false)
const validationErrors = ref({})

// Computed
const isEditMode = computed(() => props.detector !== null)

const isFormValid = computed(() => {
  return form.value.name.trim() !== '' && 
         form.value.tones.length > 0 && 
         form.value.tones.every(tone => tone >= 100 && tone <= 3000) &&
         Object.keys(validationErrors.value).length === 0
})

// Methods
function initializeForm() {
  if (props.detector) {
    // Edit mode - populate form with existing detector
    form.value = {
      name: props.detector.name,
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
      if (!tone || tone < 100 || tone > 3000) {
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

async function handleSubmit() {
  if (!validateForm() || isSubmitting.value) return
  
  isSubmitting.value = true
  
  try {
    const detectorData = { ...form.value }
    
    if (isEditMode.value) {
      await detectorsStore.updateDetector(props.detectorIndex, detectorData)
    } else {
      await detectorsStore.createDetector(detectorData)
    }
    
    emit('saved')
    emit('close')
  } catch (error) {
    // Error handling is done in the store
  } finally {
    isSubmitting.value = false
  }
}

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