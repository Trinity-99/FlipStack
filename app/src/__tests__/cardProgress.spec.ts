import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardProgress } from '@/models/cardProgress'
import { dataRouter } from '@/data/dataRouter'

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
    const findProgress = vi
      .spyOn(dataRouter, 'findProgressForUserAndDirection')
      .mockResolvedValue([row])

    const progress = await CardProgress.findAllForUserAndDirection('user-1', 'direction-1')

    expect(findProgress).toHaveBeenCalledWith('user-1', 'direction-1')
    expect(progress).toHaveLength(1)
    expect(progress[0]).toBeInstanceOf(CardProgress)
    expect(progress[0]?.counter).toBe(4)
  })

  it('resets matching progress for selected cards', async () => {
    const resetProgress = vi.spyOn(dataRouter, 'resetProgress').mockResolvedValue()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await CardProgress.resetForUserCardsAndDirection('user-1', ['card-1'], 'direction-1')

    expect(resetProgress).toHaveBeenCalledWith('user-1', ['card-1'], 'direction-1')
  })

  it('returns without a database request when reset has no card IDs', async () => {
    await expect(
      CardProgress.resetForUserCardsAndDirection('user-1', [], 'direction-1'),
    ).resolves.toBeUndefined()
  })

  it('rejects invalid progress query identifiers and reset card IDs', async () => {
    await expect(CardProgress.findAllForUserAndDirection('', 'direction-1')).rejects.toThrow(
      'Missing parameters',
    )
    await expect(
      CardProgress.resetForUserCardsAndDirection('user-1', ['card-1', 'card-1'], 'direction-1'),
    ).rejects.toThrow('unique, non-empty strings')
  })

  it('logs and rethrows a reset database failure', async () => {
    vi.spyOn(dataRouter, 'resetProgress').mockRejectedValue(new Error('write failed'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      CardProgress.resetForUserCardsAndDirection('user-1', ['card-1'], 'direction-1'),
    ).rejects.toThrow('write failed')
    expect(log).toHaveBeenCalledOnce()
  })
})
