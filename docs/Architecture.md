# FlipStack — Architecture

## 1 Purpose and Scope

This document describes the architecture of FlipStack: the layers, the technology and the central data model.

- What the product does is defined in the **Product Specification**.
- How code is written is defined in the **Coding Guidelines**.

## 2 Overview

FlipStack is a cloud-first, mobile-first Progressive Web App. All application logic runs in the client. Supabase provides authentication and the database. A local database (IndexedDB) holds a mirror of the user's data, so learning works offline.

```
+--------------------------------------------------+
| Views                  screens and UI components |
+------------------------+-------------------------+
| Stores (Pinia)         | Study Engine            |
| application state      | study logic, no UI      |
+------------------------+-------------------------+
| Domain Models (Active Record)                    |
| domain logic and persistence                     |
+--------------------------------------------------+
| Data Router                                      |
| decides which source serves which data           |
+------------------------+-------------------------+
| Remote Source          | Local Source            |
| Supabase               | IndexedDB               |
+------------------------+-------------------------+
```

**Rules**

- Views and stores may use the study engine and the models directly.
- The study engine uses the models.
- Models never call upward.
- Only the models access data, and only through the data router. Only the router uses the sources.

## 3 Technology Stack

| Area | Technology |
|---|---|
| Frontend framework | Vue.js 3 with TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Routing | Vue Router |
| State | Pinia |
| App type | Progressive Web App (installable on iOS and Android) |
| Backend | Supabase: Auth, PostgreSQL, Row-Level Security |
| Backend access | `@supabase/supabase-js` |
| Offline learning | Local database (IndexedDB) via Dexie |

## 4 Pattern: Pure Active Record

- Each domain model contains its properties, its domain behavior and its own persistence (save, delete, queries).
- There is no separate service or repository layer.
- Models accept and return domain objects, not raw JSON.
- Only the models access data, and only through the data router (4.1).
- The Supabase client is initialized in one place and contains no data logic.

The detailed rules for models are in the Coding Guidelines.

### 4.1 Data Layer

The data layer has three parts with one job each:

- **Remote source:** the only code that talks to Supabase. It knows nothing about IndexedDB.
- **Local source:** the only code that talks to IndexedDB. It knows nothing about Supabase.
- **Data router:** the only thing the models talk to. It decides, per kind of data, which source to use and in what order.

Nothing above the router knows where data lives. Only three things cross it: the sync status, a defined error when content cannot be saved offline, and a loading state while the active deck is not yet available.

### 4.2 Storage Policy

| Data | Read | Write |
|---|---|---|
| Content (decks, cards, tags, directions) | Local source | Remote source first, then local source. Requires a connection. |
| Progress (`card_progress`) | Local source | Local source first, sent to the remote source in the background |

### 4.3 Sync

The router keeps the local mirror aligned with Supabase.

- Content is pulled from Supabase only at app start. The active deck is loaded completely before any view is shown; the other decks follow in the background.
- A sync that fails or takes too long counts as offline for that session and is retried at the next start.
- A deck replaces its local copy completely or not at all.
- When the connection returns, only unsent progress is sent.
- Progress is compared by update time; the newer update wins.

## 5 Data Model

| Entity | Purpose |
|---|---|
| `profile` | The user; one per authenticated user |
| `deck` | A study deck with 2 or 3 side labels |
| `card` | A study card with up to three sides |
| `tag` | A learning topic within a deck |
| `card_tag` | Links cards and tags (many to many) |
| `direction` | A saved study direction of a deck |
| `card_progress` | Known counter per card and direction |

**Relationships:** a user has decks. A deck has cards, tags and directions. Cards and tags are many to many. Progress belongs to a card and a saved direction.

**Ownership:** all data belongs to one user. There is no sharing between users.

The schema is defined in `createDatabase.sql`; the models mirror it.

## 6 Security

- **Authorization:** Row-Level Security is enabled on every table, and users can only access their own data.
- **Client:** the app holds only the public Supabase URL and anon key. Security rests on the row-level policies.

## 7 Project Structure

```
app/src/
├── db/        Supabase client initialization only
├── models/    Active Record domain models
├── router/    Vue Router setup
├── views/     Pages
├── App.vue
└── main.ts
```

## 8 Security Controls

Chapter 6 defines authorization and the client key. This chapter defines the controls that follow from it. The client is untrusted: the database enforces every rule that protects data, and the app adds a second line of defense.

### 8.1 Database

All controls below are defined in `createDatabase.sql`.

**Row-Level Security**

- Every table has policies for select, insert, update and delete.
- Every policy binds rows to `auth.uid()`, using `USING` for reads and `WITH CHECK` for writes.
- Tables that reference other tables (`card`, `card_tag`, `direction`, `card_progress`) check that the referenced row belongs to the same user. A user cannot attach data to another user's deck or card.

**Constraints**

- `card_progress.counter` is between 0 and 10.
- `direction` holds a valid ordered list: sides 1 to 3 without duplicates, exactly one question first, at least one answer.
- `card` sides are a jsonb object with only the keys `s1`, `s2`, `s3`, each a string.
- `deck` has 2 or 3 side labels.
- Text fields have maximum lengths.

**Limits**

- A maximum size per card.
- A maximum number of rows per user and table, enforced by trigger.

**Data lifecycle**

- Every user-owned table references the user with `ON DELETE CASCADE`. Deleting a user removes all of their data.

### 8.2 App Code

**Rendering**

- Card, deck and tag content is rendered as plain text only.
- `v-html` and `innerHTML` are not used for user content.

**Offline data**

- The local database (IndexedDB) belongs to one user. It is cleared on logout and when a different user signs in. An expired session does not clear it.
- Local data reaches Supabase only through the data router and the authenticated Supabase client, so Row-Level Security always applies. 

**Service worker**

- The service worker caches static app assets only.
- It never caches API responses or authentication tokens.

**External data**

- Any externally supplied data (imported files, for example) is untrusted. The models validate its structure and size before saving.
- Values written to CSV are neutralized against formula injection.

## 9 Query Safety

The app never sends SQL. All data access goes through `supabase-js`, which sends parameterized requests. This protection holds only as long as user input is passed as a value and never becomes part of a query string.

### 9.1 App Code

- User input reaches the database only as a parameter of a builder method (`.eq()`, `.in()`, `.insert()`, `.update()` and similar).
- User input is never concatenated into a string that the client library interprets, such as the arguments of `.or()`, `.filter()` or `.not()`. Where a dynamic filter is unavoidable, the data layer builds it from validated values only.
- Column names for sorting and filtering come from a fixed list in the data layer, never from user input.
- Only the remote source builds queries (see 4.1), so these rules apply in one place.

### 9.2 Database

- Database functions and triggers do not build SQL by string concatenation. Dynamic SQL uses `format()` with `%I` for identifiers and `%L` for literals, or `USING` for values.
- `SECURITY DEFINER` functions are avoided because they bypass Row-Level Security. If one is required, it sets a fixed `search_path`.
- A `SECURITY DEFINER` function that clients can call (RPC) also checks `auth.uid()` itself.
- A trigger function works only on the row that fired it (`NEW`) and does not use `auth.uid()`, because triggers such as the sign-up trigger run outside a user request.

### 9.3 Scripts Outside the App

- Scripts that write to the database (such as the one-time import) use parameterized statements. SQL is never assembled from input lines.