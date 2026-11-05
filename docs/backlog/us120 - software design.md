# US120 - Software Design

## 1. Confirmed technical decisions

- Count password length in Unicode code points. Count Unicode letters, Unicode numbers, and all other characters as the three categories; at least two categories must be present.
- The confirmation callback must not leave the user signed in. After confirming the callback session, clear it locally and return to Login with a one-time confirmation message.
- Supabase Auth project settings are maintained outside this repository; no specification or database schema changes are part of this design.

## 2. Existing behavior and architecture

- `RemoteSource` is the Supabase boundary; `DataRouter` proxies auth operations; `Profile` is the model-facing auth API.
- `Profile.authenticate()` prepares the local mirror and loads the database-created profile. The existing `handle_new_user` trigger creates that profile; a new account has no decks or cards and follows the existing empty-deck onboarding.
- The Login route is public, while the global router guard restores an existing session before most navigation. Email confirmation therefore needs a public callback route that skips session restoration until it has consumed the callback.
- Login already provides the centered, responsive auth-card pattern. Keep signup single-column and aligned with that pattern; no changes to `docs/UI Design.md` are required.

## 3. File and method changes

| File / class | Technical changes |
|---|---|
| `app/src/data/remoteSource.ts` — `RemoteSource` | Add `signUp(credentials, emailRedirectTo): Promise<void>` using `supabase.auth.signUp`; classify and log failures through the existing authentication error pattern. Add `completeEmailConfirmation(): Promise<void>` to consume the callback session, require a confirmed email, then clear the local session. Throw on invalid or incomplete callbacks. |
| `app/src/data/dataRouter.ts` — `DataRouter` | Add typed proxies for `signUp()` and `completeEmailConfirmation()` to `RemoteSource`, matching the existing auth-operation boundary. |
| `app/src/models/profile.ts` — `Profile` | Add static `signUp(email, password, emailRedirectTo): Promise<void>` with input checks and contextual error logging. Add static `completeEmailConfirmation(): Promise<void>` to delegate callback processing through `DataRouter`. Signup must not set auth-store state or prepare a local user mirror. |
| `app/src/router/index.ts` — route table and startup guard | Add lazy public routes named `SignUp` (`/signup`) and `EmailConfirmation` (`/auth/confirm`). Skip session restoration for the callback route so callback processing cannot be mistaken for an ordinary signed-in startup. Keep protected-route behavior unchanged. |
| `app/src/views/SignUpView.vue` — new `SignUpView` | Add email/password form, accessible show/hide password control, visible password criteria, `validateForm(): string \| null`, category validation, and `handleSubmit(): Promise<void>`. Construct the callback URL from the app base URL. On success, replace the form with the check-email status; show validation and request failures without exposing raw backend errors. Provide a Back to login link. |
| `app/src/views/EmailConfirmationView.vue` — new `EmailConfirmationView` | On mount, call `Profile.completeEmailConfirmation()`. On success, replace the route with Login carrying a one-time confirmation query flag. On failure, show an explicit confirmation error and a link back to Login; do not authenticate the user or invoke startup data loading. |
| `app/src/views/LoginView.vue` — `LoginView` | Add the “No account yet? Sign up” route link. Read and display the one-time confirmation message from the callback query, then remove the query with `router.replace()` so it is not replayed after revisiting Login. Preserve current login validation for existing accounts. |

Use the callback route as `emailRedirectTo` for signup and add it to the Supabase Auth redirect allowlist. The app already creates an empty profile through the database trigger; no SQL migration or model for decks/cards is needed.

## 4. Tests

- Extend `remoteSource.spec.ts`, `dataRouter.spec.ts`, and `profile.spec.ts`: successful signup delegation, signup failures, valid confirmation callback clearing its session, and invalid/unconfirmed callback rejection.
- Add `SignUpView.spec.ts`: empty/invalid email, password length and category boundaries (including Unicode), no request for invalid input, show/hide toggle, pending/success/error states, and route links.
- Add callback-view/router tests: callback route bypasses session restoration; successful confirmation lands at Login with the message and no authenticated store state; invalid callback reports failure; protected routes remain guarded.
- Extend `LoginView.spec.ts`: signup link and one-time confirmation message; existing login validation and navigation behavior remain unchanged.
- Verify a confirmed new account reaches existing empty-deck onboarding after the user separately logs in.
