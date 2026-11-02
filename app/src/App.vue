<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useDeckStore } from '@/stores/deckStore'
import router from '@/router'

const authStore = useAuthStore()
const deckStore = useDeckStore()
const isInitialNavigationReady = ref(false)
const isStartupPending = computed(
  () =>
    !isInitialNavigationReady.value ||
    authStore.isRestoring ||
    (authStore.isAuthenticated && deckStore.isLoading),
)

/**
 * @summary Waits until the router has completed its initial guarded navigation.
 * @returns {Promise<void>} A promise that resolves when the initial navigation is ready.
 */
async function waitForInitialNavigation(): Promise<void> {
  try {
    await router.isReady()
  } catch (error: unknown) {
    console.error('App could not complete its initial route navigation:', error)
  } finally {
    isInitialNavigationReady.value = true
  }
}

async function retryStartup(): Promise<void> {
  try {
    await authStore.retryAuthentication()
    if (authStore.isAuthenticated) await router.replace({ name: 'SessionStart' })
  } catch (error: unknown) {
    console.error('App could not retry startup authentication:', error)
  }
}

onMounted(() => {
  void waitForInitialNavigation()
})
</script>

<template>
  <main
    v-if="authStore.initializationError"
    class="flex min-h-dvh items-center justify-center bg-app px-4"
  >
    <section
      class="w-full max-w-md rounded-3xl border-2 border-rose-500/50 bg-rose-950/90 p-6 text-rose-200 shadow-2xl"
      role="alert"
    >
      <p>{{ authStore.initializationError }}</p>
      <button
        type="button"
        class="mt-4 min-h-11 rounded-xl bg-surface-muted px-4 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        @click="retryStartup"
      >
        Retry
      </button>
    </section>
  </main>
  <main
    v-else-if="isStartupPending"
    class="flex min-h-dvh items-center justify-center bg-app"
    role="status"
    aria-label="Loading app"
  >
    <svg
      aria-hidden="true"
      class="h-8 w-8 animate-spin text-indigo-500"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
    <span class="sr-only">Loading app</span>
  </main>
  <router-view v-else />
</template>
