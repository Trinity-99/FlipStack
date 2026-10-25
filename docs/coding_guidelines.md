# FlipStack — Coding Guidelines

These guidelines define how code is written in FlipStack. The structure of the system is described in the Architecture document.

## 1 General

- **Formatting:** Prettier with no semicolons, single quotes and 2-space indentation.
- **Linting:** ESLint with the recommended Vue and TypeScript rules.
- Formatting and linting run automatically and must pass without errors.
- TypeScript runs in `strict` mode.
- Imports from `src` use the `@/` alias.
- **Naming:**
  - Classes, types, interfaces and Vue components: `PascalCase`
  - Variables, functions and methods: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - TypeScript files: `camelCase` (e.g. `cardProgress.ts`)
  - Vue component files: `PascalCase` (e.g. `DeckList.vue`)

## 2 TypeScript

- `any` is not allowed, explicit or implicit. Use `unknown` and narrow it (e.g. in `catch`), and typed interfaces for external data such as database rows.
- All parameters and return types are explicitly typed (e.g. `Promise<Deck[]>`, `void`).
- Fixed sets of values are union types, e.g. `export type SideRole = 'question' | 'answer' | 'extra'`.
- Use `const` by default; `let` only when a value is reassigned; never `var`.
- Use `readonly` for values that must not change after creation.
- **JSDoc:** every class, constructor parameter, public method and static method has a JSDoc block:

```typescript
/**
 * @summary Brief summary of the class or method purpose.
 * @param {string} parameterName - Description of the parameter.
 * @returns {Promise<Card | null>} Description of the return value.
 * @throws {Error} Conditions under which an error is thrown.
 */
```

## 3 Vue.js

- Use the Composition API with `<script setup lang="ts">`. No Options API.
- Props and emits are typed: `defineProps<{ ... }>()` and `defineEmits<{ ... }>()`.
- Components are small and have one responsibility. Reusable logic goes into composables named `useXyz`.
- State shared between components lives in Pinia stores, written in setup syntax (`defineStore('name', () => { ... })`). State used by one component stays in that component (`ref`, `reactive`).
- Derived values use `computed`; they are never stored as separate state.
- `v-for` always has a stable `:key`. Never combine `v-if` and `v-for` on the same element.
- Views are lazy-loaded in the router.
- Style with Tailwind utility classes in the template. Custom CSS only when utilities are not enough, then in `<style scoped>`.
- Use semantic HTML for interaction (e.g. `<button>`, not a clickable `<div>`).

**Styling**

- Style with Tailwind utility classes in the template. 
- Custom theme tokens (colors, radii, spacing) must be defined in `src/assets/main.css` within the `@theme` block, following the Tailwind v4 CSS-first configuration standard.
- Custom CSS is allowed only when utility classes are insufficient, and must be placed in `<style scoped>` blocks.


### Reusable UI Components

- **BottomNavigation** (`src/components/BottomNavigation.vue`): Core bottom navigation for study and card-list screens.
- **DeckSwitcher** (`src/components/DeckSwitcher.vue`): Displays and switches the active deck in the app header.
- **FeedbackBanner** (`src/components/FeedbackBanner.vue`): Fixed, animated success/error feedback that stays visible while scrolling.
- **TagSelector** (`src/components/TagSelector.vue`): Selects tags available in the active deck.

## 4 Data Layer

**Models**

- Domain models live in `src/models/`, one file per model, named after the class in `camelCase`.
- Database-managed identifiers (`id`, `userId`, `deckId`, ...) are `public readonly`. An unsaved entity has `id: string | null`.
- Domain methods take domain objects, not raw JSON or primitives: `isCardEligible(card: Card, direction: Direction)`, not `isCardEligible(content: Record<string, string>)`.
- A model contains logic about itself only. Logic across several models belongs in the study engine.

**Required methods**

- `static fromJSON(row)`: takes the typed database row, parses dates into `Date`, validates required attributes and throws a descriptive error if one is missing. Returns a typed instance.
- `save(): Promise<void>`: INSERT when `id === null`, otherwise UPDATE. After an insert it assigns `id`, `createdAt` and `updatedAt` with `Object.assign(this, { ... })`. Related child records (e.g. `card_tag`) are synced in the same call.
- `delete(): Promise<void>`: throws if the instance has no `id`.
- `static findById(id): Promise<Model | null>`: returns `null` when not found (PostgreSQL code `PGRST116`).
- `static findAllFor<Parent>(parentId): Promise<Model[]>`: returns `[]` when nothing matches (e.g. `findAllForUser`, `findAllForDeck`).
- Models that the database creates itself (e.g. `Profile`) are read-only and implement `fromJSON` only.

**Validation and errors**

- Validate parameters and required fields before any network request.
- Throw descriptive `Error` instances when an invariant is violated.
- Wrap Supabase calls in `try...catch`, log with context via `console.error`, and rethrow.

## 5 Database / SQL

- **Tables:** lowercase singular nouns (`deck`, `card_progress`).
- **Columns:** lowercase `snake_case` (`user_id`, `created_at`).
- **Primary keys:** UUID v4, generated by the database. No auto-increment integers.
- **Row-Level Security** is enabled on every table. Policies check ownership with `auth.uid()`, directly via `user_id` or through the parent record.
- Tables with an `updated_at` column have a trigger that sets it automatically.