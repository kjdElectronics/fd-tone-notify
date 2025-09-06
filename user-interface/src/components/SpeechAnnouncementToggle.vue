<template>
  <div class="card">
    <div class="flex items-center">
      <div class="p-2 rounded-lg" :class="iconBackgroundClass">
        <SpeakerWaveIcon class="w-6 h-6" :class="iconClass" />
      </div>
      <div class="ml-4 flex-1">
        <label for="speech-announcements" class="flex items-center cursor-pointer">
          <div class="flex flex-col">
            <p class="text-sm font-medium text-gray-600">Voice Announcements</p>
            <p class="text-xs text-gray-500">Speak detector names when tones are detected</p>
          </div>
          <input
            id="speech-announcements"
            v-model="speechSettings.announcementsEnabled.value"
            type="checkbox"
            class="ml-auto rounded border-gray-300 text-fire-600 focus:ring-fire-500"
            :disabled="!speechSynthesis.isSupported.value"
          />
        </label>
        
        <!-- Unsupported browser message -->
        <div v-if="!speechSynthesis.isSupported.value" class="mt-2">
          <p class="text-xs text-gray-400">
            Text-to-speech not supported in this browser
          </p>
        </div>
        
        <!-- Voice selection info when enabled -->
        <div v-else-if="speechSettings.announcementsEnabled.value && speechSynthesis.selectedVoice.value" class="mt-2">
          <p class="text-xs text-gray-500">
            Voice: {{ speechSynthesis.selectedVoice.value.name }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { SpeakerWaveIcon } from '@heroicons/vue/24/outline'
import { useSpeechSettingsStore } from '../stores/speechSettings'
import { useSpeechSynthesis } from '../composables/useSpeechSynthesis'

// Initialize stores and composables
const speechSettings = useSpeechSettingsStore()
const speechSynthesis = useSpeechSynthesis()

// Computed classes for visual feedback
const iconBackgroundClass = computed(() => {
  if (!speechSynthesis.isSupported.value) {
    return 'bg-gray-100'
  }
  return speechSettings.announcementsEnabled.value 
    ? 'bg-fire-100' 
    : 'bg-blue-100'
})

const iconClass = computed(() => {
  if (!speechSynthesis.isSupported.value) {
    return 'text-gray-400'
  }
  return speechSettings.announcementsEnabled.value 
    ? 'text-fire-600' 
    : 'text-blue-600'
})
</script>