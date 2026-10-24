import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { Profile } from '@/models/profile'

const { authSignIn, profileFrom } = vi.hoisted(() => ({
  authSignIn: vi.fn<(credentials: { email: string; password: string }) => Promise<unknown>>(),
  profileFrom: vi.fn<(table: string) => unknown>(),
}))

vi.mock('@/db/supabase', () => ({
  supabase: {
    auth: { signInWithPassword: authSignIn },
    from: profileFrom,
  },
}))

const profileRow = {
  id: 'user-1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

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
    created_at: '2026-01-01T00:00:00.000Z',
  },
}

const profileQuery = {
  select: vi.fn<() => unknown>(),
  eq: vi.fn<() => unknown>(),
  single: vi.fn<() => Promise<unknown>>(),
}

describe('Profile authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    profileQuery.select.mockReturnThis()
    profileQuery.eq.mockReturnThis()
    profileFrom.mockReturnValue(profileQuery)
    profileQuery.single.mockResolvedValue({ data: profileRow, error: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('authenticates and returns the profile and session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    authSignIn.mockResolvedValue({
      data: { user: session.user, session },
      error: null,
    })

    const result = await Profile.authenticate(' user@example.com ', 'password')

    expect(authSignIn).toHaveBeenCalledWith({ email: 'user@example.com', password: 'password' })
    expect(profileFrom).toHaveBeenCalledWith('profile')
    expect(profileQuery.eq).toHaveBeenCalledWith('id', 'user-1')
    expect(result.profile).toBeInstanceOf(Profile)
    expect(result.session).toBe(session)
  })

  it('maps Supabase invalid-credential errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    authSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
    })

    await expect(Profile.authenticate('user@example.com', 'wrong')).rejects.toMatchObject({
      name: 'AuthenticationError',
      kind: 'invalid-credentials',
    })
  })

  it('maps transport exceptions to network failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    authSignIn.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(Profile.authenticate('user@example.com', 'password')).rejects.toMatchObject({
      name: 'AuthenticationError',
      kind: 'network',
    })
  })

  it('rejects when the authenticated user has no profile', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    authSignIn.mockResolvedValue({
      data: { user: session.user, session },
      error: null,
    })
    profileQuery.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    await expect(Profile.authenticate('user@example.com', 'password')).rejects.toMatchObject({
      name: 'AuthenticationError',
      kind: 'unexpected',
    })
  })

  it('rejects empty credentials before calling Supabase', async () => {
    await expect(Profile.authenticate('   ', 'password')).rejects.toThrow(
      'Email and password are required',
    )
    await expect(Profile.authenticate('user@example.com', '')).rejects.toThrow(
      'Email and password are required',
    )
    expect(authSignIn).not.toHaveBeenCalled()
  })

  it('returns null when a profile does not exist', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    profileQuery.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    await expect(Profile.findById('missing-user')).resolves.toBeNull()
  })

  it('loads per-deck preferences with the profile', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    profileQuery.single.mockResolvedValue({
      data: {
        ...profileRow,
        user_deck_preferences: [
          {
            deck_id: 'deck-1',
            last_selected_direction_id: 'direction-1',
            last_selected_tag_id: 'tag-1',
          },
        ],
      },
      error: null,
    })

    const result = await Profile.findById('user-1')

    expect(profileQuery.select).toHaveBeenCalledWith(
      '*, user_deck_preferences:user_deck_preference(*)',
    )
    expect(result?.getDeckPreference('deck-1')).toEqual({
      deckId: 'deck-1',
      lastSelectedDirectionId: 'direction-1',
      lastSelectedTagId: 'tag-1',
    })
  })
})
