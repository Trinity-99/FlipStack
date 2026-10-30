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

  it('adds a saved direction to the active deck cache', () => {
    const store = useDeckStore()
    store.activeDeckId = 'deck-newer'
    const direction = new Direction(
      'direction-1',
      'deck-newer',
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
      ],
      createdAt,
    )

    store.upsertDirection(direction)

    expect(store.directions).toEqual([direction])
  })

  it('replaces a saved direction by ID', () => {
    const store = useDeckStore()
    store.activeDeckId = 'deck-newer'
    const oldDirection = new Direction(
      'direction-1',
      'deck-newer',
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
      ],
      createdAt,
    )
    const updatedDirection = new Direction(
      'direction-1',
      'deck-newer',
      [
        { side: 2, role: 'question' },
        { side: 1, role: 'answer' },
      ],
      createdAt,
    )
    store.directions = [oldDirection]

    store.upsertDirection(updatedDirection)

    expect(store.directions).toEqual([updatedDirection])
  })

  it('rejects unsaved and non-active-deck directions', () => {
    const store = useDeckStore()
    store.activeDeckId = 'deck-newer'
    const unsavedDirection = new Direction(
      null,
      'deck-newer',
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
      ],
      null,
    )
    const otherDeckDirection = new Direction(
      'direction-2',
      'deck-older',
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
      ],
      createdAt,
    )

    expect(() => store.upsertDirection(unsavedDirection)).toThrow(
      'Cannot add a direction to the cache before it has been saved.',
    )
    expect(() => store.upsertDirection(otherDeckDirection)).toThrow(
      'does not belong to the active deck',
    )
  })

  it('creates a tag for the active deck and keeps the cache alphabetized', async () => {
    const store = useDeckStore()
    store.decks = userDecks
    store.activeDeckId = 'deck-newer'
    store.tags = [new Tag('tag-existing', 'deck-newer', 'Vocabulary', createdAt)]
    const save = vi.spyOn(Tag.prototype, 'save').mockImplementation(async function (
      this: Tag,
    ): Promise<void> {
      Object.assign(this, { id: 'tag-created', createdAt })
    })

    const created = await store.createTag('  Grammar  ')

    expect(save).toHaveBeenCalledOnce()
    expect(created.name).toBe('Grammar')
    expect(created.deckId).toBe('deck-newer')
    expect(created.id).toBe('tag-created')
    expect(store.tags.map((tag) => tag.name)).toEqual(['Grammar', 'Vocabulary'])
  })

  it('returns an existing exact-name tag without inserting a duplicate', async () => {
    const store = useDeckStore()
    store.decks = userDecks
    store.activeDeckId = 'deck-newer'
    const existingTag = new Tag('tag-existing', 'deck-newer', 'Grammar', createdAt)
    store.tags = [existingTag]
    const save = vi.spyOn(Tag.prototype, 'save')

    await expect(store.createTag(' Grammar ')).resolves.toBe(existingTag)

    expect(save).not.toHaveBeenCalled()
    expect(store.tags).toEqual([existingTag])
  })

  it('replaces a cached tag with the same ID', () => {
    const store = useDeckStore()
    store.activeDeckId = 'deck-newer'
    const existingTag = new Tag('tag-1', 'deck-newer', 'Old name', createdAt)
    const updatedTag = new Tag('tag-1', 'deck-newer', 'New name', createdAt)
    store.tags = [existingTag]

    store.upsertTag(updatedTag)

    expect(store.tags).toEqual([updatedTag])
  })

  it('rejects tag creation without an active deck or a non-empty name', async () => {
    const store = useDeckStore()

    await expect(store.createTag('Grammar')).rejects.toThrow('loaded active deck')

    store.decks = userDecks
    store.activeDeckId = 'deck-newer'
    await expect(store.createTag('  ')).rejects.toThrow('Tag name cannot be empty.')
  })

  it('rejects unsaved and non-active-deck tags from the cache', () => {
    const store = useDeckStore()
    store.activeDeckId = 'deck-newer'
    const unsavedTag = new Tag(null, 'deck-newer', 'Grammar', null)
    const otherDeckTag = new Tag('tag-other', 'deck-older', 'Grammar', createdAt)

    expect(() => store.upsertTag(unsavedTag)).toThrow(
      'Cannot add a tag to the cache before it has been saved.',
    )
    expect(() => store.upsertTag(otherDeckTag)).toThrow(
      'does not belong to the active deck',
    )
  })

  it('leaves the tag cache unchanged and rethrows when persistence fails', async () => {
    const store = useDeckStore()
    store.decks = userDecks
    store.activeDeckId = 'deck-newer'
    const existingTag = new Tag('tag-existing', 'deck-newer', 'Vocabulary', createdAt)
    store.tags = [existingTag]
    vi.spyOn(Tag.prototype, 'save').mockRejectedValue(new Error('Database unavailable'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(store.createTag('Grammar')).rejects.toThrow('Database unavailable')

    expect(store.tags).toEqual([existingTag])
    expect(log).toHaveBeenCalledOnce()
  })

  it('does not add a created tag to the cache after the active deck changes', async () => {
    const store = useDeckStore()
    store.decks = userDecks
    store.activeDeckId = 'deck-newer'
    const otherDeckTag = new Tag('tag-older', 'deck-older', 'Older tag', createdAt)
    let resolveSaving: (value: void | PromiseLike<void>) => void = () => {}
    const saving = new Promise<void>((resolve) => {
      resolveSaving = resolve
    })
    vi.spyOn(Tag.prototype, 'save').mockImplementation(async function (
      this: Tag,
    ): Promise<void> {
      await saving
      Object.assign(this, { id: 'tag-created', createdAt })
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const creation = store.createTag('Grammar')
    store.activeDeckId = 'deck-older'
    store.tags = [otherDeckTag]
    resolveSaving()

    await expect(creation).rejects.toThrow('active deck changed')

    expect(store.tags).toEqual([otherDeckTag])
    expect(log).toHaveBeenCalledOnce()
  })

  it('creates a direction and updates the active deck cache after saving', async () => {
    const store = useDeckStore()
    store.decks = [userDecks[0]!]
    store.activeDeckId = 'deck-newer'
    const save = vi.spyOn(Direction.prototype, 'save').mockImplementation(async function (
      this: Direction,
    ): Promise<void> {
      Object.assign(this, { id: 'direction-new', createdAt })
    })

    const created = await store.createDirection([
      { side: 1, role: 'question' },
      { side: 2, role: 'answer' },
    ])

    expect(save).toHaveBeenCalledOnce()
    expect(created.id).toBe('direction-new')
    expect(store.directions).toEqual([created])
  })

  it('leaves the direction cache unchanged when creation fails', async () => {
    const store = useDeckStore()
    store.decks = [userDecks[0]!]
    store.activeDeckId = 'deck-newer'
    const existing = new Direction(
      'direction-existing',
      'deck-newer',
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
      ],
      createdAt,
    )
    store.directions = [existing]
    const save = vi.spyOn(Direction.prototype, 'save')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      store.createDirection([
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
      ]),
    ).rejects.toThrow('This direction already exists')

    expect(save).not.toHaveBeenCalled()
    expect(store.directions).toEqual([existing])
    expect(log).toHaveBeenCalledOnce()
  })

  it('requires an active deck before creating a direction', async () => {
    const store = useDeckStore()

    await expect(
      store.createDirection([
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
      ]),
    ).rejects.toThrow('loaded active deck')
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
