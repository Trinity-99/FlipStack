# US90 — Software Design

This document records technical decisions and code responsibilities that supplement US90. The user story and Architecture remain the sources of behavior and layering requirements.

## Data layer

### `app/src/data/localSource.ts` — `LocalSource`

Own the IndexedDB database and all local persistence. Use **Dexie**, with a typed database class and one declarative schema per database version. Keep Dexie imports and APIs inside this file.

Object stores: `meta`, `profile`, `user_deck_preference`, `deck`, `card`, `tag`, `direction`, `card_progress`. Add indexes for actual query needs: deck/user ownership, deck-scoped content, preference owner/deck, progress user/card/direction, and pending progress/settings.

Methods:

- Open/upgrade the database and get, set, or clear its owner user ID.
- Find model rows by ID and query rows by user, deck, card, or direction; assemble card tag IDs and profile preferences into shapes existing model parsers accept.
- Save progress/settings locally as pending; assign a UUID to new local progress rows.
- Reset matching progress; delete content and apply the mirror cascades in US90.
- Return pending rows with a persisted revision/snapshot marker.
- Replace downloaded global data and one deck's data in one Dexie transaction.
- Reconcile a pushed progress/settings snapshot only if its revision is unchanged; adopt the server progress ID after successful push.

### `app/src/data/remoteSource.ts` — `RemoteSource`

The only application module that imports `@/db/supabase`. Encapsulate Supabase queries, Auth calls, pagination, and Supabase error translation here.

Methods:

- Proxy `signInWithPassword` and `getSession`.
- Perform model content reads/writes/deletes and progress/settings writes.
- Download global data and a deck's complete sync data, paging until the final page.
- Read matching remote progress and upsert progress rows with the existing conflict key, returning server rows.

Do not pass local-only fields or a locally generated progress ID to Supabase. Log contextual failures and rethrow; translate `PGRST116` only to a not-found result.

### `app/src/data/dataRouter.ts` — `DataRouter`

Own source policy, sync lifecycle, connectivity, loading, and status. Inject sources through the constructor for tests; export one app singleton. It must not import stores or UI.

Methods:

- Local-only model reads; content writes/deletes remote-first then mirror; local-first progress and settings writes.
- `pushPendingChanges()`: compare pending progress with remote values by `last_updated`, push the newer local value, otherwise reconcile the remote value locally. Guard acknowledgements with the local revision. Retry non-network batch failures row by row; leave pending data on network failure.
- `syncAtStartup(userId)`: push changes, download global plus active deck in memory, then transactionally replace the mirror. Continue syncing other decks serially after startup is released.
- `prepareDeckSwitch(deckId)`: reuse a deck already synced this session or download/replace before switching.
- `prepareAuthenticatedUser(userId)`: preserve same-user data; clear a different user's mirror before loading their data.
- `retryStartupSync()` and one-time online/offline event registration. Reconnect pushes pending rows only.

Expose readonly reactive sync status and startup/deck loading state to the UI boundary. Use one `SYNC_DEADLINE_MS = 10000` for startup push and download. A timed-out download must not be committed; completed push acknowledgements are not rolled back.

Export `OfflineError` from this layer for failed online-only content operations.

## Existing files to adapt

- `app/src/models/profile.ts`: delegate profile/preferences persistence and profile lookups to the router. Keep `AuthenticationError`, `AuthenticationResult`, and model validation; route auth calls through the router.
- `app/src/models/deck.ts`, `card.ts`, `tag.ts`, `direction.ts`: keep their public methods and validation; delegate persistence and reads to the router. `Card` continues to pass `tagIds` through the local row shape.
- `app/src/models/cardProgress.ts`: keep public methods and validation; delegate persistence, lookups, and reset to the router. `fromJSON` continues to receive a valid ID; LocalSource assigns local progress IDs.
- `app/src/main.ts`: start router network monitoring before mounting.
- `app/src/router/index.ts`, `app/src/App.vue`, `app/src/stores/authStore.ts`: coordinate restored session, mirror readiness, blocking startup loading, and retry without redirecting network failures to login.
- `app/src/stores/deckStore.ts`: request deck readiness before committing a deck switch; continue to read through models.
- `app/src/engine/studyService.ts`: retain study logic and async save queue. Model saves persist locally; router initiates a non-blocking push after an online swipe.
- `app/src/stores/syncStatusStore.ts`: observe router status only; no storage or sync policy.
- `app/src/components/SyncStatusDot.vue` and `app/src/layouts/AppLayout.vue`: add the decorative status dot to the existing header.
- `app/eslint.config.ts`: forbid importing `@/db/supabase` outside `src/data/remoteSource.ts`.

Add Dexie to the Architecture technology stack when implementing the selected wrapper. Keep `fake-indexeddb` as a development dependency for tests.

## Tests

- `localSource.spec.ts`: schema upgrade, owner isolation, query indexes, pending persistence, cascades, atomic replacement, and revision-guarded reconciliation.
- `remoteSource.spec.ts`: auth pass-through, pagination, row mapping, query errors, and batch behavior.
- `dataRouter.spec.ts`: startup/deck-switch flows, newer-timestamp resolution, reconnect, failure handling, and fake-timer deadline behavior.
- `syncStatusStore.spec.ts` and `SyncStatusDot.spec.ts`: status mapping and non-interactive UI.
- Update model/store tests to mock the router boundary instead of Supabase directly; retain existing validation and study-engine coverage.
