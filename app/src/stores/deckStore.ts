import { computed, shallowRef, ref } from 'vue'
import { defineStore } from 'pinia'
import { Card } from '@/models/card'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'
import { Profile } from '@/models/profile'
import { Tag } from '@/models/tag'
import { useAuthStore } from '@/stores/authStore'
import { useCardStore } from '@/stores/cardStore'

interface ActiveDeckData {
  directions: Direction[]
  tags: Tag[]
  cards: Card[]
}

/**
 * @summary Coordinates the user's decks and data associated with the active deck.
 */
export const useDeckStore = defineStore('decks', () => {
  const authStore = useAuthStore()
  const cardStore = useCardStore()
  const decks = shallowRef<Deck[]>([])
  const activeDeckId = ref<string | null>(null)
  const directions = shallowRef<Direction[]>([])
  const tags = shallowRef<Tag[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const activeDeck = computed(
    () => decks.value.find((deck) => deck.id === activeDeckId.value) ?? null,
  )
  const activeDeckPreference = computed(() =>
    activeDeckId.value ? (authStore.profile?.getDeckPreference(activeDeckId.value) ?? null) : null,
  )

  let initializedUserId: string | null = null
  let contextUserId: string | null = null

  function clearDeckContext(): void {
    decks.value = []
    activeDeckId.value = null
    directions.value = []
    tags.value = []
    cardStore.clear()
  }

  function commitActiveDeckData(deckId: string, data: ActiveDeckData): void {
    directions.value = data.directions
    tags.value = data.tags
    cardStore.setCardsForDeck(deckId, data.cards)
    activeDeckId.value = deckId
  }

  /**
   * @summary Loads a user's decks and resolves the initial active deck.
   * @param {Profile} profile - The authenticated user's profile and preferences.
   * @returns {Promise<void>} A promise that resolves when the initial deck context is loaded.
   * @throws {Error} If the deck list or active deck data cannot be loaded.
   */
  async function initialize(profile: Profile): Promise<void> {
    if (initializedUserId === profile.id) return

    if (contextUserId !== profile.id) {
      clearDeckContext()
      initializedUserId = null
      contextUserId = profile.id
    }

    isLoading.value = true
    error.value = null

    try {
      const userDecks = await Deck.findAllForUser(profile.id)
      decks.value = userDecks

      if (userDecks.length === 0) {
        clearDeckContext()
        decks.value = userDecks
        initializedUserId = profile.id
        return
      }

      const savedDeck = userDecks.find((deck) => deck.id === profile.lastActiveDeckId)
      const fallbackDeck = [...userDecks].sort((first, second) => {
        const firstCreatedAt = first.createdAt?.getTime() ?? Number.POSITIVE_INFINITY
        const secondCreatedAt = second.createdAt?.getTime() ?? Number.POSITIVE_INFINITY
        return firstCreatedAt - secondCreatedAt
      })[0]
      const selectedDeck = savedDeck ?? fallbackDeck

      if (!selectedDeck?.id) {
        throw new Error('Unable to resolve an active deck from the user deck list.')
      }

      const activeData = await loadActiveDeckData(selectedDeck.id)
      commitActiveDeckData(selectedDeck.id, activeData)
      initializedUserId = profile.id
    } catch (loadError: unknown) {
      error.value = 'Unable to load your decks. Please try again.'
      console.error(`DeckStore.initialize failed for user ${profile.id}:`, loadError)
      throw loadError
    } finally {
      isLoading.value = false
    }
  }

  /**
   * @summary Loads all deck-scoped data without changing the currently active context.
   * @param {string} deckId - The UUID of the deck to load.
   * @returns {Promise<ActiveDeckData>} Directions, tags, and cards for the deck.
   * @throws {Error} If any deck-scoped data cannot be loaded.
   */
  async function loadActiveDeckData(deckId: string): Promise<ActiveDeckData> {
    if (!deckId || deckId.trim() === '') {
      throw new Error('Invalid deckId provided to DeckStore.loadActiveDeckData.')
    }

    const [deckDirections, deckTags, deckCards] = await Promise.all([
      Direction.findAllForDeck(deckId),
      Tag.findAllForDeck(deckId),
      cardStore.fetchCardsForDeck(deckId),
    ])

    return { directions: deckDirections, tags: deckTags, cards: deckCards }
  }

  /**
   * @summary Adds a saved deck to the cache or replaces its existing entry.
   * @param {Deck} deck - The persisted deck to synchronize with the cache.
   * @returns {void}
   * @throws {Error} If the deck has not been persisted.
   */
  function upsertDeck(deck: Deck): void {
    if (!deck.id) {
      throw new Error('Cannot add a deck to the cache before it has been saved.')
    }

    const existingIndex = decks.value.findIndex((cachedDeck) => cachedDeck.id === deck.id)
    if (existingIndex === -1) {
      decks.value = [...decks.value, deck]
      return
    }

    decks.value = decks.value.map((cachedDeck, index) =>
      index === existingIndex ? deck : cachedDeck,
    )
  }

  /**
   * @summary Switches the active deck after its data and saved preference load successfully.
   * @param {string} deckId - The UUID of the deck to activate.
   * @returns {Promise<void>} A promise that resolves when the deck is active.
   * @throws {Error} If the deck is unavailable or its data cannot be loaded.
   */
  async function selectActiveDeck(deckId: string): Promise<void> {
    if (!deckId || deckId.trim() === '') {
      throw new Error('Invalid deckId provided to DeckStore.selectActiveDeck.')
    }
    if (isLoading.value) {
      throw new Error('Cannot switch decks while another deck operation is in progress.')
    }
    if (activeDeckId.value === deckId) return

    const profile = authStore.profile
    if (!profile) {
      throw new Error('Cannot switch decks without an authenticated profile.')
    }

    const selectedDeck = decks.value.find((deck) => deck.id === deckId)
    if (!selectedDeck || selectedDeck.userId !== profile.id) {
      throw new Error(`Deck ${deckId} is not available for the authenticated user.`)
    }

    isLoading.value = true
    error.value = null

    try {
      const activeData = await loadActiveDeckData(deckId)
      const updatedProfile = await profile.saveLastActiveDeck(deckId)

      authStore.setProfile(updatedProfile)
      commitActiveDeckData(deckId, activeData)
    } catch (switchError: unknown) {
      error.value = 'Unable to switch decks. Your current deck is unchanged.'
      console.error(`DeckStore.selectActiveDeck failed for deck ${deckId}:`, switchError)
      throw switchError
    } finally {
      isLoading.value = false
    }
  }

  /**
   * @summary Retries loading the authenticated user's active deck context.
   * @returns {Promise<void>} A promise that resolves after deck data is reloaded.
   * @throws {Error} If there is no authenticated profile or reloading fails.
   */
  async function retryLoad(): Promise<void> {
    const profile = authStore.profile
    if (!profile) {
      throw new Error('Cannot reload decks without an authenticated profile.')
    }

    initializedUserId = null
    await initialize(profile)
  }

  return {
    decks,
    activeDeckId,
    activeDeck,
    activeDeckPreference,
    directions,
    tags,
    isLoading,
    error,
    initialize,
    selectActiveDeck,
    loadActiveDeckData,
    upsertDeck,
    retryLoad,
  }
})
