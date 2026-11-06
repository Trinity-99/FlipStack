<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SpeechLanguageOption } from '@/composables/useSpeechSynthesis'

const props = defineProps<{
  sideLabel: string
  languages: SpeechLanguageOption[]
  currentLanguageCode: string | null
}>()

const emit = defineEmits<{
  confirm: [languageCode: string]
  cancel: []
}>()

const selectedLanguageCode = ref(props.currentLanguageCode ?? '')
const languageOptions = computed(() => {
  const options = [...props.languages]
  const currentCode = props.currentLanguageCode
  if (currentCode && !options.some((language) => language.code === currentCode)) {
    options.push({ code: currentCode, label: `${currentCode} (not available on this device)` })
  }
  return options
})
const canConfirm = computed(() => selectedLanguageCode.value !== '')

/**
 * @summary Confirms the selected language when one is available.
 * @returns {void}
 */
function confirmSelection(): void {
  if (!canConfirm.value) return
  emit('confirm', selectedLanguageCode.value)
}

/**
 * @summary Closes the dialog without changing the saved language.
 * @returns {void}
 */
function cancelSelection(): void {
  emit('cancel')
}
</script>

<template>
  <dialog
    open
    role="dialog"
    aria-modal="true"
    aria-labelledby="audio-language-title"
    class="fixed inset-0 z-50 m-0 flex h-dvh max-h-none w-full max-w-none items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
    @click.self="cancelSelection"
    @keydown.esc.prevent="cancelSelection"
  >
    <form
      class="my-auto w-full max-w-sm rounded-3xl border-2 border-slate-600 bg-card p-4 shadow-2xl sm:p-6"
      @submit.prevent="confirmSelection"
    >
      <h2 id="audio-language-title" class="text-xl font-semibold text-primary">Audio language</h2>
      <p class="mt-2 text-sm text-secondary">{{ sideLabel }}</p>

      <label for="audio-language-select" class="mt-5 block text-sm font-medium text-primary">
        Language
      </label>
      <select
        id="audio-language-select"
        v-model="selectedLanguageCode"
        class="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-muted px-4 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        :disabled="languageOptions.length === 0"
      >
        <option value="" disabled>
          {{ languageOptions.length === 0 ? 'No language available' : 'Choose a language' }}
        </option>
        <option v-for="language in languageOptions" :key="language.code" :value="language.code">
          {{ language.label }}
        </option>
      </select>
      <p v-if="languageOptions.length === 0" class="mt-2 text-sm text-secondary" role="status">
        No language available
      </p>

      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="min-h-11 rounded-xl px-4 text-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          @click="cancelSelection"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="min-h-11 rounded-xl bg-brand-primary px-5 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canConfirm"
        >
          OK
        </button>
      </div>
    </form>
  </dialog>
</template>
