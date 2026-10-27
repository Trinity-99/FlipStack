import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Card } from '@/models/card'
import { CardProgress } from '@/models/cardProgress'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'
import { Profile } from '@/models/profile'
import { useAuthStore } from '@/stores/authStore'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'
import { useStudyStore } from '@/stores/studyStore'
import StudyView from '@/views/StudyView.vue'

interface PointerEventOptions {
  pointerId: number
  isPrimary: boolean
  clientX: number
  clientY: number
  timeStamp?: number
}

const createdAt = new Date('2026-01-01T00:00:00.000Z')
const deck = new Deck('deck-1', 'user-1', 'Language', ['Prompt', 'Answer'], createdAt, createdAt)
const direction = new Direction(
  'direction-1',
  'deck-1',
  [
    { side: 1, role: 'question' },
    { side: 2, role: 'answer' },
  ],
  createdAt,
)
const card = new Card(
  'card-1',
  'deck-1',
  'user-1',
  { s1: 'question text', s2: 'answer text' },
  [],
  createdAt,
  createdAt,
)
let pinia: ReturnType<typeof createPinia>

describe('StudyView', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.restoreAllMocks()

    const profile = new Profile('user-1', createdAt, createdAt)
    useAuthStore().setProfile(profile)
    vi.spyOn(profile, 'saveDeckPreference').mockResolvedValue(profile)

    const deckStore = useDeckStore()
    deckStore.decks = [deck]
    deckStore.activeDeckId = 'deck-1'
    deckStore.directions = [direction]
    deckStore.tags = []
    useCardStore().setCardsForDeck('deck-1', [card])
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function mountStudyView(progressRecords: CardProgress[] = [], prepareSession = true) {
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue(progressRecords)
    const studyStore = useStudyStore()
    if (prepareSession) await studyStore.startSession(null, direction)

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/study', name: 'Study', component: StudyView },
        {
          path: '/study/init',
          name: 'SessionStart',
          component: { template: '<p>Session setup</p>' },
        },
      ],
    })
    await router.push({ name: 'Study' })
    await router.isReady()
    const wrapper = mount(StudyView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    return { wrapper, router, studyStore }
  }

  it('renders the active card and advances through sides with tap and buttons', async () => {
    const { wrapper } = await mountStudyView()

    expect(wrapper.text()).toContain('question text')
    expect(wrapper.text()).toContain('Prompt · Question')
    expect(wrapper.text()).toContain('Side 1 of 2')

    await wrapper.get('.study-card').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Side 2 of 2'))
    expect(wrapper.text()).toContain('answer text')

    await wrapper.get('[aria-label="Previous side"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Side 1 of 2'))
  })

  it('shows completion after the last card reaches score ten', async () => {
    const masteredSoon = new CardProgress(
      'progress-1',
      'user-1',
      'card-1',
      'direction-1',
      9,
      createdAt,
    )
    vi.spyOn(CardProgress.prototype, 'save').mockResolvedValue()
    const { wrapper, router } = await mountStudyView([masteredSoon])

    const gotItButton = wrapper.findAll('button').find((button) => button.text().includes('Got It'))
    if (!gotItButton) throw new Error('Expected the Got It control.')
    await gotItButton.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Congratulations!'))

    expect(wrapper.text()).toContain('You mastered 1 card on Whole Deck')
    const startButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Start New Session'))
    if (!startButton) throw new Error('Expected the new-session control.')
    await startButton.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('SessionStart'))
  })

  it('uses horizontal pointer movement to turn sides', async () => {
    const { wrapper } = await mountStudyView()
    const studyCard = wrapper.get('button.study-card').element

    dispatchPointerEvent(studyCard, 'pointerdown', {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    })
    dispatchPointerEvent(studyCard, 'pointermove', {
      pointerId: 1,
      isPrimary: true,
      clientX: 170,
      clientY: 140,
    })
    dispatchPointerEvent(studyCard, 'pointerup', {
      pointerId: 1,
      isPrimary: true,
      clientX: 170,
      clientY: 140,
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('Side 2 of 2'))
  })

  it('uses a vertical pointer swipe to rate the current card', async () => {
    const { wrapper } = await mountStudyView()
    const studyCard = wrapper.get('button.study-card').element

    dispatchPointerEvent(studyCard, 'pointerdown', {
      pointerId: 2,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    })
    dispatchPointerEvent(studyCard, 'pointermove', {
      pointerId: 2,
      isPrimary: true,
      clientX: 110,
      clientY: 80,
    })
    dispatchPointerEvent(studyCard, 'pointerup', {
      pointerId: 2,
      isPrimary: true,
      clientX: 110,
      clientY: 80,
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('1 / 10'))
  })

  it('uses a fast vertical flick shorter than the normal swipe threshold to rate the card', async () => {
    const { wrapper } = await mountStudyView()
    const studyCard = wrapper.get('button.study-card').element

    dispatchPointerEvent(studyCard, 'pointerdown', {
      pointerId: 3,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
      timeStamp: 100,
    })
    dispatchPointerEvent(studyCard, 'pointerup', {
      pointerId: 3,
      isPrimary: true,
      clientX: 110,
      clientY: 150,
      timeStamp: 150,
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('1 / 10'))
  })

  it('does not rate a slow vertical gesture shorter than the normal swipe threshold', async () => {
    const { wrapper } = await mountStudyView()
    const studyCard = wrapper.get('button.study-card').element

    dispatchPointerEvent(studyCard, 'pointerdown', {
      pointerId: 4,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
      timeStamp: 100,
    })
    dispatchPointerEvent(studyCard, 'pointerup', {
      pointerId: 4,
      isPrimary: true,
      clientX: 110,
      clientY: 150,
      timeStamp: 300,
    })

    expect(wrapper.text()).toContain('Card score')
    expect(wrapper.text()).toContain('0 / 10')
  })

  it('returns to session setup when the user exits study', async () => {
    const { wrapper, router } = await mountStudyView()

    await wrapper.get('[aria-label="Exit study session"]').trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('SessionStart'))
  })

  it('returns to session setup without logging when opened without a prepared session', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { router } = await mountStudyView([], false)

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('SessionStart'))
    expect(logError).not.toHaveBeenCalled()
  })
})

function dispatchPointerEvent(
  target: Element,
  eventName: string,
  options: PointerEventOptions,
): void {
  const event = new Event(eventName, { bubbles: true })
  const { timeStamp, ...eventOptions } = options
  Object.assign(event, eventOptions)
  if (timeStamp !== undefined) {
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  }
  target.dispatchEvent(event)
}
