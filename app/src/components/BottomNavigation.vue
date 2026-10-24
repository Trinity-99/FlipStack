<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()
const isCardsActive = computed(() => route.path.startsWith('/cards'))
const isStudyActive = computed(() => route.path.startsWith('/study'))
</script>

<template>
  <nav
    aria-label="Main navigation"
    class="sticky bottom-0 z-20 mt-auto border-t border-border-subtle bg-card/95 px-4 pt-2 pb-[env(safe-area-inset-bottom)] backdrop-blur"
  >
    <div class="mx-auto grid max-w-md grid-cols-2 gap-2">
      <RouterLink
        :to="{ name: 'SessionStart' }"
        class="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        :class="
          isStudyActive
            ? 'bg-brand-primary/15 text-primary'
            : 'text-secondary hover:bg-surface-muted'
        "
        :aria-current="isStudyActive ? 'page' : undefined"
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
        <span>Study</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'CardList' }"
        class="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        :class="
          isCardsActive
            ? 'bg-brand-primary/15 text-primary'
            : 'text-secondary hover:bg-surface-muted'
        "
        :aria-current="isCardsActive ? 'page' : undefined"
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
        <span>Cards</span>
      </RouterLink>
    </div>
  </nav>
</template>
