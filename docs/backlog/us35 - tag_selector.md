# US35 - tag_creation

## 1. Problem Statement
The current pill-list presentation for deck tags consumes excessive vertical screen real estate in the Card Edit/Create view (`/cards/new` or `/cards/:id/edit`), especially when a deck contains 10+ tags. On mobile screens, this pushes card side textareas below the fold and creates unnecessary visual clutter.

---
## 2. the User Story
as a user I want a more compact view of the tags and I want to be able to create new tags. SO I can actually use them.

## 2. Proposed Solution: **Compact Pill Dropdown with Inline Tag Creation**

Instead of rendering all available tag pills simultaneously in the main layout, we replace the static pill grid with an **Expandable Compact Tag Selector Control** .

### Core Design Principles
* **Default Collapsed State:** Takes up minimal vertical height (`~40px`) regardless of total deck tags.
* **Progressive Disclosure:** Tapping the control expands a lightweight popover sheet or smooth inline accordion revealing all available tags for selection.
* **Inline Creation Action:** Includes a direct `+ New Tag` CTA inside the selector to seamlessly create deck-level tags on the fly without breaking card entry flow.

---

## 3. Detailed Interface & Interaction States

### A. Collapsed / Resting State (Closed Control)
* **Visual Presentation:** A single input-height bar (`h-11`, `bg-surface-muted`, `border-slate-700`, `rounded-xl`).
* **Selected Tags Summary:**
  * Displays active tags as small removable pills inside the control (e.g., `[Grammar] [Nouns]`).
  * If no tags are selected: Displays placeholder `Select or create tags...` (`text-slate-400`).
* **Trailing Actions:**
  * Quick `+` button triggering the inline tag creation input.
  * Chevron icon (`▼`) triggering view of all tags.

---

### B. Expanded State (Dropdown / Sheet Modal)
When tapped, an interactive container pops up (or expands inline):

**Selected & Available Tag List:**
   * Active tags highlighted at the top.
   * Unselected tags rendered as compact touch-friendly chips/rows below.
   * Smooth scrollable container maxing out at `~200px` height.

---

### C. Inline Tag Creation Workflow (Within Card Form)

1. User taps **`+`** inside the tag control.
2. An inline text input opens seamlessly inside the popover (e.g., input placeholder: *"Tag name..."* with color picker dot).
3. Tapping **"Add Tag"** (or pressing Enter):
   * Instantiates and saves the new `Tag` model linked to the current `deckId` via Supabase.
   * Automatically checks/selects the new tag for the current card being created.
   * Appends the tag to the active `deckStore` list for future reuse across the deck.
4. Input resets while keeping the user directly inside the card creation flow.

---

## 4. Visual UI Spec (Tailwind & Geometry)

```
+-------------------------------------------------------------+
| TAGS                                                        |
| +---------------------------------------------------------+ |
| | [Grammar] [Verbs] ...                     [ + ] [▼] | |
| +---------------------------------------------------------+ |
+-------------------------------------------------------------+
                               │ (Tapping opens sheet)
                               ▼
+-------------------------------------------------------------+
| ✚ Create new tag "Phonetics"                               |
+-------------------------------------------------------------+
| SELECT TAGS FOR THIS DECK                                   |
|  [Grammar]   [Verbs]    [Nouns]    [JLPT N5]        |
|  [Idioms]    [Slang]    [Formal]   [Travel]         |
+-------------------------------------------------------------+
```

### Component Structure (`app/src/components/cards/TagSelector.vue`)

* **Collapsed Trigger:** `bg-slate-700/60`, `border-slate-600`, `rounded-xl`, `px-3.5 py-2 flex items-center justify-between`.
* **Tag Chips (Active):** `bg-indigo-600/30`, `text-indigo-200`, `border border-indigo-500/40`, `text-xs px-2 py-0.5 rounded-md`.
* **Popover Container:** `bg-slate-800`, `border border-slate-700`, `shadow-2xl`, `rounded-2xl`, `p-3`, `max-h-60 overflow-y-auto`.
* **Inline Create Row:** `bg-indigo-950/50`, `border-indigo-800/60`, `text-indigo-300 hover:bg-indigo-900/60`, `rounded-xl p-2.5 text-xs flex items-center gap-2 cursor-pointer`.

---

## 5. Key Benefits & UX Gains
* **Zero Layout Bloat:** Keeps the Card Create view compact regardless of whether a deck has 2 or 50 tags.
* **Context Preservation:** Users can add a missing topic classification standard mid-card-creation without navigating to deck settings.
* **Touch-Friendly:** Designed specifically for thumb reach and fast selection on mobile viewports.