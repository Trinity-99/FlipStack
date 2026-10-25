# US10 — Login Screen Software Design

## 1. Goal

Implement the US10 email-and-password login flow using the existing Vue, Pinia, Supabase, and Active Record architecture. This document defines the files, classes, and public methods to add or update. It is a design proposal only; no application code is changed as part of this story-design step.

## 2. Existing code and architectural constraints

- [Architecture.md](../Architecture.md) defines the layer flow: views call stores and models; only models access Supabase; there is no service or repository layer.
- [coding_guidelines.md](../coding_guidelines.md) specifies Vue Composition API, Pinia setup stores, strict TypeScript, and the existing `camelCase` model filenames.
- [profile.ts](../../app/src/models/profile.ts) already models the read-only `profile` table, maps its timestamps, and holds user deck preferences. It currently has no authentication or profile lookup method.
- [createDatabase.sql](../../database/createDatabase.sql) defines `profile.id` as a reference to `auth.users.id`. A database trigger creates the profile row when an auth user is created.
- [supabase.ts](../../app/src/db/supabase.ts) initializes the shared Supabase client. The browser client currently uses Supabase defaults; no custom auth storage is needed.
- [authStore does not exist yet](../../app/src/stores). Pinia is already registered in [main.ts](../../app/src/main.ts).
- [index.ts](../../app/src/router/index.ts) currently maps `/` to the test view and `/test` to the same view.
- [main.css](../../app/src/assets/main.css) already defines the `app`, `card`, `surface-muted`, `primary`, `secondary`, `accent-got-it`, `brand-primary`, and `radius-card` theme tokens. Use existing tokens and Tailwind utilities for the login screen; do not add duplicate design tokens.

## 3. Proposed file changes

| File | Change |
|---|---|
| `app/src/models/profile.ts` | Add the authentication result/error types and the static methods `authenticate()` and `findById()`. Keep all Supabase Auth and profile-table access inside this model. |
| `app/src/stores/authStore.ts` | Add the `useAuthStore` Pinia setup store to hold the authenticated `Profile` and current in-memory Supabase session. |
| `app/src/views/LoginView.vue` | Add the login form, client-side validation, loading/error/success states, and orchestration through `Profile` and `useAuthStore`. |
| `app/src/router/index.ts` | Make `LoginView` the `/` route. Retain `/test` for the existing test view. Do not add route guards or a post-login redirect in US10. |
| `app/src/__tests__/profile.spec.ts` | Test the model's authentication, profile lookup, and authentication error mapping. |
| `app/src/__tests__/authStore.spec.ts` | Test storing the authenticated profile/session and derived authentication state. |
| `app/src/__tests__/LoginView.spec.ts` | Test form rendering, validation, submit/loading behavior, error banners, and success state. |

No changes are proposed to `main.ts`, `supabase.ts`, or `main.css`: the app already installs Pinia and the existing theme tokens cover the specified colors and card radius.

## 4. Model design — `Profile` in `profile.ts`

`Profile` remains the read-only Active Record model for `public.profile`. It will also encapsulate the authentication operation, as required by US10; the view and store must not import or call the Supabase client.

### Types to add

- `AuthenticationFailureKind`: `'invalid-credentials' | 'network' | 'unexpected'`.
- `AuthenticationError extends Error`: exposes a readonly `kind` so the view can choose a user-facing message without parsing arbitrary backend error text.
- `AuthenticationResult`: contains `profile: Profile` and `session: Session` (the `Session` type from `@supabase/supabase-js`).

These types can live in `profile.ts`; a separate auth service or error module is not needed for this one flow.

### Static method signatures

```ts
public static async authenticate(
  email: string,
  password: string
): Promise<AuthenticationResult>

public static async findById(profileId: string): Promise<Profile | null>
```

### `Profile.authenticate()` behavior

1. Reject empty/whitespace email or empty password before making a network request. The view performs the full user-facing validation; the model guards its own public input boundary.
2. Call `supabase.auth.signInWithPassword({ email: email.trim(), password })`.
3. When Supabase returns an authentication error, translate a recognized invalid-credentials response (including the SDK's invalid-credentials code and applicable unauthorized status) to `AuthenticationError` with kind `invalid-credentials`. Do not depend only on HTTP 401: Supabase Auth may report invalid credentials using another status/code combination.
4. Translate recognized transport/fetch failures to `AuthenticationError` with kind `network`. Preserve or wrap other failures as kind `unexpected`; do not silently return a success-shaped fallback.
5. Require a non-null successful session and user, then load the associated profile using `Profile.findById(user.id)`. Throw a descriptive unexpected authentication error if no profile row is found.
6. Return `{ profile, session }`. Catch and log failures with context, then rethrow the mapped error. Do not log credentials, tokens, or raw session data.

`Profile.findById()` queries the `profile` table by its `id`, parses a result with the existing `Profile.fromJSON()`, returns `null` for PostgREST's not-found code (`PGRST116`), and throws/logs other database errors according to existing model conventions.

### Session persistence

Use the session returned by `signInWithPassword()` for the current in-memory store state. Rely on the existing Supabase browser client's default session persistence and token refresh behavior. Do not add custom `localStorage` writes, token expiry logic, or a Pinia persistence plugin.

## 5. Store design — `authStore.ts`

Add a setup-style Pinia store:

```ts
export const useAuthStore = defineStore('auth', () => {
  // profile, session, isAuthenticated, and setAuthenticated(...)
})
```

State and API:

- `profile: Ref<Profile | null>` — the current user's database-backed profile.
- `session: Ref<Session | null>` — the current session in memory only.
- `isAuthenticated: ComputedRef<boolean>` — true when both profile and session are present.
- `setAuthenticated(profile: Profile, session: Session): void` — updates both state values after successful authentication.

The store must not make Supabase calls. Logout, auth-state subscriptions, and session rehydration/routing guards are not included in US10; they can be designed with the later global auth/routing story.

## 6. View design — `LoginView.vue`

Use `<script setup lang="ts">`; keep all form-only state local to the view:

- `email` and `password` refs.
- `isSubmitting` ref.
- `errorMessage` ref for a validation or authentication error.
- `successMessage` ref for the MVP success confirmation.
- `validateForm(): string | null` — returns the first required validation message, checking in this order: both fields present; valid email format; password length at least six characters.
- `async handleSubmit(): Promise<void>` — clears previous messages, validates before any request, sets/clears loading state in `try/finally`, calls `Profile.authenticate()`, calls `useAuthStore().setAuthenticated(...)` on success, and displays the temporary success confirmation. It maps the typed model error kinds to the exact US10 invalid-credentials/network messages; unexpected failures receive a generic, non-sensitive failure message.

Do not trim or otherwise transform the password. Use the trimmed email for submission. Prevent duplicate submissions while `isSubmitting` is true. The view must not navigate after successful login in this story.

### Markup and accessibility

- Use a semantic `<form>` with associated labels, email/password input types, and a submit `<button>`.
- Use appropriate `autocomplete` values (`email` and `current-password`).
- Keep the primary button full-width; disable it during submission and show an inline spinner with an accessible loading label.
- Render validation and server errors in an accessible status/alert region above the fields; render success as a separate success status.
- Apply the specified responsive centered card design using existing theme utilities: `bg-app`, `bg-card`, `border-2 border-slate-600`, `rounded-card`, `p-6`, `shadow-2xl`, `bg-surface-muted`, `text-primary`, `text-secondary`, and `bg-brand-primary`. Use the specified rose classes for errors and the existing `accent-got-it` token for success. Verify focus-ring contrast against the stated WCAG AA target.

## 7. Routing

In `router/index.ts`, replace the `/` route's component with a lazy import of `LoginView` and use a `Login` route name, following the coding guideline that views are lazy-loaded. Keep `/test` mapped to `TestView` to retain the existing development screen. Adding a guard or redirect would contradict the US10 success-state stub.

## 8. Test plan

- **Profile model:** successful sign-in returns the parsed profile and session; invalid credentials map to `invalid-credentials`; transport failure maps to `network`; missing profile and unexpected Supabase failures reject; input guards avoid the auth request.
- **Auth store:** initially unauthenticated; `setAuthenticated()` stores the exact profile/session and updates `isAuthenticated`.
- **Login view:** renders email, password, and Sign In controls; each client-side validation case does not call `Profile.authenticate()`; valid submission calls it once; button is disabled while pending; typed auth failures render the exact specified messages/styles; successful submission updates the store and displays the success confirmation without routing.
- Run the focused unit tests and TypeScript type-check after implementation.

## 9. Acceptance-criteria coverage

| Criterion | Design coverage |
|---|---|
| AC1 | `LoginView.vue` responsive semantic form and existing theme utilities. |
| AC2 | `validateForm()` runs before `Profile.authenticate()`. |
| AC3 | `Profile.authenticate()` owns Supabase sign-in; Supabase manages session persistence; returned profile/session are stored in Pinia. |
| AC4 | Model classifies transport failures; view displays the exact network message and rose status styles. |
| AC5 | Model maps invalid credentials to a stable error kind; view displays the exact invalid-credentials message and rose status styles. |
| AC6 | On success, the view stores the profile/session in `useAuthStore` and shows the temporary confirmation without navigation. |

## 10. Scope boundaries and review notes

- No sign-up, password reset, logout, route protection, automatic redirect, auth-state listener, or session restoration on page reload.
- No changes to database schema, Supabase client configuration, or profile persistence behavior.
- Supabase invalid-credential failures must be identified by the SDK's stable error code/status information rather than assuming every invalid login is literally HTTP 401.
