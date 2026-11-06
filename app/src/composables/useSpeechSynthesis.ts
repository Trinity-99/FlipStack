import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'

export interface SpeechLanguageOption {
  code: string
  label: string
}

/**
 * @summary Provides local-voice discovery and controlled browser speech playback.
 * @returns {object} Available languages, playback state, and speech controls.
 */
export function useSpeechSynthesis(): {
  languages: Ref<SpeechLanguageOption[]>
  isSpeaking: Ref<boolean>
  error: Ref<string | null>
  hasLocalVoice: (languageCode: string) => boolean
  speak: (text: string, languageCode: string) => void
  stop: () => void
} {
  const languages = ref<SpeechLanguageOption[]>([])
  const isSpeaking = ref(false)
  const error = ref<string | null>(null)
  let voices: SpeechSynthesisVoice[] = []
  let currentUtterance: SpeechSynthesisUtterance | null = null

  function getSynthesis(): SpeechSynthesis | null {
    return typeof window === 'undefined' ? null : (window.speechSynthesis ?? null)
  }

  function refreshVoices(): void {
    const synthesis = getSynthesis()
    voices = synthesis?.getVoices().filter((voice) => voice.localService && voice.lang.trim()) ?? []

    const options = new Map<string, SpeechLanguageOption>()
    for (const voice of voices) {
      if (!voice.lang || options.has(voice.lang)) continue
      const languageName =
        typeof Intl.DisplayNames === 'undefined'
          ? null
          : new Intl.DisplayNames(undefined, { type: 'language' }).of(voice.lang)
      options.set(voice.lang, {
        code: voice.lang,
        label: languageName ? `${languageName} (${voice.lang})` : voice.lang,
      })
    }

    languages.value = [...options.values()].sort((first, second) =>
      first.label.localeCompare(second.label),
    )
  }

  function hasLocalVoice(languageCode: string): boolean {
    return voices.some((voice) => voice.lang === languageCode)
  }

  function stop(): void {
    const utterance = currentUtterance
    currentUtterance = null
    isSpeaking.value = false
    if (!utterance) return

    try {
      getSynthesis()?.cancel()
    } catch (stopError: unknown) {
      console.error('Speech synthesis could not be stopped:', stopError)
      error.value = 'Unable to stop audio playback.'
    }
  }

  function speak(text: string, languageCode: string): void {
    stop()
    error.value = null

    const synthesis = getSynthesis()
    if (!synthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      error.value = 'Audio playback is not available in this browser.'
      return
    }

    const voice =
      voices.find((candidate) => candidate.lang === languageCode && candidate.default) ??
      voices.find((candidate) => candidate.lang === languageCode)
    if (!voice) {
      error.value = 'No local voice is available for this language.'
      return
    }
    if (!text.trim()) {
      error.value = 'There is no text to play on this side.'
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = languageCode
    utterance.voice = voice
    utterance.onend = () => {
      if (currentUtterance !== utterance) return
      currentUtterance = null
      isSpeaking.value = false
    }
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (currentUtterance !== utterance) return
      currentUtterance = null
      isSpeaking.value = false
      console.error(`Speech synthesis failed for ${languageCode}:`, event.error)
      error.value = 'Unable to play audio for this side.'
    }

    currentUtterance = utterance
    isSpeaking.value = true
    try {
      synthesis.speak(utterance)
    } catch (speechError: unknown) {
      if (currentUtterance === utterance) {
        currentUtterance = null
        isSpeaking.value = false
      }
      console.error(`Speech synthesis failed for ${languageCode}:`, speechError)
      error.value = 'Unable to play audio for this side.'
    }
  }

  onMounted(() => {
    refreshVoices()
    getSynthesis()?.addEventListener('voiceschanged', refreshVoices)
  })

  onBeforeUnmount(() => {
    getSynthesis()?.removeEventListener('voiceschanged', refreshVoices)
    stop()
  })

  return { languages, isSpeaking, error, hasLocalVoice, speak, stop }
}
