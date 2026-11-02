import { computed } from 'vue'
import { defineStore } from 'pinia'
import { dataRouter } from '@/data/dataRouter'

/**
 * @summary Exposes data-router sync state to UI components.
 */
export const useSyncStatusStore = defineStore('syncStatus', () => {
  const status = computed(() => dataRouter.status.value)
  const dotColor = computed(() => {
    if (!status.value.online || status.value.abandoned) return 'red'
    if (status.value.syncing || status.value.pending) return 'orange'
    return 'green'
  })

  return { status, dotColor }
})
