# US70 — Study Direction Creation Software Design

## Status

Design proposal for review. This document does not modify US70, the Architecture, Coding Guidelines, PRD, or UI Design specifications.

## 1. Scope

Add direction creation to the existing Session Start page. A user opens a modal from the direction selector, assigns deck sides to Question, Answer, and optional Extra roles, chooses the reveal order, previews the generated name, and saves the configuration for the active deck.

This design targets the current `/study/init` route and `StudyInitView.vue`. It does not add a route, implement the active `/study` card screen, change existing direction or study behavior, or add study-card animations.

## 2. Confirmed Decisions

- Use the existing `/study/init` route (`SessionStart`) and `StudyInitView.vue`; do not add `/study/start` or `/session/start`.
- Reuse the existing `Direction` Active Record model and `DirectionStep` type. Do not add a second `StudyDirection` model.
- Keep the model responsible for its record shape, existing configuration validation, and persistence. Do not add direction-creation business rules or title-generation logic to the model.
- Generate the displayed name from all configured side labels in configuration order, joined by ` - `. The title is a display value; only the ordered side-and-role configuration is persisted.
- The Question step stays first. The user can explicitly order the remaining Answer and optional Extra steps.
- Reject an exact ordered side-and-role configuration already saved for the active deck. A different role assignment or reveal order is a distinct configuration.
- Keep the modal open and preserve the current selection and pool if validation or persistence fails. Show the failure in the modal. Close only after a successful save.
- The existing `deckStore` coordinates the operation and updates its direction cache after save. The Study Engine owns the duplicate rule; the view owns modal state and selection.
- Pool recalculation uses the existing `studyStore.loadPoolSummary()` workflow after the new direction is selected.

**Specification wording to leave unchanged:** US70's AC-02 uses an arrow in its expected name, while its name-generation section and the confirmed design decision use the configured labels joined by ` - `. This design follows the confirmed ` - ` format; the story itself is unchanged for its owner to resolve if needed.

## 3. Existing Code and Architecture

- `router/index.ts` already defines `/study/init` as `SessionStart` and lazy-loads `StudyInitView.vue`.
- `StudyInitView.vue` already loads the active deck's direction names, selects a direction, and watches the selected direction and topic to call `studyStore.loadPoolSummary()`.
- `Direction` in `app/src/models/direction.ts` represents the `direction` table, validates configurations when saving, and persists with `save()`. `DirectionStep` represents a side number and its role. `Direction.getName()` already returns deck labels in configuration order joined by ` - `.
- `deckStore.upsertDirection()` already adds or replaces a saved direction for the active deck.
- `StudyService` in `app/src/engine/studyService.ts` already coordinates study workflows and uses models for persistence.
- `studyStore.loadPoolSummary()` already recalculates eligible cards for a selected topic and direction.

The design follows the Architecture: the modal and view handle presentation and events; the store coordinates active-deck state; the Study Engine owns the duplicate business rule and coordinates the model; the Active Record model persists and validates its own record. No new repository or general-purpose service layer is introduced.

## 4. Files and Responsibilities

### 4.1 New: `app/src/components/study/StudyDirectionCreateModal.vue`

Create a focused modal component for configuring one direction. It receives the active `Deck`, save-in-progress state, and an optional save error from `StudyInitView`.

**Typed interface**

- Props:
  - `deck: Deck` — supplies the configured side labels.
  - `isSaving: boolean` — disables editing and repeat submission during persistence.
  - `errorMessage: string | null` — exposes a duplicate or persistence failure without closing the modal.
- Emits:
  - `save(configuration: DirectionStep[]): void` — submits the ordered configuration to the parent.
  - `cancel(): void` — requests dismissal without saving.

**Component state and derived values**

- Keep the selected Question side, selected Answer sides, optional Extra side, and remaining-step order local to the modal.
- Derive the ordered `DirectionStep[]` and preview name with `computed`; do not store separately derived values.
- Generate the preview using `deck.getSideLabel(step.side)` for each ordered step and join the labels with ` - `. The preview is not sent to persistence.
- Offer only the labels configured on the active deck. A side assigned to one role is unavailable for another role.
- Keep the Question at index zero. Provide keyboard-operable move-up/move-down controls to reorder the selected Answer and Extra steps.

**Methods**

- `selectQuestionSide(side: number): void` — select the sole required Question side and remove it from any other role.
- `toggleAnswerSide(side: number): void` — add or remove a side from the Answer selection without allowing overlap with Question or Extra.
- `selectExtraSide(side: number | null): void` — select or clear the optional Extra side without allowing overlap with another role.
- `moveStep(side: number, offset: -1 | 1): void` — reorder a selected non-Question step within the configured sequence, without moving it before Question.
- `validateConfiguration(): string | null` — require one Question first, at least one Answer, unique sides, and a valid two- or three-step configuration; return an inline validation message when invalid.
- `submitConfiguration(): void` — validate, then emit the ordered configuration. It does not call models or stores.
- `cancelCreation(): void` — emit `cancel` without saving or changing the selected direction.

**Interaction and visual behavior**

- Use a semantic dialog and form controls with labels, keyboard operation, visible focus, and validation text associated with the relevant controls.
- Follow US70's existing modal design mapping: dimmed blurred backdrop, `bg-card` container, rounded corners, border and shadow; side controls use the existing surface and primary color tokens.
- Keep the layout usable on narrow screens and preserve usable touch targets. Disable the Save action while `isSaving` is true.
- Show `errorMessage` inside the dialog. Do not dismiss on validation, duplicate, or persistence errors.
- Do not add card-flip, swipe, or other active-study animations to this direction-creation modal.

### 4.2 Update: `app/src/views/StudyInitView.vue`

Connect the existing direction selector and page state to the modal and store action.

**View state**

- Add `isDirectionCreateOpen: Ref<boolean>` for modal visibility.
- Add `isCreatingDirection: Ref<boolean>` to disable repeated submissions.
- Add `directionCreationError: Ref<string | null>` for modal validation and persistence feedback.
- Keep `selectedDirection` as the selected direction source of truth; do not introduce a second selected-direction state in the modal.

**Methods**

- Update `updateSelectedDirection(event: Event): void` to recognize a dedicated **+ Create New Direction** selector option, open the modal, and preserve the currently selected direction. Existing saved-direction options continue to select as they do now.
- Add `createDirection(configuration: DirectionStep[]): Promise<void>`:
  1. Clear the prior modal error and mark creation pending.
  2. Call `deckStore.createDirection(configuration)`.
  3. On success, calculate the display label from the active deck and returned configuration, add it to `directionNames`, set `selectedDirection` to the saved direction, and close the modal.
  4. Let the existing selected-direction watcher trigger `studyStore.loadPoolSummary()` for the current topic and new direction. Do not issue a second explicit refresh.
  5. On failure, keep the modal open and the prior selection unchanged, show a clear inline error, and log the view failure with context.
  6. Clear the pending state in `finally`.
- Add `cancelDirectionCreation(): void` to close the modal and clear its transient error; it does not change direction selection or pool state.

Do not save a new deck preference as part of direction creation. Existing Session Start behavior saves the chosen direction and topic when the user starts studying.

### 4.3 Update: `app/src/engine/studyService.ts` — `StudyService`

Add the domain workflow for creating and de-duplicating a direction. The engine is the only layer with the duplicate rule; the model remains Active Record.

**Method**

```typescript
public async createDirection(
  deckId: string,
  configuration: DirectionStep[],
  existingDirections: Direction[],
): Promise<Direction>
```

Responsibilities:

1. Construct an unsaved `Direction` for `deckId` with the supplied ordered configuration.
2. Compare the candidate configuration with each saved direction by length and by each position's `side` and `role`.
3. Throw a descriptive error when an exact ordered match already exists; do not call `save()` for a duplicate.
4. Call `Direction.save()` for a non-duplicate configuration. The model's existing validation runs before its database request.
5. Return the saved direction. Propagate save errors; do not convert failures into an empty or success-shaped result.

Do not add title generation, database access outside the model, or a new direction-creation service. Duplicate checking uses the active deck's loaded direction list passed from the store.

### 4.4 Update: `app/src/stores/deckStore.ts`

Add an action that coordinates the active deck, Study Engine, and direction cache.

**Method**

```typescript
async function createDirection(configuration: DirectionStep[]): Promise<Direction>
```

Responsibilities:

1. Require a loaded active deck with a persisted ID; fail explicitly if no active deck is available.
2. Delegate creation and duplicate checking to `StudyService.createDirection(activeDeckId, configuration, directions.value)`.
3. Call the existing `upsertDirection()` only after the engine returns a saved direction.
4. Return the saved direction to the view. On failure, leave the current direction cache unchanged, log with store context, and rethrow so the modal can display the error.

No separate direction store is needed. The store does not compute display names or pool eligibility.

### 4.5 Reuse without changes

- `app/src/models/direction.ts`: use the existing `Direction` constructor, validation, and `save()`; add no title or duplicate business logic.
- `app/src/stores/studyStore.ts`: use the existing `loadPoolSummary(tagId, direction)` action; add no new pool action.
- `app/src/router/index.ts`: keep the existing `/study/init` route; add no route.

## 5. Save and State Flow

1. The user selects **+ Create New Direction** from the direction selector. The view opens the modal and keeps its current selection.
2. The user chooses one Question, at least one Answer, optionally one Extra, and orders the non-Question steps. The component shows the generated label preview.
3. The user submits. The modal validates local role requirements and emits the ordered `DirectionStep[]`.
4. `StudyInitView` calls `deckStore.createDirection()`. The store passes the active deck and cached directions to `StudyService`.
5. `StudyService` rejects an exact duplicate or saves a new `Direction` through the Active Record model. The store updates its cache only after successful persistence.
6. On success, `StudyInitView` updates its display-name cache, selects the returned direction, and closes the modal. The existing watcher recalculates the pool for the selected topic and direction.
7. On duplicate or persistence failure, the modal remains open with an error. No direction is added to the cache, no selection changes, and no pool refresh is triggered.
8. Canceling only closes the modal; no model, store, or pool action runs.

## 6. Error and Duplicate Considerations

- Structural invalidity is prevented by the modal controls and checked again before emitting. `Direction.save()` remains the authoritative model validation before database writes.
- Exact duplicate comparison includes side positions, roles, and order. The displayed title alone is not used for equality.
- Duplicate checks use the active deck's in-memory direction list. The current schema has no uniqueness constraint for direction configurations; concurrent creates from separate clients can race. A database-level uniqueness guarantee would require a separately approved schema/specification change and is not included here.
- Persistence errors are logged by the existing model, contextualized by the store/view, and surfaced in the open modal. The previous direction and pool remain selected.

## 7. Tests

Add or extend focused Vitest coverage:

| Test file | Coverage |
|---|---|
| `app/src/__tests__/StudyDirectionCreateModal.spec.ts` (new) | Render configured labels for two- and three-side decks; enforce required roles and non-overlap; verify generated name follows configured order and includes Extra labels; reorder non-Question steps; emit the final configuration; disable submission and show errors while saving or after failure; cancellation emits without saving. |
| `app/src/__tests__/studyService.spec.ts` | Reject an exact ordered duplicate without saving; allow different roles or order; persist and return a unique direction; propagate model save failures. |
| `app/src/__tests__/deckStore.spec.ts` | Require an active deck; delegate with active deck ID and cached directions; update the cache after success only; leave it unchanged and propagate errors on failure. |
| `app/src/__tests__/StudyInitView.spec.ts` | Open the modal from the selector; retain the current selection while open; select the newly saved direction and update its displayed name on success; verify the pool recalculates through the existing watcher; keep the modal open and selection unchanged on failure; cancel without saving or refreshing. |

No model test changes are required unless implementation changes existing `Direction` validation or persistence behavior; this design does not require either change.
