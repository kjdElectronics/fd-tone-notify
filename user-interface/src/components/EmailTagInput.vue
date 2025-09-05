<template>
  <div class="email-tag-input" autocomplete="off">
    <!-- Email Tags Display -->
    <div 
      class="email-tags-container"
      :class="[
        'flex flex-wrap items-center gap-2 p-2 border rounded-md bg-white min-h-[42px] cursor-text',
        hasError ? 'border-red-500 focus-within:ring-2 focus-within:ring-red-500 focus-within:border-red-500' : 'border-gray-300 focus-within:ring-2 focus-within:ring-fire-500 focus-within:border-fire-500'
      ]"
      @click="focusInput"
    >
      <!-- Email Tags -->
      <div
        v-for="(email, index) in emailList"
        :key="`email-${index}`"
        class="email-tag"
        :class="[
          'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors',
          isValidEmail(email) 
            ? 'bg-fire-100 text-fire-800 border border-fire-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        ]"
      >
        <span class="email-text">{{ email }}</span>
        <button
          type="button"
          @click="removeEmail(index)"
          class="email-remove-btn"
          :class="[
            'ml-1 rounded-full p-0.5 hover:bg-opacity-20 hover:bg-current transition-colors',
            'focus:outline-none focus:ring-1 focus:ring-current'
          ]"
          :title="`Remove ${email}`"
          tabindex="0"
        >
          <XMarkIcon class="w-3 h-3" />
        </button>
      </div>

      <!-- Input Field - Adding some extra params to try and prevent password managers from detecting it-->
      <input
        ref="emailInput"
        v-model="inputValue"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bw-exclude="true"
        data-form-type="other"
        data-credential-type="none"
        role="textbox"
        aria-label="Email addresses for notifications"
        :placeholder="emailList.length === 0 ? placeholder : ''"
        class="flex-1 min-w-[120px] border-0 outline-none bg-transparent text-sm"
        @input="handleInput"
        @keydown="handleKeydown"
        @blur="handleBlur"
        @paste="handlePaste"
        :disabled="disabled"
      />
    </div>

    <!-- Action Buttons -->
    <div v-if="emailList.length > 0" class="flex items-center justify-between mt-2">
      <div class="flex items-center space-x-2">
        <button
          type="button"
          @click="copyAllEmails"
          class="text-xs text-gray-600 hover:text-fire-600 transition-colors"
        >
          Copy All
        </button>
        <button
          type="button"
          @click="clearAllEmails"
          class="text-xs text-red-600 hover:text-red-700 transition-colors"
        >
          Clear All
        </button>
      </div>
      <div class="text-xs text-gray-500">
        {{ emailList.length }} {{ emailList.length === 1 ? 'email' : 'emails' }}
      </div>
    </div>

    <!-- Error Messages -->
    <div v-if="hasError" class="mt-1">
      <p v-for="error in errorMessages" :key="error" class="text-xs text-red-600">
        {{ error }}
      </p>
    </div>

    <!-- Help Text -->
    <p v-if="helpText" class="form-help-sm mt-1">{{ helpText }}</p>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'

// Props
const props = defineProps({
  modelValue: {
    type: [String, Array],
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Enter email addresses...'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  helpText: {
    type: String,
    default: ''
  },
  validateEmails: {
    type: Boolean,
    default: true
  }
})

// Emits
const emit = defineEmits(['update:modelValue'])

// Refs
const emailInput = ref(null)
const inputValue = ref('')

// State
const emailList = ref([])
const errorMessages = ref([])

// Computed
const hasError = computed(() => errorMessages.value.length > 0)

// Email validation regex (RFC 5322 compliant)
const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

// Methods
function isValidEmail(email) {
  if (!props.validateEmails) return true
  return emailRegex.test(email.trim())
}

function parseEmailInput(input) {
  if (!input) return []
  
  // Split by comma or semicolon, trim each email, and filter empty strings
  return input
    .split(/[,;]/)
    .map(email => email.trim())
    .filter(email => email.length > 0)
}

function addEmail(email) {
  const trimmedEmail = email.trim().toLowerCase()
  
  // Check if email already exists (case insensitive)
  if (emailList.value.some(existingEmail => existingEmail.toLowerCase() === trimmedEmail)) {
    return false
  }
  
  // Add email to list
  emailList.value.push(email.trim())
  updateModelValue()
  return true
}

function removeEmail(index) {
  emailList.value.splice(index, 1)
  updateModelValue()
  nextTick(() => {
    emailInput.value?.focus()
  })
}

function clearAllEmails() {
  emailList.value = []
  inputValue.value = ''
  updateModelValue()
  nextTick(() => {
    emailInput.value?.focus()
  })
}

function copyAllEmails() {
  if (emailList.value.length === 0) return
  
  const emailString = emailList.value.join(', ')
  navigator.clipboard.writeText(emailString).then(() => {
    // Could add a toast notification here if available
  }).catch(err => {
    console.warn('Failed to copy emails to clipboard:', err)
  })
}

function focusInput() {
  nextTick(() => {
    emailInput.value?.focus()
  })
}

function validateEmailList() {
  if (!props.validateEmails) {
    errorMessages.value = []
    return
  }

  const errors = []
  const invalidEmails = emailList.value.filter(email => !isValidEmail(email))
  
  if (invalidEmails.length > 0) {
    errors.push(`Invalid email format: ${invalidEmails.slice(0, 3).join(', ')}${invalidEmails.length > 3 ? ` and ${invalidEmails.length - 3} more` : ''}`)
  }
  
  errorMessages.value = errors
}

function updateModelValue() {
  // Emit as comma-separated string for backward compatibility
  const emailString = emailList.value.join(', ')
  emit('update:modelValue', emailString)
  
  // Validate after update
  nextTick(() => {
    validateEmailList()
  })
}

function handleInput() {
  // Clear errors when typing
  errorMessages.value = []
}

function handleKeydown(event) {
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    processInput()
  } else if (event.key === 'Backspace' && inputValue.value === '' && emailList.value.length > 0) {
    // Remove last email if input is empty and backspace is pressed
    removeEmail(emailList.value.length - 1)
  } else if (event.key === ',' || event.key === ';') {
    event.preventDefault()
    processInput()
  }
}

function handleBlur() {
  processInput()
}

function handlePaste(event) {
  event.preventDefault()
  const pastedText = event.clipboardData?.getData('text') || ''
  
  if (pastedText) {
    const emails = parseEmailInput(pastedText)
    emails.forEach(email => {
      if (email) addEmail(email)
    })
    inputValue.value = ''
  }
}

function processInput() {
  if (!inputValue.value.trim()) return
  
  const emails = parseEmailInput(inputValue.value)
  emails.forEach(email => {
    if (email) addEmail(email)
  })
  
  inputValue.value = ''
}

function initializeFromModelValue() {
  if (props.modelValue) {
    if (Array.isArray(props.modelValue)) {
      emailList.value = [...props.modelValue]
    } else if (typeof props.modelValue === 'string') {
      const emails = parseEmailInput(props.modelValue)
      emailList.value = emails
    }
  } else {
    emailList.value = []
  }
  
  nextTick(() => {
    validateEmailList()
  })
}

// Watch for external model value changes
watch(
  () => props.modelValue,
  (newValue, oldValue) => {
    // Only update if the change came from outside (not from our own emit)
    const currentEmailString = emailList.value.join(', ')
    const newEmailString = Array.isArray(newValue) ? newValue.join(', ') : (newValue || '')
    
    if (currentEmailString !== newEmailString) {
      initializeFromModelValue()
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.email-tag-input .email-tags-container:hover {
  border-color: rgb(107, 114, 128); /* gray-500 */
}

.email-tag {
  user-select: none;
}

.email-tag:hover .email-remove-btn {
  opacity: 1;
}

.email-remove-btn {
  opacity: 0.7;
}

.email-remove-btn:hover {
  opacity: 1;
}

.form-help-sm {
  @apply text-xs text-gray-500 mt-1;
}
</style>