# US30 - Card Edit & Create Software Design

## 1. Goal

Define the implementation for creating and editing cards with partial multi-line side content and reusable deck tags. This is a design document only; application code and existing specifications remain unchanged.

## 2. Existing code and architectural constraints

- [Architecture.md](../Architecture.md) requires a Pure Active Record model boundary: only models access Supabase; views and Pinia stores call models; do not add a service or repository layer.
- [coding_guidelines.md](../coding_guidelines.md) requires strict TypeScript, Composition API `<script setup>`, setup-style Pinia stores, explicit types, JSDoc for public model methods, and Tailwind-first styling.
- [UI Design.md](../UI%20Design.md) defines the app/card surfaces, primary and secondary text colors, rose error banners, emerald success feedback, 24px primary card radius/padding, and the 375 x 812 mobile baseline.
- [us30 - card_edit.md](./us30%20-%20card_edit.md) defines the create/edit actions, dynamic side labels, partial cards, tag selection, non-empty validation, and the two-second success feedback selected for "Save & Create Next."
- The PRD allows decks with two or three sides, stores side content as a JSON object, and treats missing side keys as empty. A card with fewer than two populated sides can be saved.
- [card.ts](../../app/src/models/card.ts) already implements the `Card` Active Record, `save()`, `delete()`, `findById()`, `findAllForDeck()`, tag-junction synchronization, and `isStudyReady()` (general readiness based on at least two populated sides).
- The Study Engine is not implemented in `app/src/` yet. Study-specific eligibility is determined dynamically by the future Study Engine based on its direction; US30 must not persist a completion/readiness flag or add a database column.
- [tag.ts](../../app/src/models/tag.ts) and [deckStore.ts](../../app/src/stores/deckStore.ts) already provide the tag model and active deck/tag context.
- [cardStore.ts](../../app/src/stores/cardStore.ts) fetches and caches the active deck's cards but currently has no method to synchronize one saved card into that cache.
- [router/index.ts](../../app/src/router/index.ts) currently routes `/cards/new` to a placeholder. It has no card edit route. The existing `/cards` route is also a placeholder and belongs to US40.
- [AppLayout.vue](../../app/src/layouts/AppLayout.vue) supplies the shared header, bottom navigation, app background, and content frame. The card editor must render only its page content.
- `Card.save()` already synchronizes the card's `card_tag` relations. No separate `CardTag` model is needed.

## 3. Proposed file changes

| File | Change |
|---|---|
| `app/src/models/card.ts` | Keep `Card` as the Active Record. Add a shared 256-character per-side limit and update `save()` to normalize side text, reject over-limit sides, and reject a card with no non-whitespace side before network access. Keep the existing card and tag persistence flow. Do not add a completion flag or change `isStudyReady()` for study-specific rules. |
| `app/src/stores/cardStore.ts` | Add `upsertCard(card: Card): void` to add a newly saved card or replace an edited card in the cached collection for that card's deck. Do not replace cache state belonging to another deck. |
| `app/src/components/TagSelector.vue` | Add a focused multi-select pill component for selecting/deselecting existing `Tag` instances. It receives the active deck's tags and selected tag IDs; it does not create or persist tags. |
| `app/src/views/CardEditView.vue` | Add the shared create/edit form. It owns draft content, selected tags, validation and feedback, loads a card for editing, calls the model/store, handles the create-next reset/focus behavior, and navigates after save-and-close/save-changes. |
| `app/src/router/index.ts` | Route `/cards/new` to `CardEditView.vue`; add `/cards/edit/:id` using the same view. Keep the existing `CardList` route and placeholder unchanged for US40. |
| `app/src/__tests__/card.spec.ts` | Add Active Record tests for content normalization/validation, partial content, insert/update behavior, and tag-junction synchronization/error propagation. |
| `app/src/__tests__/cardStore.spec.ts` | Test adding and replacing a saved card in the cache, rejecting an unsaved card, and not changing a different deck's cache. |
| `app/src/__tests__/TagSelector.spec.ts` | Test rendering the available tags and emitting selected IDs as tags are selected and deselected. |
| `app/src/__tests__/CardEditView.spec.ts` | Test create/edit mode, dynamic side labels, validation, tags, each save action, error/success feedback, cache synchronization, focus reset, and routing. |
| `app/src/__tests__/App.spec.ts` or a focused router test | Verify the create and edit routes resolve to the editor while `/cards` remains the Card List destination. |

## 4. Card model design - `Card` in `card.ts`

The current model already owns all persistence and tag-junction operations. Retain that Active Record boundary and make the model enforce the card-content invariants even if a caller bypasses the view.

### `save(): Promise<void>`

Add a public static readonly `MAX_SIDE_LENGTH` constant with the value `256`, used by both the view and model so the limit has a single source of truth.

Update the existing method to:

1. Normalize `content` before persistence: trim leading/trailing whitespace from each side and omit sides that are blank after trimming. This preserves interior newlines and Unicode while matching the PRD convention that missing keys mean empty sides.
2. Validate `deckId`, `userId`, that at least one normalized side remains, and that no side exceeds `Card.MAX_SIDE_LENGTH` characters after normalization. Throw a descriptive `Error` before any network request if validation fails. Use the same UTF-16 code-unit length semantics as the native textarea `maxlength` attribute.
3. Keep the existing insert/update behavior for the `card` record.
4. Keep calling the existing private `syncTags(cardId)` method so selected tag IDs replace the card's `card_tag` relations as part of the model save flow.
5. Retain contextual error logging and rethrow behavior for Supabase failures.

The existing private `syncTags(cardId: string): Promise<void>` remains responsible for junction synchronization. No separate public tag persistence method is added.

The view performs its own validation to show the exact inline message, "At least one side must contain text", and an explicit message when a side exceeds 256 characters; model validation protects both invariants for all callers. The model trims saved text because this behavior was selected during design clarification. Blank side keys are omitted; the story's one-side payload therefore remains `{"s1":"..."}`.

`isStudyReady(): boolean` remains a general, derived two-populated-side check. It does not write to the database. Study-specific qualification based on the selected direction is a Study Engine responsibility and is outside US30.

## 5. Card store design - `useCardStore` in `cardStore.ts`

Add:

```ts
function upsertCard(card: Card): void
```

Behavior:

- Throw if `card.id` is null; only a persisted card can be added to the cache.
- If `loadedDeckId` does not equal `card.deckId`, leave the other deck's cached collection untouched.
- Replace the cached entry when its ID already exists.
- Add a newly saved card to the beginning of the matching deck's collection, consistent with `Card.findAllForDeck()` ordering by newest first.
- Return the method from the setup store alongside the existing fetch/set/clear functions.

The editor calls this only after `Card.save()` succeeds. It does not fetch the full deck again for each save.

## 6. Tag selector design - `TagSelector.vue`

Implement a small controlled component using `<script setup lang="ts">`:

```ts
defineProps<{
  tags: Tag[]
  modelValue: string[]
}>()

defineEmits<{
  'update:modelValue': [tagIds: string[]]
}>()
```

Render the supplied deck tags as semantic buttons styled as selectable pills. Clicking a pill emits a new ID array with that tag toggled. The component does not access Pinia, Supabase, or the `Tag` model's persistence methods. An empty tag list renders a concise empty state and allows saving with no selected tags; tags are optional.

## 7. View design - `CardEditView.vue`

Use `<script setup lang="ts">`. The view obtains the active deck and its tags from `useDeckStore()`, the authenticated profile from `useAuthStore()`, the card cache from `useCardStore()`, and route/navigation from Vue Router. It must not access Supabase directly.

### Mode and active deck context

- No `id` route parameter means creation mode; `/cards/new` uses the current active deck.
- An `id` route parameter means editing mode; `/cards/edit/:id` loads through `Card.findById(id)`.
- Editing must confirm the loaded card belongs to the active deck before showing/saving its data. A missing card, missing active deck, or mismatched deck is shown as an explicit load error and prevents submission.
- The shared header deck switcher is disabled while the card editor is open, keeping the active deck context stable for the draft.
- Render one textarea for each label in `activeDeck.sideLabels`, in deck order. Use each exact side label as its field header. This naturally supports two-side and three-side decks.
- Initialize draft side text from the loaded card's `content` and selected tag IDs from `card.tagIds`.

### Local state and methods

Keep form-only state local to the view:

- A `CardContent` draft for the currently available deck sides.
- A `string[]` draft of selected tag IDs.
- Loading/saving flags, an inline error message, and a success message.
- A template ref for the first-side textarea.
- A computed create/edit mode and computed side fields based on the active deck.

Add these view methods:

```ts
async function loadCard(id: string): Promise<void>
function validateForm(): string | null
async function saveCard(action: 'createNext' | 'close' | 'changes'): Promise<void>
function resetForm(): void
```

- `loadCard()` loads and validates the card/deck context, then populates side contents and tag IDs.
- `validateForm()` trims only for the blank check, requires at least one side with non-whitespace content, and rejects any side exceeding `Card.MAX_SIDE_LENGTH` characters. On an empty-card failure, show the exact specified inline message; on an over-limit failure, show a clear length-limit error. Actual normalization and authoritative length validation are performed by `Card.save()`.
- `saveCard()` creates a new `Card` using the authenticated profile ID, active deck ID, draft content, and selected tag IDs, or updates the loaded `Card` instance. It calls `Card.save()` and then `cardStore.upsertCard()`. Disable submission while loading/saving and surface database errors in an error banner rather than treating them as success.
- In creation mode, "Save & Create Next" persists, synchronizes the cache, clears side/tag inputs, shows a success banner for two seconds, and restores focus to the first-side textarea after the DOM update.
- In creation mode, "Save & Close" persists and synchronizes the cache, then navigates to the named `CardList` route (`/cards`). The Card List implementation itself remains US40 scope.
- In edit mode, "Save Changes" persists and synchronizes the cache, then navigates to the named `CardList` route.
- `resetForm()` clears all side drafts and selected tag IDs, clears stale form feedback, and sets focus to the first side after rendering.
- Clear any success timeout when starting another save or unmounting, so an earlier timeout cannot dismiss a later message.

Use native `<textarea>` elements with `rows`, vertical resizing enabled, and `:maxlength="Card.MAX_SIDE_LENGTH"`, preserving multi-line Unicode input. Bind side content to textarea values with `v-model`; do not render user-provided side content through `v-html`, `innerHTML`, or another HTML-interpreting mechanism. The editor treats card content as text only. The 256-character limit applies independently to each side. Associate each textarea with its visible label. Use semantic `<button>` elements for actions and tag pills. Apply the US30/UI Design tokens through Tailwind classes: the `bg-card` wrapper, `bg-surface-muted` textareas, `text-primary` input text, `text-secondary` field labels, `brand-primary` primary action, and a bounded rose error banner. Style success feedback using the existing emerald success tokens. Do not duplicate the global layout or navigation.

## 8. Router design

In `router/index.ts`:

- Replace the `/cards/new` placeholder component with a lazy import of `CardEditView.vue`; retain route name `CardCreate`.
- Add `/cards/edit/:id` as a lazy import of the same view with route name `CardEdit`.
- Mark both card editor routes so `AppLayout` disables the shared deck switcher while the editor is open.
- Keep `/cards` named `CardList` and routed to its current placeholder. US40 owns implementing the list.

## 9. Validation and test coverage

### `card.spec.ts`

- Reject missing deck/user identifiers, content with no non-whitespace side, and any side exceeding 256 characters before Supabase calls.
- Trim side edges, preserve interior newlines/Unicode, and omit blank sides.
- Allow exactly 256 characters in a side and reject 257 characters; confirm the limit is applied independently to each side and uses the same length semantics as the textarea.
- Save valid one-side, two-side, and three-side cards.
- Verify insert and update calls send normalized content.
- Verify tag IDs are synchronized on insert and update, including clearing all tags.
- Verify database/tag-sync errors are logged and rethrown rather than reported as a successful save.

### `cardStore.spec.ts`

- Add a saved card and replace the same card by ID without duplicating it.
- Keep the established newest-first cache order when adding a new card.
- Reject cards without IDs.
- Do not overwrite the card collection for a different loaded deck.

### `TagSelector.spec.ts`

- Render each provided tag as a button with selected state exposed accessibly.
- Emit the selected tag ID when toggled on and remove it when toggled off.
- Render the empty state when no deck tags are available.

### `CardEditView.spec.ts` and routing tests

- Create mode renders the active deck's available side labels and tags.
- Edit mode loads content/tags, rejects a missing or wrong-deck card, and uses the edit action.
- All-whitespace submission is blocked with the required inline message; at least one nonblank side can be saved.
- Save & Create Next clears all fields and tags, updates the cache, shows success for two seconds, and restores first-side focus.
- Save & Close and Save Changes update the cache and navigate to `CardList`.
- Existing side content containing HTML-looking text is loaded as literal textarea content and is not interpreted as HTML.
- Model/load failures show an error and do not show success or navigate.
- The card routes resolve to the editor while `/cards` remains the Card List destination.

## 10. Scope and non-changes

- No persisted completion/readiness flag. General and direction-specific study eligibility remain derived at runtime; direction-specific behavior is owned by the Study Engine.
- No Card List implementation, sorting/filtering behavior, or list UI changes; those belong to US40.
- No tag-creation UI; the form selects only reusable tags already present in the active deck.
