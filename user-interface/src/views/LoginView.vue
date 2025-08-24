<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="mx-auto h-16 w-16 bg-fire-600 rounded-full flex items-center justify-center">
          <span class="text-white text-2xl font-bold">🔥</span>
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          FD Tone Notify
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600">
          Fire Department Tone Detection System
        </p>
        <p class="mt-4 text-center text-xs text-gray-500">
          Enter the admin password to access the configuration interface
        </p>
      </div>
      
      <form class="mt-8 space-y-6" @submit.prevent="handleLogin">
        <div>
          <label for="password" class="sr-only">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            v-model="password"
            class="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-fire-500 focus:border-fire-500 focus:z-10 sm:text-sm"
            placeholder="Admin password"
            :disabled="authStore.loading"
          />
        </div>

        <div v-if="authStore.error" class="alert-emergency">
          <p class="text-sm">{{ authStore.error }}</p>
        </div>

        <div>
          <button
            type="submit"
            :disabled="authStore.loading || !password"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-fire-600 hover:bg-fire-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-fire-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="authStore.loading">Authenticating...</span>
            <span v-else>Login</span>
          </button>
        </div>
      </form>

      <div class="mt-4 text-center">
        <p class="text-xs text-gray-500">
          Having trouble? Check the system logs or contact your administrator.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSocketStore } from '../stores/socket'

const authStore = useAuthStore()
const socketStore = useSocketStore()
const password = ref('')

async function handleLogin() {
  const success = await authStore.login(password.value)
  if (success) {
    // Connect to WebSocket after successful login
    socketStore.connect()
    password.value = ''
  }
}
</script>