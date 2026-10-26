import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Card } from '@/models/card'
import { CardProgress } from '@/models/cardProgress'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'
import { Profile } from '@/models/profile'
import { Tag } from '@/models/tag'
import StudyInitView from '@/views/StudyInitView.vue'
import { useAuthStore } from '@/stores/authStore'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'
import { useStudyStore } from '@/stores/studyStore'

const createdAt = new Date('2026-01-01T00:00:00.000Z')
const deck = new Deck('deck-1', 'user-1', 'Language', ['Script', 'Meaning'], createdAt, createdAt)
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
  { s1: 'word', s2: 'translation' },
  ['tag-1'],
  createdAt,
  createdAt,
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/study/init', name: 'SessionStart', component: StudyInitView },
    { path: '/study', name: 'Study', component: { template: '<div>Study</div>' } },
    { path: '/decks/new', name: 'DeckCreate', component: { template: '<div>Create deck</div>' } },
  ],
})

describe('StudyInitView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()

    const preference = {
      deckId: 'deck-1',
      lastSelectedDirectionId: 'direction-1',
      lastSelectedTagId: 'tag-1',
    }
    useAuthStore().setAuthenticated(
      new Profile('user-1', createdAt, createdAt, null, new Map([['deck-1', preference]])),
      {
        access_token: 'token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'refresh',
        user: {
          id: 'user-1',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          aud: 'authenticated',
          created_at: createdAt.toISOString(),
        },
      },
    )
    const deckStore = useDeckStore()
    deckStore.decks = [deck]
    deckStore.activeDeckId = 'deck-1'
    deckStore.tags = [new Tag('tag-1', 'deck-1', 'Grammar', createdAt)]
    deckStore.directions = [direction]
    useCardStore().setCardsForDeck('deck-1', [card])
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue([])
    await router.push('/study/init')
    await router.isReady()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountView() {
    return mount(StudyInitView, { global: { plugins: [router] } })
  }

  it('restores valid preferences and shows live study counts', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get<HTMLSelectElement>('[aria-label="Study topic"]').element.value).toBe('tag-1')
    expect(wrapper.get<HTMLSelectElement>('[aria-label="Study direction"]').element.value).toBe(
      'direction-1',
    )
    expect(wrapper.text()).toContain('Script - Meaning')
    expect(wrapper.text()).toContain('1/1')
  })

  it('falls back to Whole Deck and the first direction for stale preferences', async () => {
    const profile = useAuthStore().profile
    if (!profile) throw new Error('Expected an authenticated profile.')
    useAuthStore().setProfile(
      new Profile(
        profile.id,
        profile.createdAt,
        profile.updatedAt,
        null,
        new Map([
          [
            'deck-1',
            {
              deckId: 'deck-1',
              lastSelectedDirectionId: 'missing-direction',
              lastSelectedTagId: 'missing-tag',
            },
          ],
        ]),
      ),
    )
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get<HTMLSelectElement>('[aria-label="Study topic"]').element.value).toBe('')
    expect(wrapper.get<HTMLSelectElement>('[aria-label="Study direction"]').element.value).toBe(
      'direction-1',
    )
  })

  it('updates the eligible count when the selected topic changes', async () => {
    useCardStore().setCardsForDeck('deck-1', [
      card,
      new Card(
        'card-2',
        'deck-1',
        'user-1',
        { s1: 'untagged', s2: 'translation' },
        [],
        createdAt,
        createdAt,
      ),
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('1/1')
    await wrapper.get('[aria-label="Study topic"]').setValue('')
    await flushPromises()

    expect(wrapper.text()).toContain('2/2')
  })

  it('shows an explanatory state and disables Start when no cards are eligible', async () => {
    useCardStore().setCardsForDeck('deck-1', [
      new Card(
        'card-incomplete',
        'deck-1',
        'user-1',
        { s1: 'missing answer' },
        [],
        createdAt,
        createdAt,
      ),
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No cards in this topic have all required sides')
    expect(wrapper.find('.feedback-banner').classes()).toContain('bg-amber-950/95')
    expect(wrapper.get('[role="alert"]').attributes('aria-live')).toBe('assertive')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('All cards in this topic are mastered!')
  })

  it('shows the mastered banner and resets only after explicit confirmation', async () => {
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue([
      new CardProgress('progress-1', 'user-1', 'card-1', 'direction-1', 10, createdAt),
    ])
    const reset = vi.spyOn(useStudyStore(), 'resetMastery').mockResolvedValue()
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('All cards in this topic are mastered!')
    expect(wrapper.find('.feedback-banner').classes()).toContain('bg-emerald-950/95')
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(reset).not.toHaveBeenCalled()

    await wrapper.get('[role="dialog"] button:last-child').trigger('click')
    await flushPromises()

    expect(reset).toHaveBeenCalledWith('tag-1', direction)
  })

  it('cancels mastery reset without changing progress', async () => {
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue([
      new CardProgress('progress-1', 'user-1', 'card-1', 'direction-1', 10, createdAt),
    ])
    const reset = vi.spyOn(useStudyStore(), 'resetMastery').mockResolvedValue()
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('button').trigger('click')
    await wrapper.get('[role="dialog"] button:first-child').trigger('click')

    expect(reset).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('navigates to active study only after session preparation succeeds', async () => {
    const wrapper = mountView()
    await flushPromises()
    vi.spyOn(useStudyStore(), 'startSession').mockResolvedValue(direction)

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(useStudyStore().startSession).toHaveBeenCalledWith('tag-1', direction)
    expect(router.currentRoute.value.name).toBe('Study')
  })

  it('does not navigate to active study when preparation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountView()
    await flushPromises()
    vi.spyOn(useStudyStore(), 'startSession').mockRejectedValue(new Error('save failed'))

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('SessionStart')
  })

  it('navigates to deck creation when no active deck exists', async () => {
    useDeckStore().activeDeckId = null
    const wrapper = mountView()
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('DeckCreate')
    wrapper.unmount()
  })

  it('shows deck loading failures through the shared feedback banner', async () => {
    const deckStore = useDeckStore()
    deckStore.activeDeckId = null
    deckStore.error = 'Unable to load your decks. Please try again.'
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('.feedback-banner').text()).toBe(
      'Your deck could not be loaded. Please try again.',
    )
    expect(wrapper.get('[role="alert"]').attributes('aria-live')).toBe('assertive')
  })

  it('uses a temporary default direction when the deck has none', async () => {
    useDeckStore().directions = []
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get<HTMLSelectElement>('[aria-label="Study direction"]').element.value).toBe(
      'temporary-default',
    )
    expect(wrapper.text()).toContain('Script - Meaning')
    expect(wrapper.text()).toContain('(default)')
  })
})
