# FlipStack Project Coding Guidelines

This document establishes the official architectural, design, and coding standards for the FlipStack application. All developers and AI coding assistants must strictly adhere to these guidelines to ensure consistency, maintainability, and clean object-oriented architecture across the codebase.

---

## 1. Architectural Pattern: Pure Active Record

FlipStack follows a **Pure Active Record Pattern**. 

- **Self-Contained Domain Models:** Models represent both the domain logic and database operations. They encapsulate properties, domain behaviors, and direct persistence mechanisms via `@supabase/supabase-js`.
- **No Separate Service/Repository Layer:** Controllers, stores, and UI views interact directly with domain models (`await deck.save()`, `await Card.findById(id)`). There is no intermediary database service or repository layer for CRUD operations.

---

## 2. Domain Model Structure & Encapsulation

### File Location
All domain model classes reside under `app/src/models/` (e.g., `app/src/models/deck.ts`, `app/src/models/card.ts`).

### Immutability & Identifiers
- Database-managed identifiers (`id`, `userId`, `deckId`, etc.) are declared as `public readonly`.
  - **`public`**: Enables UI templates, router parameters, and component logic to inspect entity IDs without boilerplate getters.
  - **`readonly`**: Prevents accidental mutation or identity tampering post-instantiation.
- New/unsaved domain entities use `string | null` for their `id` property until persisted to the database.

### True Object-Oriented Methods
- Domain methods accept full **domain model instances** instead of raw JSON or primitive fields.
  - **Correct:** `direction.isCardEligible(card: Card)`
  - **Incorrect:** `direction.isCardEligible(cardContent: Record<string, string>)`
- Domain objects shield callers from internal structural details.

### Static Serialization & Factory Methods
Every model must implement a static `fromJSON` factory method:
- Accepts raw database JSON returned by Supabase queries.
- Parses dates (`created_at`, `updated_at`, `last_updated`) into JS `Date` instances.
- Instantiates and returns a strongly-typed model instance.
- Performs runtime validation and throws descriptive errors if required attributes are missing.

### Standardized Persistence Interface
Every domain model must implement the following lifecycle and static query methods:
- **`save(): Promise<void>`**  
  - Handles both **INSERT** (when `id === null`) and **UPDATE** (when `id` exists).
  - Mutates the instance upon insertion using `Object.assign(this, { id, createdAt, updatedAt })`.
  - Handles relational child syncs (e.g., `card_tag` junction table updates) within the same invocation.
- **`delete(): Promise<void>`**  
  - Removes the entity from the database. Throws if the instance has no assigned `id`.
- **`static findById(id: string): Promise<Model | null>`**  
  - Fetches a single record. Handles PostgreSQL code `PGRST116` (not found) gracefully by returning `null`.
- **`static findAllFor[Parent](parentId: string): Promise<Model[]>`**  
  - Fetches collections associated with parent entities (e.g., `findAllForUser(userId)`, `findAllForDeck(deckId)`). Returns an empty array `[]` if no matching records exist.

---

## 3. Documentation & Type Safety Standards

### JSDoc Annotation Format
All classes, constructor parameters, public methods, and static methods must be documented using standardized JSDoc blocks:

```typescript
/**
 * @summary Brief summary of the class or method purpose.
 * @param {string} parameterName - Description of the parameter.
 * @returns {Promise<Card | null>} Description of the return value.
 * @throws {Error} Description of conditions under which errors are thrown.
 */
```

### Explicit Typing
- Implicit `any` is strictly prohibited.
- All method parameters and return types must be explicitly typed (e.g., `Promise<Deck[]>`, `Promise<Direction | null>`, `void`).
- Database side fields and roles are explicitly typed using TypeScript unions (e.g., `export type SideRole = 'question' | 'answer' | 'extra';`).

### Defensive Validation & Error Handling
- Validate all incoming parameters and required fields before issuing Supabase network requests.
- Throw explicit, descriptive `Error` instances if invariants are violated (e.g., missing required properties on `save()`).
- Wrap external Supabase calls in `try...catch` blocks and log context-rich errors via `console.error`.

---

## 4. Database & SQL Conventions

### Naming Conventions
- **Table Names:** Lowercase singular nouns (`profile`, `deck`, `card`, `direction`, `tag`, `card_tag`, `card_progress`).
- **Column Names:** Lowercase snake_case (`user_id`, `deck_id`, `created_at`, `updated_at`, `last_updated`).

### Identifiers
- Primary keys must use UUID v4 auto-generation (`id uuid PRIMARY KEY DEFAULT uuid_generate_v4()`).
- Auto-incrementing integer IDs are prohibited to ensure PWA offline creation compatibility and avoid enumeration attacks.

### Row Level Security (RLS)
- RLS must be enabled on all database tables (`ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;`).
- RLS policies must strictly verify user ownership using `auth.uid()` (e.g., `user_id = auth.uid()` or via parent deck ownership checks).

### Automated Triggers
- Tables with timestamp tracking must feature an `UPDATE` trigger that automatically sets `updated_at = NOW()`.
- An `auth.users` trigger (`on_auth_user_created`) automatically populates the `profile` table upon user registration.

---

## 5. Directory Structure & Supabase Client

```
app/
├── src/
│   ├── db/
│   │   └── supabase.ts      # Pure Supabase client initialization
│   ├── models/              # Active Record Domain Models
│   │   ├── card.ts
│   │   ├── cardProgress.ts
│   │   ├── deck.ts
│   │   ├── direction.ts
│   │   ├── profile.ts
│   │   └── tag.ts
│   ├── router/
│   │   └── index.ts         # Vue Router setup
│   ├── views/               # Page/View components
│   │   └── Test.vue         # Database smoke test & verification route
│   ├── App.vue              # Main Vue application root
│   └── main.ts              # Application entry point
```

### Supabase Client Setup
- `app/src/db/supabase.ts` is strictly responsible for initializing and exporting the `supabase` client instance using environment variables:
  - `import.meta.env.VITE_SUPABASE_URL`
  - `import.meta.env.VITE_SUPABASE_ANON_KEY`
- No data fetching logic, service layer code, or state management may be placed inside `app/src/db/`.