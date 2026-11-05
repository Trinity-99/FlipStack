# US100 - Tablet View

**User story**
As a user on a tablet or desktop, I want the app to use a wider, centered column, so that it looks and feels right on larger screens instead of showing a narrow phone strip.

## Layout
- **Below 640 px (phone):** unchanged, full width.
- **640 px and up (portrait tablet, desktop):** one centered column, max width 720 px. Header, content and bottom navigation all use this same column width. The area outside the column stays plain app background.
- The layout stays single-column at every size. Nothing moves side by side.

## Use of the extra width
- Cards, forms and lists fill the wider column.
- The study card is proportionally larger, and card text, headings and spacing scale up with it.
- Tap targets are never smaller than today.

## Acceptance criteria
- At 390 px, nothing changes compared to today.
- At 768 px (portrait tablet) and 1440 px (desktop), the 720 px column is centered, with header and bottom navigation aligned to it.
- Study start, study session, card list, card form and deck creation all follow this.
- Swipe gestures, buttons and thresholds work as before on the larger card.
- No horizontal scrolling at any width.

## Out of scope
- Landscape-specific layouts, multi-column layouts.

The 640 px breakpoint, the 720 px width and the text sizes are starting values to tune on a real tablet.
