# US100 - Software Design

## 1. Scope and decisions

- Keep the phone layout unchanged below 640px. At 640px and above, use a centered 720px maximum app frame; keep all pages single-column.
- Preserve immersive study mode: the study route continues to hide the global header and bottom navigation. The study content uses the wider app frame.
- Use breakpoint-based Tailwind sizing from 640px. Initial tablet values: proportionally enlarge the study stage at its current approximate 1.225:1 width-to-height ratio; increase the question prompt from 3xl to 4xl and answer text from 2xl to 3xl; increase page headings from 2xl to 3xl and study spacing/padding by one step. Keep interactive targets at least 44px high.
- The 4xl prompt size is specified by the tablet typography rule in `docs/UI Design.md`.
- At 390px, preserve current dimensions and behavior. Validate centered alignment at 768px and 1440px and no horizontal page scrolling at any width.

## 2. File and component changes

| File / component | Technical changes |
|---|---|
| `app/src/layouts/AppLayout.vue` — `AppLayout` | Replace the frame's `max-w-md` with full width below `sm` and `sm:max-w-[720px]`, retaining `mx-auto`. Keep the existing route-driven immersive behavior. The frame remains the shared width boundary for page content and visible global chrome. No new method. |
| `app/src/components/BottomNavigation.vue` — `BottomNavigation` | Remove the inner `max-w-md` cap so the navigation fills the app frame, retaining its existing horizontal insets, links, and touch targets. No new method. |
| `app/src/views/StudyInitView.vue` — study-start view | Remove the root `max-w-md` cap so the setup card uses the available content width. Apply the larger-screen heading, card padding, and spacing values above. Keep the dialog's compact `max-w-sm` width. No new method. |
| `app/src/views/StudyView.vue` — study-session view | Keep the current 82% width rule and `max-w-xs` on phones; add `sm:max-w-none` and `sm:aspect-[1.225] sm:h-auto` to the stage while retaining `h-60` below `sm`. Move the current 15rem height from `.study-stage` to that template utility so the phone geometry remains unchanged and Tailwind controls the wider aspect ratio. Scale prompt, answer, side label, and stage padding at `sm`; retain all existing controls and gesture thresholds. |
| `app/src/views/StudyView.vue` — stage sizing | Replace the fixed `STAGE_HEIGHT_PX` dependency with a `stageHeight` ref initialized to 240px. Add `updateStageDimensions(element: HTMLElement): void` to update both `stageWidth` and `stageHeight`; call it when observing the stage and from the existing `ResizeObserver`. Use the measured height when positioning the 3D cap, keeping prism geometry synchronized with the responsive stage. |
| `app/src/views/CardListView.vue` — card-list view | Keep the list and table full-width within the app frame. Make the tag-filter row single-column at every breakpoint. Remove horizontal scrolling from the table wrapper; keep its fixed table layout and truncated cell content so it fits the available width. Increase the page heading at `sm`. No new method. |
| `app/src/views/CardEditView.vue` — card editor | Remove the root `max-w-md` cap and let the form fill the available content width. Increase the heading and form padding at `sm`; preserve all existing field and action minimum heights. No new method. |
| `app/src/views/DeckEditView.vue` — deck editor | Remove the root `max-w-md` cap and let the form fill the available content width. Increase the heading and form padding at `sm`; preserve the existing single-column form and touch-target minimums. No new method. |

Use the existing Vue/Tailwind patterns for responsive classes; keep component-specific study-stage geometry in `StudyView.vue` rather than adding global CSS tokens or a layout abstraction.

## 3. Tests and verification

Update the focused existing tests:

- `app/src/__tests__/AppLayout.spec.ts`: verify the 720px responsive frame classes and that immersive routes still hide the header and bottom navigation.
- `app/src/__tests__/StudyInitView.spec.ts`, `CardListView.spec.ts`, `CardEditView.spec.ts`, and `DeckEditView.spec.ts`: verify the widened page containers, responsive sizing classes, and preserved controls.
- `app/src/__tests__/StudyView.spec.ts`: verify stage dimensions update on resize, 3D cap positioning uses the measured height, and existing swipe classifications/thresholds remain unchanged.

In a browser, check 390px, 768px, and 1440px viewport widths: confirm the 390px layout is unchanged, the app frame is centered and no wider than 720px at tablet/desktop widths, visible header and bottom navigation align with the frame, and the document has no horizontal overflow. Also exercise study swipes and buttons at the larger stage size.
