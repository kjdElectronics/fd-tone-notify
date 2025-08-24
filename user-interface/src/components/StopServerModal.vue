<template>
  <div v-if="show" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
    <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-red-200 bg-red-50">
        <h3 class="text-lg font-medium text-red-900 flex items-center">
          <ExclamationTriangleIcon class="w-6 h-6 mr-2 text-red-600" />
          Danger: Stop Server
        </h3>
        <button
          @click="$emit('close')"
          class="text-red-400 hover:text-red-600 transition-colors"
        >
          <XMarkIcon class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-6">
        <div class="space-y-4">
          <!-- Warning Message -->
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <div class="flex items-start">
              <ExclamationTriangleIcon class="w-6 h-6 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
              <div class="text-sm text-red-800">
                <p class="font-semibold mb-2">⚠️ Warning</p>
                <p class="mb-2">You are about to <strong>stop</strong> the FD Tone Notify backend server.</p>
                <p>This action will:</p>
                <ul class="list-disc list-inside mt-2 space-y-1 text-xs">
                  <li>Immediately terminate all tone detection</li>
                  <li>Stop all notification services</li>
                  <li>Interrupt pending notifications and recordings</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Manual Restart Instructions -->
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 class="font-medium text-gray-900 mb-2">After stopping, you will be able to restart if the Manager System is also running.</h4>
          </div>

          <!-- Confirmation -->
          <div class="border-t pt-4">
            <div class="flex items-center">
              <input
                id="confirm-stop"
                v-model="confirmStop"
                type="checkbox"
                class="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
              >
              <label for="confirm-stop" class="ml-2 block text-sm text-gray-700">
                I understand the consequences and want to proceed with stopping the server
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="bg-gray-50 px-6 py-4 rounded-b-lg">
        <div class="flex justify-between space-x-3">
          <button
            @click="$emit('close')"
            class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            @click="handleStop"
            :disabled="!confirmStop || stopping"
            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            <StopIcon v-if="!stopping" class="w-4 h-4 mr-2" />
            <div v-else class="w-4 h-4 mr-2 animate-spin border-2 border-white border-t-transparent rounded-full"></div>
            {{ stopping ? 'Stopping...' : 'Stop Server' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { 
  ExclamationTriangleIcon,
  XMarkIcon,
  StopIcon
} from '@heroicons/vue/24/outline'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'stop'])

const confirmStop = ref(false)
const stopping = ref(false)

function handleStop() {
  if (!confirmStop.value || stopping.value) return
  
  stopping.value = true
  emit('stop')
}

// Reset state when modal is closed
function resetState() {
  confirmStop.value = false
  stopping.value = false
}

// Watch for show prop changes to reset state
import { watch } from 'vue'
watch(() => props.show, (newValue) => {
  if (!newValue) {
    resetState()
  }
})
</script>