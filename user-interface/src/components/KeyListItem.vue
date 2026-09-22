<template>
  <li class="py-3 flex items-center justify-between">
    <div>
      <div class="flex items-center gap-2">
        <span class="font-medium text-gray-900">{{ apiKey.name }}</span>
        <span
          v-for="scope in apiKey.scopes"
          :key="scope"
          class="text-xs px-1.5 py-0.5 rounded-full font-medium"
          :class="scopeBadgeClass(scope)"
        >
          {{ scope }}
        </span>
      </div>
      <div class="text-xs text-gray-500 mt-1">
        <span class="font-mono">{{ apiKey.id }}</span>
        <span class="mx-1.5">&bull;</span>
        Created {{ formatDate(apiKey.createdAt) }}
        <template v-if="apiKey.lastUsedAt">
          <span class="mx-1.5">&bull;</span>
          Last used {{ formatDate(apiKey.lastUsedAt) }}
        </template>
        <template v-else>
          <span class="mx-1.5">&bull;</span>
          Never used
        </template>
      </div>
    </div>
    <button
      @click="$emit('delete')"
      class="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
      :disabled="deleting"
      title="Delete"
    >
      <TrashIcon class="w-4 h-4" />
    </button>
  </li>
</template>

<script setup>
import { TrashIcon } from '@heroicons/vue/24/outline'

defineProps({
  apiKey: {
    type: Object,
    required: true
  },
  deleting: {
    type: Boolean,
    default: false
  }
})

defineEmits(['delete'])

function scopeBadgeClass(scope) {
  switch (scope) {
    case 'admin':
      return 'bg-red-100 text-red-700'
    case 'ingest':
      return 'bg-purple-100 text-purple-700'
    case 'read':
    default:
      return 'bg-blue-100 text-blue-700'
  }
}

function formatDate(value) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString()
}
</script>
