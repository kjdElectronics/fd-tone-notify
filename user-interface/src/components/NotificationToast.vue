<template>
  <div class="fixed top-4 right-4 z-50 space-y-3 max-w-lg w-96">
    <TransitionGroup name="notification" tag="div">
      <div
        v-for="notification in notificationStore.notifications"
        :key="notification.id"
        :class="getNotificationClasses(notification.type)"
        class="w-full shadow-xl rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden backdrop-blur-sm"
      >
        <div class="p-5">
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <component 
                :is="getIcon(notification.type)" 
                :class="getIconClasses(notification.type)"
                class="h-7 w-7"
              />
            </div>
            <div class="ml-4 w-0 flex-1 pt-0.5">
              <p v-if="notification.title" class="text-base font-semibold mb-1 leading-tight">
                {{ notification.title }}
              </p>
              <p class="text-sm leading-relaxed" :class="notification.title ? 'text-opacity-90' : 'font-medium'">
                {{ notification.message }}
              </p>
            </div>
            <div class="ml-4 flex-shrink-0 flex">
              <button
                @click="notificationStore.removeNotification(notification.id)"
                class="rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                <span class="sr-only">Close</span>
                <XMarkIcon class="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { useNotificationStore } from '../stores/notifications'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  InformationCircleIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline'

const notificationStore = useNotificationStore()

function getIcon(type) {
  switch (type) {
    case 'success':
      return CheckCircleIcon
    case 'warning':
      return ExclamationTriangleIcon
    case 'error':
      return XCircleIcon
    default:
      return InformationCircleIcon
  }
}

function getIconClasses(type) {
  switch (type) {
    case 'success':
      return 'text-green-500'
    case 'warning':
      return 'text-amber-500'
    case 'error':
      return 'text-red-500'
    default:
      return 'text-blue-500'
  }
}

function getNotificationClasses(type) {
  switch (type) {
    case 'success':
      return 'bg-green-50 text-green-900 border-l-4 border-green-400'
    case 'warning':
      return 'bg-amber-50 text-amber-900 border-l-4 border-amber-400'
    case 'error':
      return 'bg-red-50 text-red-900 border-l-4 border-red-400'
    default:
      return 'bg-blue-50 text-blue-900 border-l-4 border-blue-400'
  }
}
</script>

<style scoped>
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>