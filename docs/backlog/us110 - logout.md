# US110 - Logout

**User story**
As a user, I want to log out, so that someone else can use the app on this device with their own account.

## Behavior
- A logout icon sits at the top right of the header, after the existing icons.
- On tap, if there are unsynced counter changes, a dialog asks "Log out?" and warns that those changes are not yet saved online and will be lost if a different user logs in on this device before they sync. The user can choose Cancel or Log out.
- If nothing is unsynced, the user is logged out right away, without a dialog.
- After logout the login screen is shown.
- Logout does not clear the local data. The existing rule applies: the same user logging in again keeps the data and it syncs, and a different user starts clean (local data cleared first).
- Logout also works offline.

## Acceptance criteria
- Same user logs out and in again: all local data is still there, and unsynced counters sync.
- A different user logs in: no deck, card, tag or counter of the previous user is visible, and the local data is cleared before the new user's data loads.
- After logout, no app screen is reachable, including via the browser back button.
- The icon's tap target is the same size as the other header icons.
