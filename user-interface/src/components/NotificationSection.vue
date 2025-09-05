<template>
  <div class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <h5 class="text-sm font-medium text-gray-700">{{ title }}</h5>
      <button
        @click="$emit('add')"
        class="btn-secondary btn-sm"
        type="button"
      >
        <PlusIcon class="w-3 h-3 mr-1" />
        Add {{ getTypeLabel(type) }}
      </button>
    </div>

    <!-- No notifications message -->
    <div v-if="modelValue.length === 0" class="text-sm text-gray-500 py-2">
      No {{ getTypeLabel(type).toLowerCase() }} notifications configured
    </div>

    <!-- Notification items -->
    <div v-else class="space-y-3">
      <div
        v-for="(notification, index) in modelValue"
        :key="`${type}-${index}`"
        class="border border-gray-200 rounded-md p-3 bg-gray-50"
      >
        <!-- Email Notification Fields -->
        <div v-if="type === 'email'" class="space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="form-label-sm">To (recipients)</label>
              <EmailTagInput
                v-model="notification.to"
                placeholder="Enter recipient email addresses..."
                help-text="Required: Enter email addresses separated by commas"
                @update:model-value="updateNotification(index)"
              />
            </div>
            <div>
              <label class="form-label-sm">BCC (optional)</label>
              <EmailTagInput
                v-model="notification.bcc"
                placeholder="Enter BCC email addresses..."
                help-text="Optional: Additional recipients (hidden from main recipients)"
                @update:model-value="updateNotification(index)"
              />
            </div>
          </div>
          <div>
            <label class="form-label-sm">Subject</label>
            <input
              v-model="notification.subject"
              type="text"
              placeholder="Tone Detected"
              class="form-input form-input-sm"
              @input="updateNotification(index)"
            />
          </div>
          <div>
            <label class="form-label-sm">Message</label>
            <textarea
              v-model="notification.text"
              rows="2"
              placeholder="Tone detected for detector %d"
              class="form-input form-input-sm"
              @input="updateNotification(index)"
            ></textarea>
            <p class="form-help-sm">Use %d as placeholder for date</p>
          </div>
        </div>

        <!-- Pushbullet Notification Fields -->
        <div v-else-if="type === 'pushbullet'" class="space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="form-label-sm">Title</label>
              <input
                v-model="notification.title"
                type="text"
                placeholder="Tone Detected"
                class="form-input form-input-sm"
                @input="updateNotification(index)"
              />
            </div>
            <div>
              <label class="form-label-sm">Channel Tag (optional)</label>
              <input
                v-model="notification.channelTag"
                type="text"
                placeholder="fire-department"
                class="form-input form-input-sm"
                @input="updateNotification(index)"
              />
            </div>
          </div>
          <div>
            <label class="form-label-sm">Message</label>
            <textarea
              v-model="notification.body"
              rows="2"
              placeholder="Tone detected for detector %d"
              class="form-input form-input-sm"
              @input="updateNotification(index)"
            ></textarea>
            <p class="form-help-sm">Use %d as placeholder for date</p>
          </div>
        </div>

        <!-- Webhook Notification Fields -->
        <div v-else-if="type === 'webhook'" class="space-y-3">
          <div>
            <label class="form-label-sm">Webhook URL</label>
            <input
              v-model="notification.address"
              type="url"
              placeholder="https://example.com/webhook"
              class="form-input form-input-sm"
              @input="updateNotification(index)"
            />
          </div>
          <div>
            <label class="form-label-sm">Headers (optional)</label>
            <div class="space-y-2">
              <div
                v-for="(value, key) in notification.headers"
                :key="`header-${key}`"
                class="flex gap-2"
              >
                <input
                  :value="key"
                  type="text"
                  placeholder="Header name"
                  class="form-input form-input-sm flex-1"
                  @input="updateHeaderKey(index, key, $event.target.value)"
                />
                <input
                  :value="value"
                  type="text"
                  placeholder="Header value"
                  class="form-input form-input-sm flex-1"
                  @input="updateHeaderValue(index, key, $event.target.value)"
                />
                <button
                  @click="removeHeader(index, key)"
                  class="p-1 text-red-600 hover:bg-red-50 rounded"
                  type="button"
                >
                  <XMarkIcon class="w-4 h-4" />
                </button>
              </div>
              <button
                @click="addHeader(index)"
                class="btn-secondary btn-sm"
                type="button"
              >
                <PlusIcon class="w-3 h-3 mr-1" />
                Add Header
              </button>
            </div>
            <p class="form-help-sm">Add custom headers for authentication or other purposes</p>
          </div>
        </div>

        <!-- External Command Notification Fields -->
        <div v-else-if="type === 'externalCommand'" class="space-y-3">
          <div>
            <label class="form-label-sm">Command</label>
            <input
              v-model="notification.command"
              type="text"
              placeholder="node ./scripts/notify.js [timestamp] '[detectorName]' '[filename]'"
              class="form-input form-input-sm"
              @input="updateNotification(index)"
            />
            <p class="form-help-sm">
              Available placeholders: [timestamp], [detectorName], [filename], [description], [tones], [matchAverages], [recordingRelPath]
            </p>
          </div>
          <div>
            <label class="form-label-sm">Description (optional)</label>
            <input
              v-model="notification.description"
              type="text"
              placeholder="Send notification to external system"
              class="form-input form-input-sm"
              @input="updateNotification(index)"
            />
          </div>
        </div>

        <!-- Remove button -->
        <div class="flex justify-end mt-3">
          <button
            @click="$emit('remove', index)"
            class="btn-danger btn-sm"
            type="button"
          >
            <TrashIcon class="w-3 h-3 mr-1" />
            Remove
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import EmailTagInput from './EmailTagInput.vue'

// Props
const props = defineProps({
  modelValue: {
    type: Array,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  template: {
    type: Object,
    required: true
  }
})

// Emits
const emit = defineEmits(['add', 'remove', 'update'])

// Methods
function getTypeLabel(type) {
  switch (type) {
    case 'email':
      return 'Email'
    case 'pushbullet':
      return 'Pushbullet'
    case 'webhook':
      return 'Webhook'
    case 'externalCommand':
      return 'Command'
    default:
      return 'Notification'
  }
}

function updateNotification(index) {
  emit('update', { index, data: props.modelValue[index] })
}

function addHeader(index) {
  const notification = props.modelValue[index]
  if (!notification.headers) {
    notification.headers = {}
  }
  notification.headers[''] = ''
  updateNotification(index)
}

function removeHeader(index, key) {
  const notification = props.modelValue[index]
  delete notification.headers[key]
  updateNotification(index)
}

function updateHeaderKey(index, oldKey, newKey) {
  const notification = props.modelValue[index]
  if (oldKey !== newKey) {
    notification.headers[newKey] = notification.headers[oldKey]
    delete notification.headers[oldKey]
    updateNotification(index)
  }
}

function updateHeaderValue(index, key, value) {
  const notification = props.modelValue[index]
  notification.headers[key] = value
  updateNotification(index)
}
</script>

<style scoped>
.form-label-sm {
  @apply block text-xs font-medium text-gray-700 mb-1;
}

.form-input-sm {
  @apply text-sm;
}

.form-help-sm {
  @apply text-xs text-gray-500 mt-1;
}
</style>