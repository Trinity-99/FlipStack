# US15 — App Layout & Global Navigation Shell Software Design

## 1. Goal

Define the files, classes, and methods required to implement the shared authenticated-app layout, active-deck switcher, global navigation, and deck-context reload behavior. This is the design proposal for review; it does not implement the application changes.

## 2. Existing code and architectural constraints

- [Architecture.md](../Architecture.md) defines the client layers: views and stores use models, models own Supabase access, and there is no service or repository layer.
- [coding_guidelines.md](../coding_guidelines.md) requires Composition API views, setup-style Pinia stores, strict TypeScript, Tailwind-first styling, and lazy-loaded views.
- [UI Design.md](../UI%20Design.md) specifies a centered mobile-first app frame, a top-header deck switcher, and a bottom navigation bar for Study and Cards. It also says bottom navigation hides during immersive study.
- [us15 - App Layout & Global Navigation Shell.md](./us15%20-%20App%20Layout%20%26%20Global%20Navigation%20Shell.md) requires the global header to remain present on non-study views, deck switching and data reload, a create-deck action, and hidden header on `/study`.
- [App.vue](../../app/src/App.vue) currently renders only `<router-view />`; no application layout exists.
- [router/index.ts](../../app/src/router/index.ts) currently routes `/` to the login view and `/test` to a test view. The login route is not yet separated from authenticated application routes.
- [authStore.ts](../../app/src/stores/authStore.ts) holds the signed-in `Profile` and Supabase `Session`, but has no profile update method.
- [deck.ts](../../app/src/models/deck.ts) already provides `Deck.findAllForUser(userId)` and `Deck.findById(deckId)`.
- [direction.ts](../../app/src/models/direction.ts) and [tag.ts](../../app/src/models/tag.ts) provide `findAllForDeck(deckId)`. [card.ts](../../app/src/models/card.ts) provides `Card.findAllForDeck(deckId)` and includes each card's tag IDs.
- [profile.ts](../../app/src/models/profile.ts) already has `lastActiveDeckId`, per-deck `DeckPreference`, `getDeckPreference()`, `saveDeckPreference()`, and `saveLastActiveDeck()`. Its parser can read nested `user_deck_preferences`, but its current `findById()` query does not fetch that relation.
- No `deckStore`, `cardStore`, or `layouts/` directory currently exists.
- The existing CSS theme in [main.css](../../app/src/assets/main.css) includes `app`, `card`, `surface-muted`, `primary`, `secondary`, `brand-primary`, and `radius-card` tokens. The layout should reuse these rather than introduce duplicate tokens.
- [us80 - App Initialization & Dynamic Startup Routing](./us80%20-%20app_initialization_dynamic_startup_routing.md) also defines active-deck resolution and initial route selection. Its destination paths differ from US15 in one place; see §9.

## 3. Proposed file changes

| File | Change |
|---|---|
| `app/src/layouts/AppLayout.vue` | New authenticated application frame. Provides safe-area spacing, centered max-width content, header, nested route content, and bottom navigation. Watches route metadata to enter immersive mode. |
| `app/src/components/DeckSwitcher.vue` | New accessible deck dropdown. Displays the active deck, deck options, create-deck action, loading/empty/error states, and requests deck changes through `deckStore`. |
| `app/src/components/BottomNavigation.vue` | New mobile-first Study/Cards navigation component with active-route styling and accessible labels. Hidden in immersive mode. |
| `app/src/stores/deckStore.ts` | New Pinia store for the user's deck list, active deck context, directions, and tags; coordinates active-deck data hydration and persistence of the last-active deck. |
| `app/src/stores/cardStore.ts` | New Pinia store for cards associated with the active deck. Keeps card-list state separate from deck metadata and exposes deck-scoped loading/replacement methods. |
| `app/src/stores/authStore.ts` | Add a method to replace the current profile after its last-active-deck preference has been persisted. Keep Supabase calls out of this store. |
| `app/src/models/profile.ts` | Update `findById()` to include per-deck preferences in the returned `Profile`, and retain `saveLastActiveDeck()` as the persistence operation used by deck selection. No new auth or data-service layer. |
| `app/src/router/index.ts` | Add the `AppLayout` route branch, route metadata for immersive study, and named destinations for the global navigation and deck-creation action. Keep login and test routes outside the authenticated shell. |
| `app/src/__tests__/AppLayout.spec.ts` | Test shell rendering, responsive frame structure, and immersive navigation visibility. |
| `app/src/__tests__/DeckSwitcher.spec.ts` | Test active title, option selection, dropdown close, create-deck action, and loading/error/empty states. |
| `app/src/__tests__/BottomNavigation.spec.ts` | Test destination links and active-route indication. |
| `app/src/__tests__/deckStore.spec.ts` | Test initial deck resolution, active-deck reload, preference persistence, and failure behavior. |
| `app/src/__tests__/cardStore.spec.ts` | Test deck-scoped card loading and replacement. |
| `app/src/__tests__/authStore.spec.ts` | Extend tests for replacing the current profile after saving a deck preference. |
| `app/src/__tests__/profile.spec.ts` | Extend tests that `findById()` parses per-deck preferences from its joined result. |

No changes are proposed to `main.ts`; Pinia and Vue Router are already registered there.

## 4. Layout design — `AppLayout.vue`

`AppLayout` owns only shared chrome and layout state. It must not fetch Supabase data directly. It renders:

1. A full-viewport `bg-app` frame centered at `max-w-md` on wider screens.
2. A safe-area-aware top header containing `DeckSwitcher` and the story's quick links to Card List Hub and Session Start.
3. A nested `<router-view />` for the active page.
4. `BottomNavigation` for Study and Cards on non-immersive routes.

The component reads the current route and derives `isImmersive` from `route.meta.immersive === true`. In immersive mode, hide both the top header and bottom navigation; the top-header exception is explicitly required by US15, and hiding the bottom bar follows [UI Design.md](../UI%20Design.md). The study view itself remains responsible for providing an exit control.

For initial deck state, the layout may invoke the idempotent `deckStore.initialize(profile)` action when an authenticated profile is available. It must not implement authentication checks, startup redirects, or zero-deck onboarding decisions; those belong to the global startup-routing story. If profile or deck initialization fails, render an explicit recoverable error state rather than a successful-looking empty selector.

### Component responsibilities

- `AppLayout.vue`: route-aware shell, shared header actions, and mobile frame.
- `DeckSwitcher.vue`: selector interactions and create-deck affordance.
- `BottomNavigation.vue`: primary Study/Cards route links.
- Page-specific views: page content only; they do not duplicate global navigation.

## 5. Deck state design — `deckStore.ts`

Use a setup-style Pinia store. The store may call domain models, but never Supabase directly. It coordinates `Deck`, `Direction`, and `Tag` models with `cardStore`.

### State

- `decks: ShallowRef<Deck[]>` — decks belonging to the authenticated user.
- `activeDeckId: Ref<string | null>` and `activeDeck: ComputedRef<Deck | null>`.
- `directions: ShallowRef<Direction[]>` and `tags: ShallowRef<Tag[]>` for the active deck.
- `isLoading: Ref<boolean>` and `error: Ref<string | null>` for selector and reload feedback.
- A private initialized-user marker to make repeated shell mounts safe and avoid duplicate deck-list requests for the same user.

Use shallow refs for domain instances, consistent with `authStore` and to avoid Vue proxying model objects.

### Actions

```ts
initialize(profile: Profile): Promise<void>
selectActiveDeck(deckId: string): Promise<void>
loadActiveDeckData(deckId: string): Promise<ActiveDeckData>
```

- `initialize(profile)` loads `Deck.findAllForUser(profile.id)` once per user, then chooses the saved `profile.lastActiveDeckId` if it still belongs to that user; otherwise choose a deterministic fallback (recommend the oldest created deck, consistent with US8's “first created” rule). It hydrates the selected deck's data. If there are no decks, leave `activeDeckId` null and let startup routing handle onboarding.
- `selectActiveDeck(deckId)` validates the ID against the loaded deck list; fetches the target deck's directions, tags, and cards; persists `lastActiveDeckId` through `Profile.saveLastActiveDeck()`; then commits all in-memory deck state and updates `authStore` with the returned Profile. The dropdown closes after a successful selection. Failures remain visible and preserve the previous active context.
- `loadActiveDeckData(deckId)` fetches `Direction.findAllForDeck(deckId)`, `Tag.findAllForDeck(deckId)`, and the target deck's cards via `cardStore`, returning them as an `ActiveDeckData` value without mutating active state. The caller commits the returned data only when the full operation succeeds. Clear stale deck-scoped state when there is no active deck or when the user changes.

`ActiveDeckData` is a store-local interface containing `directions: Direction[]`, `tags: Tag[]`, and `cards: Card[]`. It is a simple typed result for staging a deck switch, not a new domain model or service layer.

`activeDeck` is computed from `decks` and `activeDeckId`; do not keep a second independently mutable active-deck object.

## 6. Card state design — `cardStore.ts`

This store is added because card-list state has a distinct lifecycle from the deck selector and direction/tag metadata. It also supplies the card pool needed after a deck switch.

### State and methods

- `cards: ShallowRef<Card[]>` — cards loaded for the active deck.
- `loadedDeckId: Ref<string | null>` — identifies which deck the current card array belongs to.
- `fetchCardsForDeck(deckId: string): Promise<Card[]>` — calls `Card.findAllForDeck(deckId)` without mutating the currently active card state; used while staging a deck switch.
- `setCardsForDeck(deckId: string, cards: Card[]): void` — commits a fully fetched array when `deckStore` coordinates an all-or-nothing deck-context reload.
- `clear(): void` — clears cards and `loadedDeckId` on context reset.

`cardStore` does not own deck selection, route navigation, or direct Supabase access.

## 7. Profile preference and auth-store integration

### `Profile.findById()`

The existing `Profile.fromJSON()` already parses an optional `user_deck_preferences` array. Update the `findById()` select to alias the related `user_deck_preference` rows to that property (for example, `user_deck_preferences:user_deck_preference(*)`). Continue returning `null` for `PGRST116`, and preserve existing error logging/rethrow behavior.

This lets `Profile.getDeckPreference(deckId)` return saved direction/tag selections after authentication or a reload. Do not add a separate preference repository or store.

### `authStore.ts`

Add:

```ts
setProfile(profile: Profile): void
```

This replaces the current profile after `saveLastActiveDeck()` succeeds while preserving the current session. Do not add a Supabase call or duplicate preference state to `authStore`.

## 8. Router and navigation design

### Route structure

- Login remains a standalone route outside the global shell.
- Authenticated destinations are children of the `AppLayout` route.
- The active study route is marked `meta: { immersive: true }`.
- `/test` remains outside the shell as a development route.
- Use named routes in components rather than hard-coded strings in click handlers.

Proposed route names and paths:

| Route name | Path | Destination |
|---|---|---|
| `Login` | `/login` | Existing `LoginView.vue` |
| `DeckCreate` | `/decks/new` | `DeckEditView.vue` (owned by US20) |
| `CardList` | `/cards` | Card List Hub (owned by US40) |
| `CardCreate` | `/cards/new` | Card Edit (owned by US30) |
| `SessionStart` | `/study/init` | Session Start (owned by US50) |
| `Study` | `/study` | Active Study (owned by US60), immersive metadata |
| `Test` | `/test` | Existing `Test-FlipStack.vue` |

The global header's Card List and Session Start shortcuts target `CardList` and `SessionStart`. `DeckSwitcher`'s “+ Create New Deck” targets `DeckCreate`. `BottomNavigation` has Study and Cards links targeting `SessionStart` and `CardList`.

Only register lazy route imports when the destination view exists. Do not add fake placeholder pages to make the shell appear complete. If US15 is implemented before the destination stories, the navigation links and route integration must be completed together with those stories or use explicitly agreed temporary placeholders.

### Existing route transition

The current `/` route renders the login screen, while [us80](./us80%20-%20app_initialization_dynamic_startup_routing.md) specifies unauthenticated routing to `/login`. Move the login screen to `/login` when the global route structure is established. The root route's redirect/boot behavior belongs to US8 and should not be implemented in this story.

## 9. Responsive, accessibility, and interaction behavior

- Use the existing theme classes and a `max-w-md` centered app frame.
- Apply `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` spacing so fixed/anchored navigation does not overlap device UI.
- Keep the header anchored consistently on non-study routes; ensure content has enough top/bottom spacing to avoid being obscured.
- Use a semantic `<button>` for the deck-switcher trigger; expose `aria-expanded`, `aria-controls`, and an accessible label. Close the menu on selection, create action, Escape, or outside interaction.
- Render a stable, keyboard-accessible list of deck choices with active-deck indication. If there are no decks, show an explicit empty state and keep the create action available.
- Provide clear loading and recoverable error states during initial deck load and deck switches.
- Use `<RouterLink>` semantics for navigation and indicate the active bottom-nav item with `aria-current="page"`.
- Respect reduced motion for optional dropdown transitions; navigation must remain usable without motion.

## 10. Test plan

- **Deck store:** loads decks once per user; resolves saved active deck or deterministic fallback; loads directions, tags, and cards for the selected deck; persists active deck changes and replaces the auth profile; leaves the previous context intact if a reload fails; handles an empty deck list.
- **Card store:** stores cards with their deck ID, replaces data on switch, and clears stale data.
- **Deck switcher:** displays the selected title and all deck titles; selection invokes the store, closes on success, and exposes errors on failure; create action navigates to `DeckCreate`.
- **Bottom navigation:** links to the correct named routes and reflects active route; immersive state omits it.
- **App layout:** renders shared header/content/nav on non-immersive routes; hides header and bottom nav on routes marked immersive; applies safe-area/mobile frame classes.
- **Profile/Auth store:** profile query includes preferences and store profile replacement preserves session.
- Run focused tests, TypeScript type-check, production build, and both configured linters after implementation.

## 11. Acceptance-criteria coverage

| Criterion | Design coverage |
|---|---|
| AC-01 | `AppLayout` owns shared anchored header and stable centered layout across nested non-study routes. |
| AC-02 | `DeckSwitcher` calls `deckStore.selectActiveDeck()`; the store reloads directions, tags, and cards before committing and persists the selected deck. |
| AC-03 | The selector's create action navigates to the named `DeckCreate` route (`/decks/new`). |
| AC-04 | `Study` route metadata marks it immersive; `AppLayout` hides the header and bottom navigation. |

## 12. Scope boundaries and review points

- No deck editing screen implementation, card-list implementation, session-start implementation, or active-study implementation; those remain in their respective user stories.
- No logout, auth guard, cold-start route evaluation, or zero-deck onboarding redirect; these belong to US8.
- Do not add a service/repository layer or let views call Supabase.
- Confirm `/session/start` versus `/study/start` before implementation. Preserve both via a route alias only if that is the agreed migration strategy.
- The backlog directory is ignored by the current `.gitignore`; the design file will exist locally but will not appear in ordinary `git status` unless that ignore rule is changed or the file is force-added.
