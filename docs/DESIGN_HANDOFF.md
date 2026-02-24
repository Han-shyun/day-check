# Design Handoff: Day-check SPA Restructure

## Scope Completed
- Replaced single-page dense layout with a 4-view IA inside a single route outlet:
  - `home`
  - `buckets`
  - `calendar`
  - `report`
- Added hash-based routing with persisted last route:
  - route format: `#/home`, `#/buckets`, `#/calendar`, `#/report`
  - storage key: `day-check.ui.route.v1`
- Introduced app shell composition:
  - fixed header/auth area
  - fixed tab navigation
  - animated route content outlet
- Preserved existing data model and backend API contracts.

## Interaction Rules Applied
- Route transition baseline: `180ms`.
- Direction-aware motion:
  - forward: fade + slight slide-left impression
  - backward: fade + slight slide-right impression
- Focus management:
  - on route switch, focus moves to the first heading (`h1/h2`) in the active view.
- Reduced motion support:
  - route transition animation disabled under `prefers-reduced-motion: reduce`.

## Design System Updates
- Kept `src/style.css` as single entry, extended with explicit app-shell layers:
  - shell
  - tabs
  - route outlet
  - route view animation
- Unified tab/button/card states to one interaction language.
- Set touch-target baseline to `44px` for primary controls.
- Preserved responsive breakpoints while adapting to routed layout:
  - `<=760`
  - `761~1180`
  - `>1180`

## Architecture and Module Contract
- Added router module:
  - `src/app/router.js`
- Implemented feature UI modules with `mount/unmount/render` lifecycle:
  - `src/features/todo/ui.js`
  - `src/features/bucket/ui.js`
  - `src/features/calendar/ui.js`
  - `src/features/report/ui.js`
  - `src/features/auth/ui.js`
  - `src/features/collab/ui.js` (compatibility placeholder lifecycle retained)
- `src/main.js` now orchestrates:
  - global state and sync
  - route activation
  - active-route rendering only

## Stability Fixes
- Removed legacy composer wiring that referenced non-existing DOM nodes.
- Restored weekly report render path based on current `todos` and `doneLog`.
- Enabled bucket toolbar controls in routed buckets view:
  - add bucket
  - remove bucket
  - drag handle availability in dynamic bucket column creation

## Files Updated In This Pass
- `index.html`
- `src/style.css`
- `src/main.js`
- `src/app/router.js`
- `src/features/todo/ui.js`
- `src/features/bucket/ui.js`
- `src/features/calendar/ui.js`
- `src/features/report/ui.js`
- `src/features/auth/ui.js`
- `src/features/collab/ui.js`

## Update: Collaboration + Flat Design (2026-02-20)

### Collaboration UX Surface
- Added a dedicated collaboration panel in buckets view:
  - public ID visibility (`@publicId`)
  - invite form (bucket + target public ID)
  - received invites (accept/decline)
  - sent invites (cancel)
  - membership list (kick/leave)
- Added per-bucket shared task section below personal tasks:
  - shared context selector (owned/joined)
  - shared task composer
  - shared task cards with explicit author badge
  - comments panel with author badge on each comment

### Identification Rules
- Shared task cards always show `author @publicId`.
- Shared comments always show `author @publicId`.
- Owner/member permissions are reflected by available CTA buttons:
  - owner: delete shared task, remove member
  - member: edit/toggle shared task, write comments, delete own comment

### Visual Direction Shift
- Moved to square flat UI language:
  - radius reduced to 6~8px
  - 1px border as primary depth cue
  - heavy shadows and blur removed
  - hover motion translation removed
- Applied consistently to:
  - topbar
  - tabs
  - cards
  - bucket columns
  - shared panel
  - comment bubbles
- Mobile bottom tabs preserve fixed layout but remove glass effect.

### Implementation Notes
- Flat redesign is applied via override layer at the end of `src/style.css` to minimize regression risk.
- Collaboration behavior is orchestrated in `src/main.js`:
  - `collabSummary`
  - `sharedTodosByContext`
  - `sharedCommentsByTodo`
  - bucket-route polling (`COLLAB_POLL_INTERVAL_MS`)
