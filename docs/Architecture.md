# FlipStack — Architecture

## 1 Purpose and Scope

This document describes the architecture of FlipStack: the layers, the technology and the central data model.

- What the product does is defined in the **Product Specification**.
- How code is written is defined in the **Coding Guidelines**.

## 2 Overview

FlipStack is a cloud-first, mobile-first Progressive Web App. All application logic runs in the client. Supabase provides authentication and the database. A local database (IndexedDB) is used for offline learning.

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
| Supabase                                         |
| Auth, PostgreSQL + Row-Level Security            |
+--------------------------------------------------+
```

**Rules**

- Views and stores may use the study engine and the models directly.
- The study engine uses the models.
- Models never call upward.
- Only the models access data.

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
| Offline learning | Local database (IndexedDB) |

## 4 Pattern: Pure Active Record

- Each domain model contains its properties, its domain behavior and its own persistence (save, delete, queries).
- There is no separate service or repository layer.
- Models accept and return domain objects, not raw JSON.
- Only the models access data. Today they call Supabase directly; later they go through a data-source factory, which alone knows whether the data comes from Supabase or the local database.
- The Supabase client is initialized in one place and contains no data logic.

The detailed rules for models are in the Coding Guidelines.

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
