import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteSource } from '@/data/remoteSource'

const { authGetSession, authSignOut } = vi.hoisted(() => ({
  authGetSession: vi.fn<() => Promise<unknown>>(),
  authSignOut: vi.fn<(options: { scope: 'local' }) => Promise<unknown>>(),
}))

vi.mock('@/db/supabase', () => ({
  supabase: {
    auth: { getSession: authGetSession, signOut: authSignOut },
  },
}))

describe('RemoteSource sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
