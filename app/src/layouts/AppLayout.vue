<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import BottomNavigation from '@/components/BottomNavigation.vue'
import DeckSwitcher from '@/components/DeckSwitcher.vue'
import FeedbackBanner from '@/components/FeedbackBanner.vue'
import { useAuthStore } from '@/stores/authStore'
import { useDeckStore } from '@/stores/deckStore'

const route = useRoute()
const authStore = useAuthStore()
const deckStore = useDeckStore()
const isImmersive = computed(() => route.meta.immersive === true)
const isDeckSwitcherDisabled = computed(() => route.meta.deckSwitcherDisabled === true)
const isBottomNavigationHidden = computed(() => route.meta.hideBottomNavigation === true)

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
      class="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-app pt-[env(safe-area-inset-top)]"
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
        </div>
      </header>

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
  </div>
</template>
