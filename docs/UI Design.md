# FlipStack — Design Specification

# 1. Design System & Visual Foundations

## 1.1 Color Palette & Token Definitions

| Token Category | Token Name | Hex Code / Tailwind Ref | Usage & Accessibility Notes |
| :--- | :--- | :--- | :--- |
| **Surfaces** | `bg-app` | `#0B0F19` (`slate-950`) | Deep immersive background for low-light mobile study. |
| | `bg-card` | `#1E293B` (`slate-800`) | Elevated card container surface, providing strong visual depth. |
| | `bg-surface-muted`| `#334155` (`slate-700`) | Input fields, secondary pills, and interactive buttons. |
| **Foreground / Text** | `text-primary` | `#F8FAFC` (`slate-50`) | High-contrast main text (Thai script, headings). **Contrast ratio: 14.2:1 (Passes AAA)**. |
| | `text-secondary`| `#94A3B8` (`slate-400`) | Supporting labels, phonetics, and helper text. **Contrast ratio: 4.6:1 (Passes AA)**. |
| | `text-muted` | `#64748B` (`slate-500`) | Disabled states, inactive counter dots. |
| **Borders** | `border-subtle` | `#334155` (`slate-700`) | Card outlines and divider lines. |
| **Semantics** | `accent-got-it` | `#22C55E` (`emerald-500`) | Swipe Up success action ("Got It" / Counter +1). |
| | `accent-review` | `#F43F5E` (`rose-500`) | Swipe Down correction action ("Needs Review" / Counter -1). |
| | `brand-primary` | `#6366F1` (`indigo-500`) | Active states, primary CTAs, brand focus. |

## 1.2 Status Banners & Alert Tokens (Extracted from Mockup)

All inline alert banners, feedback notifications, and state badges follow a structured bounded container treatment consisting of a dark tinted background fill, subtle border stroke, and high-contrast text label.

| Banner State | Background Fill (`bg-*`) | Border Stroke (`border-*`) | Text Color (`text-*`) | Usage Context |
| :--- | :--- | :--- | :--- | :--- |
| **Error / Review (Rose)** | `bg-rose-950/90` or `bg-rose-950/40` | `border-rose-500/50` or `border-rose-500/60` | `text-rose-300` (`#FDA4AF`) / `text-rose-200` (`#FECDD3`) | Validation errors, auth failures, "Needs Review" action feedback. |
| **Success / Got-It (Emerald)** | `bg-emerald-950/90` or `bg-emerald-500/20` | `border-emerald-500/50` or `border-emerald-500/30` | `text-emerald-300` (`#6EE7B7`) / `text-emerald-400` | Positive actions, "Got It" swipe confirmation, sync completed. |
| **Primary / Question (Indigo)** | `bg-indigo-500/20` | `border-indigo-500/30` or `border-indigo-500/40` | `text-indigo-300` (`#A5B4FC`) | Active prompt labels, Question badges, selected filters. |
| **Warning / Info (Amber)** | `bg-amber-950` | `border-amber-800/60` | `text-amber-300` (`#FCD34D`) | Partial setup warnings, multi-sided status indicators. |

### Component Standard: Error & Alert Banners
- **Bounded Container Requirement:** All inline validation messages, server error feedback, and alert banners MUST be rendered inside a bounded container (`bg-rose-950/90` or `bg-rose-950/40` with `border-rose-500/50`).
- **Contrast & Legibility:** Banner text MUST use `text-rose-300` (`#FDA4AF`) or `text-rose-200` (`#FECDD3`) to guarantee a minimum contrast ratio of at least 4.5:1 (WCAG AA compliant) against dark card containers.
- **Layout Placement:** Success and error feedback use the shared `FeedbackBanner` as a fixed overlay, so they remain visible while scrolling without shifting form content. It sits just below and slightly overlaps the sticky app header, above the main content. Its horizontal insets keep it aligned with the app's centered content width on larger viewports and preserve edge spacing on narrow screens. Interactive actions, such as retry buttons, sit outside the live announcement element. Login keeps its existing inline feedback for now.

## 1.3 Typography & Readability Standards
- **Font Family & Localization:**
  - Uses a modern, clean system sans-serif stack (`Inter`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `sans-serif`).
  - Native browser Unicode fallback automatically renders non-Latin characters (Thai, Burmese, Khmer, etc.) cleanly without needing custom per-view font switching logic.
- **Responsive Typography Scale:**
  - *Primary Prompt (Side 1 / Main Text):* `text-2xl` to `text-3xl`, `font-semibold`, with `leading-relaxed` line-height buffer so upper/lower diacritics and tone marks never clip.
  - *Secondary / Supporting Text (Sides 2 & 3):* `text-lg` to `text-xl`, `font-medium`.
  - *UI Labels, Metadata & Counters:* `text-xs` to `text-sm`, `font-normal`.


## 1.4 Layout, Elevation & Container Standards

All primary cards, modals, and container elements must adhere to these standardized layout tokens to ensure consistent geometry, elevation, and touch target proportions across mobile viewports:

| Token Name | Tailwind / CSS Value | Usage & Context |
| :--- | :--- | :--- |
| `card-radius` | `rounded-3xl` (`1.5rem` / `24px`) | Primary card containers (Active study card, Login form card, Modal overlays). |
| `card-padding` | `p-6` (`1.5rem` / `24px`) | Standard internal content padding for primary floating card containers. |
| `card-padding-sm` | `p-4` (`1rem` / `16px`) | Compact sub-cards (List item cards, Tag selector blocks, Settings containers). |
| `card-elevation` | `shadow-2xl` | Deep elevation shadow to float interactive cards cleanly above `bg-app` (`#0B0F19`). |
| `card-border` | `border-2 border-slate-600` | Distinct outer stroke for interactive study and form card containers. |
| `pill-radius` | `rounded-xl` (`0.75rem` / `12px`) | Secondary buttons, dropdown triggers, and tag pills. |

### Mobile Viewport Frame Rule
- **Standard Frame Target:** iPhone 12 Mini baseline (`375px × 812px`).
- **Card Bounds:** Primary floating cards maintain a maximum height constraint (e.g. `h-80` / `20rem` on mobile study viewports) to ensure touch targets for upper/lower swipe gestures remain effortlessly reachable single-handed.

### Compact Forms on Narrow Viewports
- Dense forms may use `p-4` card padding and tighter field spacing below the `sm` breakpoint to reduce unnecessary scrolling on the standard mobile frame. Restore the standard `p-6` padding and roomier spacing at `sm` and above.
- Multi-line textareas may use a shorter default height on narrow screens and increase their minimum height at wider breakpoints. Keep textareas vertically resizable so users can expand fields when needed.
- Preserve accessible touch targets for buttons and selectable controls when compacting forms; reduce surrounding whitespace and text-entry area before reducing action-control height.
- Task-focused editing forms may hide the bottom navigation when it does not help complete the current task. Keep this route-scoped so core navigation remains available on the main study and card-list screens.
- Success and error feedback must remain visible while the user scrolls without moving the form. Use the shared `FeedbackBanner` component, positioned as described in the banner layout guidance above. It uses a polite status role for success and an assertive alert role for errors. Keep interactive actions outside the live announcement element. Login retains its existing inline feedback for now.
---

# 2. Main Navigation & App Architecture

## 2.1 Navigation Model & Priority
- **Primary Mobile Navigation:** A thumb-optimized **Bottom Navigation Bar** dedicated strictly to the core day-to-day study loop, housing two primary tabs:
  1. **Study:** The primary launchpad for configuring and running active study sessions.
  2. **Cards:** The card management hub for viewing, filtering by tags, sorting, and editing card content (CRUD).
- **Secondary & Auxiliary Access:**
  - **Deck Switcher & Creation:** Placed in the top header context (e.g., a dropdown/selector) since users typically focus on a single active deck over long periods.
  - **Settings & Profile:** Housed in a clean top-header modal or icon, containing offline status indicators, sync controls, and account login/management.

## 2.2 Screen Hierarchy & Flow
- **Immersive Study Mode:** When an active study session is launched from the Study tab, the bottom navigation bar temporarily hides to maximize screen estate and focus, providing an easy exit button back to the launchpad.
- **Detail Views & Feature Screens:** Screen-specific detail views, forms, and secondary dialogs are designed iteratively alongside their respective User Stories.