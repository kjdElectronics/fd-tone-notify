import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../utils/api'
import { useNotificationStore } from './notifications'

// API key management (GET/POST/DELETE /api/keys - see docs/api.md
// "Authentication" and "Per-source ingest keys"). A key's full plaintext
// value is only ever returned once, by createKey() right after creation -
// it is never stored here or persisted anywhere in the UI.
export const useApiKeysStore = defineStore('apiKeys', () => {
  // State
  const keys = ref([])
  const loading = ref(false)
  const error = ref(null)
  const creating = ref(false)
  const deletingId = ref(null)

  // Computed
  const ingestKeys = computed(() => keys.value.filter(k => k.scopes?.includes('ingest')))
  const managementKeys = computed(() => keys.value.filter(k => k.scopes?.includes('read') || k.scopes?.includes('admin')))
  const hasIngestKeys = computed(() => ingestKeys.value.length > 0)

  // Actions
  async function fetchKeys() {
    loading.value = true
    error.value = null

    try {
      const response = await api.get('/keys')
      if (response.data.success) {
        keys.value = response.data.keys || []
      } else {
        throw new Error(response.data.error || 'Failed to fetch API keys')
      }
    } catch (err) {
      error.value = err.response?.data?.error || err.message || 'Failed to fetch API keys'
      console.error('Failed to fetch API keys:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Create a new API key. Returns the full key object (including the
   * one-time plaintext `key`) so the caller can show/copy it - the store
   * itself only keeps the non-secret fields in `keys`.
   */
  async function createKey({ name, scopes }) {
    creating.value = true
    error.value = null

    try {
      const response = await api.post('/keys', { name, scopes })
      if (response.data.success) {
        const { key, ...withoutSecret } = response.data.key
        keys.value.push(withoutSecret)

        const notificationStore = useNotificationStore()
        notificationStore.addNotification({
          type: 'success',
          message: `API key "${name}" created`
        })

        return response.data.key
      } else {
        throw new Error(response.data.error || 'Failed to create API key')
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create API key'
      error.value = errorMessage

      const notificationStore = useNotificationStore()
      notificationStore.addNotification({ type: 'error', message: errorMessage })

      throw err
    } finally {
      creating.value = false
    }
  }

  async function deleteKey(id) {
    deletingId.value = id
    error.value = null

    const originalKeys = [...keys.value]
    keys.value = keys.value.filter(k => k.id !== id)

    try {
      const response = await api.delete(`/keys/${id}`)
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to delete API key')
      }

      const notificationStore = useNotificationStore()
      notificationStore.addNotification({ type: 'success', message: 'API key deleted' })
    } catch (err) {
      keys.value = originalKeys

      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete API key'
      error.value = errorMessage

      const notificationStore = useNotificationStore()
      notificationStore.addNotification({ type: 'error', message: errorMessage })

      throw err
    } finally {
      deletingId.value = null
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    // State
    keys,
    loading,
    error,
    creating,
    deletingId,

    // Computed
    ingestKeys,
    managementKeys,
    hasIngestKeys,

    // Actions
    fetchKeys,
    createKey,
    deleteKey,
    clearError
  }
})
