import { shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { Card } from '@/models/card'

/**
 * @summary Stores cards loaded for the selected deck.
 */
export const useCardStore = defineStore('cards', () => {
  const cards = shallowRef<Card[]>([])
  const loadedDeckId = shallowRef<string | null>(null)

  /**
   * @summary Fetches cards for a deck without changing the currently committed deck state.
   * @param {string} deckId - The deck UUID to load.
   * @returns {Promise<Card[]>} The cards belonging to the deck.
   * @throws {Error} If the deck ID is invalid or loading fails.
   */
  async function fetchCardsForDeck(deckId: string): Promise<Card[]> {
    if (!deckId || deckId.trim() === '') {
      throw new Error('Invalid deckId provided to CardStore.fetchCardsForDeck.')
    }

    return Card.findAllForDeck(deckId)
  }

  /**
   * @summary Commits cards after all data for a deck has loaded successfully.
   * @param {string} deckId - The UUID of the deck associated with the cards.
   * @param {Card[]} deckCards - The loaded cards for the deck.
   * @returns {void}
   */
  function setCardsForDeck(deckId: string, deckCards: Card[]): void {
    if (!deckId || deckId.trim() === '') {
      throw new Error('Invalid deckId provided to CardStore.setCardsForDeck.')
    }
    cards.value = deckCards
    loadedDeckId.value = deckId
  }

  /**
   * @summary Clears cards when the active user or deck context is reset.
   * @returns {void}
   */
  function clear(): void {
    cards.value = []
    loadedDeckId.value = null
  }

  return { cards, loadedDeckId, fetchCardsForDeck, setCardsForDeck, clear }
})
