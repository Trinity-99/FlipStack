# US110 - Software Design

## 1. Confirmed decisions

- Sign out this device only. Clear its local Supabase session and show login even when the network is unavailable; remote session revocation is best-effort and must not block local logout.
- Show the confirmation whenever any local sync work is pending: progress counters, profile settings, or deck preferences. The warning text therefore refers to unsynced changes generally, not counters alone.
- Keep the existing immersive study header behavior. The logout action is in the shared header wherever that header is shown.
- Do not clear IndexedDB on logout. Existing `DataRouter.restoreUser(userId)` remains responsible for clearing local data when a different user signs in.

## 2. Existing behavior and architecture

- `AppLayout.vue` owns the shared header and already contains 44px header actions. `SyncStatusDot.vue` exposes the `DataRouter` sync status through `useSyncStatusStore`; `status.pending` covers progress and settings.
- `Profile` handles sign-in and session restoration through `DataRouter`; `RemoteSource` is the only layer that calls Supabase. There is no logout method yet.
- The router's global guard redirects unauthenticated users away from protected application routes. `LoginView.vue` handles post-login navigation.
- `LocalSource.hasPendingChanges()` already checks pending progress, profile settings, and deck preferences. `DataRouter.restoreUser()` already clears the local mirror before preparing a different user's data.

## 3. File and method changes

| File / class | Technical changes |
|---|---|
| `app/src/data/remoteSource.ts` — `RemoteSource` | Add `signOut(): Promise<{ remoteRevocationPending: boolean }>` using Supabase `auth.signOut({ scope: 'local' })`. If remote revocation fails but the local session is confirmed removed, return a pending-revocation result; throw if local sign-out did not complete. Do not expose tokens or raw auth data. |
| `app/src/data/dataRouter.ts` — `DataRouter` | Add `signOut(): Promise<{ remoteRevocationPending: boolean }>` as the auth-operation proxy to `RemoteSource`, matching the existing `signInWithPassword()` and `getSession()` boundary. Keep IndexedDB intact. |
| `app/src/models/profile.ts` — `Profile` | Add static `signOut(): Promise<{ remoteRevocationPending: boolean }>` to invoke the router operation, log failures with context, and rethrow failures that mean the local session was not cleared. |
| `app/src/stores/authStore.ts` — `useAuthStore` | Add `logout(): Promise<void>`, a `logoutWarning: Ref<string \| null>`, and a private `clearAuthentication(): void` helper. `logout()` calls `Profile.signOut()`, clears `profile`/`session` only after local sign-out succeeds, and keeps `hasRestoredAuthentication` true so the router recognizes the known signed-out state instead of restoring the session. Set `logoutWarning` if remote revocation could not be confirmed; clear it on a later successful sign-in. Do not clear local data. |
| `app/src/layouts/AppLayout.vue` — `AppLayout` | Add a right-aligned semantic logout button after the current header actions, with the same 44px target and focus treatment. Add local dialog/loading/error state and `requestLogout(): void`, `confirmLogout(): Promise<void>`, and `cancelLogout(): void`. Use `useSyncStatusStore().status.pending` to decide whether to show the warning. If no pending work exists, proceed immediately. On confirmation, call `authStore.logout()` and `router.replace({ name: 'Login' })`. Show an explicit recoverable error if local sign-out fails. |
| `app/src/views/LoginView.vue` — `LoginView` | Display `authStore.logoutWarning` as a non-blocking status message, without changing login validation or authentication behavior. |
| `app/src/router/index.ts` — startup guard | Retain and verify the existing protected-route redirect. No new guard method is required unless tests reveal that back navigation can bypass the existing unauthenticated redirect. |

Use the existing confirmation-dialog styling and interaction pattern in `StudyInitView.vue`; keep the logout-specific dialog in `AppLayout.vue` rather than adding a one-use component. The dialog offers Cancel and Log out, and describes possible loss of unsynced changes if another user signs in before they sync.

## 4. Tests

- `app/src/__tests__/dataRouter.spec.ts` and `remoteSource.spec.ts` (add the latter if absent): verify local-scope sign-out, offline revocation failure handling, and explicit failure when local session removal fails.
- `app/src/__tests__/profile.spec.ts`: verify `Profile.signOut()` delegates through `DataRouter` and propagates local sign-out failures.
- `app/src/__tests__/authStore.spec.ts`: verify logout clears profile/session and marks authentication restoration complete, including the remote-revocation-pending result.
- `app/src/__tests__/AppLayout.spec.ts`: verify the icon target, immediate logout without pending changes, warning/cancel/confirm flow with pending changes, logout error feedback, and navigation to Login.
- `app/src/__tests__/LoginView.spec.ts`: verify the remote-revocation warning is announced without breaking existing login states.
- `app/src/__tests__/router.spec.ts`: verify direct and browser-back attempts to protected routes after logout resolve to Login.
- Verify logout preserves the current user's local rows; signing in as the same user retains and syncs them, while signing in as a different user clears them before that user's data is loaded.
