<script setup lang="ts">
import { useSyncStatusStore } from '@/stores/syncStatusStore'

const syncStatusStore = useSyncStatusStore()
</script>

<template>
  <span
    aria-hidden="true"
    class="ml-auto h-2.5 w-2.5 shrink-0 rounded-full"
    :class="{
      'bg-emerald-500': syncStatusStore.dotColor === 'green',
      'bg-amber-400': syncStatusStore.dotColor === 'orange',
      'bg-rose-500': syncStatusStore.dotColor === 'red',
    }"
  />
</template>
