import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteSource } from '@/data/remoteSource'

const { authGetSession, authSignOut, authSignUp } = vi.hoisted(() => ({
  authGetSession: vi.fn<() => Promise<unknown>>(),
  authSignOut: vi.fn<(options: { scope: 'local' }) => Promise<unknown>>(),
  authSignUp:
    vi.fn<
      (credentials: {
        email: string
        password: string
        options: { emailRedirectTo: string }
      }) => Promise<unknown>
    >(),
}))

vi.mock('@/db/supabase', () => ({
  supabase: {
    auth: { getSession: authGetSession, signOut: authSignOut, signUp: authSignUp },
  },
}))

describe('RemoteSource authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an account with the email-confirmation callback URL', async () => {
    authSignUp.mockResolvedValue({ data: { user: { id: 'user-1' }, session: null }, error: null })
    const source = new RemoteSource()

    await expect(
      source.signUp(
        { email: 'user@example.com', password: 'valid-password' },
        'https://app.test/auth/confirm',
      ),
    ).resolves.toBeUndefined()

    expect(authSignUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'valid-password',
      options: { emailRedirectTo: 'https://app.test/auth/confirm' },
    })
  })

  it('categorizes signup transport failures', async () => {
    authSignUp.mockRejectedValue(new TypeError('Failed to fetch'))
    const source = new RemoteSource()

    await expect(
      source.signUp(
        { email: 'user@example.com', password: 'valid-password' },
        'https://app.test/auth/confirm',
      ),
    ).rejects.toMatchObject({ name: 'AuthenticationError', kind: 'network' })
  })

  it('confirms a verified email callback and clears the local session', async () => {
    authGetSession.mockResolvedValue({
      data: {
        session: {
          user: { email_confirmed_at: '2026-01-01T00:00:00.000Z' },
        },
      },
      error: null,
    })
    authSignOut.mockResolvedValue({ error: null })
    const source = new RemoteSource()

    await expect(source.completeEmailConfirmation()).resolves.toBeUndefined()

    expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('rejects confirmation callbacks without a confirmed session', async () => {
    authGetSession.mockResolvedValue({
      data: { session: { user: { email_confirmed_at: null } } },
      error: null,
    })
    const source = new RemoteSource()

    await expect(source.completeEmailConfirmation()).rejects.toMatchObject({
      name: 'AuthenticationError',
      message: 'The confirmation link is invalid or has expired.',
    })
    expect(authSignOut).not.toHaveBeenCalled()
  })

  it('clears only the local Supabase session', async () => {
    authSignOut.mockResolvedValue({ error: null })
    const source = new RemoteSource()

    await expect(source.signOut()).resolves.toEqual({ remoteRevocationPending: false })

    expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(authGetSession).not.toHaveBeenCalled()
  })

  it('allows offline logout when remote revocation fails after the local session is removed', async () => {
    authSignOut.mockResolvedValue({ error: new Error('Network unavailable') })
    authGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const source = new RemoteSource()

    await expect(source.signOut()).resolves.toEqual({ remoteRevocationPending: true })
    expect(authGetSession).toHaveBeenCalledOnce()
  })

  it('throws when local session removal cannot be confirmed', async () => {
    authSignOut.mockResolvedValue({ error: new Error('Sign-out failed') })
    authGetSession.mockResolvedValue({
      data: { session: { access_token: 'still-present' } },
      error: null,
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const source = new RemoteSource()

    await expect(source.signOut()).rejects.toThrow(
      'The local authentication session could not be cleared.',
    )
  })

  it('throws when the local session state cannot be verified', async () => {
    authSignOut.mockRejectedValue(new Error('Network unavailable'))
    authGetSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Storage unavailable'),
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const source = new RemoteSource()

    await expect(source.signOut()).rejects.toThrow(
      'Unable to verify that the local authentication session was cleared.',
    )
  })
})
