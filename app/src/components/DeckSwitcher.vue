<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useDeckStore } from '@/stores/deckStore'

const props = defineProps<{
  disabled?: boolean
}>()

const deckStore = useDeckStore()
const rootElement = ref<HTMLElement | null>(null)
const isOpen = ref(false)

function closeMenu(): void {
  isOpen.value = false
}

function closeOnOutsideClick(event: MouseEvent): void {
  if (event.target instanceof Node && !rootElement.value?.contains(event.target)) {
    closeMenu()
  }
}

function closeOnEscape(): void {
  closeMenu()
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closeMenu()
  },
)

async function selectDeck(deckId: string): Promise<void> {
  if (deckId === deckStore.activeDeckId) {
    closeMenu()
    return
  }

  try {
    await deckStore.selectActiveDeck(deckId)
    closeMenu()
  } catch {
    // The store exposes the failure to the shell and leaves the current deck active.
  }
}

onMounted(() => {
  document.addEventListener('click', closeOnOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnOutsideClick)
})
</script>

<template>
  <div ref="rootElement" class="relative min-w-0 flex-1" @keydown.esc="closeOnEscape">
    <button
      type="button"
      class="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-muted px-3 py-2 text-left text-primary transition-colors hover:border-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
      aria-label="Select active deck"
      aria-controls="deck-switcher-menu"
      :aria-expanded="isOpen"
      :disabled="disabled"
      @click="isOpen = !isOpen"
    >
      <span class="truncate font-semibold">
        {{
          deckStore.activeDeck?.title ?? (deckStore.isLoading ? 'Loading decks…' : 'Select a deck')
        }}
      </span>
      <svg
        v-if="!disabled"
        aria-hidden="true"
        class="h-4 w-4 shrink-0 transition-transform"
        :class="{ 'rotate-180': isOpen }"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fill-rule="evenodd"
          d="M5.22 7.22a.75.75 0 011.06 0L10 10.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 8.28a.75.75 0 010-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </button>

    <div
      v-if="isOpen && !disabled"
      id="deck-switcher-menu"
      class="absolute left-0 right-0 top-full z-30 mt-2 max-h-[min(70vh,24rem)] overflow-y-auto rounded-2xl border-2 border-slate-600 bg-card p-2 shadow-2xl"
      role="menu"
      aria-label="Available decks"
    >
      <p v-if="deckStore.isLoading" class="px-3 py-2 text-sm text-secondary" role="status">
        Loading deck data…
      </p>
      <p v-else-if="deckStore.decks.length === 0" class="px-3 py-2 text-sm text-secondary">
        No decks yet.
      </p>

      <button
        v-for="deck in deckStore.decks"
        :key="deck.id ?? deck.title"
        type="button"
        role="menuitem"
        class="flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-wait disabled:opacity-50"
        :aria-current="deck.id === deckStore.activeDeckId ? 'true' : undefined"
        :disabled="deckStore.isLoading || !deck.id"
        @click="deck.id && selectDeck(deck.id)"
      >
        <span class="truncate">{{ deck.title }}</span>
        <span v-if="deck.id === deckStore.activeDeckId" class="ml-2 text-brand-primary">
          Active
        </span>
      </button>

      <RouterLink
        :to="{ name: 'DeckCreate' }"
        role="menuitem"
        class="mt-2 flex min-h-11 items-center rounded-xl border-t border-border-subtle px-3 pt-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        @click="closeMenu"
      >
        + Create New Deck
      </RouterLink>
    </div>
  </div>
</template>
