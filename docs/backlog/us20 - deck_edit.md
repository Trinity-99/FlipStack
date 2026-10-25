# User Story: US20 — Deck Edit

### Standard Persona Format
* **As a** user,
* **I want to** create a new deck or edit an existing deck's name and side labels (2 or 3 sides),
* **So that** I can configure and maintain my study material structure accurately.

---

### Detailed Feature & UX Behavior
* **Trigger & Navigation (Remarks):** 
  * *First-login trigger & Header switcher:* Implementation of automatic routing on first login and header deck-switcher navigation will be wired up once all app views and routes are established.
  * *Mode Handling:* The `DeckEditView` serves both creation (empty state / new instance) and editing (pre-loaded with existing deck data via `deckId` route parameter).
* **Proactive Offline Check:** 
  * Upon mounting, the view immediately checks browser connectivity (`navigator.onLine`). 
  * If offline, an immediate warning banner (`bg-amber-950`, `border-amber-800/60`, `text-amber-300`) appears with the message *"Please connect to the Internet — offline data entry is not supported"*, and all form inputs/submit buttons are disabled to prevent data entry friction.
* **Form Inputs:**
  * **Deck Name:** Text input (required, max length: **24 characters**, placeholder: *"Thai Vocabulary"*). Live character counter displays `[count]/24`.
  * **Side Count Selector:** Segmented control to toggle between **2 Sides** or **3 Sides** (defaults to 3 sides).
  * **Side Label Inputs:**
    * *Side 1 Label* (Required, e.g., *"Script"*).
    * *Side 2 Label* (Required, e.g., *"Phonetic"*).
    * *Side 3 Label* (Conditional: visible only when 3-side mode is selected, and **strictly mandatory** in 3-side mode).
* **Validation Rules:**
  * **Deck Name:** Cannot be empty, whitespace-only, or exceed 24 characters.
  * **Side Labels:** 
    * For 2-side decks: Side 1 and Side 2 must not be blank.
    * For 3-side decks: Side 1, Side 2, and Side 3 must all not be blank.
* **State Transitions & Success Feedback:**
  * Submitting valid changes triggers the Active Record `.save()` persistence method.
  * Upon successful save, the view displays an explicit inline success banner: **`Deck "[Name]" created/updated successfully`**, with options to proceed.

---

### UI Design Mapping
* **Container & Surfaces:**
  * Card Wrapper: `bg-card` (`#1E293B`, `slate-800`), `rounded-3xl` (`card-radius`), `p-6` (`card-padding`), `shadow-2xl` (`card-elevation`), `border-2 border-slate-600` (`card-border`).
  * App Background: `bg-app` (`#0B0F19`, `slate-950`).
* **Input Fields:**
  * Background: `bg-surface-muted` (`#334155`, `slate-700`).
  * Text Color: `text-primary` (`#F8FAFC`, `slate-50`).
  * Placeholder / Supporting Text: `text-secondary` (`#94A3B8`, `slate-400`).
* **Primary CTA Button:**
  * Background: `brand-primary` (`#6366F1`, `indigo-500`).
  * Text: High-contrast white (`text-primary`), `rounded-xl` (`pill-radius`).
* **Error & Alert Banners:**
  * Validation Error: Bounded container using `bg-rose-950/90`, `border-rose-500/50`, and `text-rose-300` (`#FDA4AF`, WCAG AA compliant >4.5:1 ratio).
  * Offline Warning: Bounded container using `bg-amber-950`, `border-amber-800/60`, and `text-amber-300` (`#FCD34D`).

---

### Acceptance Criteria (AC)

| ID | Test Scenario | Expected Outcome |
| :--- | :--- | :--- |
| **AC-01** | **Happy Path: 3-Side Deck Save** | Given the user is on the Deck Edit view online, when they enter a valid deck name ($\le 24$ chars), select 3 sides, fill in valid labels for Side 1, Side 2, and Side 3, and save, then the deck is persisted via the Active Record model and a success banner reads `Deck "[Name]" saved successfully`. |
| **AC-02** | **Happy Path: 2-Side Deck Save** | Given the user selects 2 sides, when they provide a deck name and valid labels for Side 1 and Side 2 (leaving Side 3 hidden/ignored), and save, then a 2-sided deck is successfully created/updated. |
| **AC-03** | **Validation: Deck Name Exceeds Max Length** | Given the user enters a deck name longer than 24 characters, when they attempt to save, then validation fails and displays an inline error banner stating *"Deck name cannot exceed 24 characters"*. |
| **AC-04** | **Validation: Missing Mandatory Side Labels** | Given 3-side mode is selected but Side 3 label is left blank, when submitting, then validation halts and displays an inline error banner requiring all 3 side labels. |
| **AC-05** | **Proactive Offline Interception** | Given the browser is offline (`navigator.onLine === false`) upon opening the view, when the screen mounts, then inputs are disabled and an amber warning banner immediately displays *"Please connect to the Internet — offline data entry is not supported"*. |

---

### Technical Guidance
* **Architectural Placement:** 
  * **View:** `app/src/views/DeckEditView.vue` (handling local reactivity, pre-load logic for editing vs. creating, and proactive connectivity checks).
  * **Model:** `app/src/models/Deck.ts` implementing the **Pure Active Record** pattern (`Deck` class handling validation, properties, and Supabase persistence methods like `save()`, `find()`).
  * **Store / State:** Pinia store (`app/src/stores/deckStore.ts`) caching active deck state.
* **Database Interaction:** 
  * Directly calls `Deck` persistence methods which interact with the `deck` table in Supabase via `@supabase/supabase-js`. Row-Level Security (RLS) policies ensure data belongs strictly to the authenticated user.