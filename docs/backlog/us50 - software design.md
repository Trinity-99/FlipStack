# US50 — Learning Session Start Software Design

## Status

Design proposal for review. This document does not change US50, US70, the Architecture, Coding Guidelines, PRD, or UI Design specifications.

## 1. Scope

Implement the session-initialization screen at the existing `/study/init` route. A user chooses a topic and saved study direction, sees the eligible-card and not-yet-mastered counts, optionally resets mastery, and starts a session.

This story does not implement the active `/study` learning screen, gestures, card-flip animation, or direction-creation UI. The active learning screen remains the subject of its own story. US70 owns direction creation; this screen will select existing directions, and will be compatible with a future **+ Create New Direction** option.

Business rules currently located in the `Direction` model will move into the new Study Engine service. Persistence remains in Active Record models, as required by the Architecture specification.

## 2. Agreed Behavior

- Load the active deck, cards, tags, directions, and per-deck preference from the existing Pinia stores.
- Offer **Whole Deck** and the active deck's tags as a single-select topic.
- Offer saved directions in a normal dropdown. Do not include a direction-creation action in this story.
- Restore the last saved tag and direction when they still belong to the active deck. If the tag is missing or stale, use **Whole Deck**. If the direction is missing or stale, use the first saved direction.
- If the deck has no saved directions, show a temporary default direction using the PRD configuration: Side 1 as Question, Side 2 as Answer, and Side 3 as Answer when present. Keep it unsaved while configuring; persist it only when the user taps **Start Studying**.
- When there is no active deck, navigate to `/decks/new`.
- Recalculate the topic/direction count when either selection changes. Display **cards still to learn / all direction-eligible cards**, e.g. `45/76`. Cards at score 10 are included in the denominator but not the session pool.
- A card is direction-eligible only when the Question and every Answer side contain non-blank text. Missing Extra-side content does not make it ineligible.
- Show **All cards in this topic are mastered!** and offer **Reset Mastery Scores** only when at least one card is eligible and all eligible cards have score 10.
- If no cards are eligible, show an explanatory message and disable Start. Do not show the mastered state.
- Reset confirmation uses a dialog. On confirmation, reset only cards that are currently eligible for the selected topic and direction; cancel leaves progress unchanged.
- Tapping **Start Studying** persists the temporary default direction, if one is in use; saves the selected topic and direction with the existing profile preference model; initializes the study pool; and navigates to the existing `/study` route.
- This story designs only the setup screen. Motion for the active study card belongs to the active-study story.

## 3. Files and Responsibilities

### 3.1 New: `app/src/engine/studyService.ts`

Create the first business-logic class in the Study Engine layer. It must not access Supabase directly; model methods own persistence. Keep logic here only when it defines study eligibility, pool, mastery, or default-direction behavior.

**`StudyPoolSummary` type**

Define an exported result type containing:

- `eligibleCards: Card[]` — selected-topic cards satisfying the chosen direction.
- `cardsToLearn: Card[]` — eligible cards with a progress counter below 10; these form the session pool.
- `eligibleCount: number`.
- `cardsToLearnCount: number`.
- `isMastered: boolean` — true only when `eligibleCount > 0` and `cardsToLearnCount === 0`.

**`StudyService` methods**

- `isCardEligible(card: Card, direction: Direction): boolean` — move the eligibility behavior from `Direction.isCardEligible`. Check the Question and all Answer sides for non-blank content; do not require Extra content.
- `createDefaultDirection(deck: Deck): Direction` — return an unsaved `Direction` for the PRD default configuration, using the deck's available sides. This does not persist it.
- `getPoolSummary(cards: Card[], direction: Direction, progress: CardProgress[], tagId: string | null): StudyPoolSummary` — apply the selected topic, direction eligibility, and progress counters. Missing progress records count as 0. A card at 10 is mastered and excluded from `cardsToLearn`.
- `resetMastery(userId: string, cards: Card[], direction: Direction, tagId: string | null): Promise<void>` — select cards belonging to the chosen topic that are currently eligible, then ask `CardProgress` to set existing progress records for those card IDs and the selected direction to 0. Reject an unsaved direction because progress is keyed to a persisted direction ID. An empty eligible-card set is a successful no-op.

Move `Direction.isCardEligible()` into `StudyService.isCardEligible()`. Its `getQuestionStep()` and `getAnswerSteps()` helpers are used only by that eligibility method; remove them from `Direction` and use the direction configuration within the service. Keep `Direction.getName()`, validation, and persistence unchanged.

### 3.2 New: `app/src/stores/studyStore.ts`

Add a setup/session-state Pinia store. It coordinates models and the Study Engine service but does not reimplement study business rules.

**State**

- Current `StudyPoolSummary | null`.
- Current session pool (`Card[]`).
- The progress records loaded for the selected direction, so the active-study story can use each card's persisted counter and weight without re-querying at launch.
- Pool loading and user-facing error state.

The selected tag/direction controls remain local to `StudyInitView`; only the prepared pool and active session data need to be shared with the future study view.

**Actions**

- `loadPoolSummary(tagId, direction): Promise<void>` — load existing progress for a saved direction through `CardProgress`, then delegate filtering/counting to `StudyService`. For an unsaved temporary default, use an empty progress set (there cannot be progress rows without its direction ID).
- `startSession(tagId, direction): Promise<Direction>` — persist the temporary default through `Direction.save()` when needed; add the saved direction to `deckStore`; save the selected per-deck preference through `Profile.saveDeckPreference()` and update `authStore` with `setProfile()`; load progress and prepare the session pool via `StudyService`; then expose the pool and its progress records. Throw on any persistence or preparation failure so the view does not navigate on a failed start.
- `resetMastery(tagId, direction): Promise<void>` — delegate the eligible-card reset to `StudyService`, then reload the pool summary so the mastered state and count update.

Surface failures through the store error state and log with context; do not turn failed queries or saves into empty-success results.

### 3.3 Update: `app/src/stores/deckStore.ts`

Add `upsertDirection(direction: Direction): void` to commit a direction saved while starting a session to the active deck's existing `directions` cache. Validate that the direction has an ID and belongs to the active deck. Replace an existing entry by ID or append it. This also provides the state synchronization point required by the future direction-creation story.

No other deck-loading behavior changes.

### 3.4 Update: `app/src/models/cardProgress.ts`

Add model-owned batch operations so the service can inspect and reset progress without direct database access:

- `static findAllForUserAndDirection(userId: string, directionId: string): Promise<CardProgress[]>` — validate identifiers, query progress by `user_id` and `direction_id`, map through `fromJSON`, and return `[]` when no rows match.
- `static resetForUserCardsAndDirection(userId: string, cardIds: string[], directionId: string): Promise<void>` — validate identifiers and card IDs; return without a request for an empty ID list; parameterize a batch update of matching records to counter 0. Only existing records need updates because an absent record represents counter 0.

Wrap database calls in contextual logging and rethrow failures, following the model conventions. The reset method must constrain by user, direction, and eligible card IDs.

### 3.5 Update: `app/src/models/direction.ts`

Remove `isCardEligible()`, `getQuestionStep()`, and `getAnswerSteps()` after their behavior is moved to `StudyService`. Keep the `Direction` Active Record responsibilities (`save`, `delete`, queries, parsing, and configuration validation) unchanged.

### 3.6 New: `app/src/views/StudyInitView.vue`

Implement the setup screen with Vue Composition API and `<script setup lang="ts">`.

**Initialization**

- Read `activeDeck`, cards, tags, directions, and active deck preference from existing stores.
- If no active deck exists, navigate to `/decks/new`.
- Initialize topic and saved direction from valid preferences, falling back to **Whole Deck** and the first available direction respectively.
- If no direction exists, use `StudyService.createDefaultDirection(activeDeck)` as the temporary selection.
- Request the initial pool summary from `studyStore`; repeat when the topic or direction changes.

**Controls and display**

- Render a topic dropdown with **Whole Deck** plus available tags.
- Render a direction dropdown with existing directions, using the existing `Direction.getName()` behavior for labels. Display a temporary default using that same method.
- Display `cardsToLearnCount / eligibleCount` and a concise explanation of eligible cards.
- Present the story's mastered banner and reset action only when `summary.isMastered`.
- Present the no-eligible-cards message and disable the start action when `eligibleCount === 0`.
- Use an accessible confirmation dialog for **Reset Mastery Scores**, with explicit cancel and confirm actions. On confirmation call the store reset action; do not reset before confirmation.
- Enable **Start Studying** only when at least one card remains to learn. Start through the store and navigate to `{ name: 'Study' }` only after successful pool initialization.
- Show errors with the existing `FeedbackBanner` pattern; keep loading and disabled states visible and accessible.

**Visual direction**

- Use the supplied setup-screen mapping: `bg-app`; a centered `bg-card`, `rounded-3xl`, `p-6`, `border-2 border-slate-600` configuration container; muted select surfaces; and a full-width indigo primary action with `rounded-xl`, `py-4`, and prominent type.
- Make the count a clear focal point, visually distinguish topic and direction selection, and use the emerald mastered banner styles specified for US50.
- Keep the hierarchy compact and legible on the 375px mobile target. Do not add card-flip or gesture animations here; those belong to the active-study story.

### 3.7 Update: `app/src/router/index.ts`

Replace the `SessionStart` placeholder component at `/study/init` with a lazy import of `StudyInitView.vue`. Keep its route name and parent layout. Do not change the `/study` route or its immersive metadata in this story.

### 3.8 Tests

Add:

- `app/src/__tests__/studyService.spec.ts` — eligibility for Question/Answer/Extra roles; default directions for two- and three-sided decks; tag filtering; missing progress as zero; mastered vs. non-mastered pool calculation; reset target IDs.
- `app/src/__tests__/studyStore.spec.ts` — pool-summary loading; temporary direction persistence only on start; preference persistence and auth-store update; pool initialization; reset and refresh; failures block launch.
- `app/src/__tests__/StudyInitView.spec.ts` — preference restoration and invalid-preference fallback; selectors; live counts; no-eligible and mastered states; reset confirmation/cancel; start navigation after success; no-active-deck navigation.
- Extend `app/src/__tests__/direction.spec.ts` to remove eligibility assertions from the model tests; the moved eligibility behavior is tested in `studyService.spec.ts`.
- Extend `app/src/__tests__/cardProgress.spec.ts` for the new batch fetch/reset methods, including empty ID validation/no-op behavior and database failure handling.
- Extend `app/src/__tests__/deckStore.spec.ts` for `upsertDirection` validation and append/replace behavior.
- Extend `app/src/__tests__/App.spec.ts` to assert `/study/init` remains `SessionStart` under `AppLayout`.

## 4. Data Flow

1. `AppLayout` initializes `deckStore`; the setup view reads the committed active deck context and per-deck preference.
2. The view requests a pool summary from `studyStore` when the selection changes.
3. `studyStore` gets progress through `CardProgress` model methods and passes cards, direction, progress, and tag to `StudyService`.
4. `StudyService` applies topic filtering, eligibility, mastery, and pool rules.
5. On Start, the store persists the temporary default direction if needed, synchronizes `deckStore.directions`, saves the preference through `Profile`, computes the pool, and exposes it to Pinia state.
6. Only after successful preparation does the view navigate to `/study`.
7. On confirmed reset, the service derives currently eligible card IDs and calls the model batch update. The view then reloads the summary.

Views and stores may call the Study Engine and models. The Study Engine uses models. Models do not call upward and remain the only code that accesses Supabase.

## 5. Acceptance Criteria Coverage

| Story criterion | Design coverage |
|---|---|
| AC-01 — Remember last preferences | `StudyInitView` initializes from `activeDeckPreference`, with agreed valid-option fallbacks. Store saves preferences only on Start. |
| AC-02 — Live card pool calculation | `StudyService.getPoolSummary` filters selected topic, direction eligibility, and progress; view reloads on either selection change. |
| AC-03 — One-tap session launch | Store persists any temporary default, preference, and pool before view navigates to `/study`. |
| AC-04 — Mastered handling and reset | Summary distinguishes all-mastered from no-eligible; dialog-confirmed reset applies only to currently eligible cards in the selected topic/direction. |

## 6. Future Story Integration Notes

- US70 should add its **+ Create New Direction** option to the direction dropdown and select the newly saved direction so the pool summary recalculates. Direction creation itself is not implemented in US50.
- US70 mentions `/study/start` or `/session/start` and `StudyStartView`; US50 and the current router use `/study/init` and `SessionStart`. This design targets the existing US50 route and does not rewrite either story.
- The `/study` view will consume the pool prepared by `studyStore`; its card presentation, gestures, and motion are outside US50.
