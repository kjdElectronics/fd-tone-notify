import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// api.js is mocked so login()/changePassword() never make a real HTTP call -
// each test controls exactly what the "backend" responds with.
vi.mock('../utils/api', () => ({
  default: { post: vi.fn() }
}))

import api from '../utils/api'
import { useAuthStore } from './auth'

// jsdom isn't loaded (this suite only needs localStorage, not a DOM), so
// provide a minimal in-memory localStorage before the store (which reads it
// eagerly on creation via checkAuthFromStorage()) is ever instantiated.
function installFakeLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  }
}

describe('stores/auth', () => {
  beforeEach(() => {
    installFakeLocalStorage()
    setActivePinia(createPinia())
    api.post.mockReset()
  })

  it('forces a password change when logging in with the shipped default password', async () => {
    api.post.mockResolvedValue({ data: { success: true, token: 'session-token' } })

    const auth = useAuthStore()
    const result = await auth.login('admin123')

    expect(result).toBe(true)
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.mustChangePassword).toBe(true)
    expect(localStorage.getItem('ui-must-change-password')).toBe('true')
  })

  it('does not force a password change for a non-default password', async () => {
    api.post.mockResolvedValue({ data: { success: true, token: 'session-token' } })

    const auth = useAuthStore()
    await auth.login('a-real-password')

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.mustChangePassword).toBe(false)
    expect(localStorage.getItem('ui-must-change-password')).toBeNull()
  })

  it('restores the forced-change flag from localStorage on reload', () => {
    localStorage.setItem('ui-authenticated', 'true')
    localStorage.setItem('ui-token', 'session-token')
    localStorage.setItem('ui-must-change-password', 'true')

    const auth = useAuthStore()

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.mustChangePassword).toBe(true)
  })

  it('clears the forced-change flag once the password is successfully changed', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, token: 'session-token' } })
    const auth = useAuthStore()
    await auth.login('admin123')
    expect(auth.mustChangePassword).toBe(true)

    api.post.mockResolvedValueOnce({ data: { success: true, message: 'Password changed successfully' } })
    const result = await auth.changePassword('admin123', 'a-brand-new-password')

    expect(result).toBe(true)
    expect(auth.mustChangePassword).toBe(false)
    expect(localStorage.getItem('ui-must-change-password')).toBeNull()
    expect(api.post).toHaveBeenLastCalledWith('/auth/password', {
      currentPassword: 'admin123',
      newPassword: 'a-brand-new-password'
    })
  })

  it('surfaces a backend error from changePassword without clearing the forced-change flag', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, token: 'session-token' } })
    const auth = useAuthStore()
    await auth.login('admin123')

    api.post.mockResolvedValueOnce({ data: { success: false, error: 'Current password is incorrect' } })
    const result = await auth.changePassword('wrong', 'a-brand-new-password')

    expect(result).toBe(false)
    expect(auth.passwordChangeError).toBe('Current password is incorrect')
    expect(auth.mustChangePassword).toBe(true)
  })

  it('logout clears authentication and the forced-change flag', async () => {
    api.post.mockResolvedValue({ data: { success: true, token: 'session-token' } })
    const auth = useAuthStore()
    await auth.login('admin123')

    auth.logout()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.mustChangePassword).toBe(false)
    expect(localStorage.getItem('ui-authenticated')).toBeNull()
    expect(localStorage.getItem('ui-token')).toBeNull()
    expect(localStorage.getItem('ui-must-change-password')).toBeNull()
  })
})
