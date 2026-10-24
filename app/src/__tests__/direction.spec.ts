import { describe, expect, it, vi } from 'vitest'
import { Deck } from '@/models/deck'
import { Direction } from '@/models/direction'

describe('Direction.getName', () => {
  it('returns side labels in the direction configuration order', async () => {
    const deck = new Deck('deck-id', 'user-id', 'Thai', ['Script', 'Meaning', 'Phonetic'], null, null)
    const direction = new Direction(
      'direction-id',
      'deck-id',
      [
        { side: 3, role: 'question' },
        { side: 1, role: 'answer' },
        { side: 2, role: 'extra' },
      ],
      null
    )

    vi.spyOn(Deck, 'findById').mockResolvedValue(deck)

    await expect(direction.getName()).resolves.toBe('Phonetic - Script - Meaning')
  })

  it('throws when the deck cannot be found', async () => {
    const direction = new Direction('direction-id', 'deck-id', [], null)
    vi.spyOn(Deck, 'findById').mockResolvedValue(null)

    await expect(direction.getName()).rejects.toThrow('Deck with ID deck-id not found')
  })
})
