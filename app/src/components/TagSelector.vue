<script setup lang="ts">
import { Tag } from '@/models/tag'

const props = defineProps<{
  tags: Tag[]
  modelValue: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [tagIds: string[]]
}>()

/**
 * @summary Toggles a saved tag in the selected tag ID list.
 * @param {Tag} tag - The tag selected by the user.
 * @returns {void}
 */
function toggleTag(tag: Tag): void {
  if (!tag.id) return

  const selectedTagIds = props.modelValue.includes(tag.id)
    ? props.modelValue.filter((tagId) => tagId !== tag.id)
    : [...props.modelValue, tag.id]
  emit('update:modelValue', selectedTagIds)
}
</script>

<template>
  <div>
    <p v-if="tags.length === 0" class="text-sm text-secondary">No tags available for this deck.</p>
    <div v-else class="flex flex-wrap gap-2">
      <button
        v-for="tag in tags"
        :key="tag.id ?? tag.name"
        type="button"
        :disabled="!tag.id"
        :aria-pressed="tag.id ? modelValue.includes(tag.id) : false"
        class="min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
        :class="
          tag.id && modelValue.includes(tag.id)
            ? 'border-brand-primary bg-brand-primary text-white'
            : 'border-border-subtle bg-surface-muted text-secondary'
        "
        @click="toggleTag(tag)"
      >
        {{ tag.name }}
      </button>
    </div>
  </div>
</template>
