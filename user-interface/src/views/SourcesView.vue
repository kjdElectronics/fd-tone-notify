<template>
  <div class="p-6">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">Sources</h1>
      <p class="text-gray-600">Connect Rdio Scanner instances and manage API keys for this server</p>
    </div>

    <div class="space-y-6">
      <!-- Connect a server -->
      <div class="card">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <ServerIcon class="w-5 h-5 mr-2 text-fire-600" />
          Connect a Server
        </h2>
        <p class="text-sm text-gray-600 mb-4">
          Point Rdio Scanner, SDRTrunk's Rdio Scanner broadcaster, or Thin Line Radio's uploader at this URL:
        </p>

        <div class="flex items-center gap-2 mb-4">
          <input
            :value="callUploadUrl"
            readonly
            class="input-field font-mono text-sm bg-gray-50"
            @focus="$event.target.select()"
          />
          <button @click="copy(callUploadUrl)" class="btn-secondary btn-sm whitespace-nowrap">
            <ClipboardDocumentIcon class="w-4 h-4 mr-1" />
            Copy
          </button>
        </div>

        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-2">
          <p>
            Create an <strong>ingest key</strong> below and use it as the API key in your Rdio Scanner
            downstream configuration (or SDRTrunk's Rdio Scanner broadcaster / Thin Line Radio's uploader
            settings). Each source can use its own key so detections and detectors can be restricted to a
            specific site.
          </p>
          <p>
            Rdio Scanner's <code class="bg-blue-100 px-1 rounded">config.json</code> downstream entry needs
            this server's URL above and the ingest key as <code class="bg-blue-100 px-1 rounded">apiKey</code>.
          </p>
        </div>
      </div>

      <!-- Ingest Keys -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900 flex items-center">
            <RadioIcon class="w-5 h-5 mr-2 text-fire-600" />
            Ingest Keys
          </h2>
          <button @click="startCreate('ingest')" class="btn-primary btn-sm">
            <PlusIcon class="w-4 h-4 mr-1" />
            Create Ingest Key
          </button>
        </div>
        <p class="text-sm text-gray-600 mb-4">
          Used to authenticate <code class="bg-gray-100 px-1 rounded">POST /api/call-upload</code> from a
          Rdio Scanner-compatible source. Detectors can optionally be restricted to specific ingest keys in
          the detector editor's "Sources" field.
        </p>

        <KeyCreateForm
          v-if="createForm.scopeGroup === 'ingest'"
          :fixed-scopes="['ingest']"
          :loading="apiKeysStore.creating"
          @create="handleCreate"
          @cancel="cancelCreate"
        />

        <div v-if="apiKeysStore.loading" class="text-center py-6 text-gray-500">Loading keys...</div>

        <div v-else-if="apiKeysStore.ingestKeys.length === 0" class="text-center py-8 text-gray-500">
          <RadioIcon class="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p class="font-medium text-gray-700">No sources connected</p>
          <p class="text-sm mt-1">Create an ingest key above, then connect a server using it.</p>
        </div>

        <ul v-else class="divide-y divide-gray-200">
          <KeyListItem
            v-for="key in apiKeysStore.ingestKeys"
            :key="key.id"
            :api-key="key"
            :deleting="apiKeysStore.deletingId === key.id"
            @delete="confirmDelete(key)"
          />
        </ul>
      </div>

      <!-- API Keys (read/admin) -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900 flex items-center">
            <KeyIcon class="w-5 h-5 mr-2 text-fire-600" />
            API Keys
          </h2>
          <button @click="startCreate('management')" class="btn-primary btn-sm">
            <PlusIcon class="w-4 h-4 mr-1" />
            Create API Key
          </button>
        </div>
        <p class="text-sm text-gray-600 mb-4">
          Read or admin-scoped keys for a control plane or automation talking to this server's HTTP API
          instead of, or alongside, a UI login. See
          <code class="bg-gray-100 px-1 rounded">docs/api.md</code> for the full contract.
        </p>

        <KeyCreateForm
          v-if="createForm.scopeGroup === 'management'"
          :available-scopes="['read', 'admin']"
          :loading="apiKeysStore.creating"
          @create="handleCreate"
          @cancel="cancelCreate"
        />

        <div v-if="apiKeysStore.loading" class="text-center py-6 text-gray-500">Loading keys...</div>

        <div v-else-if="apiKeysStore.managementKeys.length === 0" class="text-center py-8 text-gray-500">
          <KeyIcon class="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p>No API keys yet</p>
        </div>

        <ul v-else class="divide-y divide-gray-200">
          <KeyListItem
            v-for="key in apiKeysStore.managementKeys"
            :key="key.id"
            :api-key="key"
            :deleting="apiKeysStore.deletingId === key.id"
            @delete="confirmDelete(key)"
          />
        </ul>
      </div>

      <!-- Newly created key - shown once -->
      <div v-if="newlyCreatedKey" class="card border-2 border-amber-400 bg-amber-50">
        <div class="flex items-start">
          <ExclamationTriangleIcon class="w-6 h-6 text-amber-600 mr-3 flex-shrink-0" />
          <div class="flex-1">
            <h3 class="font-semibold text-amber-900">
              "{{ newlyCreatedKey.name }}" created
            </h3>
            <p class="text-sm text-amber-800 mt-1">
              Copy this key now - it will not be shown again. If you lose it, delete the key and create a
              new one.
            </p>
            <div class="flex items-center gap-2 mt-3">
              <input
                :value="newlyCreatedKey.key"
                readonly
                class="input-field font-mono text-sm bg-white"
                @focus="$event.target.select()"
              />
              <button @click="copy(newlyCreatedKey.key)" class="btn-secondary btn-sm whitespace-nowrap">
                <ClipboardDocumentIcon class="w-4 h-4 mr-1" />
                Copy
              </button>
            </div>
            <button @click="newlyCreatedKey = null" class="text-sm text-amber-700 hover:text-amber-900 mt-3">
              Done, I've copied it
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div
      v-if="deleteConfirm"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
    >
      <div class="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Delete API Key</h3>
        <p class="text-gray-600 mb-6">
          Are you sure you want to delete "{{ deleteConfirm.name }}"? Anything using this key
          (a Rdio Scanner source, or a control plane) will stop authenticating immediately.
        </p>
        <div class="flex justify-end space-x-3">
          <button @click="deleteConfirm = null" class="btn-secondary">Cancel</button>
          <button @click="executeDelete" class="btn-danger">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApiKeysStore } from '../stores/apiKeys'
import { useNotificationStore } from '../stores/notifications'
import api from '../utils/api'
import KeyCreateForm from '../components/KeyCreateForm.vue'
import KeyListItem from '../components/KeyListItem.vue'
import {
  ServerIcon,
  RadioIcon,
  KeyIcon,
  PlusIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'

const apiKeysStore = useApiKeysStore()
const notificationStore = useNotificationStore()

const createForm = ref({ scopeGroup: null })
const newlyCreatedKey = ref(null)
const deleteConfirm = ref(null)

// Derives the call-upload URL from the same base URL axios is already using
// (utils/api.js), so it always matches whatever host/protocol/port the UI
// itself is talking to the backend on.
const callUploadUrl = computed(() => {
  const base = api.defaults.baseURL.replace(/\/api\/?$/, '')
  return `${base}/api/call-upload`
})

function startCreate(scopeGroup) {
  createForm.value = { scopeGroup }
}

function cancelCreate() {
  createForm.value = { scopeGroup: null }
}

async function handleCreate({ name, scopes }) {
  try {
    const created = await apiKeysStore.createKey({ name, scopes })
    newlyCreatedKey.value = created
    cancelCreate()
  } catch (err) {
    // Error notification already shown by the store
  }
}

function confirmDelete(key) {
  deleteConfirm.value = key
}

async function executeDelete() {
  const key = deleteConfirm.value
  deleteConfirm.value = null
  try {
    await apiKeysStore.deleteKey(key.id)
  } catch (err) {
    // Error notification already shown by the store
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    notificationStore.addNotification({ type: 'success', message: 'Copied to clipboard', duration: 2000 })
  } catch (err) {
    console.warn('Failed to copy to clipboard:', err)
  }
}

onMounted(() => {
  apiKeysStore.fetchKeys()
})
</script>
