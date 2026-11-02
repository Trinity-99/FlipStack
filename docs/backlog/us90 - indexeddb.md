# User Story: US90 — IndexedDB (Offline Learning)

### Standard Persona Format
* **As a** learner,
* **I want to** study my decks without an internet connection and have my progress synchronized later,
* **So that** I can learn anywhere, and on any of my devices, without thinking about connectivity.

---

### Scope
* **In scope:** local mirror in IndexedDB, data router with remote and local source, offline studying, sync, sync status dot in the header.
* **Out of scope:** offline data entry (stays online only, see US20), live updates between devices, logout function.
* **Binding references:** Architecture chapters 4.1 to 4.3 and 8.2. This story adds the decisions and details below and does not repeat them.

---

### Detailed Feature & Behavior

#### 1 Data classes

| Class | Data | Write path |
| :--- | :--- | :--- |
| Content | `deck`, `card` (with its tag links), `tag`, `direction` | Remote first, then mirror. Online only. |
| Progress | `card_progress` | Local first, pushed to Supabase later. |
| Settings | `profile.last_active_deck_id`, `user_deck_preference` | Local first, pushed to Supabase later. |

* Reads always come from the mirror.
* The local source returns rows in the same shape as Supabase rows, so the existing `fromJSON` methods work unchanged for both.
* All validation stays in the models and runs before any call to the router.

#### 2 Local database

* One IndexedDB database holds the mirror of: `profile`, `user_deck_preference`, `deck`, `card`, `tag`, `direction`, `card_progress`. Card tag links are stored with the card (`tagIds`); no separate junction store is needed.
* A meta record stores the `userId` that owns the local data.
* A progress or settings row that is not yet sent carries a `pending` flag. The flag survives an app restart.
* Schema changes use IndexedDB version upgrades. A wrapper library may be used; if one is chosen, it is added to the Architecture technology stack.

#### 3 Progress (counters)

* A swipe writes the new counter and `lastUpdated` to the mirror first and marks the row `pending`. Studying never waits for the network.
* `CardProgress.resetForUserCardsAndDirection` follows the same path: all affected rows are written locally and marked `pending`.
* **Push:** pending rows are sent to Supabase in batches with the existing upsert on `(user_id, card_id, direction_id)`. For each pending row, compare its lastUpdated with the matching server row. The row with the newer timestamp wins: push the local row if it is newer; otherwise keep the server row and update the mirror. After a successful request the `pending` flag is cleared, but only if the row was not changed again while the request was running.
* **Failed push:**
  * A network error keeps the rows `pending`.
  * Any other error (constraint, row limit, row-level security, or a card deleted on another device) fails the whole batch. The push then retries that batch row by row, drops only the rows that fail, logs them with `console.error`, and sends the rest.
* **When:** the push is the first step of every sync at app start and of every deck switch. It also runs whenever the browser reports that the connection returned during a session.

#### 4 Settings (active deck, last direction, last tag)

* Changes are written to the mirror first and marked `pending`, so switching decks and the study start screen work offline.
* Settings are pushed together with progress

#### 5 Content

* Save: the router writes to Supabase first. On success it writes the returned row to the mirror, and the model takes the server-generated values (id, createdAt, and updatedAt where the table has it) from the returned row. Card tag links are written together with the card.
* Delete: Supabase first, then the mirror, applying the same cascades as the database:

| Deleted | Also removed or cleared in the mirror |
| :--- | :--- |
| `deck` | its cards, tags, directions, progress, preferences; `profile.last_active_deck_id` set to null |
| `card` | its progress and tag links |
| `tag` | its tag links; `last_selected_tag_id` set to null where used |
| `direction` | its progress; `last_selected_direction_id` set to null where used |

* If there is no connection, or the request to Supabase fails, the router throws `OfflineError`. The mirror stays unchanged and nothing is queued. Views show the existing message *"Please connect to the Internet — offline data entry is not supported"*. The proactive `navigator.onLine` check in US20 stays.

#### 6 Sync

**Unit.** A sync unit is the *global part* (profile, deck preferences, deck list) plus *one deck* (its cards with tag links, tags, directions and the progress of its directions).

**At app start, online:**
1. Restore the session.
2. Push local changes to Supabase
3. Download the global part and the active deck completely into memory. No downloaded data is written to the mirror yet. The push and download share a deadline: `SYNC_DEADLINE_MS = 10000`, one constant.
4. If the download is complete, replace the local copy of the global part and the deck in **one IndexedDB transaction**. 
5. Release the views. Until then the user sees a spinner telling them to wait until the active deck's data is loaded. No view renders data before this point.
6. In the background: sync the other decks one by one with the same download-then-replace procedure.

**Failure.** If the push or download is incomplete at the deadline or fails, the in-memory data is discarded and the mirror stays untouched (except for updates that already successfull phushes might have made). The app continues on the local copy for this session as if offline; the sync is retried at the next start. If there is no local copy yet (first start on a device), the user sees an error message with a *Retry* button.

**Offline start.** No sync. With a local copy the app opens on it. Without one the user sees *"Connect to the internet to load your decks"*.

**Deck switch.** If the deck has already been synced in this session, the switch is immediate. Otherwise that deck moves to the front of the sync queue and the spinner is shown until its sync completes or fails (failure behaves as above).

**Connection returns during a session.** Only pending rows are pushed. Content is not pulled; the screen content does not change.

**Paging.** Supabase returns a limited number of rows per request. Every download is paged with a page size at or below the project's max-rows setting. The download counts as complete only after the last page; a missing page is a failure. Progress is fetched with `direction_id in (the deck's direction ids)`.

#### 7 Session, user and authentication

* An expired session never clears the mirror.
* `Profile.restoreAuthentication` must work offline: it uses the stored session and loads the profile from the mirror. A network error while restoring or refreshing the session must not send the user to the login screen.
* Login stays online only. After sign-in the router compares the user with the meta record: same user keeps the mirror and pushes pending rows; a different user clears the whole mirror first.
* Supabase Auth calls (`signInWithPassword`, `getSession`) live in the remote source and pass through the router unchanged.

#### 8 Sync status dot

A small colored dot in the header navigation, no label, no tap behavior.

| Color | State |
| :--- | :--- |
| Green | Online, no sync running, nothing pending |
| Orange | Online, and a sync is running or rows are pending |
| Red | Offline, or the sync was abandoned in this session |

Online or offline is derived from the browser `online` and `offline` events and from failed requests. `navigator.onLine` alone is not sufficient.

---

### Technical Guidance
* **Placement:**
  * `app/src/data/remoteSource.ts`: the only file group that imports `@/db/supabase`. Translates "not found" (`PGRST116`) into a neutral result.
  * `app/src/data/localSource.ts`: the only file group that touches IndexedDB.
  * `app/src/data/dataRouter.ts`: policy, sync, status. Exposes only what the models need, plus `status`, `OfflineError` and the loading state for app start and deck switch.
  * `app/src/stores/syncStatusStore.ts`: Pinia store that reads the router status. `app/src/components/SyncStatusDot.vue` shows it in the header.
* **Models:** keep their public methods and validation. Supabase imports and Supabase-specific error handling move into the remote source. `findById` returns `null` when the row is missing in the mirror.
* **Layering:** the router never calls upward. The status store observes the router; the router does not know the store.
* **Lint:** a `no-restricted-imports` rule forbids `@/db/supabase` outside `src/data/remoteSource.ts`.
* **Tests:** use `fake-indexeddb` and a controllable fake remote source; test the deadline with fake timers.
* **Coding Guidelines:** when reworked, chapter 4 (Data Layer) is rewritten for the router; the `PGRST116` and `try...catch` around Supabase rules then apply to the remote source. New code follows the existing rules (JSDoc, no `any`).

---

### Acceptance Criteria (AC)

| ID | Test Scenario | Expected Outcome |
| :--- | :--- | :--- |
| **AC-01** | **First start online, no mirror** | Spinner is shown; no view renders until the global part and the active deck are in the mirror; then the app opens. |
| **AC-02** | **First start, sync fails or times out** | No local copy exists: error message with *Retry*; Retry starts the sync again. |
| **AC-03** | **Offline start with mirror** | App opens on the mirror without the login screen; deck list and studying work. |
| **AC-04** | **Offline start without mirror** | Message *"Connect to the internet to load your decks"*; no study view. |
| **AC-05** | **Swipe offline** | Counter and `lastUpdated` are written to the mirror, row is `pending`, no request is sent, the next card is drawn from local counters. |
| **AC-06** | **Swipe online** | The mirror is written before any request; studying continues if the push fails. |
| **AC-07** | **Pending survives restart** | After restarting the app, pending rows are still pending and are pushed at the next start. |
| **AC-08** | **Push creates or reconciles** A pending row with no server match is inserted. If a server row exists, the row with the newer lastUpdated wins. The winning server row, including its id, is stored in the mirror and the pending flag is cleared unless the local row changed during the push. |
| **AC-09** | **Swipe during push** | A row changed after its push started stays `pending`. |
| **AC-10** | **Push errors** | Network error: row stays `pending`. Constraint, row-limit or RLS error: row is dropped and logged. |
| **AC-11** | **Reset progress** | `resetForUserCardsAndDirection` writes locally, marks rows `pending`, and works offline. |
| **AC-12** | **Content save online** | Written to Supabase first, then to the mirror; the model receives `id` and timestamps from the server row; a card's tag links are saved with it. |
| **AC-13** | **Content save offline** | `OfflineError` is thrown, the mirror is unchanged, nothing is queued; the view shows the offline message. |
| **AC-14** | **Delete cascades** | Deleting a deck, card, tag or direction removes or clears exactly the related mirror data listed in the cascade table. |
| **AC-15** | **Content from another device** | Edits and deletions made on another device are present in the mirror after the next app start. |
| **AC-16** | **Deadline** | If the push and download is incomplete after `SYNC_DEADLINE_MS`, no downloaded content is written, the app runs on it, and the dot is red. |
| **AC-17** | **Atomic replace** | If the write phase fails, the previous local copy of the deck is fully intact. |
| **AC-18** | **Paging** | A deck with more rows than one page is loaded completely; a missing page counts as a failed download. |
| **AC-19** | **Order** | Views are released after the active deck is in the mirror; the other decks sync afterwards, one by one, without changing what the views show. |
| **AC-20** | **Deck switch** | A deck already synced this session opens immediately; otherwise a spinner is shown until its sync completes; on failure the local copy is used, or the error with *Retry* if none exists. |
| **AC-21** | **Reconnect mid-session** | Only pending rows are pushed; no content is pulled; the visible screen does not change. |
| **AC-22** | **Status dot** | Green, orange and red appear exactly as in the status table; the dot has no label and no tap behavior. |
| **AC-23** | **Expired session offline** | The user is not sent to the login screen; local data is intact; after the connection returns the session is refreshed and pending rows are pushed. |
| **AC-24** | **Login, same user** | The mirror is kept; pending rows are pushed. |
| **AC-25** | **Login, different user** | The whole mirror is cleared before any data of the new user is loaded. |
| **AC-26** | **Boundaries (lint and structure)** | No file outside `remoteSource.ts` imports `@/db/supabase` (lint fails otherwise); only `localSource.ts` accesses IndexedDB; models, study engine, stores and views contain no storage-specific branching. |
