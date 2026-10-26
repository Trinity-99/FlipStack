# US40 — Card List Software Design

## Status

Design proposal for review. This document does not change the User Story, Architecture, Coding Guidelines, PRD, or UI Design specifications.

## 1. Scope

Implement the Card List screen for the active deck. Users can view its cards, filter by one tag, sort by a configured side, open a card for editing, and create a card in the active deck context.

The screen consumes the active deck data already loaded by the Pinia stores. It does not add database queries or persistence responsibilities to the view.

## 2. Decisions

- Display only the sides configured on the active deck, using that deck's side labels. A deck has two or three configured sides.
- Provide one ascending A–Z sort option for each configured side.
- Start with no sort selection and preserve the current `cardStore.cards` order until a side is selected.
- Compare side text using locale-aware, case-insensitive comparison.
- Use a single-select control with **All Tags** as its default.
- Keep card-tag persistence in `Card`; do not add a `CardTag` model. This follows the existing implementation, where `Card` loads and synchronizes its junction-table relations.
- When there is no active deck, show **please select a deck.** and hide the create action.
- When the active deck has no cards, show a concise explanatory empty state. Exact copy can be set during implementation.

## 3. Files and Responsibilities

### 3.1 New: `app/src/views/CardListView.vue`

Implement the screen with Vue Composition API and `<script setup lang="ts">`.

**Store and router dependencies**

- `useDeckStore()` provides `activeDeck`, `tags`, and active-deck context.
- `useCardStore()` provides the cards already loaded for that context.
- `useRouter()` navigates through the existing named routes.

**Local state**

- `selectedTagId: Ref<string | null>`; initialize to `null` for **All Tags**.
- `sortSide: Ref<CardSide | null>`; initialize to `null` to preserve store order.
- Define `CardSide` as the supported card content keys (`s1`, `s2`, `s3`), reusing the `CardContent` type from `@/models/card`.

**Derived values**

- `availableSides`: derive side keys and labels from `deckStore.activeDeck.sideLabels`, in their existing order. Do not offer a side absent from that deck.
- `visibleCards`: derive from `cardStore.cards`. Apply the selected tag filter, then—when `sortSide` is selected—sort a copied array by that side's content using locale-aware, case-insensitive comparison. Do not mutate the Pinia store's card array.

**View behavior**

- Render a single-select tag control with **All Tags** and the active deck's tags. Selecting a tag shows cards whose `tagIds` contain that tag ID.
- Render a sort dropdown with one A–Z option for each available side. With no selection, preserve store order.
- Render each card as a semantic link to the existing `CardEdit` route with that card's ID.
- In each card, render the configured side columns with the matching deck labels. Constrain columns to the available width and truncate long side text with an ellipsis.
- Render the primary `+` action as a link to the existing `CardCreate` route only when an active deck exists. This retains the active deck in `deckStore` for the existing card editor.
- With no active deck, show **please select a deck.** and do not render the create action.
- With an active deck and no cards, show a concise explanatory empty state; keep the create action available.
- Use the story's card-list styling: `bg-card`, `rounded-xl`, `p-4`, and `border border-slate-700/60`; use the specified muted surfaces and primary accent for controls and the create action.
- Keep responsive layout and accessible focus styles consistent with the existing app. Use semantic links/select controls and stable card IDs as list keys.

The view does not need additional imperative navigation methods: `RouterLink` targets the already named card-create and card-edit routes.

### 3.2 Update: `app/src/router/index.ts`

Change the existing `/cards` (`CardList`) route component from `FeaturePlaceholderView.vue` to a lazy import of `CardListView.vue`. Keep the path, route name, parent layout, and other route metadata unchanged.

### 3.3 New: `app/src/__tests__/CardListView.spec.ts`

Add focused view tests covering:

- Configured side labels and columns for two- and three-side decks.
- Display of cards from the active card store.
- Single-tag filtering and resetting with **All Tags**.
- Side selection applying ascending, locale-aware case-insensitive ordering; no selection preserving store order.
- Card links targeting `CardEdit` with the selected card ID.
- The `+` action targeting `CardCreate` while an active deck remains selected.
- The no-active-deck message and hidden create action.
- The active-deck/no-cards empty state and available create action.
- Long side text receiving the truncation styles.

### 3.4 Update: `app/src/__tests__/App.spec.ts`

Retain the existing route name and parent-layout checks, and add an assertion that `/cards` resolves to the Card List view rather than the placeholder if the test setup can assert the resolved component directly. Otherwise, cover the route rendering through the view test and leave the existing route assertions unchanged.

## 4. Existing Classes and Stores — No Changes Planned

### `Card` — `app/src/models/card.ts`

No new methods. `Card.findAllForDeck(deckId)` already retrieves cards with their tag IDs through a batched `card_tag` query and returns domain objects. `Card.save()` already owns synchronization of those tag relations.

### `Tag` — `app/src/models/tag.ts`

No new methods. `Tag.findAllForDeck(deckId)` already returns the active deck's tags in name order.

### `useCardStore` — `app/src/stores/cardStore.ts`

No new methods. The store already exposes `cards`, `loadedDeckId`, and the deck-loading/cache actions needed by the screen.

### `useDeckStore` — `app/src/stores/deckStore.ts`

No new methods. `loadActiveDeckData()` already loads cards and tags, and the deck store commits them together when a deck becomes active. Deck switching therefore updates the list through the existing shared state.

### `CardTag`

Do not create `app/src/models/cardTag.ts`. The current `Card` Active Record implementation owns the `card_tag` query and synchronization, so a separate model is not needed for this story.

## 5. Architecture and Data Flow

1. `AppLayout` initializes or switches the active deck through `useDeckStore`.
2. `DeckStore` loads that deck's cards using `Card.findAllForDeck()` and its tags using `Tag.findAllForDeck()`.
3. `CardListView` derives filtering, sorting, and side labels from the stores and active `Deck`.
4. Card and tag database access remains inside the existing domain models. The view performs no direct Supabase calls.
5. Card selection and creation use the existing router routes. The editor continues to use the active deck context from `deckStore`.

This keeps the layer direction within the Architecture specification: views use stores and models; only models access data; models do not call upward. Existing RLS protections and plain-text rendering remain in force.

## 6. Acceptance Criteria Coverage

| Story criterion | Design coverage |
|---|---|
| AC-01 — List display and side truncation | Configured side columns and labels in `CardListView.vue`; responsive truncation styles. |
| AC-02 — Single tag filtering | Single-select control and derived `visibleCards`; **All Tags** resets the filter. |
| AC-03 — Alphabetical sorting by side | Side dropdown and copied-array sort using locale-aware, case-insensitive comparison. |
| AC-04 — Card selection for editing | Each card links to `CardEdit` with its ID. |
| AC-05 — Create action | `+` links to `CardCreate` when an active deck exists, preserving store context. |

## 7. Implementation Validation

After approval and implementation, run the focused `CardListView.spec.ts` and relevant existing router tests, then run the app's lint/type-check command if required by the changed files.
