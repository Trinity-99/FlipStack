# User Story: US40 — Card List

### Standard Persona Format

* **As a** user,

* **I want to** view, filter, and sort a list of all cards in my current deck,

* **So that** I can easily locate, organize, and open cards for editing.

### Detailed Feature & UX Behavior

* **View Context:**

  * Displays all cards belonging to the active deck context (`deckId`) retrieved directly from the Pinia store (`deckStore.ts`).

* **Card Item Display:**

  * Each card item renders all available sides (Side 1, Side 2, Side 3) in side-by-side layout columns.

  * Text content is truncated gracefully with ellipsis based on viewport width.

* **Tag Filter:**

  * A single-select tag filter component featuring an **"All Tags"** default option.

  * Selecting a specific tag filters the list to display only cards associated with that tag.

* **Side Sorting:**

  * Alphabetical sorting dropdown allowing users to sort cards by **Side 1**, **Side 2**, or **Side 3** (A–Z).

  * Sorting by a specific side brings cards with missing content for that side to the top/bottom predictably.

* **Quick Actions:**

  * Tapping a card item navigates directly to the Card Edit view (`/cards/edit/:id`).

  * A prominent primary `+` action button navigates directly to Card Creation (`/cards/new`).

### UI Design Mapping

* **Background:** `bg-app` (`#0B0F19`, `slate-950`).

* **List Item Card:** `bg-card` (`#1E293B`, `slate-800`), `rounded-xl`, `p-4` (`card-padding-sm`), `border border-slate-700/60`.

* **Filter Pills & Dropdowns:** `bg-surface-muted` (`#334155`, `slate-700`), `text-secondary` (`#94A3B8`, `slate-400`), active state `brand-primary` (`#6366F1`, `indigo-500`).

* **Text Formatting:** Primary side text `text-primary` (`#F8FAFC`, `slate-50`), supporting side text `text-secondary` (`#94A3B8`, `slate-400`).

### Acceptance Criteria (AC)

| ID | Test Scenario | Expected Outcome | 
| ----- | ----- | ----- | 
| **AC-01** | **List Display & Side Truncation** | Given the user opens the Card List view, when cards are rendered, each card displays its populated sides in side-by-side columns with long text truncated according to available viewport width. | 
| **AC-02** | **Single Tag Filtering** | Given the user selects a specific tag from the tag filter, then only cards associated with that tag are displayed. Selecting "All Tags" resets the filter to show all cards in the deck. | 
| **AC-03** | **Alphabetical Sorting by Side** | Given the user selects a side (Side 1, Side 2, or Side 3) in the sort control, then the card list sorts alphabetically (A–Z) based on the content of that side. | 
| **AC-04** | **Card Selection for Editing** | Given a user taps on any card in the list, then the app navigates to `/cards/edit/:id` for that specific card. | 
| **AC-05** | **Create Action** | Given a user taps the primary `+` action button, then the app navigates to `/cards/new` retaining the active deck context. | 

### Technical Guidance

* **Architectural Placement:**

  * **View:** `app/src/views/CardListView.vue` (handling local sorting, tag filtering, and routing).

  * **Models:** `Card.ts`, `Tag.ts`, `CardTag.ts` implementing the **Pure Active Record** pattern.

  * **Store / State:** `deckStore.ts` provides the active deck context; `cardStore.ts` manages card collection state.

* **Database Interaction:**

  * Queries `card` and `card_tag` tables via the Supabase client wrapped inside domain models, adhering to user RLS constraints.