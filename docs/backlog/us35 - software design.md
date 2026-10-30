# US35 — Tag Selector Software Design

## 1. Scope

Specify the implementation for the compact, expandable tag selector and in-form tag creation used by the card create/edit screen. This document adds technical detail only; it does not replace or edit the user story, Architecture, Coding Guidelines, PRD, or UI Design specifications.

## 2. Existing implementation and constraints

- [Architecture.md](../Architecture.md) defines a Pure Active Record boundary: models own database access; views and stores use models; there is no service or repository layer.
- [coding_guidelines.md](../coding_guidelines.md) requires Vue Composition API components, setup-style Pinia stores, strict TypeScript, explicit types, JSDoc for public model methods, and Tailwind-first styling.
- [UI Design.md](../UI%20Design.md) defines the app surfaces, colors, radii, focus treatment, and compact mobile form guidance.
- [us35 - tag_selector.md](./us35%20-%20tag_selector.md) defines the compact selector and inline tag creation flow.
- [TagSelector.vue](../../app/src/components/TagSelector.vue) currently renders all deck tags as selectable pills and emits selected tag IDs. It is used by [CardEditView.vue](../../app/src/views/CardEditView.vue).
- [CardEditView.vue](../../app/src/views/CardEditView.vue) owns the selected tag IDs, already renders the shared `FeedbackBanner`, and saves tag relations through `Card.save()`.
- [tag.ts](../../app/src/models/tag.ts) already provides the `Tag` Active Record, including `save()` validation and persistence, and `findAllForDeck()`.
- [deckStore.ts](../../app/src/stores/deckStore.ts) loads tags for the active deck and caches them in `tags`. Its existing `createDirection()`/`upsertDirection()` methods establish the pattern for coordinating persistence and active-deck cache updates.
- [createDatabase.sql](../../database/createDatabase.sql) defines tags with a unique `(deck_id, name)` constraint and a 1–32 character name constraint. The `Tag` model mirrors the name limit.
- The `Tag` model and database do not contain a color property. Per the clarification for this design, tag creation will not include a color picker or add color persistence.

## 3. Confirmed design choices

- Expand the selector as an inline accordion below its trigger.
- Keep all selected tag pills visible in the collapsed control and allow them to wrap. The control may exceed one input-height row when several tags are selected.
- If an exact, trimmed tag name already exists in the active deck, select that tag rather than creating a duplicate.
- Do not add tag color to the model or database, and do not modify the existing specifications.

## 4. File changes

| File | Change |
|---|---|
| `app/src/components/TagSelector.vue` | Replace the always-visible pill list with the inline expandable selector. Retain controlled selected-ID state, add the inline name-entry interaction, and emit a creation request to the parent. |
| `app/src/views/CardEditView.vue` | Handle the creation request, ask the deck store to persist/cache the tag, select its ID for the current card, and report failures through the existing feedback pattern. |
| `app/src/stores/deckStore.ts` | Add active-deck tag cache synchronization and a store action that creates a tag through the `Tag` model. |
| `app/src/__tests__/TagSelector.spec.ts` | Extend component tests for the accordion, selection controls, inline creation input, duplicate selection, and emitted creation requests. |
| `app/src/__tests__/deckStore.spec.ts` | Test tag creation, active-deck cache insertion/replacement, duplicate reuse, invalid context, and persistence failure behavior. |
| `app/src/__tests__/CardEditView.spec.ts` | Test that a requested tag is created through the store and selected for the card, and that failures are surfaced without changing card persistence behavior. |

No new component, model, composable, service, repository, database migration, or route is needed. Keep the existing component at `app/src/components/TagSelector.vue`; do not move it to the nested path mentioned in the story's proposed component structure.

## 5. Component design — `TagSelector.vue`

Keep the component controlled by its parent for selected tag IDs:

```ts
defineProps<{
  tags: Tag[]
  modelValue: string[]
}>()

defineEmits<{
  'update:modelValue': [tagIds: string[]]
  'create-tag': [name: string]
}>()
```

Retain the existing `toggleTag(tag: Tag): void` behavior: ignore an unsaved tag without an ID, otherwise emit a new ID list with that tag toggled.

Add component-local state for:

- Whether the inline accordion is expanded.
- Whether the inline creation input is visible.
- The draft tag name.

Add focused handlers:

- `toggleExpanded(): void` opens/closes the inline accordion.
- `showTagCreation(): void` expands the selector if necessary and reveals the name input.
- `submitTagCreation(): void` trims the draft, does nothing for a blank name, and emits `create-tag` for a new name. Keep the input and accordion open while the request is pending.
- `selectExistingTag(tag: Tag): void` selects the exact matching active-deck tag and clears the draft without emitting a creation request.

Compare duplicate names after trimming and with exact case-sensitive equality, matching the database's existing unique constraint. The store also checks for an existing active-deck tag so callers other than this component do not create an avoidable duplicate.

When creation succeeds, the parent updates `tags` and `modelValue`; clear the draft once the matching saved tag is present and selected. If creation fails, leave the draft available for correction or retry. The component does not perform persistence or swallow errors.

### Rendering and interaction

- The collapsed control contains the selected tag pills, a semantic `+` button, and a separate expand/collapse button. Keep these as sibling controls; do not nest interactive buttons.
- Selected pills remain individually removable and expose their selected state accessibly.
- The expand/collapse button exposes `aria-expanded` and `aria-controls`.
- The accordion lists selected tags first and other available tags afterward. Use semantic buttons with `aria-pressed` for selection, stable tag IDs as keys, and a scrollable list with the story's approximately 200px maximum height.
- The `+` action reveals an associated, labeled text input and an **Add Tag** button. Submitting with Enter performs the same action.
- Retain a create action when the deck has no tags; an empty tag list must not block creating its first tag.
- Keep touch targets, visible focus styles, and surfaces consistent with [UI Design.md](../UI%20Design.md) and the existing component.
- Do not render a color picker or color dot because tag color is not part of the existing data model or database schema.

## 6. Store design — `useDeckStore` in `deckStore.ts`

Add the following public actions to the setup store:

```ts
function upsertTag(tag: Tag): void
async function createTag(name: string): Promise<Tag>
```

`upsertTag(tag)`:

- Rejects an unsaved tag.
- Rejects a tag that does not belong to the currently active deck.
- Adds a new tag or replaces the cached tag with the same ID.

`createTag(name)`:

1. Requires a loaded active deck and a non-empty name after trimming.
2. Finds an exact trimmed-name match in the active deck's cached `tags`; if found, returns that saved tag without issuing an insert.
3. Creates `new Tag(null, activeDeckId, trimmedName, null)` and calls `save()`.
4. Calls `upsertTag()` only after persistence succeeds, then returns the saved domain object.
5. Logs failures with context and rethrows them. Do not add a success-shaped fallback.
6. Must not add a tag from an old deck context to the cache if the active deck changes while the save is in flight.

The database's unique constraint remains authoritative. If a concurrent or stale-context insert reaches it and fails, surface that error rather than masking it as a successful duplicate selection.

Do not add persistence to the store or component. `Tag.save()` remains the only operation that writes a tag.

## 7. Card form integration — `CardEditView.vue`

Add an async handler for the component's `create-tag` event:

```ts
async function createTag(name: string): Promise<void>
```

The handler:

1. Calls `deckStore.createTag(name)`.
2. Adds the returned tag ID to `selectedTagIds` if it is not already selected.
3. On failure, logs the form-level context and displays a concise error through the existing `useFeedback`/`FeedbackBanner` flow. It must not report success or change the selected IDs.

Bind the handler to `TagSelector` and keep its existing `v-model` update behavior. A saved tag is therefore selected before the existing `Card.save()` persists the card and its tag relations. Do not add direct Supabase access to the view, change card persistence, or create a card-tag model.

## 8. Test coverage

Extend the existing focused test files:

- `TagSelector.spec.ts`: collapsed initial state; opening/closing the accordion; toggling selected tags; showing and submitting the creation input with Enter and the button; trimming; exact duplicate selecting the existing ID without emitting `create-tag`; input staying available until the saved tag appears and is selected; empty-deck creation affordance.
- `deckStore.spec.ts`: a new tag is saved and cached; an existing exact-name tag is returned without saving; a saved tag replaces the matching cache entry; no active deck or invalid tag is rejected; save failure leaves the cache unchanged and is rethrown; a late completion cannot contaminate another active deck's tag cache.
- `CardEditView.spec.ts`: the emitted request reaches the store; the returned tag ID is selected; a store failure is visible through the shared error feedback and does not mark the tag selected.

Preserve the existing tests for card creation/editing and the current `TagSelector` selection contract.

## 9. Data flow and architecture

1. `CardEditView` passes `deckStore.tags` and `selectedTagIds` into `TagSelector`.
2. `TagSelector` handles expansion and selection locally. For a new name, it emits a typed request; it does not access a store or model.
3. `CardEditView` delegates creation to `DeckStore`.
4. `DeckStore` constructs and saves a `Tag` through the Active Record model, then updates its active-deck cache.
5. The view selects the returned ID. The existing `Card.save()` persists the card and its `card_tag` relations.

This keeps database access in models, cache coordination in the Pinia store, and transient control state in the component. No layer calls upward.

## 10. Implementation validation

After this design is approved and implemented, run the focused `TagSelector.spec.ts`, `deckStore.spec.ts`, and `CardEditView.spec.ts` tests, followed by the app's lint/type-check command if required by the changed files.
