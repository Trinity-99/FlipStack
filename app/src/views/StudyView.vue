<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import FeedbackBanner from '@/components/FeedbackBanner.vue'
import { StudyService } from '@/engine/studyService'
import type { StudyRating } from '@/engine/studyService'
import type { DirectionStep } from '@/models/direction'
import { useDeckStore } from '@/stores/deckStore'
import { useStudyStore } from '@/stores/studyStore'

interface PointerOrigin {
  id: number
  x: number
  y: number
  timeStamp: number
}

interface DragOffset {
  x: number
  y: number
}

const FLIP_DURATION_MS = 360
const RATING_DURATION_MS = 240
const HORIZONTAL_THRESHOLD_PX = 40
const VERTICAL_THRESHOLD_PX = 80
const FAST_FLICK_MIN_DISTANCE_PX = 40
const FAST_FLICK_VELOCITY_PX_PER_MS = 0.6
const VERTICAL_SLOPE_LIMIT = Math.tan((30 * Math.PI) / 180)

const router = useRouter()
const deckStore = useDeckStore()
const studyStore = useStudyStore()
const studyService = new StudyService()
const currentSideIndex = ref(0)
const pointerOrigin = ref<PointerOrigin | null>(null)
const dragOffset = ref<DragOffset>({ x: 0, y: 0 })
const flipAngle = ref(0)
const flipTargetIndex = ref<number | null>(null)
const isFlipping = ref(false)
const isExiting = ref(false)
const feedbackDirection = ref<StudyRating | null>(null)
const isAnimating = ref(false)
const isReducedMotion = ref(false)
let animationTimeout: ReturnType<typeof setTimeout> | null = null
let suppressClickTimeout: ReturnType<typeof setTimeout> | null = null
let suppressNextClick = false
let motionPreference: MediaQueryList | null = null

const activeSession = computed(() => studyStore.activeSession)
const currentCard = computed(() => activeSession.value?.currentCard ?? null)
const visibleSteps = computed<DirectionStep[]>(() => {
  const card = currentCard.value
  const direction = activeSession.value?.direction
  return card && direction ? studyService.getDisplaySteps(card, direction) : []
})
const currentStep = computed(() => visibleSteps.value[currentSideIndex.value] ?? null)
const nextStep = computed(() => {
  if (flipTargetIndex.value === null) return null
  return visibleSteps.value[flipTargetIndex.value] ?? null
})
const currentSideContent = computed(() => getSideContent(currentStep.value))
const nextSideContent = computed(() => getSideContent(nextStep.value))
const currentScore = computed(() => {
  const cardId = currentCard.value?.id
  if (!cardId) return 0
  return (
    activeSession.value?.progressRecords.find((record) => record.cardId === cardId)?.counter ?? 0
  )
})
const topicLabel = computed(() => activeSession.value?.topicLabel ?? 'your study session')
const sideLabel = computed(() => {
  const step = currentStep.value
  const deck = deckStore.activeDeck
  return step && deck ? deck.getSideLabel(step.side) : ''
})
const sideRole = computed(() => {
  const role = currentStep.value?.role
  if (role === 'question') return 'Question'
  if (role === 'answer') return 'Answer'
  if (role === 'extra') return 'Extra'
  return ''
})
const cardStyle = computed(() => ({
  transform: `translate3d(${dragOffset.value.x}px, ${dragOffset.value.y}px, 0)`,
}))
const flipStyle = computed(() => ({
  transform: `rotateY(${flipAngle.value}deg)`,
}))
const cardFeedbackClass = computed(() => {
  const activeFeedback =
    feedbackDirection.value ??
    (dragOffset.value.y < -8 ? 'got-it' : dragOffset.value.y > 8 ? 'needs-review' : null)
  if (activeFeedback === 'got-it') {
    return 'border-emerald-500 bg-emerald-900/40 shadow-emerald-950/40'
  }
  if (activeFeedback === 'needs-review') {
    return 'border-rose-500 bg-rose-900/40 shadow-rose-950/40'
  }
  return 'border-slate-600 bg-card'
})

function getSideContent(step: DirectionStep | null): string {
  const card = currentCard.value
  if (!card || !step) return ''
  return card.content[`s${step.side}` as 's1' | 's2' | 's3'] ?? ''
}

function clearAnimationTimeout(): void {
  if (animationTimeout !== null) {
    clearTimeout(animationTimeout)
    animationTimeout = null
  }
}

function handleMotionPreferenceChange(event: MediaQueryListEvent): void {
  isReducedMotion.value = event.matches
}

function resetDrag(): void {
  pointerOrigin.value = null
  dragOffset.value = { x: 0, y: 0 }
}

function turnToSide(direction: 'next' | 'previous'): void {
  if (isAnimating.value || visibleSteps.value.length < 2) return

  const sideCount = visibleSteps.value.length
  const offset = direction === 'next' ? 1 : -1
  const targetIndex = (currentSideIndex.value + offset + sideCount) % sideCount
  if (isReducedMotion.value) {
    currentSideIndex.value = targetIndex
    return
  }

  clearAnimationTimeout()
  isAnimating.value = true
  isFlipping.value = true
  flipTargetIndex.value = targetIndex
  flipAngle.value = direction === 'next' ? -180 : 180
  animationTimeout = setTimeout(() => {
    currentSideIndex.value = targetIndex
    flipAngle.value = 0
    flipTargetIndex.value = null
    isFlipping.value = false
    isAnimating.value = false
    animationTimeout = null
  }, FLIP_DURATION_MS)
}

function turnToNextSide(): void {
  turnToSide('next')
}

function turnToPreviousSide(): void {
  turnToSide('previous')
}

async function rateCurrentCard(rating: StudyRating): Promise<void> {
  if (isAnimating.value || !currentCard.value) return

  isAnimating.value = true
  feedbackDirection.value = rating
  isExiting.value = true
  dragOffset.value = {
    x: dragOffset.value.x,
    y:
      (rating === 'got-it' ? -1 : 1) *
      Math.max(window.innerHeight, window.visualViewport?.height ?? 0),
  }
  await new Promise<void>((resolve) => {
    animationTimeout = setTimeout(resolve, isReducedMotion.value ? 0 : RATING_DURATION_MS)
  })
  animationTimeout = null

  try {
    studyStore.rateCurrentCard(rating)
    currentSideIndex.value = 0
  } finally {
    dragOffset.value = { x: 0, y: 0 }
    feedbackDirection.value = null
    isExiting.value = false
    isAnimating.value = false
  }
}

function handlePointerDown(event: PointerEvent): void {
  if (isAnimating.value || !event.isPrimary) return
  pointerOrigin.value = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    timeStamp: event.timeStamp,
  }
  const target = event.currentTarget
  if (target instanceof HTMLElement) {
    const setPointerCapture: unknown = Reflect.get(target, 'setPointerCapture')
    if (typeof setPointerCapture === 'function') {
      setPointerCapture.call(target, event.pointerId)
    }
  }
}

function handlePointerMove(event: PointerEvent): void {
  const origin = pointerOrigin.value
  if (!origin || origin.id !== event.pointerId) return

  dragOffset.value = { x: event.clientX - origin.x, y: event.clientY - origin.y }
}

async function handlePointerUp(event: PointerEvent): Promise<void> {
  const origin = pointerOrigin.value
  if (!origin || origin.id !== event.pointerId) return

  const deltaX = event.clientX - origin.x
  const deltaY = event.clientY - origin.y
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)
  const durationMs = event.timeStamp - origin.timeStamp
  const isFastVerticalFlick =
    verticalDistance >= FAST_FLICK_MIN_DISTANCE_PX &&
    durationMs > 0 &&
    verticalDistance / durationMs >= FAST_FLICK_VELOCITY_PX_PER_MS
  const moved = Math.max(horizontalDistance, verticalDistance) > 10
  resetDrag()
  if (moved) {
    suppressNextClick = true
    if (suppressClickTimeout !== null) clearTimeout(suppressClickTimeout)
    suppressClickTimeout = setTimeout(() => {
      suppressNextClick = false
      suppressClickTimeout = null
    }, 500)
  }

  if (horizontalDistance >= HORIZONTAL_THRESHOLD_PX && horizontalDistance > verticalDistance) {
    turnToSide(deltaX < 0 ? 'next' : 'previous')
    return
  }

  if (
    (verticalDistance >= VERTICAL_THRESHOLD_PX || isFastVerticalFlick) &&
    verticalDistance > horizontalDistance &&
    horizontalDistance / verticalDistance <= VERTICAL_SLOPE_LIMIT
  ) {
    await rateCurrentCard(deltaY < 0 ? 'got-it' : 'needs-review')
  }
}

function handlePointerCancel(event: PointerEvent): void {
  if (pointerOrigin.value?.id !== event.pointerId) return
  resetDrag()
}

function handleCardClick(): void {
  if (suppressNextClick) {
    suppressNextClick = false
    if (suppressClickTimeout !== null) clearTimeout(suppressClickTimeout)
    suppressClickTimeout = null
    return
  }
  turnToNextSide()
}

async function exitStudy(): Promise<void> {
  await router.push({ name: 'SessionStart' })
}

async function startNewSession(): Promise<void> {
  await router.push({ name: 'SessionStart' })
}

async function initializeActiveSession(): Promise<void> {
  if (activeSession.value) return
  if (!studyStore.preparedSession) {
    await router.replace({ name: 'SessionStart' })
    return
  }

  try {
    studyStore.startActiveSession()
  } catch {
    // The store exposes the startup failure in its error state.
  }
}

onMounted(() => {
  motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
  isReducedMotion.value = motionPreference?.matches ?? false
  motionPreference?.addEventListener('change', handleMotionPreferenceChange)
  void initializeActiveSession()
})

onBeforeUnmount(() => {
  clearAnimationTimeout()
  if (suppressClickTimeout !== null) clearTimeout(suppressClickTimeout)
  motionPreference?.removeEventListener('change', handleMotionPreferenceChange)
})
</script>

<template>
  <section class="flex min-h-full flex-1 flex-col px-4 pb-4 pt-3 sm:px-6">
    <header class="flex min-h-12 items-center justify-between gap-3">
      <button
        type="button"
        class="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-secondary transition-colors hover:bg-surface-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        aria-label="Exit study session"
        @click="exitStudy"
      >
        <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none">
          <path
            d="M15 18l-6-6 6-6M9 12h11"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="hidden sm:inline">Exit</span>
      </button>

      <div v-if="activeSession && currentCard" class="text-right">
        <p class="text-xs text-secondary">Cards to master</p>
        <p class="text-sm font-semibold tabular-nums text-primary" aria-live="polite">
          {{ activeSession.poolSummary.cardsToLearnCount }} /
          {{ activeSession.poolSummary.eligibleCount }}
        </p>
      </div>
      <span v-else-if="activeSession?.isSessionComplete" class="sr-only" aria-live="polite">
        Study session complete
      </span>
    </header>

    <FeedbackBanner
      v-if="studyStore.error"
      class="mt-3"
      :message="studyStore.error"
      variant="error"
    />

    <div
      v-if="activeSession?.isSessionComplete"
      class="flex flex-1 items-center justify-center py-6"
    >
      <section
        class="w-full rounded-3xl border-2 border-slate-600 bg-card p-6 text-center shadow-2xl"
        aria-labelledby="study-complete-title"
      >
        <div
          class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300"
          aria-hidden="true"
        >
          <svg class="h-9 w-9" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12.5l4.5 4.5L19 7"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h1 id="study-complete-title" class="text-2xl font-semibold text-primary">
          Congratulations!
        </h1>
        <p class="mt-3 text-secondary">
          You mastered {{ activeSession.masteredDuringSession }}
          {{ activeSession.masteredDuringSession === 1 ? 'card' : 'cards' }} on
          <span class="font-medium text-primary">{{ activeSession.topicLabel }}</span>
          — keep that spirit up!
        </p>
        <button
          type="button"
          class="mt-8 min-h-14 w-full rounded-xl bg-brand-primary px-5 py-4 text-lg font-semibold text-primary transition-colors hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          @click="startNewSession"
        >
          Start New Session
        </button>
      </section>
    </div>

    <div
      v-else-if="currentCard && currentStep"
      class="flex flex-1 flex-col justify-center gap-4 py-4"
    >
      <div class="flex items-center justify-between px-1">
        <div>
          <p class="text-xs text-secondary">{{ topicLabel }}</p>
          <p class="mt-1 text-sm font-medium text-primary">{{ sideLabel }} · {{ sideRole }}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-secondary">Card score</p>
          <p class="mt-1 text-sm font-semibold tabular-nums text-primary">
            {{ currentScore }} / 10
          </p>
        </div>
      </div>

      <div class="perspective-container">
        <button
          type="button"
          class="study-card flex h-80 w-full select-none flex-col rounded-3xl border-2 p-6 text-center shadow-2xl"
          :class="[
            cardFeedbackClass,
            isFlipping
              ? 'transition-[transform,border-color,background-color] duration-300 ease-in-out'
              : '',
            isExiting
              ? 'transition-[transform,border-color,background-color] duration-200 ease-in'
              : '',
            isReducedMotion ? 'motion-reduce:transition-none' : '',
          ]"
          :style="cardStyle"
          aria-describedby="study-card-instructions"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointercancel="handlePointerCancel"
          @click="handleCardClick"
        >
          <span
            class="study-card-inner flex h-full w-full flex-col items-center justify-center text-center"
            :class="
              isFlipping ? 'transition-transform duration-[360ms] ease-in-out' : 'transition-none'
            "
            :style="flipStyle"
          >
            <span class="study-card-face flex flex-col items-center justify-center">
              <span class="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-secondary">
                {{ sideLabel }}
              </span>
              <span
                class="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-2xl font-semibold leading-relaxed text-primary sm:text-3xl"
              >
                {{ currentSideContent }}
              </span>
            </span>
            <span
              v-if="nextStep"
              class="study-card-face study-card-back flex flex-col items-center justify-center"
              aria-hidden="true"
            >
              <span class="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-secondary">
                {{ deckStore.activeDeck?.getSideLabel(nextStep.side) }}
              </span>
              <span
                class="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-2xl font-semibold leading-relaxed text-primary sm:text-3xl"
              >
                {{ nextSideContent }}
              </span>
            </span>
          </span>
        </button>
      </div>

      <p id="study-card-instructions" class="sr-only">
        Tap or swipe left to show the next side. Swipe right to show the previous side. Swipe up
        when you know it or swipe down when it needs review.
      </p>

      <p class="text-center text-xs text-secondary" aria-live="polite">
        Side {{ currentSideIndex + 1 }} of {{ visibleSteps.length }}
      </p>

      <div class="flex items-center justify-center gap-3" role="group" aria-label="Side navigation">
        <button
          type="button"
          class="min-h-11 min-w-11 rounded-xl bg-surface-muted px-4 text-sm font-medium text-primary transition-colors hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-50"
          aria-label="Previous side"
          :disabled="isAnimating || visibleSteps.length < 2"
          @click="turnToPreviousSide"
        >
          Previous
        </button>
        <button
          type="button"
          class="min-h-11 min-w-11 rounded-xl bg-surface-muted px-4 text-sm font-medium text-primary transition-colors hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-50"
          aria-label="Next side"
          :disabled="isAnimating || visibleSteps.length < 2"
          @click="turnToNextSide"
        >
          Next
        </button>
      </div>

      <div class="mt-auto grid grid-cols-2 gap-3">
        <button
          type="button"
          class="min-h-12 rounded-xl border border-rose-500/50 bg-rose-950/40 px-4 py-3 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isAnimating"
          @click="rateCurrentCard('needs-review')"
        >
          <span aria-hidden="true">↓ </span>Needs Review
        </button>
        <button
          type="button"
          class="min-h-12 rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-4 py-3 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isAnimating"
          @click="rateCurrentCard('got-it')"
        >
          <span aria-hidden="true">↑ </span>Got It
        </button>
      </div>
    </div>

    <div v-else class="flex flex-1 items-center justify-center py-6">
      <section
        class="w-full rounded-3xl border-2 border-slate-600 bg-card p-6 text-center shadow-2xl"
      >
        <h1 class="text-xl font-semibold text-primary">Ready to study?</h1>
        <p class="mt-2 text-sm text-secondary">
          Set up a topic and direction before starting a session.
        </p>
        <button
          type="button"
          class="mt-6 min-h-12 rounded-xl bg-brand-primary px-5 py-3 font-semibold text-primary transition-colors hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          @click="exitStudy"
        >
          Go to Session Setup
        </button>
      </section>
    </div>
  </section>
</template>

<style scoped>
.perspective-container {
  perspective: 1200px;
}

.study-card {
  transform-style: preserve-3d;
  touch-action: none;
  will-change: transform;
}

.study-card-inner {
  position: relative;
  transform-style: preserve-3d;
  transform-origin: center;
}

.study-card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.study-card-back {
  transform: rotateY(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .study-card-inner,
  .study-card {
    transition-duration: 1ms !important;
  }
}
</style>
