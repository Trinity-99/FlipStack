<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import DirectionDefinition from '@/components/DirectionDefinition.vue'
import FeedbackBanner from '@/components/FeedbackBanner.vue'
import { DirectionAlreadyExistsError, StudyService } from '@/engine/studyService'
import { useDeckStore } from '@/stores/deckStore'
import { useStudyStore } from '@/stores/studyStore'
import type { Direction, DirectionStep } from '@/models/direction'
import { useFeedback } from '@/composables/useFeedback'

const TEMPORARY_DIRECTION_ID = 'temporary-default'
const CREATE_DIRECTION_OPTION = 'create-direction'

const router = useRouter()
const deckStore = useDeckStore()
const studyStore = useStudyStore()
const studyService = new StudyService()
const selectedTagId = ref<string | null>(null)
const selectedDirection = shallowRef<Direction | null>(null)
const temporaryDirection = shallowRef<Direction | null>(null)
const directionNames = ref<Record<string, string>>({})
const isInitialized = ref(false)
const isResetDialogOpen = ref(false)
const isDirectionCreateOpen = ref(false)
const isCreatingDirection = ref(false)
const directionCreationError = ref<string | null>(null)
const feedback = useFeedback()
const { message: feedbackMessage, variant: feedbackVariant } = feedback
const summary = computed(() => studyStore.poolSummary)
type StudyFeedbackVariant = 'error' | 'success' | 'warning'
const studyFeedback = computed<{ message: string; variant: StudyFeedbackVariant } | null>(() => {
  if (studyStore.error) return { message: studyStore.error, variant: 'error' }
  if (feedbackMessage.value) {
    return { message: feedbackMessage.value, variant: feedbackVariant.value }
  }
  if (deckStore.error && !deckStore.activeDeck) {
    return { message: 'Your deck could not be loaded. Please try again.', variant: 'error' }
  }
  if (summary.value?.isMastered) {
    return { message: 'All cards in this topic are mastered!', variant: 'success' }
  }
  if (summary.value && summary.value.eligibleCount === 0) {
    return {
      message: 'No cards in this topic have all required sides for the selected direction.',
      variant: 'warning',
    }
  }
  return null
})
const directionOptions = computed(() =>
  deckStore.directions.length > 0
    ? deckStore.directions
    : temporaryDirection.value
      ? [temporaryDirection.value]
      : [],
)
const isStartDisabled = computed(
  () =>
    !summary.value ||
    summary.value.cardsToLearnCount === 0 ||
    studyStore.isLoading ||
    !selectedDirection.value,
)
const selectedDirectionValue = computed(() => selectedDirection.value?.id ?? TEMPORARY_DIRECTION_ID)

async function getDirectionName(direction: Direction): Promise<string> {
  return direction.getName()
}

async function initializeStudySetup(): Promise<void> {
  if (deckStore.isLoading) {
    isInitialized.value = false
    return
  }

  const deck = deckStore.activeDeck
  if (!deck?.id) {
    isInitialized.value = false
    if (!deckStore.error) {
      await router.replace({ name: 'DeckCreate' })
    }
    return
  }

  const preference = deckStore.activeDeckPreference
  const savedDirection = deckStore.directions.find(
    (direction) => direction.id === preference?.lastSelectedDirectionId,
  )
  const selectedSavedDirection = savedDirection ?? deckStore.directions[0]
  const defaultDirection =
    deckStore.directions.length === 0 ? studyService.createDefaultDirection(deck) : null
  temporaryDirection.value = defaultDirection
  selectedDirection.value = selectedSavedDirection ?? defaultDirection
  selectedTagId.value = deckStore.tags.some((tag) => tag.id === preference?.lastSelectedTagId)
    ? (preference?.lastSelectedTagId ?? null)
    : null

  try {
    const names = await Promise.all(
      directionOptions.value.map(
        async (direction) =>
          [direction.id ?? TEMPORARY_DIRECTION_ID, await getDirectionName(direction)] as const,
      ),
    )
    directionNames.value = Object.fromEntries(names)
    isInitialized.value = true
    await refreshPoolSummary()
  } catch (error: unknown) {
    console.error('StudyInitView could not initialize study setup:', error)
    feedback.showError('Unable to prepare this study session. Please try again.')
  }
}

async function refreshPoolSummary(): Promise<void> {
  const direction = selectedDirection.value
  if (!direction || !deckStore.activeDeckId || !isInitialized.value) return

  try {
    await studyStore.loadPoolSummary(selectedTagId.value, direction)
  } catch {
    // The study store exposes the failure through its error state.
  }
}

/**
 * @summary Changes the selected topic from the topic dropdown.
 * @param {Event} event - The topic select change event.
 * @returns {void}
 */
function updateSelectedTag(event: Event): void {
  const select = event.currentTarget
  if (!(select instanceof HTMLSelectElement)) return
  selectedTagId.value = select.value || null
}

/**
 * @summary Changes the selected direction from the direction dropdown.
 * @param {Event} event - The direction select change event.
 * @returns {void}
 */
function updateSelectedDirection(event: Event): void {
  const select = event.currentTarget
  if (!(select instanceof HTMLSelectElement)) return
  if (select.value === CREATE_DIRECTION_OPTION) {
    directionCreationError.value = null
    isDirectionCreateOpen.value = true
    return
  }

  selectedDirection.value =
    directionOptions.value.find(
      (direction) => (direction.id ?? TEMPORARY_DIRECTION_ID) === select.value,
    ) ?? null
}

/**
 * @summary Creates and selects a direction after the store persists it successfully.
 * @param {DirectionStep[]} configuration - The ordered side and role configuration.
 * @param {string} generatedName - The name generated by the Direction model for the preview.
 * @returns {Promise<void>} A promise that resolves after the direction has been selected.
 */
async function createDirection(
  configuration: DirectionStep[],
  generatedName: string,
): Promise<void> {
  if (isCreatingDirection.value) return

  directionCreationError.value = null
  isCreatingDirection.value = true
  try {
    const direction = await deckStore.createDirection(configuration)
    if (!direction.id) {
      throw new Error('The saved direction did not receive an ID.')
    }

    directionNames.value = { ...directionNames.value, [direction.id]: generatedName }
    selectedDirection.value = direction
    isDirectionCreateOpen.value = false
  } catch (error: unknown) {
    directionCreationError.value =
      error instanceof DirectionAlreadyExistsError
        ? 'This direction already exists.'
        : 'Unable to save this direction. Please review it and try again.'
    console.error('StudyInitView could not create a direction:', error)
  } finally {
    isCreatingDirection.value = false
  }
}

/**
 * @summary Closes the direction modal without saving or changing the selection.
 * @returns {void}
 */
function cancelDirectionCreation(): void {
  if (isCreatingDirection.value) return
  isDirectionCreateOpen.value = false
  directionCreationError.value = null
}

/**
 * @summary Starts studying after the store has prepared the session pool.
 * @returns {Promise<void>} A promise that resolves after navigation.
 */
async function startStudying(): Promise<void> {
  const direction = selectedDirection.value
  if (isStartDisabled.value || !direction) return

  feedback.clear()
  try {
    const savedDirection = await studyStore.startSession(selectedTagId.value, direction)
    selectedDirection.value = savedDirection
    await router.push({ name: 'Study' })
  } catch (error: unknown) {
    console.error('StudyInitView could not start studying:', error)
  }
}

/**
 * @summary Resets mastery after the user confirms the reset dialog.
 * @returns {Promise<void>} A promise that resolves when progress is reset.
 */
async function confirmMasteryReset(): Promise<void> {
  const direction = selectedDirection.value
  if (!direction || !summary.value?.isMastered) return

  isResetDialogOpen.value = false
  try {
    await studyStore.resetMastery(selectedTagId.value, direction)
  } catch (error: unknown) {
    console.error('StudyInitView could not reset mastery:', error)
  }
}

watch(
  () => [deckStore.activeDeckId, deckStore.isLoading, deckStore.error] as const,
  initializeStudySetup,
  { immediate: true },
)
watch([selectedTagId, selectedDirection], refreshPoolSummary)
</script>

<template>
  <section class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4">
    <FeedbackBanner
      v-if="studyFeedback"
      :message="studyFeedback.message"
      :variant="studyFeedback.variant"
    >
      <button
        v-if="studyFeedback.variant === 'success'"
        type="button"
        class="min-h-11 shrink-0 rounded-xl border border-emerald-500/50 px-4 font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="studyStore.isLoading || !selectedDirection?.id"
        @click="isResetDialogOpen = true"
      >
        Reset Mastery Scores
      </button>
    </FeedbackBanner>

    <div
      v-if="deckStore.isLoading && !deckStore.activeDeck"
      class="rounded-3xl border-2 border-slate-600 bg-card p-6 text-center text-secondary"
      role="status"
    >
      Loading your deck…
    </div>

    <div
      v-else-if="deckStore.activeDeck && selectedDirection"
      class="rounded-3xl border-2 border-slate-600 bg-card p-5 shadow-2xl sm:p-6"
    >
      <header class="mb-6 text-center">
        <h1 class="text-2xl font-semibold text-primary">Ready to learn?</h1>
        <p class="mt-2 text-sm text-secondary">Choose a topic and direction for this session.</p>
      </header>

      <div class="mb-6 grid gap-4">
        <label class="flex flex-col gap-2 text-sm font-medium text-primary">
          Topic
          <select
            :value="selectedTagId ?? ''"
            class="min-h-12 w-full rounded-xl border border-slate-600 bg-surface-muted px-4 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Study topic"
            @change="updateSelectedTag"
          >
            <option value="">Whole Deck</option>
            <option v-for="tag in deckStore.tags" :key="tag.id ?? tag.name" :value="tag.id ?? ''">
              {{ tag.name }}
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-2 text-sm font-medium text-primary">
          Direction
          <select
            :value="selectedDirectionValue"
            class="min-h-12 w-full rounded-xl border border-slate-600 bg-surface-muted px-4 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Study direction"
            @change="updateSelectedDirection"
          >
            <option
              v-for="direction in directionOptions"
              :key="direction.id ?? TEMPORARY_DIRECTION_ID"
              :value="direction.id ?? TEMPORARY_DIRECTION_ID"
            >
              {{ directionNames[direction.id ?? TEMPORARY_DIRECTION_ID] ?? 'Loading direction…' }}
              {{ direction.id ? '' : ' (default)' }}
            </option>
            <option :value="CREATE_DIRECTION_OPTION">+ Create New Direction</option>
          </select>
        </label>
      </div>

      <div class="mb-6 rounded-2xl bg-surface-muted/70 px-4 py-5 text-center">
        <p class="text-sm text-secondary">Cards to learn</p>
        <p class="mt-1 text-4xl font-bold tabular-nums text-primary" aria-live="polite">
          <span v-if="summary">
            {{ summary.cardsToLearnCount }}<span class="px-1 text-secondary">/</span
            >{{ summary.eligibleCount }}
          </span>
          <span v-else aria-label="Loading">—</span>
        </p>
        <p class="mt-1 text-xs text-secondary">not yet mastered / matching this direction</p>
      </div>

      <button
        type="button"
        class="min-h-14 w-full rounded-xl bg-brand-primary py-4 text-lg font-semibold text-primary transition-colors hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="isStartDisabled"
        @click="startStudying"
      >
        {{ studyStore.isLoading ? 'Preparing session…' : 'Start Studying' }}
      </button>
    </div>

    <dialog
      v-if="isResetDialogOpen"
      open
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-mastery-title"
      class="fixed inset-0 z-50 m-0 flex h-dvh max-h-none w-full max-w-none items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div class="w-full max-w-sm rounded-3xl border border-slate-700/80 bg-card p-6 shadow-2xl">
        <h2 id="reset-mastery-title" class="text-lg font-semibold text-primary">
          Reset mastery scores?
        </h2>
        <p class="mt-2 text-sm text-secondary">
          Scores for eligible cards in this topic and direction will be reset to zero.
        </p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="min-h-11 rounded-xl px-4 text-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            @click="isResetDialogOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="min-h-11 rounded-xl bg-brand-primary px-4 font-semibold text-primary hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            :disabled="studyStore.isLoading"
            @click="confirmMasteryReset"
          >
            Confirm reset
          </button>
        </div>
      </div>
    </dialog>

    <DirectionDefinition
      v-if="isDirectionCreateOpen && deckStore.activeDeck"
      :deck="deckStore.activeDeck"
      :is-saving="isCreatingDirection"
      :error-message="directionCreationError"
      @save="createDirection"
      @cancel="cancelDirectionCreation"
    />
  </section>
</template>
