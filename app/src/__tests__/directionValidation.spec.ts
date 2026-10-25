import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn<(table: string) => object>(),
}))

vi.mock('@/db/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { Direction } from '@/models/direction'

describe('Direction validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an incomplete configuration before contacting Supabase', async () => {
    const direction = new Direction(null, 'deck-1', [{ side: 1, role: 'question' }], null)

    await expect(direction.save()).rejects.toThrow('A direction must contain two or three steps.')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('accepts the largest valid configuration within the database size constraint', () => {
    const direction = Direction.fromJSON({
      id: 'direction-1',
      deck_id: 'deck-1',
      configuration: [
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
        { side: 3, role: 'extra' },
      ],
      created_at: '2026-01-01T00:00:00.000Z',
    })

    expect(direction.configuration).toHaveLength(3)
  })

  it.each([
    ['too few steps', [{ side: 1, role: 'question' }]],
    [
      'too many steps',
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'answer' },
        { side: 3, role: 'extra' },
        { side: 4, role: 'extra' },
      ],
    ],
    [
      'question not first',
      [
        { side: 1, role: 'answer' },
        { side: 2, role: 'question' },
      ],
    ],
    [
      'no answer',
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'extra' },
      ],
    ],
    [
      'duplicate sides',
      [
        { side: 1, role: 'question' },
        { side: 1, role: 'answer' },
      ],
    ],
    [
      'fractional side',
      [
        { side: 1, role: 'question' },
        { side: 2.5, role: 'answer' },
      ],
    ],
    [
      'invalid role',
      [
        { side: 1, role: 'question' },
        { side: 2, role: 'other' },
      ],
    ],
  ])('rejects persisted configuration with %s', (_description, configuration) => {
    expect(() =>
      Direction.fromJSON({
        id: 'direction-1',
        deck_id: 'deck-1',
        configuration,
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow(/Failed to parse Direction from JSON/)
  })

  it('rejects rows without a required creation timestamp', () => {
    expect(() =>
      Direction.fromJSON({
        id: 'direction-1',
        deck_id: 'deck-1',
        configuration: [
          { side: 1, role: 'question' },
          { side: 2, role: 'answer' },
        ],
        created_at: null,
      }),
    ).toThrow(/Failed to parse Direction from JSON/)
  })
})
