<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FeedbackBanner from '@/components/FeedbackBanner.vue'
import TagSelector from '@/components/TagSelector.vue'
import { useFeedback } from '@/composables/useFeedback'
import { Card } from '@/models/card'
import type { CardContent } from '@/models/card'
import { useAuthStore } from '@/stores/authStore'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'

type SaveAction = 'createNext' | 'close' | 'changes'
type SideKey = keyof CardContent

const SIDE_KEYS: SideKey[] = ['s1', 's2', 's3']

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const cardStore = useCardStore()
const deckStore = useDeckStore()
const cardId = computed(() => {
  const routeCardId = route.params.id
  return typeof routeCardId === 'string' ? routeCardId : null
})
const isEditMode = computed(() => cardId.value !== null)
const activeDeck = computed(() => deckStore.activeDeck)
const sideFields = computed(() => {
  const deck = activeDeck.value
  if (!deck) return []

  return deck.sideLabels.flatMap((label, index) => {
    const key = SIDE_KEYS[index]
    return key ? [{ key, label, id: `card-side-${index + 1}` }] : []
  })
})
const content = ref<CardContent>({})
const selectedTagIds = ref<string[]>([])
const loadedCard = shallowRef<Card | null>(null)
const isLoadingCard = ref(false)
const isSaving = ref(false)
const feedback = useFeedback()
const { message: feedbackMessage, variant: feedbackVariant } = feedback
const firstSideInput = ref<HTMLTextAreaElement | null>(null)
const isFormDisabled = computed(
  () =>
    deckStore.isLoading ||
    isLoadingCard.value ||
    isSaving.value ||
    !authStore.profile ||
    !activeDeck.value ||
    (isEditMode.value && !loadedCard.value),
)

/**
 * @summary Shows one brief error when a text insertion exceeds the side limit.
 * @returns {void}
 */
function showLengthLimitError(): void {
  feedback.showError(`Each side is limited to ${Card.MAX_SIDE_LENGTH} characters.`, {
    durationMs: 2000,
  })
}

/**
 * @summary Detects a typed character that the textarea maxlength would reject.
 * @param {KeyboardEvent} event - The textarea's keydown event.
 * @returns {void}
 */
function handleSideKeydown(event: KeyboardEvent): void {
  if (event.key.length === 0 || event.ctrlKey || event.metaKey || event.altKey) return
  if (!(event.currentTarget instanceof HTMLTextAreaElement)) return

  const textarea = event.currentTarget
  const selectedLength = textarea.selectionEnd - textarea.selectionStart
  const availableLength = Card.MAX_SIDE_LENGTH - (textarea.value.length - selectedLength)

  if (event.key.length > availableLength) {
    showLengthLimitError()
  }
}

/**
 * @summary Detects text insertion that the textarea maxlength would reject.
 * @param {InputEvent} event - The textarea's beforeinput event.
 * @returns {void}
 */
function handleSideBeforeInput(event: InputEvent): void {
  if (!event.inputType.startsWith('insert')) return
  if (!(event.currentTarget instanceof HTMLTextAreaElement)) return

  const textarea = event.currentTarget
  const selectedLength = textarea.selectionEnd - textarea.selectionStart
  const availableLength = Card.MAX_SIDE_LENGTH - (textarea.value.length - selectedLength)
  const insertedLength = event.data?.length

  if (
    (insertedLength !== undefined && insertedLength > availableLength) ||
    (insertedLength === undefined && availableLength === 0)
  ) {
    showLengthLimitError()
  }
}

/**
 * @summary Dismisses validation feedback after the user changes the form.
 * @returns {void}
 */
function clearValidationError(): void {
  feedback.clearOnEdit()
}

function contentForDeck(source: CardContent, sideCount: number): CardContent {
  const deckContent: CardContent = {}
  for (const key of SIDE_KEYS.slice(0, sideCount)) {
    const value = source[key]
    if (value !== undefined) deckContent[key] = value
  }
  return deckContent
}

/**
 * @summary Loads a card for editing and confirms it belongs to the active deck.
 * @param {string} id - The card identifier from the route.
 * @param {string} deckId - The active deck identifier.
 * @returns {Promise<void>}
 */
async function loadCard(id: string, deckId: string): Promise<void> {
  const profile = authStore.profile
  if (!profile) {
    feedback.showError('Please sign in before editing cards.')
    return
  }

  isLoadingCard.value = true
  try {
    const card = await Card.findById(id)
    if (!card || card.deckId !== deckId || card.userId !== profile.id) {
      feedback.showError('Unable to find this card in the active deck.')
      return
    }

    loadedCard.value = card
    content.value = contentForDeck(card.content, sideFields.value.length)
    selectedTagIds.value = [...card.tagIds]
  } catch (error: unknown) {
    console.error(`CardEditView could not load card ${id}:`, error)
    feedback.showError('Unable to load this card. Please try again.')
  } finally {
    isLoadingCard.value = false
  }
}

/**
 * @summary Clears form state when its route or active deck context changes.
 * @param {string | null} id - The card route identifier.
 * @param {string | null} deckId - The active deck identifier.
 * @param {boolean} isDeckLoading - Whether the deck store is still initializing.
 * @returns {Promise<void>}
 */
async function loadFormContext(
  id: string | null,
  deckId: string | null,
  isDeckLoading: boolean,
): Promise<void> {
  if (isDeckLoading) return

  loadedCard.value = null
  content.value = {}
  selectedTagIds.value = []
  feedback.clear()

  if (!authStore.profile) {
    feedback.showError('Please sign in before creating or editing cards.')
    return
  }
  if (!deckId) {
    if (!deckStore.error) {
      feedback.showError('Select an active deck before creating or editing cards.')
    }
    return
  }
  if (id) await loadCard(id, deckId)
}

/**
 * @summary Validates card content before saving.
 * @returns {string | null} The first validation error, or null when valid.
 */
function validateForm(): string | null {
  const sideValues = sideFields.value.map((field) => content.value[field.key] ?? '')
  if (!sideValues.some((value) => value.trim())) {
    return 'At least one side must contain text'
  }
  if (sideValues.some((value) => value.length > Card.MAX_SIDE_LENGTH)) {
    return `Each side must be ${Card.MAX_SIDE_LENGTH} characters or fewer.`
  }
  return null
}

/**
 * @summary Saves the new or edited card and performs its requested follow-up action.
 * @param {SaveAction} action - The action to take after persistence succeeds.
 * @returns {Promise<void>}
 */
async function saveCard(action: SaveAction): Promise<void> {
  if (isFormDisabled.value || isSaving.value) return

  feedback.clear()

  const validationError = validateForm()
  if (validationError) {
    feedback.showError(validationError, { dismissOnEdit: true })
    return
  }

  const profile = authStore.profile
  const deck = activeDeck.value
  if (!profile || !deck?.id) {
    feedback.showError('Select an active deck and sign in before saving a card.')
    return
  }

  const card = loadedCard.value
  if (isEditMode.value && (!card || card.deckId !== deck.id)) {
    feedback.showError('This card does not belong to the active deck.')
    return
  }

  const cardToSave =
    card ??
    new Card(
      null,
      deck.id,
      profile.id,
      contentForDeck(content.value, sideFields.value.length),
      [...selectedTagIds.value],
      null,
      null,
    )
  cardToSave.content = contentForDeck(content.value, sideFields.value.length)
  cardToSave.tagIds = [...selectedTagIds.value]

  isSaving.value = true
  try {
    await cardToSave.save()
    cardStore.upsertCard(cardToSave)

    if (action === 'createNext') {
      resetForm()
      feedback.showSuccess('Card saved successfully.')
      return
    }

    await router.push({ name: 'CardList' })
  } catch (error: unknown) {
    console.error('CardEditView could not save card:', error)
    feedback.showError('Unable to save this card. Please try again.')
  } finally {
    isSaving.value = false
  }
}

/**
 * @summary Clears the card draft and focuses its first side after rendering.
 * @returns {void}
 */
function resetForm(): void {
  content.value = {}
  selectedTagIds.value = []
  feedback.clear()
  void nextTick(() => firstSideInput.value?.focus())
}

watch(
  [cardId, () => activeDeck.value?.id ?? null, () => deckStore.isLoading],
  ([id, deckId, isDeckLoading]) => loadFormContext(id, deckId, isDeckLoading),
  { immediate: true },
)
</script>

<template>
  <section class="mx-auto w-full max-w-md" aria-labelledby="card-edit-title">
    <header class="relative mb-4 sm:mb-6">
      <h1 id="card-edit-title" class="text-2xl font-bold text-primary">
        {{ isEditMode ? 'Edit card' : 'Create a card' }}
      </h1>
    </header>

    <FeedbackBanner :message="feedbackMessage" :variant="feedbackVariant" />

    <form
      novalidate
      class="space-y-3 rounded-card border-2 border-slate-600 bg-card p-4 shadow-2xl sm:space-y-5 sm:p-6"
      @submit.prevent
    >
      <fieldset :disabled="isFormDisabled" class="space-y-3 sm:space-y-5">
        <legend class="sr-only">Card content</legend>

        <div v-if="sideFields[0]">
          <label
            :for="sideFields[0].id"
            class="mb-1 block text-xs font-medium text-secondary sm:mb-2"
          >
            {{ sideFields[0].label }}
          </label>
          <textarea
            :id="sideFields[0].id"
            ref="firstSideInput"
            v-model="content[sideFields[0].key]"
            :maxlength="Card.MAX_SIDE_LENGTH"
            :aria-label="sideFields[0].label"
            rows="2"
            @input="clearValidationError"
            @keydown="handleSideKeydown"
            @beforeinput="handleSideBeforeInput"
            class="min-h-16 w-full resize-y rounded-xl border border-border-subtle bg-surface-muted px-3 py-2 text-primary placeholder:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-24 sm:px-4 sm:py-3"
          />
        </div>

        <div v-for="field in sideFields.slice(1)" :key="field.key">
          <label :for="field.id" class="mb-1 block text-xs font-medium text-secondary sm:mb-2">
            {{ field.label }}
          </label>
          <textarea
            :id="field.id"
            v-model="content[field.key]"
            :maxlength="Card.MAX_SIDE_LENGTH"
            :aria-label="field.label"
            rows="2"
            @input="clearValidationError"
            @keydown="handleSideKeydown"
            @beforeinput="handleSideBeforeInput"
            class="min-h-16 w-full resize-y rounded-xl border border-border-subtle bg-surface-muted px-3 py-2 text-primary placeholder:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-24 sm:px-4 sm:py-3"
          />
        </div>

        <fieldset>
          <legend class="mb-1 block text-xs font-medium text-secondary sm:mb-2">Tags</legend>
          <TagSelector
            v-model="selectedTagIds"
            :tags="deckStore.tags"
            @update:model-value="clearValidationError"
          />
        </fieldset>

        <div v-if="!isEditMode" class="space-y-2 sm:space-y-3">
          <button
            type="button"
            :disabled="isFormDisabled || isSaving"
            class="min-h-11 w-full rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
            @click="saveCard('createNext')"
          >
            {{ isSaving ? 'Saving…' : 'Save & Create Next' }}
          </button>
          <button
            type="button"
            :disabled="isFormDisabled || isSaving"
            class="min-h-11 w-full rounded-xl bg-surface-muted px-4 py-3 font-semibold text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
            @click="saveCard('close')"
          >
            Save &amp; Close
          </button>
        </div>

        <button
          v-else
          type="button"
          :disabled="isFormDisabled || isSaving"
          class="min-h-11 w-full rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
          @click="saveCard('changes')"
        >
          {{ isSaving ? 'Saving…' : 'Save Changes' }}
        </button>
      </fieldset>
    </form>
  </section>
</template>
