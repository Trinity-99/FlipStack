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
  })

  it('keeps the store unauthenticated when no persisted session exists', async () => {
    vi.spyOn(Profile, 'restoreAuthentication').mockResolvedValue(null)
    const store = useAuthStore()

    await store.restoreAuthentication()

    expect(store.profile).toBeNull()
    expect(store.session).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })
})
