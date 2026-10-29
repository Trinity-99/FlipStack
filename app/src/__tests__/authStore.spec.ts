import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { Profile } from '@/models/profile'
import { useAuthStore } from '@/stores/authStore'

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

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts unauthenticated and stores a successful login', () => {
    const store = useAuthStore()
    const profile = new Profile('user-1', new Date(), new Date())

    expect(store.isAuthenticated).toBe(false)

    store.setAuthenticated(profile, session)

    expect(store.profile).toBe(profile)
    expect(store.session).toBe(session)
    expect(store.isAuthenticated).toBe(true)
    expect(store.hasRestoredAuthentication).toBe(true)
  })

  it('replaces the profile without clearing the session', () => {
    const store = useAuthStore()
    const profile = new Profile('user-1', new Date(), new Date())
    const updatedProfile = new Profile('user-1', new Date(), new Date(), 'deck-1')
    store.setAuthenticated(profile, session)

    store.setProfile(updatedProfile)

    expect(store.profile).toBe(updatedProfile)
    expect(store.session).toBe(session)
    expect(store.isAuthenticated).toBe(true)
  })

  it('restores the persisted profile and session', async () => {
    const restoredProfile = new Profile('user-1', new Date(), new Date())
    vi.spyOn(Profile, 'restoreAuthentication').mockResolvedValue({
      profile: restoredProfile,
      session,
    })
    const store = useAuthStore()

    await store.restoreAuthentication()

    expect(store.profile).toBe(restoredProfile)
    expect(store.session).toBe(session)
    expect(store.isAuthenticated).toBe(true)
    expect(store.isRestoring).toBe(false)
    expect(store.hasRestoredAuthentication).toBe(true)
  })

  it('keeps the store unauthenticated when no persisted session exists', async () => {
    vi.spyOn(Profile, 'restoreAuthentication').mockResolvedValue(null)
    const store = useAuthStore()

    await store.restoreAuthentication()

    expect(store.profile).toBeNull()
    expect(store.session).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.isRestoring).toBe(false)
    expect(store.hasRestoredAuthentication).toBe(true)
  })

  it('coalesces concurrent restoration requests', async () => {
    let resolveRestoration: ((result: null) => void) | undefined
    const restoreAuthentication = vi.spyOn(Profile, 'restoreAuthentication').mockReturnValue(
      new Promise((resolve) => {
        resolveRestoration = resolve
      }),
    )
    const store = useAuthStore()

    const firstRestoration = store.restoreAuthentication()
    const secondRestoration = store.restoreAuthentication()

    expect(store.isRestoring).toBe(true)
    expect(restoreAuthentication).toHaveBeenCalledTimes(1)

    resolveRestoration?.(null)
    await Promise.all([firstRestoration, secondRestoration])

    expect(store.isRestoring).toBe(false)
    expect(store.hasRestoredAuthentication).toBe(true)
  })

  it('records restore failures and does not retry the completed initial attempt', async () => {
    const restoreAuthentication = vi
      .spyOn(Profile, 'restoreAuthentication')
      .mockRejectedValue(new Error('Restore failed'))
    const store = useAuthStore()

    await expect(store.restoreAuthentication()).rejects.toThrow('Restore failed')

    expect(store.initializationError).toBe('Unable to restore your session. Please sign in again.')
    expect(store.isRestoring).toBe(false)
    expect(store.hasRestoredAuthentication).toBe(true)

    await store.restoreAuthentication()

    expect(restoreAuthentication).toHaveBeenCalledTimes(1)
  })
})
