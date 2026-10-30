<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Tag } from '@/models/tag'

const props = withDefaults(
  defineProps<{
    tags: Tag[]
    modelValue: string[]
    isCreating?: boolean
  }>(),
  { isCreating: false },
)

const emit = defineEmits<{
  'update:modelValue': [tagIds: string[]]
  'create-tag': [name: string]
}>()

const isExpanded = ref(false)
const isTagInputVisible = ref(false)
const tagName = ref('')
const submittedTagName = ref<string | null>(null)

const selectedTags = computed(() =>
  props.tags.filter(
    (tag): tag is Tag & { id: string } => tag.id !== null && props.modelValue.includes(tag.id),
  ),
)
const orderedTags = computed(() => {
  const selectedIds = new Set(selectedTags.value.map((tag) => tag.id))
  return [
    ...selectedTags.value,
    ...props.tags.filter((tag) => !tag.id || !selectedIds.has(tag.id)),
  ]
})

watch(
  () => [props.tags, props.modelValue, submittedTagName.value] as const,
  ([tags, selectedTagIds, submittedName]) => {
    if (!submittedName) return

    const savedTag = tags.find((tag) => tag.name === submittedName)
    if (savedTag?.id && selectedTagIds.includes(savedTag.id)) {
      tagName.value = ''
      submittedTagName.value = null
    }
  },
)

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

/**
 * @summary Selects an existing tag without toggling off an already selected tag.
 * @param {Tag} tag - The existing tag to select.
 * @returns {void}
 */
function selectExistingTag(tag: Tag): void {
  if (!tag.id || props.modelValue.includes(tag.id)) return
  emit('update:modelValue', [...props.modelValue, tag.id])
}

/**
 * @summary Toggles the inline tag list.
 * @returns {void}
 */
function toggleExpanded(): void {
  isExpanded.value = !isExpanded.value
}

/**
 * @summary Expands the selector and reveals the inline tag name field.
 * @returns {void}
 */
function showTagCreation(): void {
  isExpanded.value = true
  isTagInputVisible.value = true
}

/**
 * @summary Selects a matching existing tag or requests creation of a new tag.
 * @returns {void}
 */
function submitTagCreation(): void {
  if (props.isCreating) return

  const normalizedName = tagName.value.trim()
  if (!normalizedName) return

  const existingTag = props.tags.find((tag) => tag.name === normalizedName)
  if (existingTag) {
    selectExistingTag(existingTag)
    tagName.value = ''
    submittedTagName.value = null
    return
  }

  submittedTagName.value = normalizedName
  emit('create-tag', normalizedName)
}
</script>

<template>
  <div class="space-y-2">
    <div
      class="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface-muted px-2 py-1.5"
    >
      <div v-if="selectedTags.length > 0" class="flex min-w-0 flex-1 flex-wrap gap-1.5">
        <button
          v-for="tag in selectedTags"
          :key="tag.id ?? tag.name"
          type="button"
          :aria-pressed="true"
          :aria-label="`Deselect ${tag.name}`"
          class="min-h-8 rounded-md border border-brand-primary/40 bg-brand-primary/30 px-2 py-1 text-xs text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          @click="toggleTag(tag)"
        >
          {{ tag.name }}
        </button>
      </div>
      <span v-else class="min-w-0 flex-1 px-1 text-sm text-secondary">
        Select or create tags...
      </span>

      <button
        type="button"
        aria-label="Create tag"
        :disabled="isCreating"
        class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-wait disabled:opacity-50"
        @click="showTagCreation"
      >
        +
      </button>
      <button
        type="button"
        :aria-expanded="isExpanded"
        aria-controls="tag-options"
        :aria-label="isExpanded ? 'Collapse tag selector' : 'Expand tag selector'"
        class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-secondary transition-colors hover:bg-slate-600/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        @click="toggleExpanded"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="h-5 w-5 transition-transform"
          :class="{ 'rotate-180': isExpanded }"
        >
          <path
            fill-rule="evenodd"
            d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>

    <div
      v-if="isExpanded"
      id="tag-options"
      class="space-y-3 rounded-2xl border border-slate-700 bg-card p-3 shadow-2xl"
    >
      <div
        v-if="isTagInputVisible"
        class="flex flex-wrap items-end gap-2 rounded-xl border border-indigo-800/60 bg-indigo-950/50 p-2.5"
      >
        <label for="new-tag-name" class="min-w-0 flex-1 text-xs text-indigo-300">
          New tag
          <input
            id="new-tag-name"
            v-model="tagName"
            type="text"
            maxlength="32"
            autocomplete="off"
            placeholder="Tag name..."
            :disabled="isCreating"
            class="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-surface-muted px-3 text-sm text-primary placeholder:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-wait disabled:opacity-60"
            @keydown.enter.prevent="submitTagCreation"
          />
        </label>
        <button
          type="button"
          aria-label="Add tag"
          :disabled="isCreating || !tagName.trim()"
          class="min-h-11 rounded-xl bg-indigo-500/20 px-3 text-sm font-medium text-indigo-300 transition-colors hover:bg-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
          @click="submitTagCreation"
        >
          {{ isCreating ? 'Adding…' : 'Add Tag' }}
        </button>
      </div>

      <p v-if="tags.length === 0" class="text-sm text-secondary">
        No tags available for this deck.
      </p>
      <div
        v-else
        class="flex max-h-50 flex-wrap gap-2 overflow-y-auto"
        role="group"
        aria-label="Tags available for this deck"
      >
        <button
          v-for="tag in orderedTags"
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
  </div>
</template>
