<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { Card, CardContent } from '@/models/card'
import { useCardStore } from '@/stores/cardStore'
import { useDeckStore } from '@/stores/deckStore'

type CardSide = keyof CardContent

interface AvailableSide {
  key: CardSide
  label: string
}

const SIDE_KEYS: CardSide[] = ['s1', 's2', 's3']

const cardStore = useCardStore()
const deckStore = useDeckStore()
const selectedTagId = ref<string | null>(null)
const sortSide = ref<CardSide | null>(null)
const sortDirection = ref<'ascending' | 'descending'>('ascending')

const availableSides = computed<AvailableSide[]>(() => {
  const deck = deckStore.activeDeck
  if (!deck) return []

  return deck.sideLabels.flatMap((label, index) => {
    const key = SIDE_KEYS[index]
    return key ? [{ key, label }] : []
  })
})

const visibleCards = computed(() => {
  const filteredCards = cardStore.cards.filter(
    (card): card is Card & { id: string } =>
      card.id !== null &&
      (selectedTagId.value === null || card.tagIds.includes(selectedTagId.value)),
  )
  const side = sortSide.value

  if (!side) return filteredCards

  return [...filteredCards].sort(
    (first, second) =>
      (first.content[side] ?? '').localeCompare(second.content[side] ?? '', undefined, {
        sensitivity: 'base',
      }) * (sortDirection.value === 'ascending' ? 1 : -1),
  )
})
watch(
  () => deckStore.activeDeckId,
  () => {
    selectedTagId.value = null
    sortSide.value = null
    sortDirection.value = 'ascending'
  },
)

/**
 * @summary Updates the selected tag filter from the tag select control.
 * @param {Event} event - The select control change event.
 * @returns {void}
 */
function updateSelectedTag(event: Event): void {
  if (!(event.currentTarget instanceof HTMLSelectElement)) return
  selectedTagId.value = event.currentTarget.value || null
}

/**
 * @summary Updates the selected side sort from the sort select control.
 * @param {Event} event - The select control change event.
 * @returns {void}
 */
function toggleSort(side: CardSide): void {
  if (sortSide.value === side) {
    sortDirection.value = sortDirection.value === 'ascending' ? 'descending' : 'ascending'
    return
  }

  sortSide.value = side
  sortDirection.value = 'ascending'
}
</script>

<template>
  <section class="flex flex-1 flex-col gap-5" aria-labelledby="card-list-title">
    <div class="flex items-center justify-between gap-4">
      <h1 id="card-list-title" class="text-2xl font-semibold text-primary">Cards</h1>
      <RouterLink
        v-if="deckStore.activeDeck"
        :to="{ name: 'CardCreate' }"
        aria-label="Create a new card"
        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary text-3xl leading-none text-white shadow-lg transition-colors hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app"
      >
        <span aria-hidden="true">+</span>
      </RouterLink>
    </div>

    <p
      v-if="!deckStore.activeDeck"
      class="rounded-xl border border-slate-700/60 bg-card p-4 text-secondary"
      role="status"
    >
      please select a deck.
    </p>

    <template v-else>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="flex min-w-0 flex-col gap-1.5 text-sm text-secondary">
          <span>Filter by tag</span>
          <select
            :value="selectedTagId ?? ''"
            class="min-h-11 w-full rounded-xl border border-slate-700/60 bg-surface-muted px-3 text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Filter cards by tag"
            @change="updateSelectedTag"
          >
            <option value="">All Tags</option>
            <option v-for="tag in deckStore.tags" :key="tag.id ?? tag.name" :value="tag.id ?? ''">
              {{ tag.name }}
            </option>
          </select>
        </label>
      </div>

      <div
        v-if="visibleCards.length > 0"
        class="overflow-x-auto rounded-xl border border-slate-700/60 bg-card"
      >
        <table class="w-full table-fixed border-collapse text-left">
          <thead class="bg-surface-muted text-sm text-secondary">
            <tr>
              <th
                v-for="side in availableSides"
                :key="side.key"
                scope="col"
                class="border-b border-slate-700/60 p-2 sm:p-3"
                :aria-sort="
                  sortSide === side.key
                    ? sortDirection === 'ascending'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                "
              >
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center justify-between gap-1 text-left text-base font-semibold text-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary"
                  :aria-label="`Sort by ${side.label} ${
                    sortSide === side.key && sortDirection === 'ascending'
                      ? 'descending'
                      : 'ascending'
                  }`"
                  @click="toggleSort(side.key)"
                >
                  <span class="truncate">{{ side.label }}</span>
                  <span aria-hidden="true" class="shrink-0 text-brand-primary">
                    {{ sortSide !== side.key ? '↕' : sortDirection === 'ascending' ? '↑' : '↓' }}
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="card in visibleCards"
              :key="card.id"
              class="border-b border-slate-700/60 last:border-b-0 hover:bg-surface-muted/50"
            >
              <td
                v-for="(side, index) in availableSides"
                :key="side.key"
                class="min-w-0 p-1 sm:p-1.5"
              >
                <RouterLink
                  :to="{ name: 'CardEdit', params: { id: card.id } }"
                  :aria-label="
                    card.content[side.key]
                      ? `Edit card: ${card.content[side.key]}`
                      : `Edit card with empty ${side.label}`
                  "
                  class="block truncate rounded-sm text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  :class="index === 0 ? 'font-medium text-primary' : 'text-secondary'"
                >
                  {{ card.content[side.key] }}
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p
        v-else-if="cardStore.cards.length === 0"
        class="rounded-xl border border-slate-700/60 bg-card p-4 text-secondary"
        role="status"
      >
        No cards in this deck yet.
      </p>
      <p
        v-else
        class="rounded-xl border border-slate-700/60 bg-card p-4 text-secondary"
        role="status"
      >
        No cards match the selected tag.
      </p>
    </template>
  </section>
</template>
