# Contributing To OpenManager

Thanks for contributing.

OpenManager is currently in a behavior-preserving refactor phase:

- the UI layout should stay familiar
- interaction habits should stay familiar
- product capabilities should stay intact
- internal code quality is allowed to improve aggressively

In short:

> Improve the codebase. Do not casually redesign the product.

## Current Priorities

The project is actively moving from a large HTML + JavaScript implementation toward a more maintainable TypeScript-based structure.

Right now, the priorities are:

1. Preserve user-facing behavior.
2. Improve maintainability and reviewability.
3. Strengthen tests and contributor docs.
4. Prepare the project for future i18n and broader open-source collaboration.

## Ground Rules

Please keep these stable unless a change is explicitly discussed and approved:

- Main UI layout
- Existing workflow and navigation
- Input behavior
- Session/task/project management flows
- Run controls such as stop / reconnect
- File upload and preview behavior

Allowed and encouraged:

- Refactoring large files into smaller modules
- Improving naming, structure, and readability
- Adding tests
- Fixing real bugs
- Hardening backend behavior
- Improving developer documentation

## Source Of Truth

Frontend source of truth:

- `frontend/src/`

Compatibility outputs:

- `app.html`
- `api.js`
- `manual.html`
- `frontend/index.html`
- `frontend/api.js`
- `frontend/manual.html`

Generated build output:

- `dist/`

If you change frontend source, run:

```bash
npm run build
```

That build also refreshes compatibility entry files via `scripts/sync-compat.mjs`.

## Development Workflow

Install dependencies:

```bash
npm install
```

Start the local app:

```bash
npm start
```

Useful commands:

```bash
npm run build
npm run typecheck
npm test
npm run regression
npm run dev
npm run dev:frontend
```

Current automated coverage:

- `npm test` runs build verification, the health smoke test, and the browser regression suite
- `npm run regression` currently covers the highest-risk behavior-preservation flows:
  project create / switch / rename / delete, session create / switch / rename / delete,
  task add / complete / delete, project settings save flow, skills enable / disable,
  cron create / run / enable / disable / delete, file preview / removal, `Shift+Enter`,
  double-Enter send, and stop / reconnect run controls

## Behavior Preservation Checklist

Before opening a PR, verify the areas touched by your change.

Core manual checks:

- Project create / switch / rename / delete
- Session create / switch / rename / delete
- Task add / edit / complete / delete
- Conversation send flow
- `Shift+Enter` newline
- double-Enter send behavior
- file upload preview and removal
- stop run / reconnect run
- Skills panel basics
- Cron panel basics
- manual page loads

If your change touches chat, memory, or runtime behavior, also verify:

- gateway chat still works on a real project
- local Codex runtime still works if relevant
- no new low-signal memory pollution is introduced

See [`docs/regression-checklist.md`](./docs/regression-checklist.md) for the fuller checklist.

## PR Guidance

Good PRs here usually:

- change one concern at a time
- keep UI behavior unchanged unless intentionally discussed
- include a short verification note
- mention any known gaps honestly

Helpful PR summary format:

1. What changed
2. Why it changed
3. What was verified
4. Any remaining risk

## Architecture Notes

If you need orientation first, read:

- [`SEPARATION_NOTES.md`](./SEPARATION_NOTES.md)
- [`USER_GUIDE.md`](./USER_GUIDE.md)
- [`docs/project-map.md`](./docs/project-map.md)
- [`docs/frontend-architecture.md`](./docs/frontend-architecture.md)
- [`docs/regression-checklist.md`](./docs/regression-checklist.md)

## What Not To Do

Please avoid these unless explicitly requested:

- large visual redesigns
- framework rewrites that also change product behavior
- changing key interaction patterns “because it feels better”
- mixing refactor, redesign, and new features in one PR
- writing runtime or private user data into the repo

## Future Direction

Possible future work includes:

- broader automated E2E coverage beyond the first regression pack
- formal i18n with English + Chinese UI switching
- more modular frontend feature boundaries
- eventual React migration, if still justified after the current refactor stabilizes

That last item is not the current default. Behavior-preserving maintainability work comes first.
