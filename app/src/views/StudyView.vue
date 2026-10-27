<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FeedbackBanner from '@/components/FeedbackBanner.vue'
import { StudyService } from '@/engine/studyService'
import type { StudyRating } from '@/engine/studyService'
import type { DirectionStep } from '@/models/direction'
import { useDeckStore } from '@/stores/deckStore'
import { useStudyStore } from '@/stores/studyStore'

type DragLock = 'horizontal' | 'vertical' | null

interface PointerOrigin {
  id: number
  x: number
  y: number
  timeStamp: number
  lock: DragLock
}

interface PrismGeometry {
  count: number
  width: number
  radius: number
  faceWidth: number
  apothem: number
  cornerDistance: number
  stepDeg: number
}

interface PrismStrip {
  key: string
  style: Record<string, string>
}

// Animation timing (ms). Multiply all by one factor to speed up or slow down.
const TURN_MS = 935
const EXIT_MS = 440
const ENTER_MS = 650
const SPRING_MS = 680

// Look. TILT_DEG gives the thin top edge; SLIVER_DEG (try 10-12) shows a strip of the next face at rest.
const TILT_DEG = 8
const SLIVER_DEG = 0
const EDGE_SHADE = 0.14
const STAGE_HEIGHT_PX = 240 // 15rem, keep in sync with .study-stage height

// Gestures. Horizontal wins; vertical must be clearly vertical.
const DRAG_START_PX = 8
const TAP_MAX_PX = 10
const HORIZONTAL_THRESHOLD_PX = 40
const HORIZONTAL_FLICK_MIN_PX = 24
const VERTICAL_THRESHOLD_PX = 80
const FAST_FLICK_MIN_DISTANCE_PX = 40
const FAST_FLICK_VELOCITY_PX_PER_MS = 0.6
const VERTICAL_SLOPE_LIMIT = Math.tan((30 * Math.PI) / 180)

// Card surface colour (bg-card, #1E293B) used to shade the rounded edges.
const SURFACE_RGB = [30, 41, 59] as const

const router = useRouter()
const deckStore = useDeckStore()
const studyStore = useStudyStore()
const studyService = new StudyService()

const stageEl = ref<HTMLElement | null>(null)
const moverEl = ref<HTMLElement | null>(null)
const stageWidth = ref(0)
const turns = ref(0)
const dragAngle = ref(0)
const dragOffsetY = ref(0)
const animateTurn = ref(false)
const springBack = ref(false)
const feedbackRating = ref<StudyRating | null>(null)
const isRating = ref(false)
const isReducedMotion = ref(false)
let pointerOrigin: PointerOrigin | null = null
let motionPreference: MediaQueryList | null = null
let resizeObserver: ResizeObserver | null = null

const activeSession = computed(() => studyStore.activeSession)
const currentCard = computed(() => activeSession.value?.currentCard ?? null)
const visibleSteps = computed<DirectionStep[]>(() => {
  const card = currentCard.value
  const direction = activeSession.value?.direction
  return card && direction ? studyService.getDisplaySteps(card, direction) : []
})
const sideCount = computed(() => visibleSteps.value.length)
const currentSideIndex = computed(() => {
  const count = sideCount.value
  return count === 0 ? 0 : ((turns.value % count) + count) % count
})
const currentStep = computed(() => visibleSteps.value[currentSideIndex.value] ?? null)
const sideLabels = computed(() => {
  const deck = deckStore.activeDeck
  return deck ? visibleSteps.value.map((step) => deck.getSideLabel(step.side)) : []
})
const currentSideLabel = computed(() => sideLabels.value[currentSideIndex.value] ?? '')
const currentSideContent = computed(() => getSideContent(currentStep.value))
const currentScore = computed(() => {
  const cardId = currentCard.value?.id
  if (!cardId) return 0
  return (
    activeSession.value?.progressRecords.find((record) => record.cardId === cardId)?.counter ?? 0
  )
})
const topicLabel = computed(() => activeSession.value?.topicLabel ?? 'your study session')
const headerTitle = computed(() => {
  const deckTitle = deckStore.activeDeck?.title
  return deckTitle ? `${deckTitle} · ${topicLabel.value}` : topicLabel.value
})

const ms = (value: number): number => (isReducedMotion.value ? 1 : value)

/** Prism dimensions: flat faces joined by rounded edges (a thick slab for two sides). */
const geometry = computed<PrismGeometry | null>(() => {
  const count = sideCount.value
  const width = stageWidth.value
  if (count === 0 || width === 0) return null
  if (count === 1) {
    return {
      count,
      width,
      radius: 0,
      faceWidth: width,
      apothem: 0,
      cornerDistance: 0,
      stepDeg: 360,
    }
  }
  const radius = count === 2 ? 11 : 14
  const faceWidth = width - 2 * radius
  const apothem = count === 2 ? radius : faceWidth / (2 * Math.tan(Math.PI / count)) + radius
  const cornerDistance =
    count === 2 ? faceWidth / 2 : (apothem - radius) / Math.cos(Math.PI / count)
  return { count, width, radius, faceWidth, apothem, cornerDistance, stepDeg: 360 / count }
})

/** Thin strips along each corner arc, plus the top cap cut to the same rounded outline. */
const prismParts = computed<{ strips: PrismStrip[]; capStyle: Record<string, string> | null }>(
  () => {
    const g = geometry.value
    if (!g || g.count < 2) return { strips: [], capStyle: null }

    const segments = g.count === 2 ? 12 : 10
    const box = 2 * (g.cornerDistance + g.radius) + 2
    const strips: PrismStrip[] = []
    const outline: string[] = []

    for (let corner = 0; corner < g.count; corner++) {
      const cornerAngle = (corner + 0.5) * g.stepDeg
      const cornerRad = (cornerAngle * Math.PI) / 180
      const halfRad = (g.stepDeg / segments / 2) * (Math.PI / 180)
      const stripWidth = 2 * g.radius * Math.sin(halfRad) + 1.2

      for (let k = 0; k < segments; k++) {
        const stripAngle = (corner + (k + 0.5) / segments) * g.stepDeg
        const shade = 1 - EDGE_SHADE * Math.sin((Math.PI * (k + 0.5)) / segments)
        const [r, gr, b] = SURFACE_RGB.map((channel) => Math.floor(channel * shade))
        strips.push({
          key: `${corner}-${k}`,
          style: {
            left: `${g.width / 2 - stripWidth / 2}px`,
            width: `${stripWidth}px`,
            backgroundColor: `rgb(${r},${gr},${b})`,
            transform: `rotateY(${cornerAngle}deg) translateZ(${g.cornerDistance}px) rotateY(${stripAngle - cornerAngle}deg) translateZ(${g.radius}px)`,
          },
        })
      }

      for (let k = 0; k <= segments; k++) {
        const angle = (((corner + k / segments) * g.stepDeg) * Math.PI) / 180
        const x = g.cornerDistance * Math.sin(cornerRad) + g.radius * Math.sin(angle)
        const z = g.cornerDistance * Math.cos(cornerRad) + g.radius * Math.cos(angle)
        outline.push(`${box / 2 + x}px ${box / 2 + z}px`)
      }
    }

    return {
      strips,
      capStyle: {
        width: `${box}px`,
        height: `${box}px`,
        margin: `${-box / 2}px 0 0 ${-box / 2}px`,
        transform: `translateY(${-STAGE_HEIGHT_PX / 2}px) rotateX(90deg)`,
        clipPath: `polygon(${outline.join(',')})`,
      },
    }
  },
)

/** Got It / Needs Review tint, driven by the drag distance or the committed rating. */
const tintStyle = computed((): Record<string, string> => {
  const rating = feedbackRating.value
  const offset = dragOffsetY.value
  const kind: StudyRating = rating ?? (offset < 0 ? 'got-it' : 'needs-review')
  const progress = rating ? 1 : Math.min(Math.abs(offset) / VERTICAL_THRESHOLD_PX, 1)
  if (progress < 0.1) return {}
  const rgb = kind === 'got-it' ? '16,185,129' : '244,63,94'
  return { '--tint': `rgba(${rgb},${0.28 * progress})`, '--bc': `rgb(${rgb})` }
})

const prismStyle = computed<Record<string, string>>(() => {
  const g = geometry.value
  const step = g?.stepDeg ?? 120
  const angle = -turns.value * step + SLIVER_DEG + dragAngle.value
  return {
    transform: `translateZ(${-(g?.apothem ?? 0)}px) rotateY(${angle}deg)`,
    transition: animateTurn.value
      ? `transform ${ms(TURN_MS)}ms cubic-bezier(.34,1.35,.5,1)`
      : 'none',
    ...tintStyle.value,
  }
})

const moverStyle = computed<Record<string, string>>(() => ({
  transform: `translate3d(0, ${dragOffsetY.value}px, 0)`,
  transition: springBack.value
    ? `transform ${ms(SPRING_MS)}ms cubic-bezier(.34,1.45,.5,1)`
    : 'none',
}))

function faceStyle(index: number): Record<string, string> {
  const g = geometry.value
  if (!g) return {}
  return {
    left: `${(g.width - g.faceWidth) / 2}px`,
    right: 'auto',
    width: `${g.faceWidth}px`,
    transform: `rotateY(${index * g.stepDeg}deg) translateZ(${g.apothem}px)`,
  }
}

function getSideContent(step: DirectionStep | null): string {
  const card = currentCard.value
  if (!card || !step) return ''
  return card.content[`s${step.side}` as 's1' | 's2' | 's3'] ?? ''
}

function handleMotionPreferenceChange(event: MediaQueryListEvent): void {
  isReducedMotion.value = event.matches
}

function play(
  element: HTMLElement | null,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | undefined {
  if (!element || typeof element.animate !== 'function') return undefined
  return element.animate(keyframes, options)
}

async function finished(animation: Animation | undefined): Promise<void> {
  try {
    await animation?.finished
  } catch {
    // The animation was cancelled (for example when the view unmounts).
  }
}

function turnToSide(direction: 'next' | 'previous'): void {
  if (isRating.value || sideCount.value < 2) return
  animateTurn.value = true
  dragAngle.value = 0
  turns.value += direction === 'next' ? 1 : -1
}

function turnToNextSide(): void {
  turnToSide('next')
}

function turnToPreviousSide(): void {
  turnToSide('previous')
}

function settleDrag(): void {
  animateTurn.value = true
  springBack.value = true
  dragAngle.value = 0
  dragOffsetY.value = 0
}

async function rateCurrentCard(rating: StudyRating, fromOffsetY = 0): Promise<void> {
  if (isRating.value || !currentCard.value) return

  isRating.value = true
  feedbackRating.value = rating
  springBack.value = false
  const direction = rating === 'got-it' ? -1 : 1

  const exit = play(
    moverEl.value,
    [
      { transform: `translate3d(0, ${fromOffsetY}px, 0) rotate(0deg)` },
      {
        transform: `translate3d(0, ${direction * window.innerHeight * 0.8}px, 0) rotate(${-direction * 6}deg)`,
      },
    ],
    { duration: ms(EXIT_MS), easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
  )
  await finished(exit)

  try {
    studyStore.rateCurrentCard(rating)
    animateTurn.value = false
    turns.value = 0
    dragAngle.value = 0
    dragOffsetY.value = 0
    feedbackRating.value = null
    await nextTick()
    // The next card rises in from slightly below.
    const enter = play(
      moverEl.value,
      [
        { transform: 'translate3d(0, 48px, 0) scale(0.94)', opacity: 0 },
        { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      ],
      { duration: ms(ENTER_MS), easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
    exit?.cancel()
    await finished(enter)
  } finally {
    feedbackRating.value = null
    dragOffsetY.value = 0
    isRating.value = false
  }
}

function classifyDrag(deltaX: number, deltaY: number): DragLock {
  if (Math.abs(deltaX) > Math.abs(deltaY)) return 'horizontal'
  if (Math.abs(deltaX) <= Math.abs(deltaY) * VERTICAL_SLOPE_LIMIT) return 'vertical'
  return null
}

function handlePointerDown(event: PointerEvent): void {
  if (isRating.value || !event.isPrimary) return
  pointerOrigin = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    timeStamp: event.timeStamp,
    lock: null,
  }
  animateTurn.value = false
  springBack.value = false
  const target = event.currentTarget
  if (target instanceof HTMLElement && typeof target.setPointerCapture === 'function') {
    target.setPointerCapture(event.pointerId)
  }
}

function handlePointerMove(event: PointerEvent): void {
  const origin = pointerOrigin
  if (!origin || origin.id !== event.pointerId) return

  const deltaX = event.clientX - origin.x
  const deltaY = event.clientY - origin.y
  if (!origin.lock && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > DRAG_START_PX) {
    origin.lock = classifyDrag(deltaX, deltaY)
  }

  const g = geometry.value
  if (origin.lock === 'horizontal' && g && g.count > 1) {
    const turnAmount = (deltaX / (g.width * 0.6)) * g.stepDeg
    dragAngle.value = Math.max(-g.stepDeg, Math.min(g.stepDeg, turnAmount))
  } else if (origin.lock === 'vertical') {
    dragOffsetY.value = deltaY
  }
}

async function handlePointerUp(event: PointerEvent): Promise<void> {
  const origin = pointerOrigin
  if (!origin || origin.id !== event.pointerId) return
  pointerOrigin = null

  const deltaX = event.clientX - origin.x
  const deltaY = event.clientY - origin.y
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)
  const durationMs = Math.max(event.timeStamp - origin.timeStamp, 1)
  const moved = Math.max(horizontalDistance, verticalDistance) > TAP_MAX_PX

  if (!moved) {
    settleDrag()
    turnToNextSide()
    return
  }

  const isHorizontalSwipe =
    horizontalDistance >= HORIZONTAL_THRESHOLD_PX ||
    (horizontalDistance >= HORIZONTAL_FLICK_MIN_PX &&
      horizontalDistance / durationMs >= FAST_FLICK_VELOCITY_PX_PER_MS)
  if (origin.lock === 'horizontal' && isHorizontalSwipe) {
    turnToSide(deltaX < 0 ? 'next' : 'previous')
    return
  }

  const isVerticalSwipe =
    verticalDistance >= VERTICAL_THRESHOLD_PX ||
    (verticalDistance >= FAST_FLICK_MIN_DISTANCE_PX &&
      verticalDistance / durationMs >= FAST_FLICK_VELOCITY_PX_PER_MS)
  if (origin.lock === 'vertical' && isVerticalSwipe) {
    await rateCurrentCard(deltaY < 0 ? 'got-it' : 'needs-review', deltaY)
    return
  }

  settleDrag()
}

function handlePointerCancel(event: PointerEvent): void {
  if (pointerOrigin?.id !== event.pointerId) return
  pointerOrigin = null
  settleDrag()
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

// Measure the stage so the prism geometry follows the available width.
watch(
  stageEl,
  (element) => {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (!element) return
    stageWidth.value = element.clientWidth
    if (typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(() => {
      stageWidth.value = element.clientWidth
    })
    resizeObserver.observe(element)
  },
  { flush: 'post' },
)

// A new card always starts on its first side.
watch(
  () => currentCard.value?.id,
  () => {
    animateTurn.value = false
    turns.value = 0
    dragAngle.value = 0
  },
)

onMounted(() => {
  motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
  isReducedMotion.value = motionPreference?.matches ?? false
  motionPreference?.addEventListener('change', handleMotionPreferenceChange)
  void initializeActiveSession()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
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
      <div class="flex items-start justify-between gap-3 px-1">
        <div class="min-w-0">
          <p class="truncate text-xs text-secondary">{{ headerTitle }}</p>
          <p class="mt-1 text-sm" aria-hidden="true">
            <template v-for="(label, index) in sideLabels" :key="index">
              <span v-if="index > 0" class="text-muted"> → </span>
              <span
                :class="
                  index === currentSideIndex ? 'font-semibold text-indigo-300' : 'text-secondary'
                "
              >
                {{ label }}
              </span>
            </template>
          </p>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-xs text-secondary">Card score</p>
          <p class="mt-1 text-sm font-semibold tabular-nums text-primary">
            {{ currentScore }} / 10
          </p>
          <div class="mt-1 flex justify-end gap-0.5" aria-hidden="true">
            <span
              v-for="n in 10"
              :key="n"
              class="h-1 w-1.5 rounded-sm"
              :class="n <= currentScore ? 'bg-emerald-500' : 'bg-surface-muted'"
            />
          </div>
        </div>
      </div>

      <div class="flex flex-1 items-center justify-center">
      <div
        ref="stageEl"
        class="study-stage mx-auto w-[82%] max-w-xs"
        role="group"
        aria-label="Study card"
        aria-describedby="study-card-instructions"
        tabindex="0"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerCancel"
        @keydown.enter.prevent="turnToNextSide"
        @keydown.space.prevent="turnToNextSide"
      >
        <div ref="moverEl" class="study-layer" :style="moverStyle">
          <div class="study-layer" :style="{ transform: `rotateX(${TILT_DEG}deg)` }">
            <div class="study-layer" :style="prismStyle">
              <div
                v-for="(step, index) in visibleSteps"
                :key="step.side"
                class="study-face"
                :style="faceStyle(index)"
                aria-hidden="true"
              >
                <span class="study-face-label">{{ sideLabels[index] }}</span>
                <span
                  class="max-h-36 overflow-y-auto whitespace-pre-wrap break-words font-semibold leading-relaxed text-primary"
                  :class="step.role === 'question' ? 'text-3xl' : 'text-2xl'"
                >
                  {{ getSideContent(step) }}
                </span>
              </div>
              <div
                v-for="strip in prismParts.strips"
                :key="strip.key"
                class="study-strip"
                :style="strip.style"
                aria-hidden="true"
              />
              <div
                v-if="prismParts.capStyle"
                class="study-cap"
                :style="prismParts.capStyle"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>
      </div>

      <p id="study-card-instructions" class="sr-only">
        Tap or swipe left to show the next side. Swipe right to show the previous side. Swipe up
        when you know it or swipe down when it needs review.
      </p>

      <p class="sr-only" aria-live="polite">
        Side {{ currentSideIndex + 1 }} of {{ sideCount }}: {{ currentSideLabel }},
        {{ currentSideContent }}
      </p>

      <div class="flex items-center justify-between" role="group" aria-label="Side navigation">
        <button
          type="button"
          class="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-surface-muted text-primary transition-colors hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-50"
          aria-label="Previous side"
          :disabled="isRating || sideCount < 2"
          @click="turnToPreviousSide"
        >
          <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-surface-muted text-primary transition-colors hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-50"
          aria-label="Next side"
          :disabled="isRating || sideCount < 2"
          @click="turnToNextSide"
        >
          <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <div class="mt-auto grid grid-cols-2 gap-3">
        <button
          type="button"
          class="min-h-12 rounded-xl border border-rose-500/50 bg-rose-950/40 px-4 py-3 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isRating"
          @click="rateCurrentCard('needs-review')"
        >
          <span aria-hidden="true">↓ </span>Needs Review
        </button>
        <button
          type="button"
          class="min-h-12 rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-4 py-3 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isRating"
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
/* Surface colours below are the design tokens: bg-card #1E293B, border slate-600 #475569, text-secondary #94A3B8. */
.study-stage {
  position: relative;
  height: 15rem;
  perspective: 1100px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}

.study-stage:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 4px;
  border-radius: 1.5rem;
}

/* One soft shadow under the whole solid instead of one per face. */
.study-stage::after {
  content: '';
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: -20px;
  height: 26px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  filter: blur(14px);
  z-index: -1;
}

.study-layer {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  will-change: transform;
}

.study-face,
.study-strip {
  position: absolute;
  top: 0;
  bottom: 0;
  background-color: #1e293b;
  background-image: linear-gradient(var(--tint, transparent), var(--tint, transparent));
  border-top: 2px solid var(--bc, #475569);
  border-bottom: 2px solid var(--bc, #475569);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.study-face {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  text-align: center;
}

.study-face-label {
  position: absolute;
  top: 1.1rem;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.875rem;
  color: #94a3b8;
}

.study-cap {
  position: absolute;
  left: 50%;
  top: 50%;
  background: #33445f;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
</style>