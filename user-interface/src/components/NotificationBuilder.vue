<template>
  <div class="space-y-6">
    <!-- Pre-Recording Notifications -->
    <div class="border border-gray-200 rounded-lg p-4">
      <h4 class="text-md font-medium text-gray-900 mb-4 flex items-center">
        <BellIcon class="w-4 h-4 mr-2" />
        Pre-Recording Notifications
      </h4>
      <p class="text-sm text-gray-600 mb-4">
        These notifications are sent immediately when tones are detected, before recording starts.
      </p>
      
      <!-- Email Notifications -->
      <NotificationSection
        v-model="notifications.preRecording.emails"
        title="Email Notifications"
        type="email"
        :template="emailTemplate"
        @add="addNotification('preRecording', 'emails')"
        @remove="removeNotification('preRecording', 'emails', $event)"
        @update="updateNotification('preRecording', 'emails', $event.index, $event.data)"
      />

      <!-- Pushbullet Notifications -->
      <NotificationSection
        v-model="notifications.preRecording.pushbullet"
        title="Pushbullet Notifications"
        type="pushbullet"
        :template="pushbulletTemplate"
        @add="addNotification('preRecording', 'pushbullet')"
        @remove="removeNotification('preRecording', 'pushbullet', $event)"
        @update="updateNotification('preRecording', 'pushbullet', $event.index, $event.data)"
      />

      <!-- Webhook Notifications -->
      <NotificationSection
        v-model="notifications.preRecording.webhooks"
        title="Webhook Notifications"
        type="webhook"
        :template="webhookTemplate"
        @add="addNotification('preRecording', 'webhooks')"
        @remove="removeNotification('preRecording', 'webhooks', $event)"
        @update="updateNotification('preRecording', 'webhooks', $event.index, $event.data)"
      />

      <!-- External Command Notifications -->
      <NotificationSection
        v-model="notifications.preRecording.externalCommands"
        title="External Commands"
        type="externalCommand"
        :template="externalCommandTemplate"
        @add="addNotification('preRecording', 'externalCommands')"
        @remove="removeNotification('preRecording', 'externalCommands', $event)"
        @update="updateNotification('preRecording', 'externalCommands', $event.index, $event.data)"
      />
    </div>

    <!-- Post-Recording Notifications -->
    <div class="border border-gray-200 rounded-lg p-4">
      <h4 class="text-md font-medium text-gray-900 mb-4 flex items-center">
        <BellIcon class="w-4 h-4 mr-2" />
        Post-Recording Notifications
      </h4>
      <p class="text-sm text-gray-600 mb-4">
        These notifications are sent after the audio recording is complete and saved.
      </p>
      
      <!-- Email Notifications -->
      <NotificationSection
        v-model="notifications.postRecording.emails"
        title="Email Notifications"
        type="email"
        :template="emailTemplate"
        @add="addNotification('postRecording', 'emails')"
        @remove="removeNotification('postRecording', 'emails', $event)"
        @update="updateNotification('postRecording', 'emails', $event.index, $event.data)"
      />

      <!-- Pushbullet Notifications -->
      <NotificationSection
        v-model="notifications.postRecording.pushbullet"
        title="Pushbullet Notifications"
        type="pushbullet"
        :template="pushbulletTemplate"
        @add="addNotification('postRecording', 'pushbullet')"
        @remove="removeNotification('postRecording', 'pushbullet', $event)"
        @update="updateNotification('postRecording', 'pushbullet', $event.index, $event.data)"
      />

      <!-- Webhook Notifications -->
      <NotificationSection
        v-model="notifications.postRecording.webhooks"
        title="Webhook Notifications"
        type="webhook"
        :template="webhookTemplate"
        @add="addNotification('postRecording', 'webhooks')"
        @remove="removeNotification('postRecording', 'webhooks', $event)"
        @update="updateNotification('postRecording', 'webhooks', $event.index, $event.data)"
      />

      <!-- External Command Notifications -->
      <NotificationSection
        v-model="notifications.postRecording.externalCommands"
        title="External Commands"
        type="externalCommand"
        :template="externalCommandTemplate"
        @add="addNotification('postRecording', 'externalCommands')"
        @remove="removeNotification('postRecording', 'externalCommands', $event)"
        @update="updateNotification('postRecording', 'externalCommands', $event.index, $event.data)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { BellIcon } from '@heroicons/vue/24/outline'
import NotificationSection from './NotificationSection.vue'

// Props
const props = defineProps({
  modelValue: {
    type: Object,
    required: true
  }
})

// Emits
const emit = defineEmits(['update:modelValue'])

// Reactive notifications object
const notifications = ref({
  preRecording: {
    pushbullet: [],
    webhooks: [],
    externalCommands: [],
    emails: []
  },
  postRecording: {
    pushbullet: [],
    webhooks: [],
    externalCommands: [],
    emails: []
  },
  ...props.modelValue
})

// Templates for new notifications
const emailTemplate = {
  to: '',
  bcc: '',
  subject: 'Tone Detected',
  text: 'Tone detected for detector %d'
}

const pushbulletTemplate = {
  title: 'Tone Detected',
  channelTag: '',
  body: 'Tone detected for detector %d'
}

const webhookTemplate = {
  address: '',
  headers: {}
}

const externalCommandTemplate = {
  command: '',
  description: ''
}

// Methods
function addNotification(timing, type) {
  const template = getTemplate(type)
  notifications.value[timing][type].push({ ...template })
  emitUpdate()
}

function removeNotification(timing, type, index) {
  notifications.value[timing][type].splice(index, 1)
  emitUpdate()
}

function updateNotification(timing, type, index, data) {
  notifications.value[timing][type][index] = data
  emitUpdate()
}

function getTemplate(type) {
  switch (type) {
    case 'emails':
      return emailTemplate
    case 'pushbullet':
      return pushbulletTemplate
    case 'webhooks':
      return webhookTemplate
    case 'externalCommands':
      return externalCommandTemplate
    default:
      return {}
  }
}

function emitUpdate() {
  emit('update:modelValue', notifications.value)
}

// Watch for external changes
watch(
  () => props.modelValue,
  (newValue) => {
    notifications.value = {
      preRecording: {
        pushbullet: [],
        webhooks: [],
        externalCommands: [],
        emails: []
      },
      postRecording: {
        pushbullet: [],
        webhooks: [],
        externalCommands: [],
        emails: []
      },
      ...newValue
    }
  },
  { immediate: true, deep: true }
)
</script>