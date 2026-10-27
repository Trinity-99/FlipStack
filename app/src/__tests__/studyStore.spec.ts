import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Card } from '@/models/card'
import { CardProgress } from '@/models/cardProgress'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'
import { Profile } from '@/models/profile'
import { Tag } from '@/models/tag'
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
const eligibleCard = new Card(
  'card-1',
  'deck-1',
  'user-1',
  { s1: 'word', s2: 'translation' },
  ['tag-1'],
  createdAt,
  createdAt,
)

describe('useStudyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()

    const profile = new Profile('user-1', createdAt, createdAt)
    vi.spyOn(profile, 'saveDeckPreference').mockResolvedValue(profile)
    useAuthStore().setAuthenticated(profile, {
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
    })
    const deckStore = useDeckStore()
    deckStore.decks = [deck]
    deckStore.activeDeckId = 'deck-1'
    deckStore.tags = [new Tag('tag-1', 'deck-1', 'Grammar', createdAt)]
    deckStore.directions = [direction]
    useCardStore().setCardsForDeck('deck-1', [eligibleCard])
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue([])
  })

  it('loads progress and calculates the current topic summary', async () => {
    const progress = [
      new CardProgress('progress-1', 'user-1', 'card-1', 'direction-1', 10, createdAt),
    ]
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue(progress)
    const store = useStudyStore()

    await store.loadPoolSummary('tag-1', direction)

    expect(CardProgress.findAllForUserAndDirection).toHaveBeenCalledWith('user-1', 'direction-1')
    expect(store.poolSummary).toMatchObject({
      eligibleCount: 1,
      cardsToLearnCount: 0,
      isMastered: true,
    })
    expect(store.progressRecords).toEqual(progress)
    expect(store.sessionPool).toEqual([])
  })

  it('uses no saved progress for an unsaved temporary direction', async () => {
    const temporaryDirection = new Direction(
      null,
      'deck-1',
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
      ],
      null,
    )
    const loadProgress = vi.spyOn(CardProgress, 'findAllForUserAndDirection')
    const store = useStudyStore()

    await store.loadPoolSummary(null, temporaryDirection)

    expect(loadProgress).not.toHaveBeenCalled()
    expect(store.sessionPool).toEqual([eligibleCard])
  })

  it('saves a temporary direction and preference only when starting', async () => {
    const temporaryDirection = new Direction(
      null,
      'deck-1',
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
      ],
      null,
    )
    const saveDirection = vi.spyOn(Direction.prototype, 'save').mockImplementation(async function (
      this: Direction,
    ): Promise<void> {
      Object.assign(this, { id: 'direction-created', createdAt })
    })
    const profile = useAuthStore().profile
    if (!profile) throw new Error('Expected an authenticated profile.')
    const updatedProfile = new Profile('user-1', createdAt, createdAt)
    const savePreference = vi.spyOn(profile, 'saveDeckPreference').mockResolvedValue(updatedProfile)
    const setProfile = vi.spyOn(useAuthStore(), 'setProfile')
    const store = useStudyStore()

    expect(saveDirection).not.toHaveBeenCalled()
    await store.startSession('tag-1', temporaryDirection)

    expect(saveDirection).toHaveBeenCalledOnce()
    expect(useDeckStore().directions).toContain(temporaryDirection)
    expect(savePreference).toHaveBeenCalledWith({
      deckId: 'deck-1',
      lastSelectedDirectionId: 'direction-created',
      lastSelectedTagId: 'tag-1',
    })
    expect(setProfile).toHaveBeenCalledWith(updatedProfile)
    expect(store.sessionPool).toEqual([eligibleCard])
  })

  it('does not start a session when every eligible card is mastered', async () => {
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockResolvedValue([
      new CardProgress('progress-1', 'user-1', 'card-1', 'direction-1', 10, createdAt),
    ])
    const profile = useAuthStore().profile
    if (!profile) throw new Error('Expected an authenticated profile.')
    const savePreference = vi.spyOn(profile, 'saveDeckPreference')

    await expect(useStudyStore().startSession(null, direction)).rejects.toThrow(
      'There are no cards left to learn',
    )
    expect(savePreference).not.toHaveBeenCalled()
  })

  it('resets mastery and refreshes the summary', async () => {
    const reset = vi.spyOn(CardProgress, 'resetForUserCardsAndDirection').mockResolvedValue()
    const store = useStudyStore()

    await store.resetMastery('tag-1', direction)

    expect(reset).toHaveBeenCalledWith('user-1', ['card-1'], 'direction-1')
    expect(CardProgress.findAllForUserAndDirection).toHaveBeenCalled()
    expect(store.poolSummary?.cardsToLearnCount).toBe(1)
  })

  it('exposes progress loading failures instead of returning an empty summary', async () => {
    vi.spyOn(CardProgress, 'findAllForUserAndDirection').mockRejectedValue(
      new Error('database unavailable'),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useStudyStore()

    await expect(store.loadPoolSummary(null, direction)).rejects.toThrow('database unavailable')
    expect(store.poolSummary).toBeNull()
    expect(store.error).toContain('Unable to calculate')
  })

  it('blocks session preparation when preference persistence fails', async () => {
    const profile = useAuthStore().profile
    if (!profile) throw new Error('Expected an authenticated profile.')
    vi.spyOn(profile, 'saveDeckPreference').mockRejectedValue(new Error('preference write failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useStudyStore()

    await expect(store.startSession('tag-1', direction)).rejects.toThrow('preference write failed')

    expect(store.sessionPool).toEqual([])
    expect(store.error).toContain('Unable to start studying')
  })

  it('publishes the engine rating immediately without surfacing a save failure', async () => {
    const store = useStudyStore()
    await store.startSession('tag-1', direction)
    store.startActiveSession()
    vi.spyOn(CardProgress.prototype, 'save').mockRejectedValue(new Error('network unavailable'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    store.rateCurrentCard('got-it')
    await vi.waitFor(() => expect(log).toHaveBeenCalled())

    expect(store.progressRecords[0]?.counter).toBe(1)
    expect(store.activeSession?.currentCard).toBe(eligibleCard)
    expect(store.error).toBeNull()
  })
})
