# Design Handoff: Apple-Inspired UI Pass

## Scope Completed
- Unified visual tokens into one source in `src/style.css`.
- Refined surface hierarchy to glass-like cards with consistent radius/shadow scale.
- Stabilized responsive layout for `320`, `768`, `1280` targets.
- Improved long-note readability with clamp + expand pattern.
- Improved long schedule visibility in calendar with continuous range bar styling.
- Kept today note highlights pinned at top of todo list behavior in `src/main.js`.
- Kept nickname/honorific edit flow and topbar placement.

## Interaction Style Applied
- Motion: short staggered card entrance and subtle hover lift.
- Input/button system: one focus ring language and one button shape scale.
- Calendar: clearer state contrast (`today`, `selected`, weekend, holiday).
- Bucket board: controls consolidated in toolbar with less visual noise.

## UX Gaps For Designer Follow-up
- Final typography selection for bilingual KR/EN polish.
- Micro-motion easing fine tuning for high-refresh devices.
- Semantic color contrast audit for edge states (error/disabled/active on bright light).
- Spacing rhythm tuning for heavy-data days (many notes/todos in one date cell).

## Accessibility Priorities
- Validate color contrast for all buttons and badges against WCAG AA.
- Ensure keyboard focus order in topbar/profile editor/calendar detail panel.
- Verify touch target minimum size (44px) for mobile critical controls.

## Files Updated In This Pass
- `index.html`
- `src/style.css`
- `src/main.js`
