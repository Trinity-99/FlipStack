# US60 — Study Session Software Design

## Status

Design proposal for review. This document does not modify US60, the Architecture, Coding Guidelines, PRD, or UI Design specifications.

## 1. Scope

Implement the actual study experience at the existing `/study` route. The user studies the cards prepared by the existing session-start screen, reviews the configured sides, rates each card, and continues through a weighted learning stream until all eligible cards are mastered.

The study screen is the focused, immersive part of the learning flow. The card is the visual center of the screen; the header and controls remain light and secondary. Smooth flips, deliberate rating feedback, and accessible non-gesture controls make the interaction feel rewarding without slowing study.

This design builds on existing `StudyService`, `studyStore`, `CardProgress`, `AppLayout`, and router code. It does not add a persistence layer, IndexedDB, offline synchronization, a new Card model score API, or a new study-start route.

## 2. Confirmed Decisions

- The design document corresponds to US60 and is named `docs/backlog/us60 - software design.md`.
- The existing session-start route is `/study/init` (route name `SessionStart`). Completion returns there; no `/study/start` route is added.
- Follow the PRD gesture mapping: swipe left or tap advances to the next configured side; swipe right returns to the previous side. Sides loop in both directions.
- The header count means cards still to master out of all eligible cards for the selected topic and direction.
- Completion is a full immersive screen. Its message names the topic and counts cards that first reached score 10 during this session, e.g. “You mastered 4 cards on Grammar — keep that spirit up!”
- Offline storage and synchronization are deferred. Ratings update in Pinia immediately. A failed Supabase save is logged, does not interrupt the session, and is not shown to the user. There is no retry or durable queue in this story; unsaved in-memory changes can be lost when the page reloads.

## 3. Existing Behavior and Architecture

- `/study` already has immersive route metadata and currently renders `FeaturePlaceholderView.vue`.
- `StudyInitView.vue` calls `studyStore.startSession()` before navigating to `/study`. That action prepares the session pool and loads progress for the selected saved direction.
- `StudyService.getPoolSummary()` already filters by tag and direction eligibility and excludes cards whose counter is 10.
- `CardProgress` owns persisted progress and saves it with an Active Record upsert. Its current counter-mutation and weight helpers are study-specific legacy behavior and will move to `StudyService`. Progress belongs to `card_progress`, not the `Card` model.
- `AppLayout.vue` already hides its header and bottom navigation for immersive routes. Its main content still has standard page padding, which the study screen needs to remove route-locally to maximize gesture space.

The design follows the Architecture layering: `StudyView` handles rendering, gestures, and animation, and dispatches user actions to `studyStore`. The store is a reactive state adapter: it supplies current application context to the Study Engine, invokes engine operations, and publishes returned state to Pinia and related store caches. `StudyService` coordinates study workflows, calls Active Record models for persistence, and owns study decisions and rules. Models persist and validate their own records but do not coordinate study behavior.

## 4. Files and Responsibilities

### 4.1 Update: `app/src/views/StudyView.vue` (new)

Create the study page. Keep touch/pointer handling and view-only animation state here; send study actions through the store to the Study Engine. Do not put study decisions in the view or store.

**View state and derived values**

- `activePointer` — pointer start position and pointer ID while a gesture is in progress.
- `dragOffset` — current card translation for live drag feedback.
- `isAnimating` — prevents overlapping gestures while a flip or rating transition is running.
- `feedbackDirection` — `got-it`, `needs-review`, or `null` for the transient card treatment.
- `visibleSteps` — the ordered display steps returned by the Study Engine, with blank optional Extra sides removed.
- `currentSideIndex` — index into `visibleSteps`, wrapping at either end.
- `currentProgress` / `currentScore` — progress record and counter for the displayed card, defaulting to zero when no progress exists.
- `activeDeck` and `topicLabel` — deck and selected topic labels for the prompt, status header, and completion message.

**Methods**

- `handlePointerDown(event: PointerEvent): void` — begin tracking a primary pointer on the card and capture it.
- `handlePointerMove(event: PointerEvent): void` — update drag offset and feedback tint while tracking the captured pointer.
- `handlePointerUp(event: PointerEvent): void` — classify a completed gesture, dispatch a side turn or rating, and reset pointer state.
- `handlePointerCancel(event: PointerEvent): void` — restore the card position and clear gesture state without rating.
- `turnToNextSide(): void` — advance one displayed side, wrapping from the final side to the first.
- `turnToPreviousSide(): void` — move one displayed side backward, wrapping from the first side to the final side.
- `rateCurrentCard(rating: 'got-it' | 'needs-review'): Promise<void>` — set the matching exit feedback, invoke the store rating action, reset `currentSideIndex` to the Question side for the next turn, and allow the keyed card transition to complete. Reset the side even if the single-card pool selects the same card again.
- `handleCardTap(): void` — advance one side after a tap, unless the tap follows a completed drag.
- `exitStudy(): Promise<void>` — navigate to the existing `SessionStart` route without clearing the current session state.
- `startNewSession(): Promise<void>` — navigate from the completion screen to `SessionStart`.

**Gesture classification**

Use pointer events so touch and mouse share the same implementation. Give horizontal gestures precedence over vertical gestures, as specified by the PRD:

- A horizontal gesture qualifies after approximately 40 px and must move further sideways than vertically.
- A vertical gesture qualifies after approximately 80 px and must be within approximately 30 degrees of vertical; a clearly vertical fast flick may also qualify.
- An ambiguous diagonal or a gesture below threshold snaps back without action.
- Prevent browser panning/selection on the gesture surface while preserving ordinary page scrolling outside it.
- A completed drag suppresses the synthetic click that can follow pointer release. A tap advances one side.

These are the PRD's starting values for implementation and real-device tuning, not new product thresholds.

**Visual treatment**

- Use the `bg-app` immersive background and a single centered study card using `bg-card`, `rounded-3xl`, `p-6`, `shadow-2xl`, and `border-2 border-slate-600`.
- Keep the card within the UI Design mobile viewport bounds (approximately `h-80` on narrow screens); allow its content to wrap and scroll internally if needed rather than clipping multi-line or Unicode text.
- Display the current side's deck label and role as a small secondary cue, with the card text as the focal point (`text-2xl` to `text-3xl` for the prompt, comfortable line height).
- Add a restrained side-position indicator for the current loop, with an accessible text equivalent such as “Side 2 of 3”.
- A horizontal turn uses a perspective `rotateY` transition. Change the displayed side at the transition midpoint so the incoming content appears on the reverse face; next-side and previous-side turns rotate in opposite directions.
- A rating sends the card upward for Got It or downward for Needs Review, with a temporary emerald or rose tint/border/glow. Keep the effect brief and let the next card settle into the same central position.
- Honor `prefers-reduced-motion`: replace 3D and travel transitions with a short opacity/state change while retaining the action's color and text feedback.
- Provide visible, keyboard-operable controls for previous side, next side, Got It, and Needs Review. Controls remain at least 44 px high and visually secondary to the card. They are the fallback for desktop, keyboard, and assistive technology users.
- Include a compact exit control in the immersive header. The bottom navigation remains hidden.

**Completion view**

When the store reports completion, render a full-screen state in place of the interactive card. Show a concise congratulatory heading, the confirmed mastered-count/topic message, and a prominent “Start New Session” button. Do not show rating totals or elapsed time; they are outside the confirmed completion summary.

### 4.2 Update: `app/src/engine/studyService.ts` (`StudyService`)

Extend the existing service; do not create a second study engine or move data access into it.
The Study Service owns study workflow coordination and business rules. It calls Active Record models for persistence; it does not issue database requests directly. Study-specific business logic found in models is legacy and should move here. Models remain responsible for their own record representation, persistence, and persistence-level validation.

**Existing setup workflows**

- `loadPoolSummary(context, direction, tagId): Promise<StudyPoolState>` — validate the active study context, load progress through `CardProgress`, and calculate the topic pool.
- `startSession(profile, context, validTagIds, tagId, direction): Promise<StudySessionStartResult>` — validate the inputs and availability, load progress and calculate the pool once, persist an unsaved direction when needed, save the selected preference through `Profile`, and return the prepared result. Reuse the already-calculated pool summary; do not recalculate it after preference persistence when neither cards nor progress changed.
- `resetMastery(context, direction, tagId): Promise<StudyPoolState>` — determine which eligible progress records to reset, persist through `CardProgress`, reload progress, and return the refreshed pool.

**Active session workflows**

- `startActiveSession(...)` — initialize the current card and session state using the weighted selector.
- `rateCurrentCard(rating, sessionState): StudySessionState` — apply the score change, update session counters, recalculate the pool, choose the next card, and determine completion.
- `selectNextCard(...)` — implement weighted random selection and immediate-repetition prevention.
- `getDisplaySteps(card, direction): DirectionStep[]` — return configured sides in order, omitting blank optional Extra sides.
- Counter changes (+1/-1 with bounds) and selection weights (`10 - score`) are Study Service logic, not `CardProgress` methods.

Selection is weighted random, not a fixed ordered queue. Recalculate candidates from the latest counters on each turn. The no-repeat rule applies to the candidates available for the next turn; a one-card pool may repeat the same card.

### 4.3 Update: `app/src/stores/studyStore.ts` (`useStudyStore`)

Keep Pinia state reactive and expose thin actions for the view. The store does not decide eligibility, mutate progress counters, calculate weights, choose cards, or decide session completion. It adapts app state needed by the engine (authenticated profile ID, active deck ID, loaded card deck, cards, and available tag IDs), invokes the corresponding `StudyService` workflow, then publishes its result.

When a workflow persists a direction or preference, the store synchronizes the returned direction/profile into `deckStore` and `authStore`. This is application-state synchronization, not study business logic. If the engine saves a direction but a later preference write fails, the store still adds the persisted direction to the deck cache before propagating the error, so Pinia remains consistent with persistence.

Keep view-only pointer offsets, animation flags, and side-turn animation in `StudyView`.

**Additional state**

- `currentCard: Card | null` — card currently presented by the study screen.
- `activeDirection: Direction | null` — direction used by this prepared session.
- `activeTagId: string | null` — selected topic ID used to keep recalculating the same topic's pool.
- `activeTopicLabel: string | null` — selected tag name or `Whole Deck`, captured for session UI and completion.
- `masteredDuringSession: number` — count of cards that first reach 10 during this session.
- `isSessionComplete: boolean` — true once the current topic/direction has no unmastered eligible cards.

Continue using the existing `progressRecords`, `sessionPool`, and `poolSummary` as the in-memory source of truth for counters and remaining-card counts.

**Methods**

- `loadPoolSummary(tagId, direction): Promise<void>` — pass the current study context to `StudyService.loadPoolSummary()` and publish the returned progress and summary.
- `startSession(tagId, direction): Promise<Direction>` — pass the current profile, study context, and valid tag IDs to `StudyService.startSession()`. Synchronize its returned direction and profile into `deckStore`/`authStore`, publish the prepared pool state, and return the saved direction for navigation. If direction persistence succeeded before a later step failed, synchronize that saved direction into `deckStore` before rethrowing.
- `resetMastery(tagId, direction): Promise<void>` — call `StudyService.resetMastery()` and publish the returned progress and refreshed pool.
- `startActiveSession()` — call the engine to select the initial card and initialize active-session state, then publish the returned state.
- `rateCurrentCard(rating)` — call the engine to apply the rating and advance the session, then publish the returned state. It must not apply ratings, select cards, or calculate completion itself.
- Retain reactive state (`poolSummary`, `sessionPool`, `progressRecords`, active-session state) and UI-facing `isLoading` / `error` state. Use request IDs or equivalent stale-result protection for overlapping pool-summary loads.

### 4.4 Update: `app/src/router/index.ts`

Keep the existing `/study` path, route name `Study`, and `immersive: true` metadata. Replace its lazy-loaded `FeaturePlaceholderView.vue` component with `StudyView.vue`. Do not add a `/study/start` route or alter the existing `/study/init` route.

### 4.5 Update: `app/src/layouts/AppLayout.vue`

Keep the existing immersive header and bottom-navigation behavior. Make the `<main>` padding conditional on `isImmersive`, removing the standard horizontal and vertical page padding in immersive mode so `StudyView` can use the available viewport height and gesture space. Preserve normal padding for all other routes.

### 4.6 Update: `app/src/models/cardProgress.ts`

Keep `CardProgress` as the Active Record for persistence and counter data. Retain `save()` and the model's persistence responsibilities. Remove the study-specific `increment()`, `decrement()`, and `getWeight()` behavior when implementing the active session; implement bounded score changes and weight calculation in `StudyService` instead. Do not add score persistence to `Card`, because the database stores progress separately.

## 5. Session Flow

1. `StudyInitView` prepares the session as it does today and routes to `/study`.
2. `StudyView` requests the active session to start; the store dispatches to `StudyService`, which selects the initial card from the eligible, not-yet-mastered pool using weighted random selection.
3. The view renders the Question side, current score, loop indicator, and remaining-to-master / eligible counts.
4. A tap or horizontal gesture turns the same card through its non-empty configured sides. A vertical gesture or rating button updates progress and selects the next card.
5. After a rating, the pool summary and header count reflect the in-memory counter immediately. The next selection uses the updated weights and never repeats the just-rated card when another candidate is available.
6. Supabase persistence runs through `CardProgress.save()` in the background. A rejected save is logged by the model; the study continues with the in-memory rating and does not display a notification or retry.
7. When no unmastered eligible cards remain, stop rendering an active card and show the completion screen. The count in its message is the number of cards that first reached score 10 in this session.
8. “Start New Session” and the exit control navigate to the existing `/study/init` screen.

## 6. UI and Interaction Details

### Header

- Provide a small exit button with an accessible label.
- Show “Cards to master” and `remaining / eligible` in compact tabular numerals.
- Show the active card counter as `score / 10`, with a subtle ten-step indicator if space allows.
- Keep both indicators secondary to the card; do not add a standard app header or bottom navigation.

### Active card

- Render only user-provided plain text; do not use `v-html` or `innerHTML`.
- Keep the active side label visible so users can understand which configured side they are viewing.
- The card's flip is a side-navigation action only; it does not change score or choose a new card.
- A drag below threshold returns the card to its resting position without changing side or score.
- Keep feedback transient so the screen remains calm during repeated study.

### Rating controls

- Label the upward action “Got It” and the downward action “Needs Review”, with clear icons or directional cues.
- Both actions remain available at any side, including the Question side, matching the PRD.
- Got It increments by one up to 10; Needs Review decrements by one down to 0.
- Ignore additional pointer or button actions while the card transition is in progress.

## 7. Tests to Add or Extend

- `app/src/__tests__/studyService.spec.ts`
  - Verify display steps preserve order and skip missing Extra content.
  - Verify selection weights favor lower counters, treats missing progress as zero, excludes the previous card when alternatives exist, allows a single candidate to repeat, and returns `null` for an empty pool.
- `app/src/__tests__/studyStore.spec.ts`
  - Verify first-card initialization, score bounds, in-memory progress updates, newly mastered counting, updated remaining counts, no immediate repeat, completion, and direction-specific state.
  - Verify a rejected `CardProgress.save()` does not roll back a rating, block next-card selection, or set a user-facing store error.
- Add `app/src/__tests__/StudyView.spec.ts`
  - Verify labels, score/count indicators, side-loop navigation, tap-to-advance, pointer direction/threshold behavior, horizontal-over-vertical precedence, rating buttons, reduced-motion state behavior where practical, completion copy, and both completion/exit navigation targets.
- `CardProgress` already has model-level persistence tests. Extend them only if implementation reveals a required persistence behavior change; this design does not require one.

## 8. Explicitly Out of Scope

- IndexedDB, offline persistence, background synchronization, durable retries, and connectivity indicators.
- User-visible warnings when Supabase score persistence fails.
- A new `/study/start` route or changes to the study initialization flow.
- Direction editing/creation, card editing, audio playback, keyboard hotkeys beyond normal accessible controls, and a spaced-repetition algorithm.
- Changes to any existing product or architecture specification.
