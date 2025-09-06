<template>
  <div class="mt-3 pt-3 border-t border-gray-200">
    <!-- Speech Announcements Toggle -->
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <SpeakerWaveIcon 
          class="w-4 h-4" 
          :class="iconClass"
        />
        <span class="text-sm font-medium" :class="textClass">
          Voice Alerts
        </span>
      </div>
      
      <label class="relative inline-flex items-center cursor-pointer">
        <input
          :checked="speechSettings.announcementsEnabled"
          @change="speechSettings.toggleAnnouncements"
          type="checkbox"
          class="sr-only peer"
          :disabled="!speechSynthesis.isSupported.value"
        />
        <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fire-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-fire-600 peer-disabled:bg-gray-100 peer-disabled:after:bg-gray-300"></div>
      </label>
    </div>
    
    <!-- Status text -->
    <div class="mt-1 text-xs text-gray-500">
      <span v-if="!speechSynthesis.isSupported.value">
        Not supported in this browser
      </span>
      <span v-else-if="speechSettings.announcementsEnabled && speechSynthesis.selectedVoice.value">
        {{ speechSynthesis.selectedVoice.value.name }}
      </span>
      <span v-else-if="speechSettings.announcementsEnabled">
        Enabled - loading voices...
      </span>
      <span v-else>
        Announce detector names when detected
      </span>
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
const iconClass = computed(() => {
  if (!speechSynthesis.isSupported.value) {
    return 'text-gray-400'
  }
  return speechSettings.announcementsEnabled 
    ? 'text-fire-600' 
    : 'text-gray-500'
})

const textClass = computed(() => {
  if (!speechSynthesis.isSupported.value) {
    return 'text-gray-400'
  }
  return speechSettings.announcementsEnabled 
    ? 'text-fire-700' 
    : 'text-gray-700'
})
</script>