import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { Profile } from '@/models/profile'
import { dataRouter } from '@/data/dataRouter'

const { authGetSession, authSignIn, profileFrom } = vi.hoisted(() => ({
  authGetSession: vi.fn<() => Promise<unknown>>(),
  authSignIn: vi.fn<(credentials: { email: string; password: string }) => Promise<unknown>>(),
  profileFrom: vi.fn<(table: string) => unknown>(),
}))

vi.mock('@/db/supabase', () => ({
  supabase: {
    auth: { getSession: authGetSession, signInWithPassword: authSignIn },
    from: profileFrom,
  },
}))

const profileRow = {
  id: 'user-1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_active_deck_id: null,
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
    vi.spyOn(dataRouter, 'prepareAuthenticatedUser').mockResolvedValue()
    vi.spyOn(dataRouter, 'findProfileById').mockResolvedValue(profileRow)
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
    expect(dataRouter.prepareAuthenticatedUser).toHaveBeenCalledWith('user-1')
    expect(dataRouter.findProfileById).toHaveBeenCalledWith('user-1')
    expect(result.profile).toBeInstanceOf(Profile)
    expect(result.session).toBe(session)
  })

  it('restores the profile from a persisted session', async () => {
    authGetSession.mockResolvedValue({ data: { session }, error: null })

    const result = await Profile.restoreAuthentication()

    expect(authGetSession).toHaveBeenCalledOnce()
    expect(dataRouter.prepareAuthenticatedUser).toHaveBeenCalledWith('user-1')
    expect(dataRouter.findProfileById).toHaveBeenCalledWith('user-1')
    expect(result?.profile).toBeInstanceOf(Profile)
    expect(result?.session).toBe(session)
  })

  it('uses the local profile when session restoration cannot reach Supabase', async () => {
    const networkError = new TypeError('Failed to fetch')
    authGetSession.mockResolvedValue({ data: { session: null }, error: networkError })
    vi.spyOn(dataRouter, 'getLocalOwnerUserId').mockResolvedValue('user-1')

    const result = await Profile.restoreAuthentication()

    expect(result?.profile).toBeInstanceOf(Profile)
    expect(result?.session).toBeNull()
    expect(dataRouter.findProfileById).toHaveBeenCalledWith('user-1')
    expect(dataRouter.prepareAuthenticatedUser).not.toHaveBeenCalled()
  })

  it('returns null when no persisted session exists', async () => {
    authGetSession.mockResolvedValue({ data: { session: null }, error: null })

    await expect(Profile.restoreAuthentication()).resolves.toBeNull()

    expect(profileFrom).not.toHaveBeenCalled()
  })

  it('delegates sign-out to DataRouter', async () => {
    vi.spyOn(dataRouter, 'signOut').mockResolvedValue({ remoteRevocationPending: true })

    await expect(Profile.signOut()).resolves.toEqual({ remoteRevocationPending: true })

    expect(dataRouter.signOut).toHaveBeenCalledOnce()
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
    vi.mocked(dataRouter.findProfileById).mockResolvedValue(null)

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
    vi.mocked(dataRouter.findProfileById).mockResolvedValue(null)

    await expect(Profile.findById('missing-user')).resolves.toBeNull()
  })

  it('loads per-deck preferences with the profile', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(dataRouter.findProfileById).mockResolvedValue({
      ...profileRow,
      user_deck_preferences: [
        {
          user_id: 'user-1',
          deck_id: 'deck-1',
          last_selected_direction_id: 'direction-1',
          last_selected_tag_id: 'tag-1',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    const result = await Profile.findById('user-1')

    expect(dataRouter.findProfileById).toHaveBeenCalledWith('user-1')
    expect(result?.getDeckPreference('deck-1')).toEqual({
      deckId: 'deck-1',
      lastSelectedDirectionId: 'direction-1',
      lastSelectedTagId: 'tag-1',
    })
  })
})
