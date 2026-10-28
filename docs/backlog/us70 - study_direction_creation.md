# User Story: US70 — Study Direction Creation

### Standard Persona Format

* **As a** user preparing to study,

* **I want to** create a new study direction directly from the Session Start view using my deck's actual side labels,

* **So that** I can instantly define how my deck's content maps to Questions, Answers, and Extra hints without manually typing direction titles or navigating away.

### Detailed Feature & UX Behavior

* **Context & Trigger Point:**
  * Accessed directly from the Direction Selector dropdown on the **Session Start View** (`/study/init`).
  * Selecting **"+ Create New Direction"** opens a lightweight modal dialogue over the current view.

* **Modal Dialogue Inputs (Using Deck Side Labels):**
  * Reads the configured side labels from the active deck (e.g., Side 1: *"Script"*, Side 2: *"Phonetic"*, Side 3: *"Meaning"*).
  * **Question Side Assignment:** Segmented picker/selector displaying deck labels to designate exactly 1 required Question side (e.g., *"Script"*).
  * **Answer Side(s) Assignment:** Multi-select toggle displaying remaining deck labels to designate 1 or more required Answer sides (e.g., *"Meaning"* or *"Phonetic"* + *"Meaning"*).
  * **Extra Side Assignment (Optional):** Optional picker displaying remaining deck labels to designate a side for non-graded supplementary details.

* **Automated Direction Name Generation:**
  * The user does not enter a manual name.
  * The `Direction` model automatically derives a human-readable direction title using the selected deck side labels:
    * *Example Syntax:* `[Question Label] - [Answer Label] - [Answer or Question Label]` (e.g., *"Script - Meaning"* or *"Script - Phonetic - Meaning"*).

* **Validation Rules:**
  * The selected Question side cannot simultaneously be selected as an Answer side.
  * At least 1 Answer side must be designated.
  * Duplicate direction mappings for the same deck are prevented or highlighted.

* **Save & Auto-Selection Workflow:**
  * Tapping **"Save Direction"** persists the new direction via the `Direction` model linked to the active `deckId`.
  * Closes the dialogue immediately, automatically selects the newly created direction in the Session Start selector, and triggers an immediate recalculation of the live eligible card pool.

### UI Design Mapping

* **Modal Overlay Container:** `bg-slate-900/80`, `backdrop-blur-sm`, centering a `bg-card` (`#1E293B`, `slate-800`) container, `rounded-3xl`, `p-6`, `border border-slate-700/80`, `shadow-2xl`.
* **Side Label Chips/Buttons:** `bg-surface-muted` (`#334155`, `slate-700`), `text-primary` (`#F8FAFC`, `slate-50`), `border border-slate-600`, active state `brand-primary` (`#6366F1`, `indigo-500`).
* **Auto-Generated Title Preview:** Displayed dynamically at the top of the modal in `text-indigo-400 font-mono text-sm`.
* **Primary Action CTA:** `brand-primary` (`#6366F1`, `indigo-500`), `text-primary`, `rounded-xl`, `py-3`, `px-4 font-semibold`.

### Acceptance Criteria (AC)

| ID | Test Scenario | Expected Outcome |
| --- | --- | --- |
| **AC-01** | **Modal Rendering with Deck Labels** | Given a user opens the direction creation modal for a deck, then side selector options display the deck's configured labels (e.g., *"Script"*, *"Phonetic"*, *"Meaning"*) rather than generic side numbers. |
| **AC-02** | **Automated Direction Naming** | Given a user selects *"Script"* as Question and *"Meaning"* as Answer, then the model automatically generates the name `"Script - Meaning"`. |
| **AC-03** | **Validation Guard against Overlapping Roles** | Given a user attempts to select the *"Script"* label as both Question and Answer, when submitting, then an inline error message prevents save until side roles are distinct. |
| **AC-04** | **Instant Selection & Pool Recalculation** | Given a new direction is saved, then the modal closes, the auto-named direction is automatically selected on the Session Start view, and the eligible card pool recalculates instantly. |

### Technical Guidance

* **Architectural Placement:**
  * **Component:** `app/src/components/DirectionDefinition.vue` (rendered conditionally within `StudyInitView.vue`).
  * **Model:** `Direction.ts` handling name generation logic (`generateTitle()`), validation rules, and Supabase persistence.
  * **Store:** Updates `deckStore.ts` / `studyStore.ts` to append the new direction and set it active in memory.