import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }
}))

import api from '../utils/api'
import { useApiKeysStore } from './apiKeys'

describe('stores/apiKeys', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.get.mockReset()
    api.post.mockReset()
    api.delete.mockReset()
  })

  it('splits fetched keys into ingest vs read/admin ("management") groups', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        keys: [
          { id: 'a', name: 'Site A', scopes: ['ingest'] },
          { id: 'b', name: 'Control Plane', scopes: ['admin'] },
          { id: 'c', name: 'Read Only', scopes: ['read'] },
          { id: 'd', name: 'Both', scopes: ['ingest', 'admin'] }
        ]
      }
    })

    const store = useApiKeysStore()
    await store.fetchKeys()

    expect(store.ingestKeys.map(k => k.id)).toEqual(['a', 'd'])
    expect(store.managementKeys.map(k => k.id)).toEqual(['b', 'c', 'd'])
    expect(store.hasIngestKeys).toBe(true)
  })

  it('createKey returns the one-time plaintext key but never stores it in state', async () => {
    api.post.mockResolvedValue({
      data: {
        success: true,
        key: { id: 'x1', name: 'New Key', scopes: ['ingest'], createdAt: '2025-01-01T00:00:00.000Z', key: 'fdtn_x1.supersecret' }
      }
    })

    const store = useApiKeysStore()
    const created = await store.createKey({ name: 'New Key', scopes: ['ingest'] })

    expect(created.key).toBe('fdtn_x1.supersecret')
    expect(store.keys).toHaveLength(1)
    expect(store.keys[0]).not.toHaveProperty('key')
    expect(store.keys[0].id).toBe('x1')
  })

  it('deleteKey removes the key optimistically and rolls back on failure', async () => {
    api.get.mockResolvedValue({ data: { success: true, keys: [{ id: 'a', name: 'A', scopes: ['read'] }] } })
    const store = useApiKeysStore()
    await store.fetchKeys()

    api.delete.mockRejectedValue({ response: { data: { error: 'boom' } } })

    await expect(store.deleteKey('a')).rejects.toBeTruthy()
    expect(store.keys.map(k => k.id)).toEqual(['a'])
  })
})
