# Server Modularization Scaffold

This directory is introduced in Phase 1 of `MODULARIZATION_REFACTOR_PLAN.md`.

Runtime bootstrap now has two valid entrypoints:

- `server.js`: legacy entrypoint via `node server.js`.
- `server/index.js`: modular entrypoint that calls `server/app.js`, which delegates to the legacy
  implementation and runs `startServer()`.

Next steps:
- phase1 compatibility refactor done: module layer now contains compatibility proxies for existing
  auth/state/holidays behavior
- follow-up: move real implementations into the modules and make `server/app.js` the owning compose layer
