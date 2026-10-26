<script setup lang="ts">
import { computed } from 'vue'

type FeedbackBannerVariant = 'error' | 'success' | 'warning'

const props = defineProps<{
  message: string
  variant: FeedbackBannerVariant
}>()

const variantClasses = computed(() => {
  if (props.variant === 'error') return 'border-rose-500/50 bg-rose-950/95 text-rose-300'
  if (props.variant === 'warning') return 'border-amber-500/50 bg-amber-950/95 text-amber-300'
  return 'border-emerald-500/50 bg-emerald-950/95 text-emerald-300'
})
const isAlert = computed(() => props.variant !== 'success')
const role = computed(() => (isAlert.value ? 'alert' : 'status'))
const liveMode = computed(() => (isAlert.value ? 'assertive' : 'polite'))
</script>

<template>
  <Transition name="feedback">
    <div
      v-if="message"
      class="feedback-banner top-[calc(env(safe-area-inset-top)+3.8125rem)] z-[60] flex items-center justify-between gap-3 rounded-xl border px-4 py-2 text-sm"
      :class="variantClasses"
    >
      <span class="min-w-0 flex-1" :role="role" :aria-live="liveMode">{{ message }}</span>
      <slot />
    </div>
  </Transition>
</template>

<style scoped>
.feedback-banner {
  position: fixed;
  inset-inline: max(1rem, calc((100vw - 28rem) / 2));
}

.feedback-enter-active,
.feedback-leave-active {
  transition:
    opacity 680ms ease,
    transform 680ms ease;
}

.feedback-enter-from,
.feedback-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .feedback-enter-active,
  .feedback-leave-active {
    transition: none;
  }
}
</style>
