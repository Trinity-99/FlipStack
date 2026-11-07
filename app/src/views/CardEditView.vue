<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FeedbackBanner from '@/components/FeedbackBanner.vue'
import TagSelector from '@/components/TagSelector.vue'
import { useFeedback } from '@/composables/useFeedback'
import { Card } from '@/models/card'
import type { CardContent } from '@/models/card'
import { useAuthStore } from '@/stores/authStore'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'
import { useStudyStore } from '@/stores/studyStore'

type SaveAction = 'createNext' | 'close' | 'changes'
type SideKey = keyof CardContent

const SIDE_KEYS: SideKey[] = ['s1', 's2', 's3']

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const cardStore = useCardStore()
const deckStore = useDeckStore()
const studyStore = useStudyStore()
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
const isDeleting = ref(false)
const isDeleteDialogOpen = ref(false)
const isCreatingTag = ref(false)
const isOnline = ref(true)
const feedback = useFeedback()
const { message: feedbackMessage, variant: feedbackVariant } = feedback
const firstSideInput = ref<HTMLTextAreaElement | null>(null)
const isFormDisabled = computed(
  () =>
    !isOnline.value ||
    deckStore.isLoading ||
    isLoadingCard.value ||
    isSaving.value ||
    isDeleting.value ||
    isCreatingTag.value ||
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

/**
 * @summary Creates or reuses a tag for the active deck and selects it for this card.
 * @param {string} name - The requested tag name.
 * @returns {Promise<void>}
 */
async function createTag(name: string): Promise<void> {
  if (isCreatingTag.value) return

  isCreatingTag.value = true
  try {
    const tag = await deckStore.createTag(name)
    if (!tag.id) {
      throw new Error('The saved tag does not have a database ID.')
    }

    if (!selectedTagIds.value.includes(tag.id)) {
      selectedTagIds.value = [...selectedTagIds.value, tag.id]
    }
    clearValidationError()
  } catch (error: unknown) {
    console.error('CardEditView could not create a tag:', error)
    feedback.showError('Unable to create tag. Please try again.')
  } finally {
    isCreatingTag.value = false
  }
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

    if (action === 'changes' && route.query.returnTo === 'study') {
      studyStore.replaceCurrentCard(cardToSave)
      await router.replace({ name: 'Study' })
      return
    }

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
 * @summary Leaves the editor without persisting the current card form.
 * @returns {Promise<void>}
 */
async function cancelEditing(): Promise<void> {
  if (isSaving.value || isDeleting.value || isCreatingTag.value) return

  if (route.query.returnTo === 'card-list') {
    try {
      await router.replace({ name: 'CardList' })
    } catch (error: unknown) {
      console.error('CardEditView could not return to the card list:', error)
      feedback.showError('Unable to leave this screen. Please try again.')
    }
    return
  }

  router.back()
}

/**
 * @summary Closes the delete confirmation without deleting the card.
 * @returns {void}
 */
function cancelCardDeletion(): void {
  if (isDeleting.value) return
  isDeleteDialogOpen.value = false
}

/**
 * @summary Deletes the persisted card and synchronizes its caches before returning.
 * @returns {Promise<void>}
 */
async function confirmCardDeletion(): Promise<void> {
  const card = loadedCard.value
  if (!card?.id || isFormDisabled.value || isDeleting.value) return

  isDeleteDialogOpen.value = false
  feedback.clear()
  isDeleting.value = true
  try {
    await card.delete()
  } catch (error: unknown) {
    console.error('CardEditView could not delete card:', error)
    feedback.showError('Unable to delete this card. Please try again.')
    isDeleting.value = false
    return
  }

  cardStore.removeCard(card)
  if (route.query.returnTo === 'study') {
    studyStore.removeCardFromSession(card)
  }
  isDeleting.value = false

  try {
    await router.replace({
      name: route.query.returnTo === 'study' ? 'Study' : 'CardList',
    })
  } catch (error: unknown) {
    console.error('CardEditView deleted the card but could not navigate away:', error)
    feedback.showError('Card deleted, but unable to leave this screen. Please try again.')
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

function updateOnlineStatus(): void {
  isOnline.value = navigator.onLine
}

watch(
  [cardId, () => activeDeck.value?.id ?? null, () => deckStore.isLoading],
  ([id, deckId, isDeckLoading]) => loadFormContext(id, deckId, isDeckLoading),
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
  <section class="mx-auto w-full" aria-labelledby="card-edit-title">
    <header class="mb-4 flex items-center justify-between gap-3 sm:mb-6">
      <h1 id="card-edit-title" class="text-2xl font-bold text-primary sm:text-3xl">
        {{ isEditMode ? 'Edit card' : 'Create a card' }}
      </h1>
      <div class="flex shrink-0 items-center gap-2">
        <button
          v-if="isEditMode"
          type="button"
          aria-label="Delete card"
          title="Delete card"
          :disabled="isFormDisabled"
          class="flex min-h-11 items-center gap-2 rounded-xl border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-950/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
          @click="isDeleteDialogOpen = true"
        >
          <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none">
            <path
              d="M4.75 7.25h14.5M9.25 7.25V4.75h5.5v2.5m-8 0 1 12h8.5l1-12M10 10.5v5.5m4-5.5v5.5"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Cancel editing"
          :disabled="isSaving || isDeleting || isCreatingTag"
          class="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface-muted px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
          @click="cancelEditing"
        >
          <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none">
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </header>

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
      class="space-y-3 rounded-card border-2 border-slate-600 bg-card p-4 shadow-2xl sm:space-y-5 sm:p-8"
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
            :is-creating="isCreatingTag"
            @create-tag="createTag"
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

    <dialog
      v-if="isDeleteDialogOpen"
      open
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-card-title"
      class="fixed inset-0 z-50 m-0 flex h-dvh max-h-none w-full max-w-none items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
      @click.self="cancelCardDeletion"
      @keydown.esc.prevent="cancelCardDeletion"
    >
      <div
        class="my-auto w-full max-w-sm rounded-3xl border-2 border-slate-600 bg-card p-4 shadow-2xl sm:p-6"
      >
        <h2 id="delete-card-title" class="text-xl font-semibold text-primary">Delete this card?</h2>
        <p class="mt-2 text-sm text-secondary">
          This permanently deletes the card and its study progress.
        </p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="min-h-11 rounded-xl px-4 text-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isDeleting"
            @click="cancelCardDeletion"
          >
            Cancel
          </button>
          <button
            type="button"
            class="min-h-11 rounded-xl bg-rose-700 px-5 font-semibold text-white hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isDeleting || isFormDisabled"
            @click="confirmCardDeletion"
          >
            {{ isDeleting ? 'Deleting…' : 'Delete card' }}
          </button>
        </div>
      </div>
    </dialog>
  </section>
</template>
