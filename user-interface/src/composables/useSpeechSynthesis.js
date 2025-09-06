import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Vue 3 Composable for Web Speech API text-to-speech synthesis
 * Provides clean interface for speaking text with voice selection and error handling
 */
export function useSpeechSynthesis() {
  const isSupported = ref(false)
  const voices = ref([])
  const speaking = ref(false)
  const selectedVoice = ref(null)

  // Check if Web Speech API is supported
  const checkSupport = () => {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  }

  // Load available voices from the browser
  const loadVoices = () => {
    if (!checkSupport()) return

    const availableVoices = speechSynthesis.getVoices()
    voices.value = availableVoices

    // Auto-select preferred voice (Microsoft Zira or first English voice)
    if (availableVoices.length > 0 && !selectedVoice.value) {
      selectPreferredVoice(availableVoices)
    }
  }

  // Select preferred voice with fallback logic
  const selectPreferredVoice = (availableVoices) => {
    // Priority 1: Microsoft Zira Desktop
    let preferred = availableVoices.find(voice => 
      voice.name.includes('Microsoft Zira') || voice.name.includes('Zira')
    )

    // Priority 2: Any English voice
    if (!preferred) {
      preferred = availableVoices.find(voice => 
        voice.lang.startsWith('en-')
      )
    }

    // Priority 3: First available voice
    if (!preferred && availableVoices.length > 0) {
      preferred = availableVoices[0]
    }

    selectedVoice.value = preferred
  }

  // Speak text with specified configuration
  const speakText = ({ text, voice = null, rate = 1.0, pitch = 1.0 } = {}) => {
    if (!checkSupport()) {
      console.warn('Speech synthesis not supported in this browser')
      return Promise.reject(new Error('Speech synthesis not supported'))
    }

    if (!text || typeof text !== 'string') {
      console.warn('Invalid text provided for speech synthesis')
      return Promise.reject(new Error('Valid text is required'))
    }

    return new Promise((resolve, reject) => {
      // Cancel any ongoing speech
      speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      
      // Use provided voice or selected voice
      const voiceToUse = voice || selectedVoice.value
      if (voiceToUse) {
        utterance.voice = voiceToUse
      }

      // Configure speech parameters
      utterance.rate = Math.max(0.1, Math.min(10, rate))
      utterance.pitch = Math.max(0, Math.min(2, pitch))

      // Event handlers
      utterance.onstart = () => {
        speaking.value = true
      }

      utterance.onend = () => {
        speaking.value = false
        resolve()
      }

      utterance.onerror = (event) => {
        speaking.value = false
        console.error('Speech synthesis error:', event.error)
        reject(new Error(`Speech synthesis failed: ${event.error}`))
      }

      // Start speaking
      speechSynthesis.speak(utterance)
    })
  }

  // Get list of available voices
  const getAvailableVoices = () => {
    return voices.value
  }

  // Stop current speech
  const stopSpeaking = () => {
    if (checkSupport()) {
      speechSynthesis.cancel()
      speaking.value = false
    }
  }

  // Set selected voice by voice object or name
  const setVoice = (voice) => {
    if (!voice) return

    if (typeof voice === 'string') {
      const foundVoice = voices.value.find(v => 
        v.name === voice || v.voiceURI === voice
      )
      selectedVoice.value = foundVoice || null
    } else {
      selectedVoice.value = voice
    }
  }

  // Initialize on mount
  onMounted(() => {
    isSupported.value = checkSupport()
    
    if (isSupported.value) {
      // Load voices immediately if available
      loadVoices()

      // Also listen for voice changes (some browsers load voices asynchronously)
      const handleVoicesChanged = () => loadVoices()
      speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)

      // Cleanup event listener on unmount
      onUnmounted(() => {
        speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
        stopSpeaking()
      })
    }
  })

  return {
    // State
    isSupported,
    voices,
    speaking,
    selectedVoice,
    
    // Methods
    speakText,
    getAvailableVoices,
    stopSpeaking,
    setVoice,
    loadVoices
  }
}