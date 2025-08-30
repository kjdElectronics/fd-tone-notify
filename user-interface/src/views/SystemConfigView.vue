<template>
  <div class="p-6">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">System Configuration</h1>
      <p class="text-gray-600">Configure audio settings, notifications, and system behavior</p>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-fire-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading configuration...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="alert-emergency mb-6">
      <h3 class="font-medium">Failed to load configuration</h3>
      <p class="text-sm mt-1">{{ error }}</p>
      <button @click="loadConfig" class="mt-2 btn-primary">Retry</button>
    </div>

    <!-- Configuration Form -->
    <div v-else class="space-y-8">
      <!-- Audio Configuration -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <SpeakerWaveIcon class="w-5 h-5 mr-2 text-fire-600" />
          Audio Configuration
        </h2>
        
        <!-- Audio Disabled Checkbox -->
        <div class="mb-6">
          <label class="label flex items-center">
            <input
              v-model="config.audio.disabled"
              type="checkbox"
              class="mr-2"
            />
            Disable LIVE Audio Input Processing
          </label>
          <p class="help-text">Check this when there will not be a live audio input stream (e.g., API-only mode or testing). When disabled, all audio processing and recording features are unavailable.</p>
        </div>
        
        <div v-if="!config.audio.disabled" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="label">Audio Input Device (Not used for Windows OS)</label>
            <input
              v-model="config.audio.inputDevice"
              type="text"
              class="input-field"
              placeholder="default"
            />
            <p class="help-text">Audio device to capture from (e.g., 'hw:1,0' or 'default')</p>
          </div>

          <div>
            <label class="label">Sample Rate (Hz)</label>
            <input
              v-model.number="config.audio.sampleRate"
              type="number"
              class="input-field"
              placeholder="44100"
              min="8000"
              max="96000"
            />
            <p class="help-text">Audio sample rate. Common values: 22050, 44100, 48000</p>
          </div>

          <div>
            <label class="label">Audio Channels</label>
            <select v-model.number="config.audio.channels" class="input-field">
              <option value="1">Mono (1)</option>
              <option value="2">Stereo (2)</option>
            </select>
            <p class="help-text">Number of audio channels to record</p>
          </div>

          <div>
            <label class="label">Frequency Scale Factor</label>
            <input
              v-model.number="config.audio.frequencyScaleFactor"
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              class="input-field"
              placeholder="1.0"
            />
            <p class="help-text">Multiplier for frequency detection (usually 1.0)</p>
          </div>

          <div>
            <label class="label">Recording Scale Factor</label>
            <input
              v-model.number="config.audio.recordingScaleFactor"
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              class="input-field"
              placeholder="2"
            />
            <p class="help-text">Multiplier for recording scale (usually 2)</p>
          </div>

          <div>
            <label class="label">Silence Amplitude Threshold</label>
            <input
              v-model.number="config.audio.silenceAmplitude"
              type="number"
              step="0.01"
              min="0"
              max="1"
              class="input-field"
              placeholder="0.05"
            />
            <p class="help-text">Threshold for silence detection (0.0 to 1.0)</p>
          </div>
        </div>
      </div>

      <!-- Recording Configuration -->
      <div v-if="!config.audio.disabled" class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <MicrophoneIcon class="w-5 h-5 mr-2 text-fire-600" />
          Recording Configuration
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="label">Recording Directory</label>
            <input
              v-model="config.recording.directory"
              type="text"
              class="input-field"
              placeholder="./recordings"
            />
            <p class="help-text">Directory where audio recordings are saved</p>
          </div>

          <div>
            <label class="label">Minimum Recording Length (seconds)</label>
            <input
              v-model.number="config.detection.minRecordingLengthSec"
              type="number"
              min="1"
              max="600"
              class="input-field"
              placeholder="30"
            />
            <p class="help-text">Minimum duration for recordings</p>
          </div>

          <div>
            <label class="label">Maximum Recording Length (seconds)</label>
            <input
              v-model.number="config.detection.maxRecordingLengthSec"
              type="number"
              min="1"
              max="600"
              class="input-field"
              placeholder="45"
            />
            <p class="help-text">Maximum duration for recordings</p>
          </div>

          <div>
            <label class="label">Auto-Delete Recordings After (days)</label>
            <input
              v-model.number="config.recording.autoDeleteOlderThanDays"
              type="number"
              min="0"
              max="365"
              class="input-field"
              placeholder="7"
            />
            <p class="help-text">Delete recordings older than this many days (0 = never delete)</p>
          </div>

          <div class="md:col-span-2">
            <label class="label flex items-center">
              <input
                v-model="config.detection.isRecordingEnabled"
                type="checkbox"
                class="mr-2"
              />
              Enable Recording
            </label>
            <p class="help-text">Enable or disable audio recording functionality</p>
          </div>
        </div>
      </div>

      <!-- Detection Configuration -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <ExclamationTriangleIcon class="w-5 h-5 mr-2 text-fire-600" />
          Detection Settings
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="label">Default Match Threshold</label>
            <input
              v-model.number="config.detection.defaultMatchThreshold"
              type="number"
              step="1"
              min="1"
              max="20"
              class="input-field"
              placeholder="6"
            />
            <p class="help-text">Default number of tones that must match for detection</p>
          </div>

          <div>
            <label class="label">Clarity Threshold</label>
            <input
              v-model.number="config.detection.clarityThreshold"
              type="number"
              step="0.01"
              min="0"
              max="1"
              class="input-field"
              placeholder="0.89"
            />
            <p class="help-text">Minimum clarity required for tone detection (0.0 to 1.0)</p>
          </div>

          <div>
            <label class="label">Default Tolerance Percent</label>
            <input
              v-model.number="config.detection.defaultTolerancePercent"
              type="number"
              step="0.01"
              min="0"
              max="1"
              class="input-field"
              placeholder="0.05"
            />
            <p class="help-text">Default frequency tolerance as percentage (0.01 = 1%)</p>
          </div>

          <div>
            <label class="label">Default Reset Timeout (ms)</label>
            <input
              v-model.number="config.detection.defaultResetTimeoutMs"
              type="number"
              step="100"
              min="1000"
              max="60000"
              class="input-field"
              placeholder="5000"
            />
            <p class="help-text">Default time before detection resets (milliseconds)</p>
          </div>

          <div>
            <label class="label">Default Lockout Timeout (ms)</label>
            <input
              v-model.number="config.detection.defaultLockoutTimeoutMs"
              type="number"
              step="100"
              min="1000"
              max="60000"
              class="input-field"
              placeholder="7000"
            />
            <p class="help-text">Default lockout time after detection (milliseconds)</p>
          </div>

          <div class="md:col-span-2">
            <label class="label flex items-center">
              <input
                v-model="config.allToneDetector.enabled"
                type="checkbox"
                class="mr-2"
                checked
              />
              Enable All Tone Detector
            </label>
            <p class="help-text">This feature will help you identify new tones that you have not setup notifications for. Detections will be shown in the UI only and no notifications will be sent. Marginal performance impact.</p>
          </div>
        </div>
      </div>

      <!-- Email/SMTP Configuration -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <EnvelopeIcon class="w-5 h-5 mr-2 text-fire-600" />
          Email Configuration
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="label">From Email Address</label>
            <input
              v-model="config.email.from"
              type="email"
              class="input-field"
              placeholder="notifications@yourfd.com"
            />
            <p class="help-text">Email address that notifications will be sent from</p>
          </div>

          <div>
            <label class="label">SMTP Host</label>
            <input
              v-model="config.email.host"
              type="text"
              class="input-field"
              placeholder="smtp.gmail.com"
            />
            <p class="help-text">SMTP server hostname</p>
          </div>

          <div>
            <label class="label">SMTP Port</label>
            <input
              v-model.number="config.email.port"
              type="number"
              class="input-field"
              placeholder="587"
              min="1"
              max="65535"
            />
            <p class="help-text">SMTP server port (587 for TLS, 465 for SSL, 25 for plain)</p>
          </div>

          <div>
            <label class="label flex items-center">
              <input
                v-model="config.email.secure"
                type="checkbox"
                class="mr-2"
              />
              Use Secure Connection (SSL/TLS)
            </label>
            <p class="help-text">Enable secure SMTP connection</p>
          </div>

          <div>
            <label class="label">SMTP Username</label>
            <input
              v-model="config.secrets.FD_SMTP_USERNAME"
              type="text"
              class="input-field"
              placeholder="your-email@gmail.com"
            />
            <p class="help-text">SMTP authentication username</p>
          </div>

          <div>
            <label class="label" for="smtp-password">SMTP Password</label>
            <SecurePasswordField
              v-model="config.secrets.FD_SMTP_PASSWORD"
              field-id="smtp-password"
              placeholder="Enter SMTP password"
            />
            <p class="help-text">SMTP authentication password (secure)</p>
          </div>
        </div>
      </div>

      <!-- External Services -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <BellIcon class="w-5 h-5 mr-2 text-fire-600" />
          External Services
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="label" for="pushbullet-api-key">Pushbullet API Key</label>
            <SecurePasswordField
              v-model="config.secrets.FD_PUSHBULLET_API_KEY"
              field-id="pushbullet-api-key"
              placeholder="Enter Pushbullet API key"
            />
            <p class="help-text">API key for Pushbullet notifications</p>
          </div>

          <div>
            <label class="label">Coralogix Application Name</label>
            <input
              v-model="config.coralogix.applicationName"
              type="text"
              class="input-field"
              placeholder="FD-Tone-Notify"
            />
            <p class="help-text">Application name for Coralogix logging</p>
          </div>

          <div>
            <label class="label">Coralogix Subsystem Name</label>
            <input
              v-model="config.coralogix.subsystemName"
              type="text"
              class="input-field"
              placeholder="Detection"
            />
            <p class="help-text">Subsystem name for Coralogix logging</p>
          </div>

          <div>
            <label class="label" for="coralogix-private-key">Coralogix Private Key</label>
            <SecurePasswordField
              v-model="config.secrets.FD_CORALOGIX_PRIVATE_KEY"
              field-id="coralogix-private-key"
              placeholder="Enter Coralogix private key"
            />
            <p class="help-text">Private key for Coralogix logging service</p>
          </div>
        </div>
      </div>

      <!-- System Settings -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <ServerIcon class="w-5 h-5 mr-2 text-fire-600" />
          System Settings
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="label" for="ui-password">UI Password</label>
            <SecurePasswordField
              v-model="config.secrets.UI_PASSWORD_HASH"
              field-id="ui-password"
              placeholder="Enter UI access password"
            />
            <p class="help-text">Password to access this web interface</p>
          </div>
          
          <div class="md:col-span-1">
            <p class="text-sm text-gray-600">
              Port and log level are controlled by environment variables (FD_PORT, FD_LOG_LEVEL) and are not configurable through this interface.
            </p>
          </div>
        </div>
      </div>

      <!-- AWS S3 Integration (Optional) -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CloudArrowUpIcon class="w-5 h-5 mr-2 text-fire-600" />
          AWS S3 Integration (Optional)
        </h2>
        <p class="text-sm text-gray-600 mb-4">
          Configure AWS S3 for recording uploads via external commands
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="label">AWS Access Key ID</label>
            <input
              v-model="config.secrets.AWS_ACCESS_KEY_ID"
              type="text"
              class="input-field"
              placeholder="AKIAIOSFODNN7EXAMPLE"
            />
            <p class="help-text">AWS access key for S3 uploads (not secret)</p>
          </div>

          <div>
            <label class="label" for="aws-secret-key">AWS Secret Access Key</label>
            <SecurePasswordField
              v-model="config.secrets.AWS_SECRET_ACCESS_KEY_ID"
              field-id="aws-secret-key"
              placeholder="Enter AWS secret access key"
            />
            <p class="help-text">AWS secret key for S3 uploads (secure)</p>
          </div>

          <div>
            <label class="label">S3 Bucket Name</label>
            <input
              v-model="config.secrets.BUCKET_NAME"
              type="text"
              class="input-field"
              placeholder="my-fd-recordings"
            />
            <p class="help-text">S3 bucket name for uploading recordings</p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-medium text-gray-900">Apply Configuration</h3>
            <p class="text-sm text-gray-600">
              Save changes and optionally restart the system to apply new settings
            </p>
          </div>
          <div class="flex space-x-3">
            <button
              @click="resetConfig"
              :disabled="saving"
              class="btn-secondary"
            >
              Reset
            </button>
            <button
              @click="saveConfig(false)"
              :disabled="saving"
              class="btn-primary"
            >
              {{ saving ? 'Saving...' : 'Save Only' }}
            </button>
            <button
              @click="saveConfig(true)"
              :disabled="saving || !isManagerAvailable"
              :class="[
                'btn-danger',
                (!isManagerAvailable) ? 'opacity-50 cursor-not-allowed' : ''
              ]"
              :title="!isManagerAvailable ? 'Manager required for restart functionality' : 'Save configuration and restart backend'"
            >
              {{ saving ? 'Saving...' : (!isManagerAvailable ? 'Save & Restart (Manager Required)' : 'Save & Restart') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useNotificationStore } from '../stores/notifications'
import { useManagerSocketStore } from '../stores/manager-socket'
import { useSystemStatus } from '../composables/useSystemStatus'
import api from '../utils/api'
import SecurePasswordField from '../components/SecurePasswordField.vue'
import {
  SpeakerWaveIcon,
  MicrophoneIcon,
  EnvelopeIcon,
  BellIcon,
  ServerIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'

const notificationStore = useNotificationStore()
const managerSocketStore = useManagerSocketStore()
const systemStatus = useSystemStatus()

// Helper function to generate manager API URLs with correct protocol and hostname
function getManagerApiUrl(endpoint) {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http'
  return `${protocol}://${window.location.hostname}:3001${endpoint}`
}

// Use unified status system for manager availability
const isManagerAvailable = systemStatus.isManagerAvailable

// Reactive data
const loading = ref(true)
const saving = ref(false)
const error = ref(null)
const config = ref({
  // Nested configuration structure matching API
  audio: {
    disabled: false,
    inputDevice: '',
    sampleRate: 44100,
    channels: 1,
    frequencyScaleFactor: 1.0,
    recordingScaleFactor: 2,
    silenceAmplitude: 0.05
  },
  detection: {
    minRecordingLengthSec: 30,
    maxRecordingLengthSec: 45,
    defaultMatchThreshold: 6,
    clarityThreshold: 0.89,
    defaultTolerancePercent: 0.05,
    defaultResetTimeoutMs: 5000,
    defaultLockoutTimeoutMs: 7000,
    isRecordingEnabled: true
  },
  allToneDetector: {
    enabled: true,
    startFreq: 100,
    endFreq: 3000,
    tolerancePercent: 0.05,
    matchThreshold: 8,
    rangeOverlapModifier: 1.8
  },
  recording: {
    directory: './recordings',
    autoDeleteOlderThanDays: 7
  },
  email: {
    from: '',
    host: '',
    port: 587,
    secure: false
  },
  coralogix: {
    applicationName: '',
    subsystemName: ''
  },
  // Secrets (mixed into config for UI compatibility)
  secrets: {
    FD_SMTP_USERNAME: '',
    FD_SMTP_PASSWORD: '',
    FD_PUSHBULLET_API_KEY: '',
    FD_CORALOGIX_PRIVATE_KEY: '',
    UI_PASSWORD_HASH: '',
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY_ID: '',
    BUCKET_NAME: ''
  }
})

const originalConfig = ref({})

// Load configuration from server
async function loadConfig() {
  loading.value = true
  error.value = null
  
  try {
    // Get configuration from backend
    const response = await api.get('/config')
    const { configuration, secrets } = response.data
    
    // Merge configuration and secrets into UI config structure
    config.value = {
      audio: { ...config.value.audio, ...configuration.audio },
      detection: { ...config.value.detection, ...configuration.detection },
      allToneDetector: { ...config.value.allToneDetector, ...configuration.allToneDetector },
      recording: { ...config.value.recording, ...configuration.recording },
      email: { ...config.value.email, ...configuration.email },
      coralogix: { ...config.value.coralogix, ...configuration.coralogix },
      secrets: { ...config.value.secrets, ...secrets }
    }
    
    originalConfig.value = JSON.parse(JSON.stringify(config.value)) // Deep copy
    
    notificationStore.addNotification({
      type: 'success',
      message: 'Configuration loaded successfully'
    })
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load configuration'
    console.error('Failed to load config:', err)
  } finally {
    loading.value = false
  }
}

// Save configuration
async function saveConfig(restart = false) {
  saving.value = true
  
  try {
    // Convert nested config structure back to flat structure for backend compatibility
    const configurationData = {
      // Audio settings - convert nested to flat
      FD_AUDIO_DISABLED: config.value.audio.disabled ? 'true' : 'false',
      FD_INPUT_DEVICE: config.value.audio.inputDevice,
      FD_SAMPLE_RATE: config.value.audio.sampleRate,
      FD_CHANNELS: config.value.audio.channels,
      FD_FREQ_SCALE_FACTOR: config.value.audio.frequencyScaleFactor,
      FD_RECORDING_SCALE_FACTOR: config.value.audio.recordingScaleFactor,
      FD_SILENCE_AMPLITUDE: config.value.audio.silenceAmplitude,
      
      // Recording settings
      FD_RECORDING_DIRECTORY: config.value.recording.directory,
      FD_MIN_RECORDING_LENGTH_SEC: config.value.detection.minRecordingLengthSec,
      FD_MAX_RECORDING_LENGTH_SEC: config.value.detection.maxRecordingLengthSec,
      FD_AUTO_DELETE_RECORDINGS_OLDER_THAN_DAYS: config.value.recording.autoDeleteOlderThanDays,
      
      // Detection settings
      FD_DEFAULT_MATCH_THRESHOLD: config.value.detection.defaultMatchThreshold,
      FD_CLARITY_THRESHOLD: config.value.detection.clarityThreshold,
      FD_DEFAULT_TOLERANCE_PERCENT: config.value.detection.defaultTolerancePercent,
      FD_DEFAULT_RESET_TIMEOUT_MS: config.value.detection.defaultResetTimeoutMs,
      FD_DEFAULT_LOCKOUT_TIMEOUT_MS: config.value.detection.defaultLockoutTimeoutMs,
      FD_IS_RECORDING_ENABLED: config.value.detection.isRecordingEnabled,
      
      // All Tone Detector settings
      FD_ALL_TONE_DETECTOR_ENABLED: config.value.allToneDetector.enabled,
      FD_ALL_TONE_DETECTOR_START_FREQ: config.value.allToneDetector.startFreq,
      FD_ALL_TONE_DETECTOR_END_FREQ: config.value.allToneDetector.endFreq,
      FD_ALL_TONE_DETECTOR_TOLERANCE_PERCENT: config.value.allToneDetector.tolerancePercent,
      FD_ALL_TONE_DETECTOR_MATCH_THRESHOLD: config.value.allToneDetector.matchThreshold,
      FD_ALL_TONE_DETECTOR_RANGE_OVERLAP_MODIFIER: config.value.allToneDetector.rangeOverlapModifier,
      
      // Email settings
      FD_EMAIL_FROM: config.value.email.from,
      FD_SMTP_HOST: config.value.email.host,
      FD_SMTP_PORT: config.value.email.port,
      FD_SMTP_SECURE: config.value.email.secure,
      
      // Coralogix settings
      FD_CORALOGIX_APPLICATION_NAME: config.value.coralogix.applicationName,
      FD_CORALOGIX_SUBSYSTEM_NAME: config.value.coralogix.subsystemName,
      
      // Secrets
      ...config.value.secrets
    }

    const response = await api.put('/config', {
      configuration: configurationData,
      restartBackend: false // Always save config first without restart
    })
    
    originalConfig.value = JSON.parse(JSON.stringify(config.value)) // Deep copy
    
    notificationStore.addNotification({
      type: 'success',
      message: 'Configuration saved successfully'
    })
    
    // Handle restart separately if requested and manager is available
    if (restart && isManagerAvailable.value) {
      try {
        const restartResponse = await fetch(getManagerApiUrl('/backend/restart'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        
        if (!restartResponse.ok) {
          throw new Error(`Restart failed: ${restartResponse.statusText}`)
        }
        
        notificationStore.addNotification({
          type: 'info',
          message: 'Backend restart initiated with new configuration...',
          duration: 10000
        })
      } catch (restartError) {
        console.error('Restart failed:', restartError)
        notificationStore.addNotification({
          type: 'error',
          message: 'Configuration saved but restart failed: ' + restartError.message
        })
      }
    } else if (restart && !isManagerAvailable.value) {
      notificationStore.addNotification({
        type: 'warning',
        message: 'Configuration saved. Manager required for automated restart.'
      })
    }
  } catch (err) {
    notificationStore.addNotification({
      type: 'error',
      message: err.response?.data?.error || 'Failed to save configuration'
    })
    console.error('Failed to save config:', err)
  } finally {
    saving.value = false
  }
}

// Reset configuration to original values
function resetConfig() {
  config.value = JSON.parse(JSON.stringify(originalConfig.value)) // Deep copy
  notificationStore.addNotification({
    type: 'info',
    message: 'Configuration reset to last saved values'
  })
}

// Check if config has changes
const hasChanges = ref(false)
watch(config, () => {
  hasChanges.value = JSON.stringify(config.value) !== JSON.stringify(originalConfig.value)
}, { deep: true })

onMounted(() => {
  loadConfig()
})
</script>