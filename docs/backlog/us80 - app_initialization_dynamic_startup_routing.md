# User Story: US80 — App Initialization & Dynamic Startup Routing

### Standard Persona Format

* **As a** returning or new user opening the app or completing login,

* **I want** the application to evaluate my local state and authentication status dynamically,

* **So that** I am instantly routed to the appropriate operational view or onboarding step without redundant network calls or landing on empty states.

### Detailed Feature & UX Behavior

* **Initialization Trigger Points:**

  1. **Cold Application Launch / Page Reload:** Executes during top-level app mounting.

  2. **Post-Authentication Event:** Executes immediately after successful user login or signup, bypassing the login screen to execute destination routing.

* **Multi-Tier Hydration & Routing Logic:**

  1. **Authentication Verification:**

     * Checks session state directly via `authStore` (Pinia).

     * *If unauthenticated:* Immediately routes to `/login`.

  2. **Store / Memory Cache Check (Decks):**

     * Evaluates local Pinia store (`deckStore`). If active deck and cards are already populated in memory, skips unnecessary database calls and proceeds directly to launchpad routing.

  3. **Database Hydration (Supabase Query - Decks):**

     * If `deckStore` is unpopulated, queries Supabase for all decks belonging to the user.

     * **Condition 0 Decks:** Routes directly to `/decks/new` (Deck Creation Onboarding). Saving a deck automatically redirects to `/cards/new`.

  4. **Active Deck Resolution (For 1+ Decks):**

     * **Single Deck:** Automatically sets the single deck as active in `deckStore`.

     * **Multiple Decks:** Checks user preferences for the last active deck ID. If found, sets that deck as active; otherwise, defaults to the first created deck.

  5. **Card Hydration & Zero-Card Onboarding Check:**

     * Evaluates `cardStore` in Pinia. If unpopulated, fetches cards for the designated active deck from Supabase into `cardStore`.

     * **0 Cards in Active Deck:** Routes directly to `/cards/new` (Card Onboarding for active deck).

     * **1+ Cards in Active Deck:** Routes directly to `/study/init` (Main Learning Launchpad).

### UI Design Mapping

* **Background:** `bg-app` (`#0B0F19`, `slate-950`).

* **Startup Splash Indicator:** Minimalist loading indicator with `text-indigo-500` centered during async state evaluation.

### Acceptance Criteria (AC)

| ID | Test Scenario | Expected Outcome | 
| ----- | ----- | ----- | 
| **AC-01** | **Unauthenticated Boot** | Given a user opens the app without an active session in `authStore`, when initialization executes, then the app routes to `/login`. | 
| **AC-02** | **Post-Login Routing** | Given a user successfully logs in on `/login`, when auth succeeds, then initialization logic executes and routes to the appropriate view based on deck/card state. | 
| **AC-03** | **Zero-Deck Onboarding Route** | Given an authenticated user has 0 decks in Supabase, when startup checks complete, then the app routes to `/decks/new`. | 
| **AC-04** | **Zero-Card Onboarding Route** | Given an authenticated user has 1+ decks but 0 cards in the active deck, when startup checks complete, then the app routes to `/cards/new`. | 
| **AC-05** | **Standard Session Launch** | Given an authenticated user has an active deck with 1+ cards, when startup checks complete, then the app routes to `/study/init`. | 

### Technical Guidance

* **Architectural Placement:**

  * **Router:** `app/src/router/index.ts` (global initialization guard `beforeEach`).

  * **App View:** `app/src/App.vue` (mount trigger).

  * **Stores:** `authStore.ts`, `deckStore.ts`, `cardStore.ts`.