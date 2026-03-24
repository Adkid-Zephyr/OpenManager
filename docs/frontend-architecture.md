# Frontend Architecture

## Goal

The frontend is being migrated from a single large HTML + JavaScript page into a TypeScript-based structure that is easier to review, test, and extend.

The guiding rule is:

> Change the implementation shape first, not the product behavior.

## Current Shape

Source of truth lives in:

```text
frontend/src/
├── main.ts
├── lib/
│   └── api-client.ts
└── legacy/
    ├── app.ts
    ├── app.css
    ├── conversation-flow.ts
    ├── conversation-panels.ts
    ├── conversation-ui.ts
    ├── operations-panels.ts
    ├── project-dashboard.ts
    ├── project-management.ts
    ├── run-status.ts
    ├── runtime-config.ts
    └── ui-helpers.ts
```

## Why There Is Still A `legacy/` Folder

`legacy/` does not mean “abandoned.”

Here it means:

- the product is still largely DOM-driven
- the UI behavior is intentionally preserved
- the code has been separated into modules without forcing a framework rewrite

This keeps risk lower while making the codebase much more manageable than the original single-file implementation.

## Module Responsibilities

`main.ts`

- bootstraps the frontend entry
- loads the current app module and styles

`lib/api-client.ts`

- centralizes browser-to-backend API calls
- gives the rest of the frontend one place to evolve network behavior

`legacy/app.ts`

- top-level wiring and orchestration
- exposes the cross-module functions the DOM still calls
- should stay small and coordination-focused

`legacy/project-dashboard.ts`

- project list
- project overview rendering
- high-level project content switching

`legacy/project-management.ts`

- project create / rename / delete flows
- session and task management actions that belong to project administration

`legacy/operations-panels.ts`

- Skills and Cron panel behavior
- tab-level operations that are not core conversation flow

`legacy/conversation-flow.ts`

- sending messages
- reconnecting runs
- stopping runs
- composer-level interaction behavior

`legacy/conversation-ui.ts`

- message rendering helpers
- composer helpers
- file preview / attachment UI helpers

`legacy/conversation-panels.ts`

- memory panel
- files panel
- logs panel
- conversation history side panels

`legacy/run-status.ts`

- run lifecycle state
- phase card rendering
- run event updates and timers

`legacy/runtime-config.ts`

- runtime and model configuration behavior

`legacy/ui-helpers.ts`

- shared UI utility helpers such as toast / escaping / manual opening

## Compatibility Outputs

The project still ships compatibility entry files because existing usage expects them:

```text
app.html
api.js
manual.html
frontend/index.html
frontend/api.js
frontend/manual.html
```

These are refreshed as part of the build pipeline.

## Build Flow

Build command:

```bash
npm run build
```

This does two things:

1. Builds the TypeScript frontend with Vite.
2. Syncs compatibility files through `scripts/sync-compat.mjs`.

Generated build output goes to:

```text
dist/
```

The backend serves static assets from `dist/` first, then falls back to compatibility files when needed.

## Backend Relationship

The frontend talks to a local Node server that handles:

- projects
- sessions
- tasks
- files
- OpenClaw chat/runtime integration
- system/runtime info

Important backend files:

```text
backend/server.js
backend/routes/openclaw.js
backend/routes/projects.js
backend/routes/sessions.js
backend/routes/tasks.js
backend/routes/files.js
backend/routes/system.js
backend/lib/memory-store.js
```

## Design Constraint: Preserve Product Behavior

When changing frontend internals, treat these as stable behavioral contracts:

- UI layout should not casually move around
- the composer should keep its established send/newline behavior
- file previews should remain visible and useful
- run controls should remain available
- conversation workflows should not be reimagined during refactor

This architecture is successful only if contributors can improve the internals without making the product feel unfamiliar.

## Near-Term Refactor Direction

The current next step is not a full rewrite.

The current next step is:

- keep tightening module boundaries
- add better regression coverage
- document expected behavior more clearly
- prepare the codebase for future i18n

React may still happen later, but it is not the default next move.
