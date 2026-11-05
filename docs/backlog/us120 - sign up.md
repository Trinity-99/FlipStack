# US120 - Sign Up

**User story**
As a new user, I want to sign up with my email and a password, so that I get my own private account.

## Behavior
- The login screen gets a link "No account yet? Sign up". The sign-up screen has a link "Back to login".
- The sign-up screen has an email field, a password field with a show/hide toggle, and a Sign up button. There is no "repeat password" field.
- Password rules: at least 8 characters, using at least 2 of 3 types: letters, numbers, special characters. These rules are checked in the app only, as the server enforces only the minimum length. The rules are shown on the screen, and an invalid password shows a clear message.
- After submitting, the user sees "Check your email to confirm your address". Email confirmation is required before the first login.
- The link in the confirmation email opens the app on the login screen with the message "Email confirmed, please log in".
- Signing in with Google or other providers is out of scope and will follow later.

## Acceptance criteria
- An invalid email or a password breaking the rules is rejected with a clear message, and no account is created.
- A valid sign-up sends the confirmation email, and login before confirming does not work.
- After clicking the confirmation link, the user can log in, and a new user starts with an empty app (no decks, no cards).
- The server minimum password length is set to 8.
- The new screen follows the layout of US100 and works on phone, tablet and desktop.
