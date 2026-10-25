# User Story: US30 — Card Edit & Create

### Standard Persona Format

* **As a** user,
* **I want to** create and edit study cards with multi-line text and tags,
* **So that** I can efficiently build and maintain my study decks.

---

### Detailed Feature & UX Behavior

* **Context & Store Management:**
  * Active deck context (`deckId`) is retrieved directly from the Pinia application store (`deckStore.ts`). URL routing stays simple (`/cards/new` or `/cards/edit/:id`).
  * Form field headers dynamically render the side names defined by the active deck's configuration (e.g., displaying "Script", "Phonetic", and "Meaning" instead of "Side 1", "Side 2", and "Side 3").

* **Modes & Actions:**
  * **Creation Mode:** Triggered when adding a new card. Features two primary actions:
    * **"Save & Create Next":** Persists the current card, clears all inputs, displays a brief success toast/banner, and resets focus to the Side 1 input for fast consecutive entry.
    * **"Save & Close":** Persists the card and navigates back to the Card List view.
  * **Editing Mode:** Triggered when selecting an existing card from the list. Pre-populates all existing side contents and tags.
    * **"Save Changes":** Persists updates and returns to the Card List view.

* **Form Inputs & Formatting:**
  * **Side Inputs:** Expandable textarea fields for each available deck side. Supports multi-line Unicode text (essential for script diacritics and notes).
  * **Partial Card Entry:** Card creation does not require all fields. A card can be saved with 1, 2, or 3 sides. *(Note: Cards with fewer than 2 sides are saved successfully, but automatically skipped during active study sessions until completed).*
  * **Tag Selector:** Multi-select pill component allowing users to assign or detach reusable deck tags.

* **Validation Rules:**
  * **Non-Empty Card Rule:** At least one side input must contain non-whitespace text. Submitting a completely empty card is prevented, displaying an inline error banner (*"At least one side must contain text"*).

---

### UI Design Mapping

* **Container & Surfaces:**
  * Card Wrapper: `bg-card` (`#1E293B`, `slate-800`), `rounded-3xl` (`card-radius`), `p-6` (`card-padding`), `shadow-2xl` (`card-elevation`), `border-2 border-slate-600` (`card-border`).
  * App Background: `bg-app` (`#0B0F19`, `slate-950`).

* **Input Textareas:**
  * Background: `bg-surface-muted` (`#334155`, `slate-700`).
  * Text Color: `text-primary` (`#F8FAFC`, `slate-50`).
  * Dynamic Field Headers: `text-secondary` (`#94A3B8`, `slate-400`), `text-xs font-medium`.

* **Action Buttons:**
  * Primary CTA ("Save & Create Next" / "Save Changes"): `brand-primary` (`#6366F1`, `indigo-500`), `text-primary`, `rounded-xl` (`pill-radius`).
  * Secondary CTA ("Save & Close"): `bg-surface-muted` (`#334155`), `text-secondary`, `rounded-xl` (`pill-radius`).

* **Validation Banners:**
  * Inline Error: `bg-rose-950/90`, `border-rose-500/50`, `text-rose-300`.

---

### Acceptance Criteria (AC)

| ID | Test Scenario | Expected Outcome |
| :--- | :--- | :--- |
| **AC-01** | **Consecutive Creation ("Save & Create Next")** | Given the user is in Card Creation mode, when they enter text into available sides, select tags, and tap *"Save & Create Next"*, then the card is saved to the active deck, input fields are cleared, a success banner appears, and focus returns to Side 1 for immediate creation of the next card. |
| **AC-02** | **Edit Existing Card ("Save Changes")** | Given the user is editing an existing card, when they update side text or tags and tap *"Save Changes"*, then the card is updated via Active Record and the view navigates back to the Card List. |
| **AC-03** | **Dynamic Side Label Rendering** | Given the active deck is configured with specific labels (e.g., Label 1: "Script", Label 2: "Phonetic", Label 3: "Meaning"), when the card form renders, then field headers display those exact labels instead of generic side numbers. |
| **AC-04** | **Partial Card Entry (1-Side Entry)** | Given the user enters text for Side 1 only and leaves Sides 2 and 3 blank, when saved, then the card is successfully created with `jsonb` payload `{"s1": "..."}` and flagged for future completion. |
| **AC-05** | **Tag Selection & Junction Sync** | Given the active deck has tags, when a user selects or deselects tags on the card form, then saving updates both the card record and the corresponding `card_tag` junction entries. |
| **AC-06** | **Validation: Prevent Empty Card Submission** | Given all side inputs are blank or contain only whitespace, when attempting to save, then submission is halted and an inline error banner displays *"At least one side must contain text"*. |

---

### Technical Guidance

* **Architectural Placement:**
  * **View:** `app/src/views/CardEditView.vue` (handling local state, consecutive clearing logic, and dynamic deck label lookup).
  * **Model:** `app/src/models/Card.ts` implementing the **Pure Active Record** pattern. Stores sides as a JSON object (`jsonb`: `{"s1": "...", "s2": "...", "s3": "..."}`) and manages persistence (`save()`, `delete()`).
  * **Store / State:** `deckStore.ts` provides active deck metadata; `cardStore.ts` manages card list caching.

* **Database Interaction:**
  * Directly interacts with `card` and `card_tag` tables in Supabase via `@supabase/supabase-js`, protected by Row-Level Security (RLS) policies tied to the authenticated user's ID.