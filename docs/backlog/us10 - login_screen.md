# User Story: US-10 — User Authentication (Login Screen)

## 1. User Story
- **As a** registered user,
- **I want** to securely log into the application using my email and password,
- **So that** I can access my personal decks, cards, and learning progress.

---

## 2. Detailed Description & UI/UX Design

The Login Screen serves as the primary entry gate for unauthenticated users visiting the PWA.

### Visual & Layout Specifications:
- **Background:** Immersive full-screen background using token `bg-app` (`#0B0F19`).
- **Container Architecture:** Centered card container utilizing:
  - Background fill: `bg-card` (`#1E293B`)
  - Border stroke: `card-border` (`border-2 border-slate-600`)
  - Corner radius: `card-radius` (`rounded-3xl` / `24px`)
  - Internal padding: `card-padding` (`p-6` / `24px`)
  - Elevation shadow: `card-elevation` (`shadow-2xl`)
  - Viewport alignment: Target baseline iPhone 12 Mini (`375px × 812px`), responsive across mobile viewports.
- **Typography & Branding:**
  - App title/logo at the top of the card (`text-primary`, `#F8FAFC`).
  - Form fields for **Email** and **Password** using `bg-surface-muted` (`#334155`), with high-contrast text (`text-primary`, `#F8FAFC`), placeholder text (`text-secondary`, `#94A3B8`), and focus rings enforcing WCAG AA contrast (4.5:1 minimum) in `brand-primary` (`#6366F1`).
- **Actions:**
  - A prominent primary action button (`brand-primary`, `#6366F1`) spanning the width of the form labeled **"Sign In"**.
  - During active network requests, the CTA transitions to a disabled semi-transparent state (`opacity-50`) with an inline loading spinner.
- **Validations & Error Banners:**
  - **Client-Side Validation (Pre-submission):**
    - If email or password field is empty $\rightarrow$ Display error banner: `"Please enter both email and password."`
    - If email format is invalid $\rightarrow$ Display error banner: `"Please enter a valid email address."`
    - If password length is less than 6 characters $\rightarrow$ Display error banner: `"Password must be at least 6 characters long."`
  - **Server-Side & Network Exception Handling:**
    - **401 Unauthorized (Invalid Credentials):** Render bounded error banner directly above form fields using codified status tokens:
      - Fill: `bg-rose-950/90` (`#450A1A`)
      - Stroke: `border-rose-500/50` (`#F43F5E`)
      - Text: `text-rose-300` (`#FDA4AF`)
      - Message: `"Invalid login credentials."`
    - **Network Failure / Server Unreachable (Offline State):** Catch network exceptions in `Profile.authenticate()` and display inline error banner using rose status tokens:
      - Message: `"Unable to connect to the server. Please check your internet connection and try again."`
- **Success State (MVP Stub):**
  - Since global routing controllers will be built in a subsequent story, successful authentication temporarily renders a clean success confirmation message inside the view (e.g., *"Login successful!"*) using `accent-got-it` (`#22C55E`) rather than triggering automated route navigation.

---

## 3. Acceptance Criteria (AC)

- **AC1:** The login screen renders correctly on all viewports featuring email input, password input, and a "Sign In" button adhering strictly to Design System tokens (`bg-app`, `bg-card`, `card-radius`, `card-padding`, `text-primary`, `brand-primary`).
- **AC2:** Submitting empty fields, invalid email formats, or passwords shorter than 6 characters triggers instant client-side validation errors without sending a network request.
- **AC3:** Submitting valid inputs invokes `Profile.authenticate(email, password)`. The Supabase client automatically manages session persistence via `localStorage` and background JWT auto-refresh without custom storage logic.
- **AC4:** Network failures or unreachable servers during login throw exceptions caught by `Profile.authenticate()`, rendering the exact message `"Unable to connect to the server. Please check your internet connection and try again."` using tokens `bg-rose-950/90`, `border-rose-500/50`, and `text-rose-300`.
- **AC5:** Failed 401 authentication from Supabase displays `"Invalid login credentials."` inline inside the designated rose status banner.
- **AC6:** Upon successful login, a temporary success confirmation message is rendered on screen and the active user state is stored in `useAuthStore`.

---

## 4. Technical & Architectural Guidance

- **Where it goes:**
  - View component: `app/src/views/LoginView.vue`
  - Domain Model: `app/src/models/profile.ts`
  - Pinia Store: `app/src/stores/authStore.ts`
- **Data & Auth Access (Active Record Enforcement):**
  - The View **must not** call `@supabase/supabase-js` directly.
  - The View calls the domain method on the Active Record model: `await Profile.authenticate(email, password)`.
  - The `Profile` model encapsulates the Supabase client call (`supabase.auth.signInWithPassword`) inside a `try/catch` block to handle network timeouts separately from standard authentication rejections.
- **Session Persistence Standard:**
  - Developers must rely strictly on Supabase's default `@supabase/supabase-js` session persistence in `localStorage`. Do **not** write custom token expiration or storage handlers.
- **State Management:**
  - Upon successful authentication, store the active user profile and session state in the dedicated Pinia store (`app/src/stores/authStore.ts`).