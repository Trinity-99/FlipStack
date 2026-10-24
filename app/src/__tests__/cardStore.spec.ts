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
})
