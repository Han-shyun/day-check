# Server Modularization Scaffold

This directory is introduced in Phase 1 of `MODULARIZATION_REFACTOR_PLAN.md`.

Current runtime still uses `server.js` directly.

`server/index.js` is a bridge entrypoint that currently forwards execution to `../server.js` with no behavior change.

Next steps:
- extract auth/state/holidays router and service logic from `server.js`
- replace bridge startup with `server/app.js + server/index.js`
