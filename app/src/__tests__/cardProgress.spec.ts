import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn<(table: string) => object>(),
}))

interface ProgressQueryResult {
  data: unknown
  error: { message: string } | null
}

interface ProgressQuery {
  select: Mock<() => ProgressQuery>
  update: Mock<() => ProgressQuery>
  eq: Mock<(column: string, value: string) => ProgressQuery | Promise<ProgressQueryResult>>
  in: Mock<(column: string, values: string[]) => Promise<ProgressQueryResult>>
}

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

  it('loads all progress records for a user and direction', async () => {
    const row = {
      id: 'progress-1',
      user_id: 'user-1',
      card_id: 'card-1',
      direction_id: 'direction-1',
      counter: 4,
      last_updated: '2026-01-01T00:00:00.000Z',
    }
    const query = createQuery({ data: [row], error: null })
    mockFrom.mockReturnValue(query)

    const progress = await CardProgress.findAllForUserAndDirection('user-1', 'direction-1')

    expect(mockFrom).toHaveBeenCalledWith('card_progress')
    expect(query.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'direction_id', 'direction-1')
    expect(progress).toHaveLength(1)
    expect(progress[0]).toBeInstanceOf(CardProgress)
    expect(progress[0]?.counter).toBe(4)
  })

  it('resets matching progress for selected cards', async () => {
    const query = createQuery({ data: null, error: null })
    mockFrom.mockReturnValue(query)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await CardProgress.resetForUserCardsAndDirection('user-1', ['card-1'], 'direction-1')

    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ counter: 0, last_updated: expect.any(String) }),
    )
    expect(query.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'direction_id', 'direction-1')
    expect(query.in).toHaveBeenCalledWith('card_id', ['card-1'])
  })

  it('returns without a database request when reset has no card IDs', async () => {
    await expect(
      CardProgress.resetForUserCardsAndDirection('user-1', [], 'direction-1'),
    ).resolves.toBeUndefined()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects invalid progress query identifiers and reset card IDs', async () => {
    await expect(CardProgress.findAllForUserAndDirection('', 'direction-1')).rejects.toThrow(
      'Missing parameters',
    )
    await expect(
      CardProgress.resetForUserCardsAndDirection('user-1', ['card-1', 'card-1'], 'direction-1'),
    ).rejects.toThrow('unique, non-empty strings')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('logs and rethrows a reset database failure', async () => {
    const query = createQuery({ data: null, error: { message: 'write failed' } })
    mockFrom.mockReturnValue(query)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      CardProgress.resetForUserCardsAndDirection('user-1', ['card-1'], 'direction-1'),
    ).rejects.toThrow('Database error while resetting card progress: write failed')
    expect(log).toHaveBeenCalledOnce()
  })
})

function createQuery(result: ProgressQueryResult): ProgressQuery {
  let isUpdate = false
  let equalityCount = 0
  const query: ProgressQuery = {
    select: vi.fn<() => ProgressQuery>(() => {
      isUpdate = false
      equalityCount = 0
      return query
    }),
    update: vi.fn<() => ProgressQuery>(() => {
      isUpdate = true
      equalityCount = 0
      return query
    }),
    eq: vi.fn<(column: string, value: string) => ProgressQuery | Promise<ProgressQueryResult>>(
      () => {
        equalityCount += 1
        return !isUpdate && equalityCount === 2 ? Promise.resolve(result) : query
      },
    ),
    in: vi.fn<(column: string, values: string[]) => Promise<ProgressQueryResult>>(() =>
      Promise.resolve(result),
    ),
  }
  return query
}
