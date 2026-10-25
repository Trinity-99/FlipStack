import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Card } from '@/models/card'
import { useCardStore } from '@/stores/cardStore'

describe('useCardStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('fetches cards without replacing the active card context', async () => {
    const store = useCardStore()
    const cards = [new Card('card-2', 'deck-2', 'user-1', { s1: 'front' }, [], null, null)]
    store.setCardsForDeck('deck-1', [])
    vi.spyOn(Card, 'findAllForDeck').mockResolvedValue(cards)

    await expect(store.fetchCardsForDeck('deck-2')).resolves.toBe(cards)

    expect(store.loadedDeckId).toBe('deck-1')
    expect(store.cards).toEqual([])
  })

  it('sets and clears cards with their deck identifier', () => {
    const store = useCardStore()
    const cards = [new Card('card-1', 'deck-1', 'user-1', { s1: 'front' }, [], null, null)]

    store.setCardsForDeck('deck-1', cards)
    expect(store.loadedDeckId).toBe('deck-1')
    expect(store.cards).toBe(cards)

    store.clear()
    expect(store.loadedDeckId).toBeNull()
    expect(store.cards).toEqual([])
  })

  it('adds a saved card to the beginning of the matching deck cache', () => {
    const store = useCardStore()
    const existingCard = new Card(
      'card-existing',
      'deck-1',
      'user-1',
      { s1: 'existing' },
      [],
      null,
      null,
    )
    const createdCard = new Card('card-new', 'deck-1', 'user-1', { s1: 'new' }, [], null, null)
    store.setCardsForDeck('deck-1', [existingCard])

    store.upsertCard(createdCard)

    expect(store.cards).toEqual([createdCard, existingCard])
  })

  it('replaces a saved card by ID without duplicating it', () => {
    const store = useCardStore()
    const oldCard = new Card('card-1', 'deck-1', 'user-1', { s1: 'old' }, [], null, null)
    const updatedCard = new Card('card-1', 'deck-1', 'user-1', { s1: 'updated' }, [], null, null)
    store.setCardsForDeck('deck-1', [oldCard])

    store.upsertCard(updatedCard)

    expect(store.cards).toEqual([updatedCard])
  })

  it('rejects an unsaved card', () => {
    const store = useCardStore()
    const unsavedCard = new Card(null, 'deck-1', 'user-1', { s1: 'front' }, [], null, null)

    expect(() => store.upsertCard(unsavedCard)).toThrow(
      'Cannot add a card to the cache before it has been saved.',
    )
  })

  it('does not change the cache when the card belongs to another deck', () => {
    const store = useCardStore()
    const cachedCard = new Card('card-1', 'deck-1', 'user-1', { s1: 'front' }, [], null, null)
    const otherDeckCard = new Card('card-2', 'deck-2', 'user-1', { s1: 'front' }, [], null, null)
    store.setCardsForDeck('deck-1', [cachedCard])

    store.upsertCard(otherDeckCard)

    expect(store.cards).toEqual([cachedCard])
    expect(store.loadedDeckId).toBe('deck-1')
  })
})
