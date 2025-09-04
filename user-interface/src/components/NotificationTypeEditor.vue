<template>
  <div class="border border-gray-200 rounded-lg p-3">
    <div class="flex items-center justify-between mb-2">
      <h6 class="text-sm font-medium text-gray-900">{{ title }}</h6>
      <button
        @click="addNotification"
        class="btn-secondary btn-sm"
        type="button"
      >
        <PlusIcon class="w-3 h-3 mr-1" />
        Add
      </button>
    </div>

    <!-- No notifications message -->
    <div v-if="notifications.length === 0" class="text-sm text-gray-500 py-2">
      No {{ title.toLowerCase() }} configured
    </div>

    <!-- Notification items -->
    <div v-else class="space-y-3">
      <div
        v-for="(notification, index) in notifications"
        :key="`${type}-${index}`"
        class="border border-gray-200 rounded-md p-3 bg-gray-50"
      >
        <!-- Email Notification Fields -->
        <div v-if="type === 'email'" class="space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="form-label-sm">To (recipients)</label>
              <input
                v-model="notification.to"
                type="email"
                placeholder="email@example.com,user@domain.com"
                class="form-input form-input-sm"
                @input="emitUpdate"
              />
            </div>
            <div>
              <label class="form-label-sm">BCC (optional)</label>
              <input
                v-model="notification.bcc"
                type="email"
                placeholder="person@example.com"
                class="form-input form-input-sm"
                @input="emitUpdate"
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
              @input="emitUpdate"
            />
          </div>
          <div>
            <label class="form-label-sm">Message</label>
            <textarea
              v-model="notification.text"
              rows="2"
              placeholder="Tone detected for detector %d"
              class="form-input form-input-sm"
              @input="emitUpdate"
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
                @input="emitUpdate"
              />
            </div>
            <div>
              <label class="form-label-sm">Channel Tag</label>
              <input
                v-model="notification.channelTag"
                type="text"
                placeholder="fire-department"
                class="form-input form-input-sm"
                @input="emitUpdate"
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
              @input="emitUpdate"
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
              @input="emitUpdate"
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
              @input="emitUpdate"
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
              @input="emitUpdate"
            />
          </div>
        </div>

        <!-- Remove button -->
        <div class="flex justify-end mt-3">
          <button
            @click="removeNotification(index)"
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
import { computed } from 'vue'
import { PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'

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
const emit = defineEmits(['update:modelValue'])

// Computed
const notifications = computed({
  get: () => props.modelValue || [],
  set: (value) => emit('update:modelValue', value)
})

// Methods
function addNotification() {
  const newNotifications = [...notifications.value, { ...props.template }]
  emit('update:modelValue', newNotifications)
}

function removeNotification(index) {
  const newNotifications = [...notifications.value]
  newNotifications.splice(index, 1)
  emit('update:modelValue', newNotifications)
}

function emitUpdate() {
  emit('update:modelValue', notifications.value)
}

function addHeader(index) {
  const notification = notifications.value[index]
  if (!notification.headers) {
    notification.headers = {}
  }
  notification.headers[''] = ''
  emitUpdate()
}

function removeHeader(index, key) {
  const notification = notifications.value[index]
  delete notification.headers[key]
  emitUpdate()
}

function updateHeaderKey(index, oldKey, newKey) {
  const notification = notifications.value[index]
  if (oldKey !== newKey) {
    notification.headers[newKey] = notification.headers[oldKey]
    delete notification.headers[oldKey]
    emitUpdate()
  }
}

function updateHeaderValue(index, key, value) {
  const notification = notifications.value[index]
  notification.headers[key] = value
  emitUpdate()
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