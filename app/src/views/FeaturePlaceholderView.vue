<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const title = computed(() =>
  typeof route.meta.placeholderTitle === 'string' ? route.meta.placeholderTitle : 'Coming soon',
)
const description = computed(() =>
  typeof route.meta.placeholderDescription === 'string'
    ? route.meta.placeholderDescription
    : 'This destination will be implemented in its own user story.',
)
</script>

<template>
  <section class="flex flex-1 items-center justify-center">
    <div class="w-full rounded-3xl border-2 border-slate-600 bg-card p-6 text-center shadow-2xl">
      <p class="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-brand-primary">
        FlipStack
      </p>
      <h1 class="text-2xl font-bold text-primary">{{ title }}</h1>
      <p class="mt-3 text-sm leading-relaxed text-secondary">{{ description }}</p>
      <p
        class="mt-5 rounded-xl border border-amber-800/60 bg-amber-950 px-4 py-3 text-sm text-amber-300"
      >
        Temporary navigation preview
      </p>
    </div>
  </section>
</template>
