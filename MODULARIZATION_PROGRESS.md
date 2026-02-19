# Modularization Progress

Active branch: `refactor/modularization-phase1`

## Phase 1 - Structural Extraction (No Behavior Change)

Completed:
- frontend date utilities extracted from `src/main.js` to `src/core/date-utils.js`
- frontend bootstrap bridge introduced: `src/app/bootstrap.js` -> imports legacy `src/main.js`
- frontend module skeleton directories created under:
  - `src/core/`
  - `src/features/`
- backend module skeleton directories created under:
  - `server/config/`, `server/db/`, `server/middleware/`, `server/modules/`, `server/shared/`
- backend bridge entrypoint now wired:
  - `server/index.js` starts server through `server/app.js`
  - `server/app.js` delegates to `../server`
  - `server.js` exposes `startServer()` and no longer auto-starts when imported as a module
- backend module proxies now implemented:
  - `server/modules/auth/{router,service,repository}.js` now own route/service/repository concerns with dependency injection
  - `server/modules/state/{router,service,repository}.js` now own route/service/repository concerns with dependency injection
  - `server/modules/holidays/{router,service}.js` now own route/service concerns with dependency injection
  - `server/middleware/{auth-session,require-auth,validate-csrf,error-handler}.js` implemented as compatibility wrappers
  - `server/modules/collab/*` prepared with non-operational placeholders returning 501 to preserve safe extension path

Compatibility:
- runtime behavior remains unchanged for current endpoints and auth/calendar/state flows
- modular entrypoint `start:modular` uses the same boot sequence as legacy

Next extraction targets:
- replace legacy delegation with first-class domain modules for auth/state/holidays while keeping behavior parity
