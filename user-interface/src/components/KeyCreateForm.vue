<template>
  <div class="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
    <div class="mb-3">
      <label class="form-label" for="key-name">Name</label>
      <input
        id="key-name"
        v-model="name"
        type="text"
        class="input-field"
        placeholder="e.g., Site A Rdio Scanner"
        :disabled="loading"
      />
    </div>

    <div v-if="!fixedScopes" class="mb-3">
      <label class="form-label">Scopes</label>
      <div class="flex gap-4">
        <label v-for="scope in availableScopes" :key="scope" class="flex items-center space-x-2 cursor-pointer">
          <input type="checkbox" :value="scope" v-model="selectedScopes" class="form-checkbox" :disabled="loading" />
          <span class="text-sm capitalize">{{ scope }}</span>
        </label>
      </div>
      <p class="form-help">An admin-scoped key can do everything a read-scoped key can, and more.</p>
    </div>

    <div class="flex justify-end gap-2">
      <button @click="$emit('cancel')" class="btn-secondary btn-sm" type="button" :disabled="loading">
        Cancel
      </button>
      <button @click="handleCreate" class="btn-primary btn-sm" type="button" :disabled="loading || !isValid">
        {{ loading ? 'Creating...' : 'Create' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  // When set, scopes are fixed (no picker shown) - e.g. ['ingest'].
  fixedScopes: {
    type: Array,
    default: null
  },
  availableScopes: {
    type: Array,
    default: () => ['read', 'admin']
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['create', 'cancel'])

const name = ref('')
const selectedScopes = ref([])

const isValid = computed(() => {
  if (!name.value.trim()) return false
  return props.fixedScopes ? true : selectedScopes.value.length > 0
})

function handleCreate() {
  if (!isValid.value) return
  emit('create', {
    name: name.value.trim(),
    scopes: props.fixedScopes || [...selectedScopes.value]
  })
  name.value = ''
  selectedScopes.value = []
}
</script>
