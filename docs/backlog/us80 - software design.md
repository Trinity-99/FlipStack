# US80 — App Initialization & Dynamic Startup Routing Software Design

## Status

Design proposal for review. This document does not modify US80, the Architecture, Coding Guidelines, PRD, or UI Design specifications.

## 1. Goal

Resolve authentication and the user's active-deck/card state during startup, then route to the required onboarding step or the requested operational view. Run the same resolution after successful login. Preserve valid authenticated deep links, avoid redundant model queries when the current user's deck context is already initialized, and keep loading and failure states explicit.

## 2. Confirmed Decisions

- Use the global Vue Router guard for authentication checks, deck initialization, onboarding routing, and default startup routing.
- Mount the Vue application before authentication restoration completes so the app can show a startup indicator during both authentication and route/data evaluation.
- Resolve startup routing for `/` and `/login`; after successful login, navigate to the existing `SessionStart` route so the guard applies the same routing rules.
- Preserve a requested authenticated destination when it is valid for the user's state. Required onboarding takes priority: no decks routes to `/decks/new`; decks with no cards in the active deck route to `/cards/new`.
- With at least one card in the active deck, use `/study/init` as the default destination. A valid requested route such as `/cards` remains the destination rather than being replaced by the default.
- Keep the current login-only scope. Do not add a signup view or signup model flow.
- Show the centered startup indicator during auth restoration and deck initialization. If deck initialization fails, do not interpret the failure as an empty deck/card result; keep the error and existing retry affordance visible in the authenticated app shell.
- Preserve the current explicit **Add cards** action after saving a new deck. This is a confirmed scope choice, but it does not match US80's current sentence that saving a deck automatically redirects to `/cards/new`. The story remains unchanged; its owner can resolve that mismatch separately.
- Use the existing `/study/init` route and `SessionStart` name. Do not add `/study/start`.

## 3. Existing Code and Architectural Constraints

- [Architecture.md](../Architecture.md) permits views and stores to use models directly; only models access Supabase. It does not permit a service or repository layer between stores and models.
- [coding_guidelines.md](../coding_guidelines.md) requires strict TypeScript, setup-style Pinia stores, Composition API views, lazy-loaded views, explicit errors, and documented public methods.
- `main.ts` currently restores auth before mounting Vue. It catches a restore failure because `authStore` retains an error for the login view.
- `App.vue` currently renders only `<router-view />`.
- `router/index.ts` has a login route at `/` (aliased to `/login`), an `/app` layout branch with the authenticated operational routes, and a separate `/test` route. There is no global authentication guard.
- `AppLayout.vue` currently watches `authStore.profile` and calls `deckStore.initialize(profile)`. It renders `deckStore.error` with a retry action.
- `authStore.ts` exposes `restoreAuthentication()`, `isAuthenticated`, and the current profile/session. It has no state indicating whether restoration is running or has already been attempted.
- `deckStore.initialize(profile)` already loads the user's decks, resolves `lastActiveDeckId` or the earliest-created deck, and loads the active deck's directions, tags, and cards via their models. It is idempotent for a user whose deck context has initialized successfully, and reports failures through `error`.
- `cardStore.loadedDeckId` identifies which deck's card list has been loaded. This must be used with `activeDeckId` so an empty but successfully loaded card list is not mistaken for an uninitialized cache.
- `DeckEditView.vue` currently saves a deck, then offers a separate action that activates the deck and navigates to card creation. Keep that behavior for this scope.
- The PRD describes login-only for now and says there is no signup screen. US80's broader persona wording does not add signup to this design.

The design keeps queries in the existing Active Record models, uses `deckStore` for deck-context hydration, and places route decisions in Vue Router. It adds no initialization service or second copy of deck-selection logic.

## 4. Proposed File Changes

| File | Change |
|---|---|
| `app/src/main.ts` | Change `startApp()` to mount the app immediately instead of waiting for auth restoration. Keep Pinia installed before Vue Router so guards can access stores. |
| `app/src/App.vue` | Render the root startup indicator while the first router navigation, auth restoration, or authenticated deck initialization is pending; render the route view after startup evaluation completes. |
| `app/src/stores/authStore.ts` | Add reactive restoration state and make `restoreAuthentication()` expose when it is in progress and when the initial restoration attempt has completed. Coalesce concurrent calls and preserve the existing error recording/rethrow behavior. |
| `app/src/router/index.ts` | Mark the `/app` branch as requiring authentication. Add a global `beforeEach` guard that restores auth once, protects authenticated routes, initializes the deck context, enforces onboarding, preserves valid deep links, and resolves `/` or `/login` to the state-appropriate default. |
| `app/src/layouts/AppLayout.vue` | Remove the profile watcher and its duplicate deck-initialization method; the router guard becomes the initialization owner. Keep the existing error banner and retry action. |
| `app/src/views/LoginView.vue` | After successful authentication, replace the login route with `SessionStart`; let the guard resolve onboarding or preserve the appropriate destination. Do not add signup. |
| `app/src/__tests__/authStore.spec.ts` | Test restoration status, successful restoration, unauthenticated restoration, and recorded failure state. |
| `app/src/__tests__/router.spec.ts` | Add focused tests for auth redirects, startup destinations, onboarding precedence, valid deep links, cache reuse, and initialization failures. |
| `app/src/__tests__/App.spec.ts` | Test that the startup indicator is visible while initial navigation is unresolved and the routed view appears afterward. |
| `app/src/__tests__/AppLayout.spec.ts` | Retain and adjust layout/error-retry tests to verify the layout no longer initiates a second initialization. |
| `app/src/__tests__/LoginView.spec.ts` | Test successful login navigation to `SessionStart` and retain current validation/authentication error coverage. |

No changes are proposed to the domain models, `deckStore.ts`, `cardStore.ts`, the deck/card onboarding views, or the database. Existing store/model APIs already provide the required hydration and state.

## 5. Root View — `App.vue`

Add `isInitialNavigationReady: Ref<boolean>` and a computed `isStartupPending` that is true while initial navigation is unresolved, auth restoration is running, or authenticated deck initialization is running.

Add `waitForInitialNavigation(): Promise<void>` to await `router.isReady()` and set `isInitialNavigationReady` when it resolves. Call it when the root component is mounted. The template renders the centered startup indicator while `isStartupPending` is true and `<router-view />` afterward. The component does not initiate auth restoration, deck queries, or route changes.

### Startup indicator

Keep the indicator in the root component rather than adding a one-use component. It follows the existing design mapping: `bg-app`, centered minimalist indicator, and `text-indigo-500`.

The root derives whether startup is pending from:

- completion of the router's initial navigation;
- `authStore` restoration in progress; and
- `deckStore.isLoading` while an authenticated user's deck context is being initialized.

While pending, show the indicator instead of an empty route outlet. Once evaluation completes, show the routed view. During post-login navigation, the authenticated deck loading state keeps the indicator visible until the guard completes. If loading fails, `deckStore.isLoading` becomes false and the routed app shell can render the existing error banner and retry action.

## 6. Authentication Restoration — `authStore.ts` and `main.ts`

### `authStore.ts`

Add restoration state:

- `isRestoring: Ref<boolean>` — true only while `Profile.restoreAuthentication()` is pending.
- `hasRestoredAuthentication: Ref<boolean>` — true once the initial restoration attempt has completed, including an unsuccessful attempt, so later route changes do not repeatedly restore the same session.
- `restorationPromise: Promise<void> | null` — private in-flight state that coalesces overlapping calls while the first restoration is pending.

Update the existing method:

- `restoreAuthentication(): Promise<void>` — return immediately if the initial attempt has completed; return the in-flight promise if restoration is already running; otherwise set `isRestoring`, run the existing profile-model restoration, call `setAuthenticated()` when a session exists, retain `initializationError` and rethrow on failure, and mark the attempt complete and clear the in-flight promise in a `finally` block.

The method continues to own auth state only; it does not navigate or load decks. `setAuthenticated()` marks restoration complete and clears any prior restore error, preventing a later guard from replacing the newly authenticated state with a second session lookup.

### `main.ts`

Update `startApp(): void` to create Pinia, register it before the router, and mount the app without awaiting `restoreAuthentication()`. Authentication restoration is initiated by the first global route guard, making the root indicator renderable during the async operation.

## 7. Route Guard — `router/index.ts`

Add `meta.requiresAuth: true` to the `/app` route record so its nested routes inherit the authenticated requirement. Keep `/`, `/login`, and `/test` outside this protected branch.

Add these methods in `router/index.ts`:

- `getRequiredOnboardingRoute(): RouteLocationRaw | null` — after successful deck initialization, return the required onboarding route based on the deck list and loaded active-deck card cache, or `null` when onboarding is not required.
- `resolveStartupRoute(to: RouteLocationNormalized): Promise<RouteLocationRaw | true>` — perform auth restoration/checks, initialize the authenticated deck context where needed, preserve or resolve the destination, and return a redirect or `true` to continue.
- Register `resolveStartupRoute` as the single global `beforeEach` guard.

The guard obtains the existing auth and deck stores after Pinia has been installed and follows this sequence:

1. If authentication restoration has not completed, await `authStore.restoreAuthentication()`. On a restoration error, the auth store retains the error; treat the session as unauthenticated for routing rather than treating it as a successful restore.
2. If the destination requires authentication and `authStore.isAuthenticated` is false, redirect to the named `Login` route.
3. If the user is unauthenticated and the destination is public, allow it.
4. If the user is authenticated and the destination is `/`, `/login`, or in the protected app branch, call `deckStore.initialize(profile)`. Its user-level initialization marker avoids repeat database calls after successful initialization, including the guard call after login.
5. If initialization fails, do not redirect to an onboarding route. Allow the requested protected view (or the default `SessionStart` view when entering from login/root) to render within `AppLayout`, where the existing error banner and retry action remain available.
6. After successful initialization, choose the required destination:
   - No decks: `/decks/new`.
   - At least one deck and no cards loaded for the active deck: `/cards/new`.
   - At least one card: the requested valid authenticated route, or `/study/init` when entering from `/` or `/login`.
7. Let the onboarding routes themselves proceed without redirect loops. Onboarding takes precedence over a different requested app route when its prerequisite is missing; otherwise preserve the requested deep link.

Use the existing named routes `Login`, `DeckCreate`, `CardCreate`, and `SessionStart`; do not introduce duplicate route paths or hardcoded aliases. The guard reads `deckStore.decks`, `deckStore.activeDeckId`, and `cardStore.loadedDeckId`/`cards` to distinguish a loaded empty deck from an uninitialized card cache. A successfully initialized non-empty deck context must have `cardStore.loadedDeckId === deckStore.activeDeckId`.

The guard calls stores only; deck, direction, tag, and card queries continue through `Deck`, `Direction`, `Tag`, and `Card` models by way of `deckStore.initialize()`.

## 8. App Layout — `AppLayout.vue`

Remove `initializeDecks()` and the immediate profile watcher. Initialization is owned by the global guard so it completes before the protected view is shown and cannot race with a second layout-triggered load.

Keep `retryDeckLoading()` and its existing **Try again** button. `deckStore.retryLoad()` remains the retry operation and continues to report failures through `deckStore.error`. The layout remains responsible for displaying that error; it does not decide which route is appropriate for successful startup.

## 9. Login Completion — `LoginView.vue`

Update `handleSubmit()` after `authStore.setAuthenticated(result.profile, result.session)` to navigate with `router.replace({ name: 'SessionStart' })`. The global guard then initializes the user's deck context and redirects to deck/card onboarding if required. With existing cards, the user lands on the Session Start page.

Remove or avoid presenting the current success status as the terminal result, because successful login immediately leaves the login screen. Retain the current validation and authentication error messages. Navigation failures must be surfaced using the project's normal router error handling rather than being reported as a successful login.

## 10. Test Coverage

Add tests that verify behavior, not only route registration:

- An unauthenticated visit to a protected route ends at `Login`; a public login route remains accessible.
- Auth restoration is awaited once, and failed restoration remains visible on the login route.
- An authenticated entry at `/` or `/login` resolves to deck creation for zero decks, card creation for zero active-deck cards, and `/study/init` when cards exist.
- A valid authenticated deep link such as `/cards` remains `/cards` when the required deck/card state exists.
- Missing deck/card prerequisites override a different protected deep link and route to the required onboarding step.
- The active deck selected by `deckStore.initialize()` follows the existing saved-deck preference and oldest-created fallback behavior.
- A loaded empty card cache (`loadedDeckId` matching `activeDeckId`) routes to card creation; it is not refetched or mistaken for an uninitialized cache.
- Repeated guard evaluation for the same initialized user does not issue duplicate deck/card model queries.
- If initialization fails, the guard does not send the user to onboarding or study based on empty fallback values; the existing error banner and retry action are available.
- The startup indicator covers initial auth/deck evaluation and disappears when the route is ready or when an error is rendered.
- Successful login navigates through `SessionStart` and resolves the same state-dependent destination as cold startup.
- Saving a new deck retains the existing explicit **Add cards** action, as confirmed for this design. This does not satisfy US80's current automatic-redirect sentence; no story edit is made here.
