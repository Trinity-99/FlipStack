# US32 - Security Update

## Standard Persona Format

- **As a** user,
- **I want to** have my account and study data protected by consistent validation and access controls,
- **So that** malformed or unauthorized data cannot bypass the app or database security rules.

## 1. Goal and Review Summary

Bring the implemented application behavior in line with [Architecture.md](../Architecture.md), chapters 8 and 9. This story adds application-side validation as a second line of defense. The database remains the authorization boundary; client validation must never replace Row-Level Security (RLS) or database constraints.

The reviewed SQL already enables RLS on all eight public tables, checks ownership and referenced-record ownership in policies, limits text and JSON data, and uses fixed identifiers in database functions. The app uses the Supabase client through the domain models, with fixed table, column, and ordering identifiers; user-provided values are passed as builder values. No unsafe `.or()`, `.filter()`, or `.not()` query construction was found. User content is rendered without `v-html` or `innerHTML`.

The application-side implementation and tests in this story are complete:

1. Models validate database constraints before saving and reject malformed or oversized parsed records.
2. Card-tag query failures propagate instead of being presented as an untagged card.

The database changes for concurrency-safe row limits and signup-trigger failure handling have been applied. No dedicated tests for these rare boundary/failure cases are planned; the implementation is accepted as working as intended.

## 2. Findings and Required Behavior

### 2.1 Validate Models Before Persistence and Parsing

Validation is uneven across the current Active Record models. Some values are validated in `save()`, while other checks are left to PostgreSQL; several `fromJSON()` methods validate types but not the full constraints. The database remains authoritative, but model-level checks should reject invalid and oversized data before a request is sent, as required by Architecture §8.2.

Enforce and test these constraints in the relevant model:

| Model          | Required validation                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Deck`         | Keep the existing two-or-three-label and non-empty checks; reject labels longer than the database limit of 32 characters. Preserve the current 24-character app title limit unless the product requirement is separately changed; the database limit is 32.        |
| `Tag`          | Require a non-empty trimmed name of at most 32 characters and a non-empty required `deckId`.                                                                                                                                                                       |
| `Direction`    | Require 2–3 steps; valid integer side numbers 1–3 with no duplicates; exactly one `question` in the first position; at least one `answer`; and valid `role` values. Enforce the configured 200-byte serialized-configuration limit consistently with the database. |
| `Card`         | Accept only `s1`, `s2`, and `s3` string values, each at most 256 characters; require at least one non-empty side; and reject more than 10 tag IDs or duplicate tag IDs before syncing relations.                                                                   |
| `CardProgress` | Require a finite integer counter from 0 through 10 both when constructing/parsing the model and immediately before saving. The counter is mutable, so constructor-only validation is insufficient.                                                                 |

`fromJSON()` must reject malformed or oversized records rather than returning partially valid domain objects. Reuse the existing parsing helpers where appropriate; add shared validation utilities only for checks that genuinely have the same semantics across models. Keep error messages descriptive and ensure validation failures occur before any Supabase request.

### 2.2 Propagate Card-Tag Query Errors

`Card.fetchTagIdsForCard()` currently returns an empty list both when no relations exist and when the Supabase query fails. Change it to throw on query failure, matching the behavior of `Card.findAllForDeck()`. A failed relation lookup must not be presented as a successful card load with no tags.

### 2.3 Make Database Row Limits Concurrency-Safe

**Implemented in `database/createDatabase.sql` and applied to the database:** `check_row_limit()` takes a transaction-level advisory lock scoped to the table and owner/parent identifier before counting rows. This serializes concurrent inserts for the same quota scope. No dedicated concurrency test is planned because the limits are intentionally high and this edge case is expected to be rare.

### 2.4 Do Not Hide Profile-Creation Trigger Failure

**Implemented in `database/createDatabase.sql` and applied to the database:** `handle_new_user()` no longer catches profile-insert errors. A failed insert now propagates through the trigger and aborts the Auth-user insert rather than silently leaving an orphaned Auth user. No dedicated failure-injection test is planned because this condition is expected to be rare and the implementation is accepted as working as intended.

The updated Architecture §9.2 resolves the trigger identity requirement: this trigger operates only on `NEW` and does not use `auth.uid()`. Retain the fixed empty `search_path`, qualify referenced objects, and keep the function narrowly scoped to this trigger. Any future client-callable `SECURITY DEFINER` RPC must independently check `auth.uid()`.

## 3. Implemented Files and Tests

| File                                            | Change                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app/src/models/deck.ts`                        | Add the missing side-label length validation and complete parsing checks while preserving the current title limit.         |
| `app/src/models/tag.ts`                         | Validate name length and required fields before save; validate parsed tag data against the same limits.                    |
| `app/src/models/direction.ts`                   | Add full direction shape, role, order, duplicate-side, and size validation to save and parsing paths.                      |
| `app/src/models/card.ts`                        | Validate card content and tag-ID count/uniqueness before persistence and when parsing; propagate card-tag lookup failures. |
| `app/src/models/cardProgress.ts`                | Enforce finite integer counter bounds in constructor/parsing and immediately before persistence.                           |
| `app/src/models/modelUtils.ts`                  | Add narrowly scoped shared parsing/validation helpers only where they reduce duplicated, identical checks.                 |
| `app/src/__tests__/deck.spec.ts`                | Cover side-label and parsed-record limits, and verify invalid saves make no database request.                              |
| `app/src/__tests__/tag.spec.ts`                 | Cover trimmed name bounds, required fields, parsed records, and no request on invalid saves.                               |
| `app/src/__tests__/directionValidation.spec.ts` | Cover valid and invalid direction structures, size bounds, parsed records, and no request on invalid saves.                |
| `app/src/__tests__/card.spec.ts`                | Cover malformed/oversized content, tag count and duplicates, and propagation of tag lookup errors.                         |
| `app/src/__tests__/cardProgress.spec.ts`        | Cover non-finite, fractional, out-of-range, and mutated counters before save.                                              |

## 4. Acceptance Criteria

| ID    | Scenario                                                                              | Expected outcome                                                                                         |
| ----- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| AC-01 | Save a model with invalid, malformed, or oversized values                             | The model throws a descriptive error before issuing a database request.                                  |
| AC-02 | Parse malformed or oversized persisted/external data                                  | `fromJSON()` rejects it; no partially valid model is returned.                                           |
| AC-03 | Load a card when its card-tag query fails                                             | The load fails explicitly and is not treated as an untagged card.                                        |
| AC-04 | Read or write another user's rows or reference another user's deck/card/tag/direction | RLS rejects the operation for every applicable table and relationship.                                   |
| AC-05 | Use user-provided values in database queries                                          | Values remain builder parameters; table, column, and sort identifiers remain fixed model-defined values. |
| AC-06 | Display user-provided card, deck, or tag text                                         | Content is rendered as plain text, never interpreted as HTML.                                            |

## 5. Existing and Future Controls

- Keep all Supabase access inside models and preserve parameterized builder calls. No dynamic query-string filters or user-controlled column names are needed for this story.
- Preserve the existing database constraints and RLS policies as defense in depth. Never trust client-provided `userId` as authorization.
- The current app source has no IndexedDB implementation, service worker, import/export flow, CSV writer, or logout action. Do not add those unrelated features in US32. When those features are implemented, they must meet Architecture §8.2: clear local user data on logout, sync only through models and the authenticated client, cache static assets only, validate imported data before save, and neutralize CSV formulas.

## 6. Out of Scope

- Changing login or adding signup/logout UI.
- Implementing offline storage, service-worker caching, or import/export.
- Changing product field limits or user-facing designs beyond showing explicit validation and database quota failures.
- Replacing the Active Record model boundary or adding a service/repository layer.
