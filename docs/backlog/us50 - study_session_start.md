# User Story: US50 — Learning Session Start

### Standard Persona Format

* **As a** user,

* **I want to** configure my topic (tag) and study direction before beginning a study session,

* **So that** I can launch targeted, high-speed practice tailored to what I need to learn right now.

### Detailed Feature & UX Behavior

* **Context & Store Pre-Loading:**

  * Pre-loads the active deck context (`deckId`) from `deckStore.ts`.

  * Retrieves saved user preferences for this deck: pre-selects the **last chosen topic** (defaulting to *"Whole Deck"*) and the **last chosen study direction**.

* **Configuration Inputs:**

  * **Topic Selector (Tag Filter):** Single-select drop-down / segment control allowing the user to select *"Whole Deck"* or any specific deck tag.

  * **Study Direction Selector:** Selects from the deck's pre-saved study directions (e.g., `Direction A: Script -> Phonetic + Meaning`). Includes option/control to manage directions.

* **Live Pool Count & Mastered State Interception:**

  * Dynamic counter recalculates eligible cards based on chosen topic and study direction.

  * Cards missing mandatory fields for the selected direction are automatically excluded.

  * **Mastered Pool Interception:** If only cards with score 10 remain (!Not if there is no card at all):

    * Displays informative banner: *"All cards in this topic are mastered!"*

    * Replaces the primary start button with a **"Reset Mastery Scores"** action button, allowing the user to reset score data for this topic and restart learning.

* **Session Launch:**

  * Tapping **"Start Studying"** saves the last chosen topic and direction; instantiates the study engine pool in state and navigates directly to the active study session view (`/study`).

### UI Design Mapping

* **Background:** `bg-app` (`#0B0F19`, `slate-950`).

* **Card Container:** `bg-card` (`#1E293B`, `slate-800`), `rounded-3xl` (`card-radius`), `p-6` (`card-padding`), `border-2 border-slate-600`.

* **Selectors / Inputs:** `bg-surface-muted` (`#334155`, `slate-700`), `text-primary` (`#F8FAFC`, `slate-50`).

* **Primary CTA Button:** `brand-primary` (`#6366F1`, `indigo-500`), `text-primary`, `rounded-xl` (`pill-radius`), `w-full`, `py-4`, `text-lg font-semibold`.

* **Mastered Info Banner:** `bg-emerald-950/80`, `border-emerald-500/50`, `text-emerald-300`, `rounded-xl`, `p-4`.

### Acceptance Criteria (AC)

| ID | Test Scenario | Expected Outcome | 
| ----- | ----- | ----- | 
| **AC-01** | **Remember Last Preferences** | Given a user opens the session start view for a deck, when the view loads, then the topic and study direction automatically default to the user's last chosen options for that deck. | 
| **AC-02** | **Live Card Pool Calculation** | Given the user changes the topic or study direction, then the eligible card count updates in real time, excluding cards that lack required sides for the direction. | 
| **AC-03** | **One-Tap Session Launch** | Given at least 1 eligible card is available in the pool, when the user taps *"Start Studying"*, then the session pool initializes and the app navigates directly into the active study view. | 
| **AC-04** | **Mastered Topic Handling & Score Reset** | Given all eligible cards in the selected topic have reached score 10, when the user selects this topic, then an informative message *"All cards in this topic are mastered!"* appears alongside a *"Reset Mastery Scores"* button which resets scores to 0 upon confirmation. | 

### Technical Guidance

* **Architectural Placement:**

  * **View:** `app/src/views/StudyInitView.vue`.

  * **Engine/Store:** `app/src/stores/studyStore.ts` (manages active session pool, filtering logic, persistent preferences, and score reset routines).

* **Database Interaction:**

  * Fetches `user_deck_preference` and card score data via Supabase Active Record models (`Card.ts`, `Deck.ts`).