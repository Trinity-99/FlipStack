import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type CardPayload = {
  deck_id: string
  user_id: string
  content: Record<string, string>
}

type CardRow = {
  id: string
  created_at: string
  updated_at: string
  deck_id?: string
  user_id?: string
  content?: Record<string, string>
}

type CardResult = {
  data: CardRow | null
  error: { message: string } | null
}

type CardInsertQuery = {
  select: () => { single: () => Promise<CardResult> }
}

type CardUpdateQuery = {
  eq: (column: string, value: string) => CardInsertQuery
}

type TagRelation = { card_id: string; tag_id: string }
type TagLookupResult = {
  data: TagRelation[] | null
  error: { message: string } | null
}

const {
  mockCardInsert,
  mockCardSingle,
  mockCardFindEq,
  mockCardFindSelect,
  mockCardFindSingle,
  mockCardUpdate,
  mockFrom,
  mockTagDelete,
  mockTagDeleteEq,
  mockTagInsert,
  mockTagFindEq,
  mockTagFindSelect,
} = vi.hoisted(() => ({
  mockCardInsert: vi.fn<(payload: CardPayload) => CardInsertQuery>(),
  mockCardSingle: vi.fn<() => Promise<CardResult>>(),
  mockCardFindEq: vi.fn<() => { single: () => Promise<CardResult> }>(),
  mockCardFindSelect: vi.fn<() => { eq: () => { single: () => Promise<CardResult> } }>(),
  mockCardFindSingle: vi.fn<() => Promise<CardResult>>(),
  mockCardUpdate: vi.fn<(payload: Pick<CardPayload, 'content'>) => CardUpdateQuery>(),
  mockFrom: vi.fn<(table: string) => object>(),
  mockTagDelete: vi.fn<
    () => {
      eq: (column: string, value: string) => Promise<{ error: null | { message: string } }>
    }
  >(),
  mockTagDeleteEq:
    vi.fn<(column: string, value: string) => Promise<{ error: null | { message: string } }>>(),
  mockTagInsert:
    vi.fn<(relations: TagRelation[]) => Promise<{ error: null | { message: string } }>>(),
  mockTagFindEq: vi.fn<() => Promise<TagLookupResult>>(),
  mockTagFindSelect: vi.fn<() => { eq: () => Promise<TagLookupResult> }>(),
}))

vi.mock('@/db/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { Card } from '@/models/card'

describe('Card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation((table) => {
      if (table === 'card') {
        return {
          insert: mockCardInsert,
          update: mockCardUpdate,
          select: mockCardFindSelect,
        }
      }
      return {
        insert: mockTagInsert,
        delete: mockTagDelete,
        select: mockTagFindSelect,
      }
    })
    mockCardInsert.mockReturnValue({ select: () => ({ single: mockCardSingle }) })
    mockCardUpdate.mockReturnValue({
      eq: () => ({ select: () => ({ single: mockCardSingle }) }),
    })
    mockTagDelete.mockReturnValue({ eq: mockTagDeleteEq })
    mockTagDeleteEq.mockResolvedValue({ error: null })
    mockTagInsert.mockResolvedValue({ error: null })
    mockCardFindSelect.mockReturnValue({ eq: mockCardFindEq })
    mockCardFindEq.mockReturnValue({ single: mockCardFindSingle })
    mockCardFindSingle.mockResolvedValue({
      data: {
        id: 'card-1',
        deck_id: 'deck-1',
        user_id: 'user-1',
        content: { s1: 'text' },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    })
    mockTagFindSelect.mockReturnValue({ eq: mockTagFindEq })
    mockTagFindEq.mockResolvedValue({ data: [], error: null })
    mockCardSingle.mockResolvedValue({
      data: {
        id: 'card-1',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['missing deck ID', new Card(null, '', 'user-1', { s1: 'text' }, [], null, null)],
    ['missing user ID', new Card(null, 'deck-1', '', { s1: 'text' }, [], null, null)],
    ['blank sides', new Card(null, 'deck-1', 'user-1', { s1: ' \n ' }, [], null, null)],
    ['unknown side only', new Card(null, 'deck-1', 'user-1', {}, [], null, null)],
    ['overlong side', new Card(null, 'deck-1', 'user-1', { s1: 'x'.repeat(257) }, [], null, null)],
    [
      'too many tags',
      new Card(
        null,
        'deck-1',
        'user-1',
        { s1: 'text' },
        Array.from({ length: 11 }, (_, i) => `tag-${i}`),
        null,
        null,
      ),
    ],
    [
      'duplicate tags',
      new Card(null, 'deck-1', 'user-1', { s1: 'text' }, ['tag-1', 'tag-1'], null, null),
    ],
    ['blank tag ID', new Card(null, 'deck-1', 'user-1', { s1: 'text' }, [' '], null, null)],
  ])('rejects %s before contacting Supabase', async (_description, card) => {
    await expect(card.save()).rejects.toThrow(/.+/)

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('trims side edges, preserves multiline Unicode content, and omits blank sides', async () => {
    const card = new Card(
      null,
      'deck-1',
      'user-1',
      { s1: '  สวัสดี\nWorld  ', s2: '  \n ', s3: ' notes ' },
      [],
      null,
      null,
    )

    await card.save()

    expect(mockCardInsert).toHaveBeenCalledWith({
      deck_id: 'deck-1',
      user_id: 'user-1',
      content: { s1: 'สวัสดี\nWorld', s3: 'notes' },
    })
    expect(card.content).toEqual({ s1: 'สวัสดี\nWorld', s3: 'notes' })
  })

  it('accepts 256 characters independently on each populated side', async () => {
    const card = new Card(
      null,
      'deck-1',
      'user-1',
      { s1: 'a'.repeat(256), s2: 'b'.repeat(256) },
      [],
      null,
      null,
    )

    await expect(card.save()).resolves.toBeUndefined()
    expect(mockCardInsert).toHaveBeenCalledOnce()
  })

  it('synchronizes selected tags after inserting a card', async () => {
    const card = new Card(null, 'deck-1', 'user-1', { s1: 'text' }, ['tag-1', 'tag-2'], null, null)

    await card.save()

    expect(mockTagDelete).toHaveBeenCalledOnce()
    expect(mockTagDeleteEq).toHaveBeenCalledWith('card_id', 'card-1')
    expect(mockTagInsert).toHaveBeenCalledWith([
      { card_id: 'card-1', tag_id: 'tag-1' },
      { card_id: 'card-1', tag_id: 'tag-2' },
    ])
  })

  it('clears existing tag links when saving without tags', async () => {
    const card = new Card('card-1', 'deck-1', 'user-1', { s1: 'updated' }, [], null, null)

    await card.save()

    expect(mockTagDeleteEq).toHaveBeenCalledWith('card_id', 'card-1')
    expect(mockTagInsert).not.toHaveBeenCalled()
  })

  it('logs and rethrows tag synchronization failures', async () => {
    const databaseError = { message: 'junction unavailable' }
    mockTagDeleteEq.mockResolvedValue({ error: databaseError })
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const card = new Card(null, 'deck-1', 'user-1', { s1: 'text' }, [], null, null)

    await expect(card.save()).rejects.toThrow('Failed to clear old card tags: junction unavailable')

    expect(logError).toHaveBeenCalledWith('Card.save failed:', expect.any(Error))
  })

  it('rejects malformed or oversized card rows when parsing', () => {
    const validRow = {
      id: 'card-1',
      deck_id: 'deck-1',
      user_id: 'user-1',
      content: { s1: 'text' },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }

    expect(() => Card.fromJSON({ ...validRow, content: { s4: 'invalid' } })).toThrow(
      /Failed to parse Card from JSON/,
    )
    expect(() => Card.fromJSON({ ...validRow, content: { s1: 'x'.repeat(257) } })).toThrow(
      /Failed to parse Card from JSON/,
    )
    expect(() => Card.fromJSON({ ...validRow, content: null })).toThrow(
      /Failed to parse Card from JSON/,
    )
    expect(() =>
      Card.fromJSON(
        validRow,
        Array.from({ length: 11 }, (_, i) => `tag-${i}`),
      ),
    ).toThrow(/Failed to parse Card from JSON/)
    expect(() => Card.fromJSON(validRow, ['tag-1', 'tag-1'])).toThrow(
      /Failed to parse Card from JSON/,
    )
    expect(() => Card.fromJSON({ ...validRow, created_at: null })).toThrow(
      /Failed to parse Card from JSON/,
    )
  })

  it('throws when fetching a card fails to fetch its tag relations', async () => {
    mockTagFindEq.mockResolvedValue({ data: null, error: { message: 'junction unavailable' } })
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(Card.findById('card-1')).rejects.toThrow(
      'Database error while fetching card tags: junction unavailable',
    )
    expect(logError).toHaveBeenCalledWith('Card.findById failed for ID card-1:', expect.any(Error))
  })
})
