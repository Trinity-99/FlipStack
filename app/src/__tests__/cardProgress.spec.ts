import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn<(table: string) => object>(),
}))

vi.mock('@/db/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { CardProgress } from '@/models/cardProgress'

describe('CardProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([-1, 10.5, 11, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid constructor counter %s',
    (counter) => {
      expect(
        () => new CardProgress(null, 'user-1', 'card-1', 'direction-1', counter, new Date()),
      ).toThrow(/Invalid counter/)
    },
  )

  it('rejects a mutated counter before contacting Supabase', async () => {
    const progress = new CardProgress(
      null,
      'user-1',
      'card-1',
      'direction-1',
      5,
      new Date('2026-01-01T00:00:00.000Z'),
    )
    progress.counter = 10.5

    await expect(progress.save()).rejects.toThrow('Invalid counter value: 10.5')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects malformed database rows', () => {
    const validRow = {
      id: 'progress-1',
      user_id: 'user-1',
      card_id: 'card-1',
      direction_id: 'direction-1',
      counter: 10,
      last_updated: '2026-01-01T00:00:00.000Z',
    }

    for (const counter of [-1, 1.5, 11, null]) {
      expect(() => CardProgress.fromJSON({ ...validRow, counter })).toThrow(
        /Failed to parse CardProgress from JSON/,
      )
    }
    expect(() => CardProgress.fromJSON({ ...validRow, last_updated: null })).toThrow(
      /Failed to parse CardProgress from JSON/,
    )
    expect(() => CardProgress.fromJSON({ ...validRow, counter: undefined })).toThrow(
      /Failed to parse CardProgress from JSON/,
    )
  })
})
