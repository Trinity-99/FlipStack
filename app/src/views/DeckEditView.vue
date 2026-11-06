<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AudioLanguageDialog from '@/components/AudioLanguageDialog.vue'
import FeedbackBanner from '@/components/FeedbackBanner.vue'
import { useFeedback } from '@/composables/useFeedback'
import { useSpeechSynthesis } from '@/composables/useSpeechSynthesis'
import { Deck, type DeckSide } from '@/models/deck'
import type { AudioLanguages, DeckSideKey } from '@/data/dataTypes'
import { useAuthStore } from '@/stores/authStore'
import { useDeckStore } from '@/stores/deckStore'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const deckStore = useDeckStore()
const deckId = computed(() => {
  const routeDeckId = route.params.deckId
  return typeof routeDeckId === 'string' ? routeDeckId : null
})
const isEditMode = computed(() => deckId.value !== null)
const deckName = ref('')
const sideCount = ref<2 | 3>(3)
const sideLabels = ref(['', '', ''])
const audioLanguages = ref<AudioLanguages>({})
const audioDialogSide = ref<DeckSide | null>(null)
const isOnline = ref(true)
const isLoadingDeck = ref(false)
const isSaving = ref(false)
const isNavigating = ref(false)
const feedback = useFeedback()
const speechSynthesis = useSpeechSynthesis()
const { message: feedbackMessage, variant: feedbackVariant } = feedback
const loadedDeck = shallowRef<Deck | null>(null)
const savedDeck = shallowRef<Deck | null>(null)
const characterCount = computed(() => deckName.value.length)
const isFormDisabled = computed(
  () =>
    !isOnline.value ||
    isLoadingDeck.value ||
    isSaving.value ||
    (isEditMode.value && !loadedDeck.value),
)

/**
 * @summary Loads a deck for editing and verifies it belongs to the signed-in user.
 * @param {string} id - The route deck identifier.
 * @returns {Promise<void>}
 */
async function loadDeck(id: string): Promise<void> {
  const profile = authStore.profile
  if (!profile) {
    feedback.showError(authStore.initializationError ?? 'Please sign in to edit this deck.', {
      dismissOnEdit: true,
    })
    return
  }

  isLoadingDeck.value = true
  try {
    const deck = await Deck.findById(id)
    if (!deck || deck.userId !== profile.id) {
      feedback.showError('Unable to find this deck.', { dismissOnEdit: true })
      return
    }

    loadedDeck.value = deck
    deckName.value = deck.title
    sideCount.value = deck.sideLabels.length === 2 ? 2 : 3
    sideLabels.value = [
      deck.sideLabels[0] ?? '',
      deck.sideLabels[1] ?? '',
      deck.sideLabels[2] ?? '',
    ]
    audioLanguages.value = { ...deck.audioLanguages }
  } catch (error: unknown) {
    console.error(`DeckEditView could not load deck ${id}:`, error)
    feedback.showError('Unable to load this deck. Please check your connection and try again.', {
      dismissOnEdit: true,
    })
  } finally {
    isLoadingDeck.value = false
  }
}

/**
 * @summary Validates the title and side labels currently shown in the form.
 * @returns {string | null} The first validation error, or null when valid.
 */
function validateForm(): string | null {
  if (!deckName.value.trim()) {
    return 'Deck name is required.'
  }
  if (deckName.value.length > 24) {
    return 'Deck name cannot exceed 24 characters'
  }
  if (sideLabels.value.slice(0, sideCount.value).some((label) => !label.trim())) {
    return 'Please enter a label for every selected side.'
  }
  return null
}

/**
 * @summary Validates and saves the new or edited deck.
 * @returns {Promise<void>}
 */
async function handleSubmit(): Promise<void> {
  if (isSaving.value || isFormDisabled.value) return

  feedback.clear()

  const validationError = validateForm()
  if (validationError) {
    feedback.showError(validationError, { dismissOnEdit: true })
    return
  }

  const profile = authStore.profile
  if (!profile) {
    feedback.showError(authStore.initializationError ?? 'Please sign in before saving a deck.', {
      dismissOnEdit: true,
    })
    return
  }

  const existingDeck = loadedDeck.value
  if (isEditMode.value && !existingDeck) {
    feedback.showError('Unable to edit this deck.', { dismissOnEdit: true })
    return
  }

  const deck =
    existingDeck ??
    new Deck(
      null,
      profile.id,
      deckName.value.trim(),
      sideLabels.value.slice(0, sideCount.value),
      null,
      null,
      audioLanguages.value,
    )
  deck.title = deckName.value.trim()
  deck.sideLabels = sideLabels.value.slice(0, sideCount.value).map((label) => label.trim())
  deck.audioLanguages = { ...audioLanguages.value }

  isSaving.value = true
  try {
    await deck.save()
    deckStore.upsertDeck(deck)
    if (isEditMode.value) {
      router.back()
      return
    }

    savedDeck.value = deck
    feedback.showSuccess(`Deck "${deck.title}" saved successfully`)
  } catch (error: unknown) {
    console.error('DeckEditView could not save deck:', error)
    feedback.showError('Unable to save this deck. Please check your information and try again.', {
      dismissOnEdit: true,
    })
  } finally {
    isSaving.value = false
  }
}

/**
 * @summary Activates the saved deck and opens the add-card screen.
 * @returns {Promise<void>}
 */
async function goToAddCards(): Promise<void> {
  const deck = savedDeck.value
  if (!deck?.id || isNavigating.value || !isOnline.value) return

  feedback.clear()
  isNavigating.value = true
  try {
    try {
      await deckStore.selectActiveDeck(deck.id)
    } catch (error: unknown) {
      console.error(`DeckEditView could not activate deck ${deck.id}:`, error)
      feedback.showError(
        `Deck "${deck.title}" was saved, but could not be activated. Please try again.`,
        { dismissOnEdit: true },
      )
      return
    }

    try {
      await router.push({ name: 'CardCreate', query: { returnTo: 'card-list' } })
    } catch (error: unknown) {
      console.error(`DeckEditView could not open card creation for deck ${deck.id}:`, error)
      feedback.showError(
        `Deck "${deck.title}" is active, but the card creation screen could not be opened. Please try again.`,
        { dismissOnEdit: true },
      )
    }
  } finally {
    isNavigating.value = false
  }
}

function resetForm(): void {
  loadedDeck.value = null
  savedDeck.value = null
  deckName.value = ''
  sideCount.value = 3
  sideLabels.value = ['', '', '']
  audioLanguages.value = {}
  audioDialogSide.value = null
  feedback.clear()
}

function updateOnlineStatus(): void {
  isOnline.value = navigator.onLine
}

/**
 * @summary Updates the selected side count and dismisses edit-cleared feedback.
 * @param {2 | 3} count - The number of sides to show.
 * @returns {void}
 */
function selectSideCount(count: 2 | 3): void {
  if (sideCount.value === count) return

  sideCount.value = count
  if (count === 2) clearAudioSetting(3)
  feedback.clearOnEdit()
}

function getAudioLanguage(side: number): string | null {
  if (!Number.isInteger(side) || side < 1 || side > 3) return null
  return audioLanguages.value[`s${side}` as DeckSideKey] ?? null
}

function clearAudioSetting(side: DeckSide): void {
  const sideKey: DeckSideKey = `s${side}`
  const nextAudioLanguages = { ...audioLanguages.value }
  delete nextAudioLanguages[sideKey]
  audioLanguages.value = nextAudioLanguages
}

function toggleAudio(side: number): void {
  if (side < 1 || side > sideCount.value) return
  if (getAudioLanguage(side)) {
    clearAudioSetting(side as DeckSide)
    return
  }
  audioDialogSide.value = side as DeckSide
}

function openAudioLanguageDialog(side: number): void {
  if (side < 1 || side > sideCount.value) return
  audioDialogSide.value = side as DeckSide
}

function confirmAudioLanguage(languageCode: string): void {
  const side = audioDialogSide.value
  if (!side) return
  audioLanguages.value = { ...audioLanguages.value, [`s${side}`]: languageCode }
  audioDialogSide.value = null
}

function cancelAudioLanguage(): void {
  audioDialogSide.value = null
}

watch(
  deckId,
  async (id) => {
    resetForm()
    if (id) await loadDeck(id)
  },
  { immediate: true },
)

onMounted(() => {
  updateOnlineStatus()
  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
})

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineStatus)
  window.removeEventListener('offline', updateOnlineStatus)
})
</script>

<template>
  <section class="mx-auto w-full" aria-labelledby="deck-edit-title">
    <div class="mb-6">
      <h1 id="deck-edit-title" class="text-2xl font-bold text-primary sm:text-3xl">
        {{ isEditMode ? 'Edit deck' : 'Create a deck' }}
      </h1>
      <p class="mt-2 text-sm text-secondary">
        Choose a name and the labels for the sides of your deck.
      </p>
    </div>

    <div
      v-if="!isOnline"
      class="mb-5 rounded-xl border border-amber-800/60 bg-amber-950 px-4 py-3 text-sm text-amber-300"
      role="status"
      aria-live="polite"
    >
      Please connect to the Internet — offline data entry is not supported
    </div>

    <FeedbackBanner :message="feedbackMessage" :variant="feedbackVariant" />

    <form
      novalidate
      class="rounded-card border-2 border-slate-600 bg-card p-6 shadow-2xl sm:p-8"
      @input="feedback.clearOnEdit"
      @submit.prevent="handleSubmit"
    >
      <fieldset :disabled="isFormDisabled" class="space-y-5">
        <legend class="sr-only">Deck details</legend>

        <div>
          <label for="deck-name" class="mb-2 block text-sm font-medium text-primary">
            Deck name
          </label>
          <input
            id="deck-name"
            v-model="deckName"
            name="deckName"
            type="text"
            maxlength="24"
            required
            placeholder="Thai Vocabulary"
            aria-describedby="deck-name-count"
            class="w-full rounded-xl border border-border-subtle bg-surface-muted px-4 py-3 text-primary placeholder:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p id="deck-name-count" class="mt-2 text-right text-xs text-secondary" aria-live="polite">
            <span class="sr-only">Character count: </span>{{ characterCount }}/24
          </p>
        </div>

        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-primary">Number of sides</legend>
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              :aria-pressed="sideCount === 2"
              class="min-h-11 rounded-xl border px-4 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
              :class="
                sideCount === 2
                  ? 'border-brand-primary bg-brand-primary text-white'
                  : 'border-border-subtle bg-surface-muted text-primary'
              "
              @click="selectSideCount(2)"
            >
              2 sides
            </button>
            <button
              type="button"
              :aria-pressed="sideCount === 3"
              class="min-h-11 rounded-xl border px-4 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
              :class="
                sideCount === 3
                  ? 'border-brand-primary bg-brand-primary text-white'
                  : 'border-border-subtle bg-surface-muted text-primary'
              "
              @click="selectSideCount(3)"
            >
              3 sides
            </button>
          </div>
        </fieldset>

        <div v-for="sideNumber in sideCount" :key="sideNumber">
          <label
            :for="`side-label-${sideNumber}`"
            class="mb-2 block text-sm font-medium text-primary"
          >
            Side {{ sideNumber }} label
          </label>
          <input
            :id="`side-label-${sideNumber}`"
            v-model="sideLabels[sideNumber - 1]"
            :name="`sideLabel${sideNumber}`"
            type="text"
            required
            :placeholder="`Side ${sideNumber}`"
            class="w-full rounded-xl border border-border-subtle bg-surface-muted px-4 py-3 text-primary placeholder:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div class="mt-3 flex min-h-11 flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              :aria-checked="getAudioLanguage(sideNumber) !== null"
              :aria-label="`Audio for ${sideLabels[sideNumber - 1] || `side ${sideNumber}`}`"
              class="inline-flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              @click="toggleAudio(sideNumber)"
            >
              <span>Audio</span>
              <span
                aria-hidden="true"
                class="relative h-6 w-11 rounded-full transition-colors"
                :class="getAudioLanguage(sideNumber) !== null ? 'bg-brand-primary' : 'bg-slate-600'"
              >
                <span
                  class="absolute top-1 h-4 w-4 rounded-full bg-white transition-transform"
                  :class="getAudioLanguage(sideNumber) !== null ? 'translate-x-6' : 'translate-x-1'"
                />
              </span>
            </button>
            <button
              v-if="getAudioLanguage(sideNumber)"
              type="button"
              class="min-h-11 rounded-xl px-3 text-sm text-indigo-300 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              :aria-label="`Change audio language for ${sideLabels[sideNumber - 1] || `side ${sideNumber}`}`"
              @click="openAudioLanguageDialog(sideNumber)"
            >
              {{ getAudioLanguage(sideNumber) }}
            </button>
          </div>
        </div>

        <button
          type="submit"
          :disabled="isFormDisabled || isSaving"
          class="flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ isSaving ? 'Saving…' : isEditMode ? 'Save changes' : 'Create deck' }}
        </button>
      </fieldset>
    </form>

    <button
      v-if="savedDeck"
      type="button"
      :disabled="isNavigating || !isOnline"
      class="mt-4 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-muted px-4 py-3 font-semibold text-primary transition-colors hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app disabled:cursor-not-allowed disabled:opacity-50"
      @click="goToAddCards"
    >
      {{ isNavigating ? 'Opening cards…' : 'Add cards to this deck' }}
    </button>

    <AudioLanguageDialog
      v-if="audioDialogSide !== null"
      :side-label="sideLabels[audioDialogSide - 1] || `Side ${audioDialogSide}`"
      :languages="speechSynthesis.languages.value"
      :current-language-code="getAudioLanguage(audioDialogSide)"
      @confirm="confirmAudioLanguage"
      @cancel="cancelAudioLanguage"
    />
  </section>
</template>
