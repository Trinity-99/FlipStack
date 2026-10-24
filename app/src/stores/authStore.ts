import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/models/profile'

/**
 * @summary Stores the current user's profile and in-memory authentication session.
 */
export const useAuthStore = defineStore('auth', () => {
  const profile = shallowRef<Profile | null>(null)
  const session = shallowRef<Session | null>(null)
  const isAuthenticated = computed(() => profile.value !== null && session.value !== null)

  /**
   * @summary Stores the profile and session returned by a successful login.
   * @param {Profile} authenticatedProfile - The signed-in user's profile.
   * @param {Session} authenticatedSession - The active Supabase session.
   * @returns {void}
   */
  function setAuthenticated(authenticatedProfile: Profile, authenticatedSession: Session): void {
    profile.value = authenticatedProfile
    session.value = authenticatedSession
  }

  return { profile, session, isAuthenticated, setAuthenticated }
})
