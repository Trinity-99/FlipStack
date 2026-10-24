import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Card } from '@/models/card'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'
import { Profile } from '@/models/profile'
import { Tag } from '@/models/tag'
import { useAuthStore } from '@/stores/authStore'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'

const createdAt = new Date('2026-01-01T00:00:00.000Z')
const userDecks = [
  new Deck('deck-newer', 'user-1', 'Newer', ['One', 'Two'], createdAt, createdAt),
  new Deck('deck-older', 'user-1', 'Older', ['One', 'Two'], new Date('2025-01-01'), createdAt),
]

describe('useDeckStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  function mockDeckData(): void {
    vi.spyOn(Direction, 'findAllForDeck').mockResolvedValue([])
    vi.spyOn(Tag, 'findAllForDeck').mockResolvedValue([])
    vi.spyOn(Card, 'findAllForDeck').mockResolvedValue([])
  }

  it('restores the saved active deck and loads its associated data', async () => {
    const profile = new Profile('user-1', createdAt, createdAt, 'deck-newer')
    const findAllForUser = vi.spyOn(Deck, 'findAllForUser').mockResolvedValue(userDecks)
    mockDeckData()
    const store = useDeckStore()
    const cardStore = useCardStore()

    await store.initialize(profile)

    expect(findAllForUser).toHaveBeenCalledWith('user-1')
    expect(store.activeDeckId).toBe('deck-newer')
    expect(Direction.findAllForDeck).toHaveBeenCalledWith('deck-newer')
    expect(Tag.findAllForDeck).toHaveBeenCalledWith('deck-newer')
    expect(cardStore.loadedDeckId).toBe('deck-newer')
  })

  it('uses the oldest deck if there is no saved active deck', async () => {
    vi.spyOn(Deck, 'findAllForUser').mockResolvedValue(userDecks)
    mockDeckData()
    const store = useDeckStore()

    await store.initialize(new Profile('user-1', createdAt, createdAt))

    expect(store.activeDeckId).toBe('deck-older')
  })

  it('keeps the current deck active when a switch fails', async () => {
    const profile = new Profile('user-1', createdAt, createdAt, 'deck-newer')
    const updatedProfile = new Profile('user-1', createdAt, createdAt, 'deck-newer')
    const authStore = useAuthStore()
    authStore.setAuthenticated(profile, {
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
    vi.spyOn(Deck, 'findAllForUser').mockResolvedValue(userDecks)
    mockDeckData()
    const store = useDeckStore()
    await store.initialize(profile)
    vi.spyOn(Direction, 'findAllForDeck').mockRejectedValue(new Error('Load failed'))
    vi.spyOn(profile, 'saveLastActiveDeck').mockResolvedValue(updatedProfile)

    await expect(store.selectActiveDeck('deck-older')).rejects.toThrow('Load failed')

    expect(store.activeDeckId).toBe('deck-newer')
    expect(authStore.profile).toBe(profile)
    expect(store.error).toContain('current deck is unchanged')
  })

  it('clears deck context for a user with no decks', async () => {
    vi.spyOn(Deck, 'findAllForUser').mockResolvedValue([])
    const store = useDeckStore()
    const cardStore = useCardStore()

    await store.initialize(new Profile('user-1', createdAt, createdAt))

    expect(store.decks).toEqual([])
    expect(store.activeDeckId).toBeNull()
    expect(store.directions).toEqual([])
    expect(store.tags).toEqual([])
    expect(cardStore.loadedDeckId).toBeNull()
  })

  it('adds a saved deck to its cache', () => {
    const store = useDeckStore()
    const newDeck = new Deck(
      'deck-created',
      'user-1',
      'New deck',
      ['Script', 'Meaning'],
      null,
      null,
    )

    store.upsertDeck(newDeck)

    expect(store.decks).toEqual([newDeck])
    expect(store.activeDeckId).toBeNull()
  })

  it('replaces an existing deck in its cache without changing other decks', () => {
    const store = useDeckStore()
    const unchangedDeck = userDecks[1]
    const updatedDeck = new Deck(
      'deck-newer',
      'user-1',
      'Updated',
      ['Script', 'Meaning'],
      null,
      null,
    )
    store.decks = userDecks
    store.activeDeckId = updatedDeck.id

    store.upsertDeck(updatedDeck)

    expect(store.decks).toEqual([updatedDeck, unchangedDeck])
    expect(store.activeDeck).toBe(updatedDeck)
  })

  it('rejects an unsaved deck', () => {
    const store = useDeckStore()
    const unsavedDeck = new Deck(null, 'user-1', 'New deck', ['Script', 'Meaning'], null, null)

    expect(() => store.upsertDeck(unsavedDeck)).toThrow(
      'Cannot add a deck to the cache before it has been saved.',
    )
  })

  it('retries initialization after deck data fails to load', async () => {
    const profile = new Profile('user-1', createdAt, createdAt, 'deck-newer')
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const findAllForUser = vi.spyOn(Deck, 'findAllForUser').mockResolvedValue(userDecks)
    vi.spyOn(Direction, 'findAllForDeck')
      .mockRejectedValueOnce(new Error('Temporary load failure'))
      .mockResolvedValue([])
    vi.spyOn(Tag, 'findAllForDeck').mockResolvedValue([])
    vi.spyOn(Card, 'findAllForDeck').mockResolvedValue([])
    const store = useDeckStore()

    await expect(store.initialize(profile)).rejects.toThrow('Temporary load failure')
    expect(store.error).toBe('Unable to load your decks. Please try again.')

    await store.retryLoad()

    expect(findAllForUser).toHaveBeenCalledTimes(2)
    expect(store.activeDeckId).toBe('deck-newer')
    expect(store.error).toBeNull()
  })
})
