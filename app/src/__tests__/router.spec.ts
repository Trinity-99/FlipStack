import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { Card } from '@/models/card'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'
import { Profile } from '@/models/profile'
import { Tag } from '@/models/tag'
import { useAuthStore } from '@/stores/authStore'
import { useDeckStore } from '@/stores/deckStore'
import { useCardStore } from '@/stores/cardStore'
import router from '@/router'

const createdAt = new Date('2026-01-01T00:00:00.000Z')
const session: Session = {
  access_token: 'access-token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'refresh-token',
  user: {
    id: 'user-1',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    aud: 'authenticated',
    created_at: createdAt.toISOString(),
  },
}
const deck = new Deck('deck-1', 'user-1', 'Deck', ['Term', 'Meaning'], createdAt, createdAt)

describe('startup router guard', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.spyOn(Profile, 'restoreAuthentication').mockResolvedValue(null)
    vi.spyOn(Deck, 'findAllForUser').mockResolvedValue([])
    vi.spyOn(Direction, 'findAllForDeck').mockResolvedValue([])
    vi.spyOn(Tag, 'findAllForDeck').mockResolvedValue([])
    vi.spyOn(Card, 'findAllForDeck').mockResolvedValue([])
    await router.push('/test')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function authenticate(): void {
    useAuthStore().setAuthenticated(new Profile('user-1', createdAt, createdAt), session)
  }

  it('redirects an unauthenticated user from a protected route to login', async () => {
    await router.push('/study/init')

    expect(router.currentRoute.value.name).toBe('Login')
    expect(Profile.restoreAuthentication).toHaveBeenCalledOnce()
  })

  it('keeps auth restoration failures on the login route with an error state', async () => {
    vi.mocked(Profile.restoreAuthentication).mockRejectedValue(new Error('Restore failed'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useAuthStore().hasRestoredAuthentication = false

    await router.push('/study/init')

    expect(router.currentRoute.value.name).toBe('Login')
    expect(useAuthStore().initializationError).toBe(
      'Unable to restore your session. Please sign in again.',
    )
  })

  it('routes an authenticated user with no decks to deck creation', async () => {
    authenticate()

    await router.push('/login')

    expect(router.currentRoute.value.name).toBe('DeckCreate')
    expect(Deck.findAllForUser).toHaveBeenCalledWith('user-1')
  })

  it('routes an authenticated user with an empty active deck to card creation', async () => {
    authenticate()
    vi.mocked(Deck.findAllForUser).mockResolvedValue([deck])

    await router.push('/cards')

    expect(router.currentRoute.value.name).toBe('CardCreate')
    expect(useCardStore().loadedDeckId).toBe('deck-1')
    expect(useCardStore().cards).toHaveLength(0)
  }, 10000)

  it('preserves a valid authenticated deep link when cards exist', async () => {
    authenticate()
    vi.mocked(Deck.findAllForUser).mockResolvedValue([deck])
    vi.mocked(Card.findAllForDeck).mockResolvedValue([
      new Card(
        'card-1',
        'deck-1',
        'user-1',
        { s1: 'Term', s2: 'Meaning' },
        [],
        createdAt,
        createdAt,
      ),
    ])

    await router.push('/cards')

    expect(router.currentRoute.value.name).toBe('CardList')
    expect(useCardStore().cards).toHaveLength(1)
  })

  it('uses the study launchpad for an authenticated startup with cards', async () => {
    authenticate()
    vi.mocked(Deck.findAllForUser).mockResolvedValue([deck])
    vi.mocked(Card.findAllForDeck).mockResolvedValue([
      new Card(
        'card-1',
        'deck-1',
        'user-1',
        { s1: 'Term', s2: 'Meaning' },
        [],
        createdAt,
        createdAt,
      ),
    ])

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('SessionStart')
  }, 10000)

  it('does not repeat deck and card queries for an initialized user', async () => {
    authenticate()
    vi.mocked(Deck.findAllForUser).mockResolvedValue([deck])
    vi.mocked(Card.findAllForDeck).mockResolvedValue([
      new Card(
        'card-1',
        'deck-1',
        'user-1',
        { s1: 'Term', s2: 'Meaning' },
        [],
        createdAt,
        createdAt,
      ),
    ])

    await router.push('/cards')
    await router.push('/study/init')

    expect(Deck.findAllForUser).toHaveBeenCalledOnce()
    expect(Card.findAllForDeck).toHaveBeenCalledOnce()
  })

  it('does not redirect to onboarding when deck initialization fails', async () => {
    authenticate()
    vi.mocked(Deck.findAllForUser).mockRejectedValue(new Error('Database unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await router.push('/study/init')

    expect(router.currentRoute.value.name).toBe('SessionStart')
    expect(useDeckStore().error).toBe('Unable to load your decks. Please try again.')
  })

  it('does not repeat a failed deck load during the startup redirect', async () => {
    authenticate()
    vi.mocked(Deck.findAllForUser).mockRejectedValue(new Error('Database unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await router.push('/login')

    expect(router.currentRoute.value.name).toBe('SessionStart')
    expect(Deck.findAllForUser).toHaveBeenCalledOnce()
  })
})
