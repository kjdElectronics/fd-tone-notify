import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../utils/api'

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false)
  const loading = ref(false)
  const error = ref(null)

  async function login(password) {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/auth/login', { password })
      
      if (response.data.success && response.data.token) {
        isAuthenticated.value = true
        localStorage.setItem('ui-authenticated', 'true')
        localStorage.setItem('ui-token', response.data.token)
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

  function logout() {
    isAuthenticated.value = false
    localStorage.removeItem('ui-authenticated')
    localStorage.removeItem('ui-token')
    error.value = null
  }

  function checkAuthFromStorage() {
    const stored = localStorage.getItem('ui-authenticated')
    const token = localStorage.getItem('ui-token')
    if (stored === 'true' && token) {
      isAuthenticated.value = true
    }
  }

  // Initialize auth state from localStorage
  checkAuthFromStorage()

  return {
    isAuthenticated,
    loading,
    error,
    login,
    logout,
    checkAuthFromStorage
  }
})