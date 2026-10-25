# User Story: US15 — App Layout & Global Navigation Shell

### Standard Persona Format

* **As a** user,
* **I want** a consistent global layout shell with quick access to deck switching, card management, and deck creation,
* **So that** I can seamlessly navigate my learning content without losing context or visual layout stability across the application.

### Detailed Feature & UX Behavior

* **Global Container & Safe Area:**
  * Wraps all main application views inside a mobile-first main viewport (`bg-app`, `max-w-md` centered on desktop/larger viewports).
  * Enforces safe-area padding top and bottom to prevent content overlapping with mobile status/navigation bars.

* **Top Header & Deck Switcher:**
  * Displays the active deck title as an interactive dropdown selector.
  * **Deck Switcher Dropdown:**
    * Lists all available user decks by title.
    * Tapping a deck updates `deckStore.ts` with the new active deck ID and triggers a full store reload for the selected deck's associated data (study directions, card tags, card pool, user preferences).
    * Includes a prominent **"+ Create New Deck"** action button at the bottom of the list to launch the deck creation workflow.
    * *Note:* Deck editing/management is explicitly excluded.
  * Displays quick action icon/button to open the **Card List Hub** (`/cards`) for the current active deck.
  * Displays home/launchpad shortcut icon to return directly to **Study Session Start** (`/study/init`).

* **Immersive Mode Exception:**
  * Navigation header automatically hides on active study routes (`/study`) to provide maximum screen real estate for card content and gesture controls.

### Acceptance Criteria (AC)

| ID | Test Scenario | Expected Outcome |
| --- | --- | --- |
| **AC-01** | **Global Shell Rendering** | Given a user navigates between non-study views, then the top navigation bar remains anchored with consistent styling and active deck context. |
| **AC-02** | **Deck Switcher & Data Reload** | Given a user taps the deck switcher dropdown and selects a different deck, then the active deck updates, the dropdown closes, and the store reloads all directions, tags, and cards for the new deck. |
| **AC-03** | **Create New Deck Entry** | Given the user opens the deck switcher dropdown, when they tap "+ Create New Deck", then the app initiates the deck creation route/modal. |
| **AC-04** | **Immersive Study Session** | Given the user enters the active study session (`/study`), then the global header hides completely to maximize vertical study space. |

### Technical Guidance

* **Architectural Placement:**
  * **Layout Component:** `app/src/layouts/AppLayout.vue` (wraps `<router-view />`).
  * **Store Integration:** Listens to `deckStore.ts` for active deck ID and triggers `deckStore.loadActiveDeckData(deckId)` on switch.