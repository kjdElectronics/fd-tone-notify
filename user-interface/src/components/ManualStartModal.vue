<template>
  <div v-if="show" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
    <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900 flex items-center">
          <InformationCircleIcon class="w-5 h-5 mr-2 text-blue-600" />
          Manual Server Start
        </h3>
        <button
          @click="$emit('close')"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <XMarkIcon class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-6">
        <div class="space-y-4">
          <!-- Status Message -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex items-center">
              <InformationCircleIcon class="w-5 h-5 text-blue-600 mr-2" />
              <div class="text-sm text-blue-800">
                <p class="font-medium">Backend server is not running</p>
                <p>Please start the server manually using the instructions below.</p>
              </div>
            </div>
          </div>

          <!-- Instructions -->
          <div class="space-y-3">
            <h4 class="font-medium text-gray-900">Starting the Server</h4>
            
            <div class="space-y-2">
              <div class="text-sm text-gray-700">
                <p class="font-medium">1. Open a terminal/command prompt</p>
                <p class="text-gray-600 ml-4">Navigate to the FD Tone Notify directory</p>
              </div>
              
              <div class="text-sm text-gray-700">
                <p class="font-medium">2. Run the manager (recommended):</p>
                <div class="bg-gray-100 rounded p-2 mt-1 font-mono text-sm">
                  <code>npm start</code>
                </div>
                <p class="text-xs text-gray-600 mt-1">Starts unified manager with both backend and UI</p>
              </div>
              
              <div class="text-sm text-gray-700">
                <p class="font-medium">3. Alternative options:</p>
                <div class="space-y-1 ml-4 text-xs">
                  <div class="space-y-1">
                    <p class="text-gray-600">Backend only:</p>
                    <div class="bg-gray-100 rounded p-2 font-mono">
                      <code>node index.js --web-server</code>
                    </div>
                    <div class="bg-gray-100 rounded p-2 font-mono">
                      <code>node index.js --web-server --port 3001</code>
                    </div>
                  </div>
                  <div class="space-y-1 mt-2">
                    <p class="text-gray-600">Manager with options:</p>
                    <div class="bg-gray-100 rounded p-2 font-mono">
                      <code>npm run manager</code>
                    </div>
                    <div class="bg-gray-100 rounded p-2 font-mono">
                      <code>node manager.js --backend-only</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Connection Status -->
          <div class="border-t pt-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div class="flex items-center">
                  <div 
                    :class="[
                      'w-2 h-2 rounded-full mr-2',
                      connectionStatus === 'connected' ? 'bg-green-500' : 
                      connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
                    ]"
                  ></div>
                  <span class="text-sm text-gray-700">
                    {{ connectionStatusText }}
                  </span>
                </div>
              </div>
              <div v-if="connectionStatus === 'connecting'" class="animate-spin">
                <div class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              </div>
            </div>
          </div>

          <!-- Troubleshooting -->
          <details class="text-sm">
            <summary class="font-medium text-gray-900 cursor-pointer hover:text-gray-700">
              Troubleshooting
            </summary>
            <div class="mt-2 space-y-2 text-gray-600 text-xs">
              <div>
                <p class="font-medium">Port already in use:</p>
                <p class="ml-2">Try: <code class="bg-gray-100 px-1 rounded">node index.js --web-server --port 3001</code></p>
              </div>
              <div>
                <p class="font-medium">Permission errors:</p>
                <p class="ml-2">Run terminal as administrator or use a port > 1024</p>
              </div>
              <div>
                <p class="font-medium">Module not found:</p>
                <p class="ml-2">Run: <code class="bg-gray-100 px-1 rounded">npm install</code></p>
              </div>
              <div>
                <p class="font-medium">Still having issues?</p>
                <p class="ml-2">Check the console output for specific error messages</p>
              </div>
            </div>
          </details>
        </div>
      </div>

      <!-- Footer -->
      <div class="bg-gray-50 px-6 py-3 rounded-b-lg">
        <div class="flex justify-end">
          <button
            @click="$emit('close')"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { 
  InformationCircleIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  connectionStatus: {
    type: String,
    default: 'disconnected', // 'disconnected', 'connecting', 'connected'
    validator: value => ['disconnected', 'connecting', 'connected'].includes(value)
  }
})

const emit = defineEmits(['close'])

const connectionStatusText = computed(() => {
  switch (props.connectionStatus) {
    case 'connected':
      return 'Connected to backend server'
    case 'connecting':
      return 'Attempting to connect...'
    case 'disconnected':
    default:
      return 'Disconnected from backend server'
  }
})
</script>