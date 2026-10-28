<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Deck } from '@/models/deck'
import { Direction, type DirectionStep } from '@/models/direction'

const props = defineProps<{
  deck: Deck
  isSaving: boolean
  errorMessage: string | null
}>()

const emit = defineEmits<{
  save: [configuration: DirectionStep[], generatedName: string]
  cancel: []
}>()

const questionSide = ref<number | null>(null)
const answerSides = ref<number[]>([])
const extraSide = ref<number | null>(null)
const remainingSideOrder = ref<number[]>([])
const validationError = ref<string | null>(null)
const previewName = ref('')
const previewError = ref<string | null>(null)
const isPreviewLoading = ref(false)
let previewRequestId = 0

const configuration = computed<DirectionStep[]>(() => [
  ...(questionSide.value === null ? [] : [{ side: questionSide.value, role: 'question' as const }]),
  ...remainingSideOrder.value.flatMap((side): DirectionStep[] => {
    if (answerSides.value.includes(side)) return [{ side, role: 'answer' }]
    if (extraSide.value === side) return [{ side, role: 'extra' }]
    return []
  }),
])

const selectedSteps = computed(() => configuration.value.slice(1))
const isPreviewPending = computed(() => isPreviewLoading.value)

/**
 * @summary Validates the selected roles before submitting a direction.
 * @returns {string | null} The validation message, or null when the configuration is valid.
 */
function validateConfiguration(): string | null {
  const steps = configuration.value
  if (questionSide.value === null) return 'Choose one Question side.'
  if (answerSides.value.length === 0) return 'Choose at least one Answer side.'
  if (steps.length < 2 || steps.length > props.deck.sideLabels.length) {
    return 'Choose a valid combination of deck sides.'
  }
  if (new Set(steps.map((step) => step.side)).size !== steps.length) {
    return 'Each deck side can only have one role.'
  }
  return null
}

/**
 * @summary Loads a generated direction name through the Direction model.
 * @param {DirectionStep[]} steps - The currently selected ordered configuration.
 * @returns {Promise<void>} A promise that resolves when the preview request completes.
 */
async function updateNamePreview(steps: DirectionStep[]): Promise<void> {
  const requestId = ++previewRequestId
  previewName.value = ''
  previewError.value = null

  if (validateConfiguration() || steps.length < 2) {
    isPreviewLoading.value = false
    return
  }

  const deckId = props.deck.id
  if (!deckId) {
    previewError.value = 'The active deck must be saved before a direction can be created.'
    isPreviewLoading.value = false
    return
  }

  isPreviewLoading.value = true
  try {
    const direction = new Direction(null, deckId, steps, null)
    const generatedName = await direction.getName()
    if (requestId === previewRequestId) previewName.value = generatedName
  } catch (error: unknown) {
    if (requestId === previewRequestId) {
      previewError.value = 'Unable to generate the direction name. Try again.'
    }
    console.error('DirectionDefinition could not generate a direction name:', error)
  } finally {
    if (requestId === previewRequestId) isPreviewLoading.value = false
  }
}

/**
 * @summary Selects the Question side and removes it from any other role.
 * @param {number} side - The selected deck side number.
 * @returns {void}
 */
function selectQuestionSide(side: number): void {
  questionSide.value = side
  if (props.deck.sideLabels.length === 2) {
    const remainingSide = side === 1 ? 2 : 1
    answerSides.value = [remainingSide]
    extraSide.value = null
    remainingSideOrder.value = [remainingSide]
    return
  }

  answerSides.value = answerSides.value.filter((answerSide) => answerSide !== side)
  if (extraSide.value === side) extraSide.value = null
  remainingSideOrder.value = remainingSideOrder.value.filter((orderedSide) => orderedSide !== side)
}

/**
 * @summary Toggles a side's Answer role without permitting role overlap.
 * @param {number} side - The selected deck side number.
 * @returns {void}
 */
function toggleAnswerSide(side: number): void {
  if (side === questionSide.value || side === extraSide.value) return

  if (answerSides.value.includes(side)) {
    answerSides.value = answerSides.value.filter((answerSide) => answerSide !== side)
    remainingSideOrder.value = remainingSideOrder.value.filter(
      (orderedSide) => orderedSide !== side,
    )
    return
  }

  answerSides.value = [...answerSides.value, side]
  remainingSideOrder.value = [...remainingSideOrder.value, side]
}

/**
 * @summary Assigns or clears the optional Extra role.
 * @param {number | null} side - The selected deck side number, or null to clear Extra.
 * @returns {void}
 */
function selectExtraSide(side: number | null): void {
  if (side === questionSide.value || (side !== null && answerSides.value.includes(side))) return

  if (extraSide.value !== null) {
    remainingSideOrder.value = remainingSideOrder.value.filter(
      (orderedSide) => orderedSide !== extraSide.value,
    )
  }

  extraSide.value = side
  if (side !== null) remainingSideOrder.value = [...remainingSideOrder.value, side]
}

/**
 * @summary Reorders an Answer or Extra step without moving it before Question.
 * @param {number} side - The deck side to move.
 * @param {-1 | 1} offset - The adjacent movement direction.
 * @returns {void}
 */
function moveStep(side: number, offset: -1 | 1): void {
  const index = remainingSideOrder.value.indexOf(side)
  const nextIndex = index + offset
  if (index < 0 || nextIndex < 0 || nextIndex >= remainingSideOrder.value.length) return

  const updatedOrder = [...remainingSideOrder.value]
  const [movedSide] = updatedOrder.splice(index, 1)
  if (movedSide === undefined) return
  updatedOrder.splice(nextIndex, 0, movedSide)
  remainingSideOrder.value = updatedOrder
}

/**
 * @summary Validates and emits the ordered direction configuration and generated name.
 * @returns {void}
 */
function submitConfiguration(): void {
  if (props.isSaving || isPreviewPending.value) return

  validationError.value = validateConfiguration()
  if (validationError.value) return
  if (previewError.value || !previewName.value) return

  emit(
    'save',
    configuration.value.map((step) => ({ ...step })),
    previewName.value,
  )
}

/**
 * @summary Requests cancellation without saving or changing the selected direction.
 * @returns {void}
 */
function cancelCreation(): void {
  if (props.isSaving) return
  emit('cancel')
}

watch(
  configuration,
  (steps) => {
    validationError.value = null
    void updateNamePreview(steps)
  },
  { immediate: true },
)
</script>

<template>
  <dialog
    open
    role="dialog"
    aria-modal="true"
    aria-labelledby="direction-definition-title"
    class="fixed inset-0 z-50 m-0 flex h-dvh max-h-none w-full max-w-none items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
    @click.self="cancelCreation"
    @keydown.esc.prevent="cancelCreation"
  >
    <form
      class="my-auto max-h-full w-full max-w-lg overflow-y-auto rounded-3xl border-2 border-slate-600 bg-card p-4 shadow-2xl sm:p-6"
      @submit.prevent="submitConfiguration"
    >
      <header class="mb-6">
        <h2 id="direction-definition-title" class="text-xl font-semibold text-primary">
          Create Study Direction
        </h2>
        <p class="mt-2 text-sm text-secondary">
          Choose which sides to study and how they should be revealed.
        </p>
      </header>

      <fieldset class="mb-5">
        <legend class="mb-2 text-sm font-medium text-primary">Question side</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(label, index) in deck.sideLabels"
            :key="`question-${index}`"
            type="button"
            :aria-pressed="questionSide === index + 1"
            class="min-h-11 rounded-xl border border-slate-600 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            :class="
              questionSide === index + 1
                ? 'border-brand-primary bg-brand-primary text-primary'
                : 'bg-surface-muted text-primary hover:border-slate-400'
            "
            @click="selectQuestionSide(index + 1)"
          >
            {{ label }}
          </button>
        </div>
      </fieldset>

      <fieldset class="mb-5">
        <legend class="mb-2 text-sm font-medium text-primary">Answer sides</legend>
        <p class="mb-2 text-xs text-secondary">Choose at least one required answer.</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(label, index) in deck.sideLabels"
            :key="`answer-${index}`"
            type="button"
            :aria-pressed="answerSides.includes(index + 1)"
            :disabled="questionSide === index + 1 || extraSide === index + 1"
            class="min-h-11 rounded-xl border border-slate-600 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-40"
            :class="
              answerSides.includes(index + 1)
                ? 'border-brand-primary bg-brand-primary text-primary'
                : 'bg-surface-muted text-primary hover:border-slate-400'
            "
            @click="toggleAnswerSide(index + 1)"
          >
            {{ label }}
          </button>
        </div>
      </fieldset>

      <label
        v-if="deck.sideLabels.length === 3"
        class="mb-5 flex flex-col gap-2 text-sm font-medium text-primary"
      >
        Extra side (optional)
        <select
          :value="extraSide ?? ''"
          class="min-h-12 w-full rounded-xl border border-slate-600 bg-surface-muted px-4 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          aria-label="Extra side"
          @change="
            selectExtraSide(
              ($event.currentTarget as HTMLSelectElement).value
                ? Number(($event.currentTarget as HTMLSelectElement).value)
                : null,
            )
          "
        >
          <option value="">None</option>
          <option
            v-for="(label, index) in deck.sideLabels"
            :key="`extra-${index}`"
            :value="index + 1"
            :disabled="questionSide === index + 1 || answerSides.includes(index + 1)"
          >
            {{ label }}
          </option>
        </select>
      </label>

      <fieldset v-if="selectedSteps.length > 1" class="mb-5">
        <legend class="mb-2 text-sm font-medium text-primary">Reveal order</legend>
        <ol class="grid gap-2">
          <li
            v-for="(step, index) in selectedSteps"
            :key="step.side"
            class="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-700 bg-surface-muted px-3 py-2"
          >
            <span class="text-sm text-primary">
              {{ deck.getSideLabel(step.side) }}
              <span class="ml-1 text-xs text-secondary">{{ step.role }}</span>
            </span>
            <span class="flex gap-2">
              <button
                type="button"
                class="min-h-9 min-w-9 rounded-lg text-primary hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-40"
                :aria-label="`Move ${deck.getSideLabel(step.side)} up`"
                :disabled="index === 0 || isSaving"
                @click="moveStep(step.side, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="min-h-9 min-w-9 rounded-lg text-primary hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-40"
                :aria-label="`Move ${deck.getSideLabel(step.side)} down`"
                :disabled="index === selectedSteps.length - 1 || isSaving"
                @click="moveStep(step.side, 1)"
              >
                ↓
              </button>
            </span>
          </li>
        </ol>
      </fieldset>

      <div class="mb-5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
        <p class="text-xs font-medium uppercase tracking-wide text-secondary">Direction name</p>
        <p class="mt-1 min-h-5 font-mono text-sm text-indigo-400" aria-live="polite">
          <span v-if="isPreviewLoading">Generating preview…</span>
          <span v-else-if="previewName">{{ previewName }}</span>
          <span v-else class="text-secondary">Choose a Question and Answer side</span>
        </p>
        <p v-if="previewError" class="mt-2 text-sm text-rose-300" role="alert">
          {{ previewError }}
          <button
            type="button"
            class="ml-1 font-semibold underline"
            :disabled="isSaving"
            @click="updateNamePreview(configuration)"
          >
            Try again
          </button>
        </p>
      </div>

      <p v-if="validationError" class="mb-4 text-sm text-rose-300" role="alert">
        {{ validationError }}
      </p>
      <p
        v-if="errorMessage"
        class="mb-4 rounded-xl border border-rose-500/50 bg-rose-950/40 p-3 text-sm text-rose-200"
        role="alert"
      >
        {{ errorMessage }}
      </p>

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="min-h-11 rounded-xl px-4 font-medium text-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isSaving"
          @click="cancelCreation"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="min-h-11 rounded-xl bg-brand-primary px-4 font-semibold text-primary transition-colors hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isSaving || isPreviewPending || !!previewError"
        >
          {{ isSaving ? 'Saving…' : 'Save Direction' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
