# US20 — Deck Edit Software Design

## 1. Goal

Define the implementation needed for creating and editing a deck's title and two or three side labels. This proposal follows the existing Vue, Pinia, Active Record, router, and design-system patterns. It is a design document only; application code is unchanged.

## 2. Existing code and architectural constraints

- [Architecture.md](../Architecture.md) requires that only domain models access Supabase. Views and Pinia stores may call models; do not introduce a service or repository layer.
- [coding_guidelines.md](../coding_guidelines.md) requires strict TypeScript, Composition API `<script setup>`, setup-style Pinia stores, explicit return types, JSDoc for public model/store methods, and Tailwind-first styling.
- [UI Design.md](../UI%20Design.md) defines the `bg-app`, `bg-card`, `bg-surface-muted`, `text-primary`, `text-secondary`, and `brand-primary` palette, rose validation banners, amber offline banners, 24px primary card radius, 24px card padding, and 375 × 812 mobile baseline.
- [us20 - deck_edit.md](./us20%20-%20deck_edit.md) defines one view for creation and editing, a 24-character deck title limit, a two/three-side choice, required labels for displayed sides, proactive offline disabling, and a save-success state.
- [deck.ts](../../app/src/models/deck.ts) already implements the `Deck` Active Record model, including mutable `title` and `sideLabels`, `save()`, `findById()`, and `findAllForUser()`. Its current `save()` only checks that title is non-empty and should enforce the model invariants for side labels and title length.
- [deckStore.ts](../../app/src/stores/deckStore.ts) already caches decks and active deck context, and handles active deck selection/reload. It currently has no method to insert or replace a saved deck in its cached list.
- [router/index.ts](../../app/src/router/index.ts) currently routes `DeckCreate` (`/decks/new`) to the temporary [FeaturePlaceholderView.vue](../../app/src/views/FeaturePlaceholderView.vue). There is no edit route yet.
- [AppLayout.vue](../../app/src/layouts/AppLayout.vue) already supplies the global frame, header, and bottom navigation. `DeckEditView.vue` should render only page content inside that shell and must not duplicate global navigation or outer background.
- [authStore.ts](../../app/src/stores/authStore.ts) exposes the authenticated `Profile`, whose `id` supplies deck ownership. RLS remains the database authorization boundary.
- `docs/backlog/` is ignored by the current `.gitignore`; the requested design file will exist locally but will not appear in normal `git status` unless that ignore rule is changed or the file is force-added.

## 3. Proposed file changes

| File | Change |
|---|---|
| `app/src/models/deck.ts` | Add a private validation helper used by `save()` to enforce a non-blank title of at most 24 characters and exactly two or three non-blank side labels. Normalize title and labels before persistence. Keep validation in the Active Record boundary so callers cannot bypass it. |
| `app/src/stores/deckStore.ts` | Add `upsertDeck(deck: Deck): void` to replace a deck by ID or append a successfully created deck without changing active selection. Let the view explicitly activate newly created decks with the existing `selectActiveDeck()` flow. |
| `app/src/views/DeckEditView.vue` | Add the shared create/edit form, route-param loading, local validation, online/offline state, save/loading states, error/success banners, and post-save actions. The view calls `Deck` methods and the deck store; it does not access Supabase. |
| `app/src/router/index.ts` | Replace the placeholder component for `/decks/new` with a lazy import of `DeckEditView.vue`; add a lazy edit route `/decks/:deckId/edit` using the same component. Keep the names `DeckCreate` and `DeckEdit`. |
| `app/src/__tests__/deck.spec.ts` | Add tests for `Deck.save()` validation and persisted trimmed values, plus preservation of valid two-side and three-side data. |
| `app/src/__tests__/deckStore.spec.ts` | Add tests that `upsertDeck()` adds a created deck and replaces an existing deck without disturbing unrelated entries. |
| `app/src/__tests__/DeckEditView.spec.ts` | Add tests for create/edit modes, title and side-count behavior, validation, online/offline disabling, save success/error, and store synchronization/navigation. |
| `app/src/__tests__/App.spec.ts` or a focused router test | Verify that `/decks/new` and `/decks/:deckId/edit` resolve to the editor within `AppLayout`. |

No changes are proposed to `main.ts`, `App.vue`, `Profile`, `Card`, `Tag`, or the database schema.

## 4. Deck model design — `Deck` in `deck.ts`

Add a private instance helper:

```ts
private validate(): void
```

`save()` invokes validation before issuing any network request. The validation rules are:

- `title.trim()` is non-empty and no longer than 24 characters.
- `sideLabels.length` is exactly 2 or 3.
- Every side label is a non-empty string after trimming.
- Side labels and title are trimmed before insert/update so persisted values are consistent.

The model should throw descriptive `Error` values for invalid state. Keep UI-specific messages in the view; the model errors are invariant/database errors, not banner copy. Update the JSDoc for `save()` to describe validation errors.

For a two-side deck, the model persists only two labels. The editor constructs a two-element array when the user selects two sides; stale/hidden third-side input must not be included in save data.

The existing constructor and `fromJSON()` remain compatible with two- and three-label arrays. Avoid changing the database schema: `side_labels` is already a JSON array.

## 5. Deck-store design — `deckStore.ts`

Add:

```ts
upsertDeck(deck: Deck): void
```

Behavior:

- Require a persisted deck ID; throw if `deck.id` is null.
- If a deck with the same ID already exists, replace that list entry with the saved instance.
- Otherwise append the new instance.
- Do not automatically change `activeDeckId` or trigger network calls. The view decides if a newly created deck should become active and can call the existing `selectActiveDeck(deck.id)` after it is registered.

When an active deck is edited, replacing its `Deck` object in `decks` updates the computed `activeDeck` title and side labels without reloading cards, tags, or directions: those records are unchanged by US20. Non-active deck edits likewise update the picker cache only.

For a newly created deck, the view calls `upsertDeck()` after persistence but does not activate it immediately. The user can proceed with the **Add cards to this deck** action, which activates the saved deck with `selectActiveDeck()` and then opens the existing card-creation route. If activation/pref persistence fails after `Deck.save()` has succeeded, report explicitly that the deck was saved but could not be activated; keep the user on the editor and do not imply that the database save was rolled back.

## 6. View design — `DeckEditView.vue`

Use `<script setup lang="ts">`. Read `deckId` from `useRoute()`; absence means create mode, presence means edit mode.

### Local state and derived values

- `deckName: Ref<string>` initialized to empty for create mode and loaded from the deck for edit mode.
- `sideCount: Ref<2 | 3>` defaults to `3` for creation and is derived from the loaded deck's label count in edit mode.
- `sideLabels: Ref<string[]>` holds three draft slots. Render only the first two or three according to `sideCount`; on save pass `sideLabels.slice(0, sideCount)` so a hidden third label is ignored in two-side mode.
- `isOnline`, initialized from `navigator.onLine` after mount and kept current with `online`/`offline` events; remove both listeners on unmount.
- `isLoadingDeck`, `isSaving`, `errorMessage`, and `successMessage` refs for route loading, save progress, and feedback.
- `isEditMode` and the character count are computed values, not duplicated state.

### Methods

```ts
async loadDeck(): Promise<void>
validateForm(): string | null
async handleSubmit(): Promise<void>
async goToAddCards(): Promise<void>
```

- `loadDeck()` runs only for edit mode. It calls `Deck.findById(deckId)`, checks that a deck was found and that `deck.userId` matches `authStore.profile?.id`, then fills the form. A missing profile/deck, foreign owner, or failed query produces a visible error and disables saving; do not fall back to a create form for an invalid edit URL. A keyed route/view or a watcher on `deckId` should ensure changing the route parameter loads the correct deck.
- `validateForm()` checks title presence/24-character maximum, then all labels required for the selected side count. It returns the first user-facing validation message. Offline submission is blocked before validation and is communicated by the offline warning. Use the exact AC message for an overlong title: `"Deck name cannot exceed 24 characters"`. The missing-label message should state that all selected side labels are required.
- `handleSubmit()` prevents duplicate or offline submission, clears stale messages, validates, and sets `isSaving` in a `try/finally` block. It constructs a new `Deck(null, profile.id, ...)` in create mode, or updates `title` and `sideLabels` on the loaded domain instance in edit mode; then calls `await deck.save()`.
- On success, call `deckStore.upsertDeck(deck)` and display `Deck "[Name]" saved successfully`. Do not automatically activate the deck at save time; the user proceeds to card creation through the success action. Use the trimmed title for both model state and confirmation.
- If saving fails, show the error and keep the form available for correction/retry. Successful persistence must not be reported as failed due to any subsequent navigation or activation problem.
- `goToAddCards(): Promise<void>` requires a successfully saved deck, activates it through the existing `selectActiveDeck(deck.id)` flow, then navigates to the existing `CardCreate` route. If activation fails, keep the user on the editor and show an explicit error; do not navigate to card creation with a different active deck.

### Success actions

The story asks for “options to proceed” without prescribing exact buttons. Since decks are created infrequently and users are most likely ready to add study material, propose one primary action:

- After either creation or editing: **Add cards to this deck**, which calls `goToAddCards()`, activates the saved deck, and navigates to the existing `CardCreate` route (`/cards/new`).

Do not offer a “Create another deck” action in the success state. Use the existing router name and do not add editing/management controls to the global deck switcher. The success banner follows the explicit AC wording `Deck "[Name]" saved successfully`, even though the detailed description also mentions “created/updated successfully”.

## 7. Create/edit routes — `router/index.ts`

Replace the current `DeckCreate` placeholder component with a lazy import of `DeckEditView.vue`. Add:

| Route name | Path | Mode |
|---|---|---|
| `DeckCreate` | `/decks/new` | Create |
| `DeckEdit` | `/decks/:deckId/edit` | Edit |

Both routes remain children of `AppLayout`, preserving global shell, safe-area, and navigation behavior. The shell's deck switcher create action continues targeting `DeckCreate`. No route guard or onboarding redirect is added here; those belong to the startup-routing story.

## 8. User interface and accessibility

- The global app background/frame comes from `AppLayout`. Within it, center a responsive form card using `bg-card`, `border-2 border-slate-600`, `rounded-3xl`, `p-6`, and `shadow-2xl`; ensure vertical scrolling remains possible on shorter mobile screens.
- Use a semantic `<form>`, associated labels, visible field labels, keyboard-operable segmented side-count buttons with `aria-pressed`, and standard submit/cancel buttons. Use `maxlength="24"` but still validate in code; programmatic input and pasted values must not bypass the rule.
- Show a live title counter as `count/24` with an accessible label.
- Show side label fields with stable IDs and contextual labels (“Side 1 label”, etc.); hide Side 3 in two-side mode and never submit its stale draft value.
- Disable all form inputs and save actions immediately when offline or while loading the edit record/saving. Render the specified offline notice with `bg-amber-950`, `border-amber-800/60`, and `text-amber-300`.
- Render validation/save errors in a bounded alert directly above fields with `bg-rose-950/90`, `border-rose-500/50`, and `text-rose-300`; use `role="alert"` and `aria-live="assertive"`.
- Render success separately with a success status treatment using the existing `accent-got-it` token, `role="status"`, and `aria-live="polite"`.
- Inputs use `bg-surface-muted`, `text-primary`, `placeholder:text-secondary`, and a visible `focus-visible` ring in `brand-primary`. Maintain high contrast and mobile touch targets.

## 9. Acceptance criteria coverage

| Criterion | Design coverage |
|---|---|
| AC-01 | Create mode validates and saves a three-label Deck through `Deck.save()` and displays the exact saved-success banner. |
| AC-02 | Selecting two sides hides Side 3 and saves exactly two labels. |
| AC-03 | View validation blocks long names with the specified inline message; model validation also protects persistence. |
| AC-04 | Every label in the selected side count is required before save. |
| AC-05 | Offline state is detected at mount and tracked; warning appears and all inputs/actions are disabled. |

## 10. Test plan

- **Deck model:** rejects blank/overlong title, unsupported side count, and blank labels before Supabase calls; trims valid values; preserves valid two- and three-side insert/update behavior.
- **Deck store:** upsert appends a new saved deck and replaces an existing instance without changing unrelated decks; active deck computed value reflects an updated title/labels.
- **Create view:** starts with three sides; toggling between two and three sides shows/hides Side 3; hidden third label does not persist; character count and all exact validation messages work; valid create persists once, registers the new deck, and shows the add-cards action. Clicking it activates the new deck and navigates to `CardCreate`.
- **Edit view:** loads deck data and side count from `deckId`; rejects missing/foreign deck; saves updates to the existing instance; updates the store's cached item; does not create a duplicate deck. Clicking the add-cards action activates that edited deck before navigating to `CardCreate`.
- **Offline state:** navigator offline on mount disables all form controls and shows the exact amber notice; online/offline events update state and listeners are cleaned up.
- **Errors:** model/save failures show a bounded error; activation failure when proceeding to card creation is surfaced and prevents navigation.
- **Router:** both creation and editing paths use the same lazy view inside the application shell.
- Run focused tests, full unit tests, TypeScript type-check, production build, ESLint, Oxlint, and formatting check after implementation.

## 11. Scope boundaries

- Deck deletion and deck management are excluded.
- Automatic first-login navigation and zero-deck onboarding routing are excluded; those are handled by startup-routing work.
- No database schema changes, model service layer, or direct Supabase calls from the view/store.
- Existing temporary placeholders for Cards and Study remain unchanged.
