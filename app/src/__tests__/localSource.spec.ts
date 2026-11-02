import { beforeEach, describe, expect, it } from 'vitest'
import { LocalSource } from '@/data/localSource'
import type { DeckRow, DeckSyncData, ProgressRow, SyncUnit } from '@/data/dataTypes'

const createdAt = '2026-01-01T00:00:00.000Z'
const profile = {
  id: 'user-1',
  created_at: createdAt,
  updated_at: createdAt,
  last_active_deck_id: 'deck-1',
}
const deck: DeckRow = {
  id: 'deck-1',
  user_id: 'user-1',
  title: 'Deck',
  side_labels: ['Term', 'Meaning'],
  created_at: createdAt,
  updated_at: createdAt,
}
const localSource = new LocalSource()

describe('LocalSource', () => {
  beforeEach(async () => {
    await localSource.open()
    await localSource.clear()
  })

  it('creates local progress IDs and preserves pending progress over a downloaded collision', async () => {
    const remoteProgress: ProgressRow = {
      id: 'server-progress',
      user_id: 'user-1',
      card_id: 'card-1',
      direction_id: 'direction-1',
      counter: 1,
      last_updated: createdAt,
    }
    const deckData: DeckRow & DeckSyncData = {
      ...deck,
      cards: [],
      tags: [],
      directions: [
        {
          id: 'direction-1',
          deck_id: 'deck-1',
          configuration: [
            { side: 1, role: 'question' },
            { side: 2, role: 'answer' },
          ],
          created_at: createdAt,
        },
      ],
      progress: [],
    }
    const syncUnit: SyncUnit = {
      global: { profile, preferences: [], decks: [deck] },
      deck: deckData,
    }
    await localSource.replaceSyncUnit(syncUnit)

    const pending = await localSource.saveProgress({
      ...remoteProgress,
      id: '',
      counter: 4,
      last_updated: '2026-01-02T00:00:00.000Z',
    })

    expect(pending.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(pending.pending).toBe(1)

    await localSource.replaceSyncUnit({
      ...syncUnit,
      deck: { ...deckData, progress: [remoteProgress] },
    })
    const stored = await localSource.findProgressForUserCardAndDirection(
      'user-1',
      'card-1',
      'direction-1',
    )

    expect(stored).toMatchObject({
      id: pending.id,
      counter: 4,
      last_updated: '2026-01-02T00:00:00.000Z',
    })
  })

  it('cascades deck deletion through mirrored content, progress, preferences, and profile', async () => {
    const preference = {
      user_id: 'user-1',
      deck_id: 'deck-1',
      last_selected_direction_id: 'direction-1',
      last_selected_tag_id: 'tag-1',
      updated_at: createdAt,
    }
    await localSource.replaceSyncUnit({
      global: { profile, preferences: [preference], decks: [deck] },
      deck: {
        ...deck,
        cards: [
          {
            id: 'card-1',
            deck_id: 'deck-1',
            user_id: 'user-1',
            content: { s1: 'Term', s2: 'Meaning' },
            tag_ids: ['tag-1'],
            created_at: createdAt,
            updated_at: createdAt,
          },
        ],
        tags: [{ id: 'tag-1', deck_id: 'deck-1', name: 'Topic', created_at: createdAt }],
        directions: [
          {
            id: 'direction-1',
            deck_id: 'deck-1',
            configuration: [
              { side: 1, role: 'question' },
              { side: 2, role: 'answer' },
            ],
            created_at: createdAt,
          },
        ],
        progress: [
          {
            id: 'progress-1',
            user_id: 'user-1',
            card_id: 'card-1',
            direction_id: 'direction-1',
            counter: 2,
            last_updated: createdAt,
          },
        ],
      },
    })

    await localSource.deleteDeck('deck-1')

    await expect(localSource.findDeckById('deck-1')).resolves.toBeNull()
    await expect(localSource.findCardById('card-1')).resolves.toBeNull()
    await expect(localSource.findTagsForDeck('deck-1')).resolves.toEqual([])
    await expect(localSource.findDirectionsForDeck('deck-1')).resolves.toEqual([])
    await expect(
      localSource.findProgressForUserCardAndDirection('user-1', 'card-1', 'direction-1'),
    ).resolves.toBeNull()
    await expect(localSource.findProfileById('user-1')).resolves.toMatchObject({
      last_active_deck_id: null,
      user_deck_preferences: [],
    })
  })
})
