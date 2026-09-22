import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../utils/api'

// The password shipped in config/secrets.template.json / docs/api.md - not
// a secret in itself (it's public in the repo), just the trigger for
// forcing a password change on first login. Comparing the entered password
// client-side (rather than the backend telling us "this is still the
// default") keeps this simple: no backend support needed beyond
// POST /api/auth/password itself, and it naturally stops firing the moment
// the password is actually changed to anything else.
const DEFAULT_PASSWORD = 'admin123'

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false)
  const mustChangePassword = ref(false)
  const loading = ref(false)
  const error = ref(null)
  const passwordChangeError = ref(null)
  const passwordChangeLoading = ref(false)

  async function login(password) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/auth/login', { password })

      if (response.data.success && response.data.token) {
        isAuthenticated.value = true
        localStorage.setItem('ui-authenticated', 'true')
        localStorage.setItem('ui-token', response.data.token)

        if (password === DEFAULT_PASSWORD) {
          mustChangePassword.value = true
          localStorage.setItem('ui-must-change-password', 'true')
        }
        return true
      } else {
        error.value = response.data.error || 'Login failed'
        return false
      }
    } catch (err) {
      error.value = err.response?.data?.error || 'Network error'
      return false
    } finally {
      loading.value = false
    }
  }

  async function changePassword(currentPassword, newPassword) {
    passwordChangeLoading.value = true
    passwordChangeError.value = null

    try {
      const response = await api.post('/auth/password', { currentPassword, newPassword })

      if (response.data.success) {
        mustChangePassword.value = false
        localStorage.removeItem('ui-must-change-password')
        return true
      } else {
        passwordChangeError.value = response.data.error || 'Failed to change password'
        return false
      }
    } catch (err) {
      passwordChangeError.value = err.response?.data?.error || 'Network error'
      return false
    } finally {
      passwordChangeLoading.value = false
    }
  }

  function logout() {
    isAuthenticated.value = false
    mustChangePassword.value = false
    localStorage.removeItem('ui-authenticated')
    localStorage.removeItem('ui-token')
    localStorage.removeItem('ui-must-change-password')
    error.value = null
  }

  function checkAuthFromStorage() {
    const stored = localStorage.getItem('ui-authenticated')
    const token = localStorage.getItem('ui-token')
    if (stored === 'true' && token) {
      isAuthenticated.value = true
      mustChangePassword.value = localStorage.getItem('ui-must-change-password') === 'true'
    }
  }

  // Initialize auth state from localStorage
  checkAuthFromStorage()

  return {
    isAuthenticated,
    mustChangePassword,
    loading,
    error,
    passwordChangeError,
    passwordChangeLoading,
    login,
    changePassword,
    logout,
    checkAuthFromStorage
  }
})