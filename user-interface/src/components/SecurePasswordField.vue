<template>
  <div class="relative">
    <input
      :id="fieldId"
      :value="displayValue"
      @input="handleInput"
      :type="showPassword ? 'text' : 'password'"
      :disabled="!showPassword"
      :class="[
        'input-field pr-20',
        !showPassword ? 'bg-gray-50 cursor-not-allowed' : ''
      ]"
      :placeholder="placeholder"
    />
    
    <!-- Show/Hide Button -->
    <button
      type="button"
      @click="toggleShowPassword"
      class="absolute inset-y-0 right-0 flex items-center px-3 text-sm font-medium text-gray-600 hover:text-gray-800 focus:outline-none focus:text-gray-800 transition-colors border-l border-gray-300"
      :class="showPassword ? 'bg-blue-50 text-blue-700' : 'bg-gray-100'"
    >
      <EyeIcon v-if="!showPassword" class="w-4 h-4 mr-1" />
      <EyeSlashIcon v-else class="w-4 h-4 mr-1" />
      {{ showPassword ? 'Hide' : 'Show' }}
    </button>
  </div>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits } from 'vue'
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '••••••••'
  },
  fieldId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:modelValue'])

const showPassword = ref(false)

// Display masked value when hidden, actual value when shown
const displayValue = computed(() => {
  console.log(`SecurePasswordField [${props.fieldId}]: modelValue="${props.modelValue}", showPassword=${showPassword.value}`)
  
  if (showPassword.value) {
    // When showing, display the actual value
    return props.modelValue || ''
  } else {
    // When hidden, show masked dots if there's a value
    if (props.modelValue && props.modelValue !== '') {
      return '••••••••'
    }
    return ''
  }
})

function toggleShowPassword() {
  showPassword.value = !showPassword.value
}

function handleInput(event) {
  if (showPassword.value) {
    emit('update:modelValue', event.target.value)
  }
}
</script>

<style scoped>
/* Ensure the input field accommodates the button */
.input-field {
  padding-right: 5rem;
}
</style>