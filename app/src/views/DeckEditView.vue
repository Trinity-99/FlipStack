<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Deck } from '@/models/deck'
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
const isOnline = ref(true)
const isLoadingDeck = ref(false)
const isSaving = ref(false)
const isNavigating = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
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
    errorMessage.value = authStore.initializationError ?? 'Please sign in to edit this deck.'
    return
  }

  isLoadingDeck.value = true
  try {
    const deck = await Deck.findById(id)
    if (!deck || deck.userId !== profile.id) {
      errorMessage.value = 'Unable to find this deck.'
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
  } catch (error: unknown) {
    console.error(`DeckEditView could not load deck ${id}:`, error)
    errorMessage.value = 'Unable to load this deck. Please check your connection and try again.'
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

  errorMessage.value = ''
  successMessage.value = ''

  const validationError = validateForm()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  const profile = authStore.profile
  if (!profile) {
    errorMessage.value = authStore.initializationError ?? 'Please sign in before saving a deck.'
    return
  }

  const existingDeck = loadedDeck.value
  if (isEditMode.value && !existingDeck) {
    errorMessage.value = 'Unable to edit this deck.'
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
    )
  deck.title = deckName.value.trim()
  deck.sideLabels = sideLabels.value.slice(0, sideCount.value).map((label) => label.trim())

  isSaving.value = true
  try {
    await deck.save()
    deckStore.upsertDeck(deck)
    savedDeck.value = deck
    successMessage.value = `Deck "${deck.title}" saved successfully`
  } catch (error: unknown) {
    console.error('DeckEditView could not save deck:', error)
    errorMessage.value = 'Unable to save this deck. Please check your information and try again.'
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

  errorMessage.value = ''
  isNavigating.value = true
  try {
    try {
      await deckStore.selectActiveDeck(deck.id)
    } catch (error: unknown) {
      console.error(`DeckEditView could not activate deck ${deck.id}:`, error)
      errorMessage.value = `Deck "${deck.title}" was saved, but could not be activated. Please try again.`
      return
    }

    try {
      await router.push({ name: 'CardCreate' })
    } catch (error: unknown) {
      console.error(`DeckEditView could not open card creation for deck ${deck.id}:`, error)
      errorMessage.value = `Deck "${deck.title}" is active, but the card creation screen could not be opened. Please try again.`
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
  errorMessage.value = ''
  successMessage.value = ''
}

function updateOnlineStatus(): void {
  isOnline.value = navigator.onLine
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
  <section class="mx-auto w-full max-w-md" aria-labelledby="deck-edit-title">
    <div class="mb-6">
      <h1 id="deck-edit-title" class="text-2xl font-bold text-primary">
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

    <div
      v-if="errorMessage"
      class="mb-5 rounded-xl border border-rose-500/50 bg-rose-950/90 px-4 py-3 text-sm text-rose-300"
      role="alert"
      aria-live="assertive"
    >
      {{ errorMessage }}
    </div>

    <div
      v-if="successMessage"
      class="mb-5 rounded-xl border border-accent-got-it/50 bg-accent-got-it/10 px-4 py-3 text-sm text-accent-got-it"
      role="status"
      aria-live="polite"
    >
      {{ successMessage }}
    </div>

    <form
      novalidate
      class="rounded-card border-2 border-slate-600 bg-card p-6 shadow-2xl"
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
              @click="sideCount = 2"
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
              @click="sideCount = 3"
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
  </section>
</template>
