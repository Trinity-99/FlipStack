import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn<(table: string) => object>(),
}))

vi.mock('@/db/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { Tag } from '@/models/tag'

describe('Tag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['missing deck ID', new Tag(null, '  ', 'Grammar', null)],
    ['blank name', new Tag(null, 'deck-1', '  ', null)],
    ['name over 32 characters', new Tag(null, 'deck-1', 'x'.repeat(33), null)],
  ])('rejects %s before contacting Supabase', async (_description, tag) => {
    await expect(tag.save()).rejects.toThrow(/required|exceed/i)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('counts Unicode code points when checking the database name limit', async () => {
    const tag = new Tag(null, 'deck-1', '😀'.repeat(33), null)

    await expect(tag.save()).rejects.toThrow('Tag name cannot exceed 32 characters.')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects malformed or oversized database rows', () => {
    const validRow = {
      id: 'tag-1',
      deck_id: 'deck-1',
      name: 'Grammar',
      created_at: '2026-01-01T00:00:00.000Z',
    }

    expect(() => Tag.fromJSON({ ...validRow, name: '😀'.repeat(33) })).toThrow(
      /Failed to parse Tag from JSON/,
    )
    expect(() => Tag.fromJSON({ ...validRow, name: '   ' })).toThrow(
      /Failed to parse Tag from JSON/,
    )
    expect(() => Tag.fromJSON({ ...validRow, created_at: null })).toThrow(
      /Failed to parse Tag from JSON/,
    )
  })
})
