<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="mx-auto h-16 w-16 bg-fire-600 rounded-full flex items-center justify-center">
          <span class="text-white text-2xl font-bold">🔥</span>
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Change Password
        </h2>
        <p class="mt-4 text-center text-sm text-gray-600">
          This account is still using the default password shipped with FD Tone Notify.
          Choose a new password to continue.
        </p>
      </div>

      <form class="mt-8 space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label for="current-password" class="form-label">Current password</label>
          <input
            id="current-password"
            type="password"
            autocomplete="current-password"
            required
            v-model="currentPassword"
            class="input-field"
            placeholder="Current password"
            :disabled="authStore.passwordChangeLoading"
          />
        </div>

        <div>
          <label for="new-password" class="form-label">New password</label>
          <input
            id="new-password"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            v-model="newPassword"
            class="input-field"
            placeholder="At least 8 characters"
            :disabled="authStore.passwordChangeLoading"
          />
        </div>

        <div>
          <label for="confirm-password" class="form-label">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autocomplete="new-password"
            required
            v-model="confirmPassword"
            class="input-field"
            placeholder="Re-enter new password"
            :disabled="authStore.passwordChangeLoading"
          />
        </div>

        <p v-if="validationError" class="form-error">{{ validationError }}</p>

        <div v-if="authStore.passwordChangeError" class="alert-emergency">
          <p class="text-sm">{{ authStore.passwordChangeError }}</p>
        </div>

        <div>
          <button
            type="submit"
            :disabled="authStore.passwordChangeLoading || !currentPassword || !newPassword || !confirmPassword"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-fire-600 hover:bg-fire-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-fire-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="authStore.passwordChangeLoading">Changing password...</span>
            <span v-else>Change Password</span>
          </button>
        </div>
      </form>

      <div class="mt-4 text-center">
        <button @click="authStore.logout()" class="text-xs text-gray-500 hover:text-gray-700">
          Log out instead
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

const validationError = computed(() => {
  if (newPassword.value && newPassword.value.length < 8) {
    return 'New password must be at least 8 characters'
  }
  if (confirmPassword.value && newPassword.value !== confirmPassword.value) {
    return 'New password and confirmation do not match'
  }
  return null
})

async function handleSubmit() {
  if (validationError.value) return

  const success = await authStore.changePassword(currentPassword.value, newPassword.value)
  if (success) {
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  }
}
</script>
