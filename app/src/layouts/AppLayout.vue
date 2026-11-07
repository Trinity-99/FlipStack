<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import BottomNavigation from '@/components/BottomNavigation.vue'
import DeckSwitcher from '@/components/DeckSwitcher.vue'
import FeedbackBanner from '@/components/FeedbackBanner.vue'
import SyncStatusDot from '@/components/SyncStatusDot.vue'
import versionData from '@/version.json'
import { useAuthStore } from '@/stores/authStore'
import { useDeckStore } from '@/stores/deckStore'
import { useSyncStatusStore } from '@/stores/syncStatusStore'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const deckStore = useDeckStore()
const syncStatusStore = useSyncStatusStore()
const isImmersive = computed(() => route.meta.immersive === true)
const isDeckSwitcherDisabled = computed(() => route.meta.deckSwitcherDisabled === true)
const isBottomNavigationHidden = computed(() => route.meta.hideBottomNavigation === true)
const isLogoutDialogOpen = ref(false)
const isLoggingOut = ref(false)
const logoutError = ref<string | null>(null)

/**
 * @summary Opens the pending-changes confirmation or immediately signs out.
 * @returns {void}
 */
function requestLogout(): void {
  logoutError.value = null
  if (syncStatusStore.status.pending) {
    isLogoutDialogOpen.value = true
    return
  }

  void confirmLogout()
}

/**
 * @summary Signs out locally and replaces the current route with Login.
 * @returns {Promise<void>} A promise that resolves after navigation.
 */
async function confirmLogout(): Promise<void> {
  if (isLoggingOut.value) return
  isLoggingOut.value = true
  logoutError.value = null

  try {
    await authStore.logout()
  } catch (error: unknown) {
    console.error('AppLayout could not sign out:', error)
    logoutError.value = 'Unable to log out. Please try again.'
    isLoggingOut.value = false
    return
  }

  isLogoutDialogOpen.value = false
  try {
    await router.replace({ name: 'Login' })
  } catch (error: unknown) {
    console.error('AppLayout signed out but could not open Login:', error)
    logoutError.value = 'You are signed out, but the login screen could not be opened.'
    isLoggingOut.value = false
  }
}

/**
 * @summary Closes the logout confirmation without signing out.
 * @returns {void}
 */
function cancelLogout(): void {
  if (isLoggingOut.value) return
  isLogoutDialogOpen.value = false
}

async function retryDeckLoading(): Promise<void> {
  try {
    await deckStore.retryLoad()
  } catch {
    // The deck store exposes retry failures in the error state, rendered below.
  }
}
</script>

<template>
  <div class="min-h-dvh bg-app">
    <div
      class="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-app pt-[env(safe-area-inset-top)] sm:max-w-[720px]"
    >
      <header
        v-if="!isImmersive"
        class="sticky top-0 z-20 border-b border-border-subtle bg-app/95 px-4 py-3 backdrop-blur"
      >
        <div class="flex items-center gap-2">
          <DeckSwitcher :disabled="isDeckSwitcherDisabled" />

          <RouterLink
            :to="{ name: 'CardList' }"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-secondary transition-colors hover:bg-surface-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Open card list"
            title="Cards"
          >
            <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 4.75h14A1.25 1.25 0 0120.25 6v12A1.25 1.25 0 0119 19.25H5A1.25 1.25 0 013.75 18V6A1.25 1.25 0 015 4.75zM8 9h8M8 12h8M8 15h5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </RouterLink>

          <RouterLink
            :to="{ name: 'SessionStart' }"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-secondary transition-colors hover:bg-surface-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Go to study session start"
            title="Study"
          >
            <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 014 16.5v-11zM4 16.5A2.5 2.5 0 016.5 14H20"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </RouterLink>

          <div class="flex shrink-0 flex-col items-end">
            <span
              class="text-[9px] leading-3 text-secondary"
              :aria-label="`App version ${versionData.version}`"
              :title="`App version ${versionData.version}`"
            >
              v {{ versionData.version }}
            </span>
            <div class="flex items-center gap-2">
              <SyncStatusDot />

              <button
                v-if="authStore.isAuthenticated"
                type="button"
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-secondary transition-colors hover:bg-surface-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Log out"
                title="Log out"
                :disabled="isLoggingOut"
                @click="requestLogout"
              >
                <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M10 5H6.75A1.75 1.75 0 005 6.75v10.5A1.75 1.75 0 006.75 19H10m4-3 4-4-4-4m4 4H9"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <FeedbackBanner v-if="logoutError" :message="logoutError" variant="error" />

      <FeedbackBanner
        v-if="deckStore.error && !isImmersive"
        :message="deckStore.error"
        variant="error"
      >
        <button
          v-if="authStore.profile"
          type="button"
          class="ml-2 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          @click="retryDeckLoading"
        >
          Try again
        </button>
      </FeedbackBanner>

      <main class="flex flex-1 flex-col" :class="isImmersive ? 'p-0' : 'px-4 py-5'">
        <RouterView />
      </main>

      <BottomNavigation v-if="!isImmersive && !isBottomNavigationHidden" />
    </div>

    <dialog
      v-if="isLogoutDialogOpen"
      open
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-dialog-title"
      class="fixed inset-0 z-50 m-0 flex h-dvh max-h-none w-full max-w-none items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <section class="w-full max-w-sm rounded-3xl border-2 border-slate-600 bg-card p-6 shadow-2xl">
        <h2 id="logout-dialog-title" class="text-xl font-semibold text-primary">Log out?</h2>
        <p class="mt-3 text-sm text-secondary">
          Some changes have not been saved online yet. They remain on this device for you, but will
          be lost if a different user logs in before they sync.
        </p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="min-h-11 rounded-xl px-4 text-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isLoggingOut"
            @click="cancelLogout"
          >
            Cancel
          </button>
          <button
            type="button"
            class="min-h-11 rounded-xl bg-brand-primary px-4 font-semibold text-primary hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isLoggingOut"
            @click="confirmLogout"
          >
            {{ isLoggingOut ? 'Logging out…' : 'Log out' }}
          </button>
        </div>
      </section>
    </dialog>
  </div>
</template>
