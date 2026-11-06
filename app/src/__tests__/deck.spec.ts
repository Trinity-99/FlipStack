import { beforeEach, describe, expect, it, vi } from 'vitest'

type DeckPayload = {
  user_id: string
  title: string
  side_labels: string[]
  audio_languages: Record<string, string>
}

type SelectQuery = { select: () => SingleQuery }
type SingleQuery = { single: () => Promise<DatabaseResult> }
type UpdateQuery = { eq: (column: string, value: string) => SelectQuery }
type DatabaseQuery = {
  insert: (payload: DeckPayload) => SelectQuery
  update: (payload: DeckPayload) => UpdateQuery
}
type DatabaseResult = {
  data: { id: string; created_at: string; updated_at: string } | null
  error: { message: string } | null
}

const { mockEq, mockFrom, mockInsert, mockSelect, mockSingle, mockUpdate } = vi.hoisted(() => ({
  mockEq: vi.fn<(column: string, value: string) => SelectQuery>(),
  mockFrom: vi.fn<(table: string) => DatabaseQuery>(),
  mockInsert: vi.fn<(payload: DeckPayload) => SelectQuery>(),
  mockSelect: vi.fn<() => SingleQuery>(),
  mockSingle: vi.fn<() => Promise<DatabaseResult>>(),
  mockUpdate: vi.fn<(payload: DeckPayload) => UpdateQuery>(),
}))

vi.mock('@/db/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { Deck } from '@/models/deck'

describe('Deck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate })
    mockInsert.mockReturnValue({ select: mockSelect })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ single: mockSingle })
  })

  it.each([
    ['blank title', new Deck(null, 'user-1', '   ', ['Script', 'Meaning'], null, null)],
    [
      'title over 24 characters',
      new Deck(null, 'user-1', '1234567890123456789012345', ['A', 'B'], null, null),
    ],
    ['one side label', new Deck(null, 'user-1', 'Thai', ['Script'], null, null)],
    ['four side labels', new Deck(null, 'user-1', 'Thai', ['A', 'B', 'C', 'D'], null, null)],
    ['blank side label', new Deck(null, 'user-1', 'Thai', ['Script', '  '], null, null)],
    [
      'overlong side label',
      new Deck(null, 'user-1', 'Thai', ['x'.repeat(33), 'Meaning'], null, null),
    ],
    [
      'invalid audio language',
      new Deck(null, 'user-1', 'Thai', ['Script', 'Meaning'], null, null, { s1: 'not a locale' }),
    ],
    [
      'audio language for a missing side',
      new Deck(null, 'user-1', 'Thai', ['Script', 'Meaning'], null, null, { s3: 'th-TH' }),
    ],
  ])('rejects invalid %s before contacting the database', async (_description, deck) => {
    await expect(deck.save()).rejects.toThrow(/.+/)

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it.each([
    ['two sides', ['Script', 'Meaning']],
    ['three sides', ['Script', 'Meaning', 'Thai']],
  ])('saves and trims a valid deck with %s', async (_description, sideLabels) => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'deck-1',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    })
    const deck = new Deck(
      null,
      'user-1',
      ' Thai ',
      sideLabels.map((label) => ` ${label} `),
      null,
      null,
    )
    deck.audioLanguages = { s1: 'th-TH' }

    await deck.save()

    expect(mockFrom).toHaveBeenCalledWith('deck')
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-1',
      title: 'Thai',
      side_labels: sideLabels,
      audio_languages: { s1: 'th-TH' },
    })
    expect(deck.title).toBe('Thai')
    expect(deck.sideLabels).toEqual(sideLabels)
    expect(deck.id).toBe('deck-1')
  })

  it('rejects database rows with invalid side labels or missing required fields', () => {
    const validRow = {
      id: 'deck-1',
      user_id: 'user-1',
      title: 'Thai',
      side_labels: ['Script', 'Meaning'],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }

    expect(() => Deck.fromJSON({ ...validRow, side_labels: ['x'.repeat(33), 'Meaning'] })).toThrow(
      /Failed to parse Deck from JSON/,
    )
    expect(() => Deck.fromJSON({ ...validRow, side_labels: ['Script'] })).toThrow(
      /Failed to parse Deck from JSON/,
    )
    expect(() => Deck.fromJSON({ ...validRow, updated_at: null })).toThrow(
      /Failed to parse Deck from JSON/,
    )
    expect(() => Deck.fromJSON({ ...validRow, title: 'x'.repeat(33) })).toThrow(
      /Failed to parse Deck from JSON/,
    )
  })

  it('parses audio languages and defaults missing legacy values to disabled', () => {
    const row = {
      id: 'deck-1',
      user_id: 'user-1',
      title: 'Thai',
      side_labels: ['Script', 'Meaning'],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }

    expect(Deck.fromJSON(row).audioLanguages).toEqual({})
    expect(Deck.fromJSON({ ...row, audio_languages: { s1: 'th-TH' } }).audioLanguages).toEqual({
      s1: 'th-TH',
    })
    expect(() => Deck.fromJSON({ ...row, audio_languages: { s3: 'th-TH' } })).toThrow(
      /missing side/,
    )
    expect(() => Deck.fromJSON({ ...row, audio_languages: { s1: 'invalid code' } })).toThrow(
      /audio language/,
    )
  })

  it('gets, sets, and clears a side audio language', () => {
    const deck = new Deck('deck-1', 'user-1', 'Thai', ['Script', 'Meaning'], null, null)

    expect(deck.getAudioLanguage(1)).toBeNull()
    deck.setAudioLanguage(1, 'th-TH')
    expect(deck.getAudioLanguage(1)).toBe('th-TH')

    deck.clearAudioLanguage(1)
    expect(deck.getAudioLanguage(1)).toBeNull()
  })
})
