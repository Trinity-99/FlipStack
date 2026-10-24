import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { Profile } from '@/models/profile'

/**
 * @summary Stores and restores the current user's profile and authentication session.
 */
export const useAuthStore = defineStore('auth', () => {
  const profile = shallowRef<Profile | null>(null)
  const session = shallowRef<Session | null>(null)
  const initializationError = shallowRef<string | null>(null)
  const isAuthenticated = computed(() => profile.value !== null && session.value !== null)

  /**
   * @summary Restores authentication from the persisted Supabase session on app startup.
   * @returns {Promise<void>} A promise that resolves when authentication restoration completes.
   * @throws {Error} If a persisted session or its profile cannot be restored.
   */
  async function restoreAuthentication(): Promise<void> {
    initializationError.value = null
    try {
      const authentication = await Profile.restoreAuthentication()
      if (authentication) {
        setAuthenticated(authentication.profile, authentication.session)
      }
    } catch (error: unknown) {
      initializationError.value = 'Unable to restore your session. Please sign in again.'
      throw error
    }
  }

  /**
   * @summary Stores the profile and session returned by a successful login.
   * @param {Profile} authenticatedProfile - The signed-in user's profile.
   * @param {Session} authenticatedSession - The active Supabase session.
   * @returns {void}
   */
  function setAuthenticated(authenticatedProfile: Profile, authenticatedSession: Session): void {
    profile.value = authenticatedProfile
    session.value = authenticatedSession
    initializationError.value = null
  }

  /**
   * @summary Replaces the current profile while preserving the authenticated session.
   * @param {Profile} updatedProfile - The updated user profile.
   * @returns {void}
   */
  function setProfile(updatedProfile: Profile): void {
    profile.value = updatedProfile
  }

  return {
    profile,
    session,
    initializationError,
    isAuthenticated,
    restoreAuthentication,
    setAuthenticated,
    setProfile,
  }
})
