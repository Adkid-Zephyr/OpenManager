# Project Map

This document is the quickest way to understand where OpenManager starts, which file owns which feature, and which paths matter when you change behavior.

It complements:

- `USER_GUIDE.md` for product concepts and data model
- `docs/frontend-architecture.md` for frontend refactor structure
- `docs/regression-checklist.md` for behavior-preservation verification

## 1. Runtime Entry Points

### Browser Pages

`/`

- Main product UI
- Project list, sessions, tasks, memory, skills, cron, project settings, and conversation modal all start here

`/manual.html`

- Built-in user manual page
- Used for onboarding and feature explanation

### Node Entry

`server.js`

- Thin root entry used by `npm start`
- Starts the backend server after the frontend build completes

`backend/server.js`

- Real application server
- Serves static frontend files
- Registers API routes
- Exposes health and product endpoints

### Package Scripts

`npm start`

- Production-style local start
- Runs build first, then starts the server

`npm run dev`

- Starts `backend/server.js` directly

`npm run dev:frontend`

- Starts the Vite frontend dev server

`npm run build`

- Builds the TypeScript frontend
- Syncs compatibility files through `scripts/sync-compat.mjs`

`npm test`

- Runs build verification
- Runs the health smoke test
- Runs the browser regression suite

## 2. Frontend Entry Points

Source of truth:

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

### `frontend/src/main.ts`

- Frontend bootstrap entry
- Loads the main app module and CSS

### `frontend/src/lib/api-client.ts`

- Browser-to-backend API wrapper
- Central place for frontend endpoint changes

### `frontend/src/legacy/app.ts`

- Top-level orchestration
- Connects modules together
- Exposes DOM-called functions to the page

### `frontend/src/legacy/project-dashboard.ts`

- Project list rendering
- Search
- Project selection
- Stats cards
- Session list rendering
- Task list rendering
- Right-side project info rendering

### `frontend/src/legacy/project-management.ts`

- Create project
- Create session
- Add task
- Project settings modal
- Save project settings
- Create-and-bind agent flow
- Rename project
- Delete project
- Rename session
- Delete session
- Toggle and delete tasks
- Edit shared memory

### `frontend/src/legacy/operations-panels.ts`

- Skills tab
- Cron tab
- Skills enable / disable actions
- Cron create / run / enable / disable / delete
- Main tab switching between sessions, tasks, cron, skills, and memory

### `frontend/src/legacy/conversation-flow.ts`

- Open conversation modal
- Send message flow
- Fallback chat flow
- Reconnect active run
- Stop active run
- Composer primary button behavior

### `frontend/src/legacy/conversation-ui.ts`

- Conversation message rendering helpers
- Composer text handling
- File preview rendering
- Attachment state handling
- Double-Enter send and `Shift+Enter` newline behavior

### `frontend/src/legacy/conversation-panels.ts`

- Conversation history side actions
- Files modal
- Logs modal
- Memory panel
- Compress memory flow
- Conversation rename flow inside the modal

### `frontend/src/legacy/run-status.ts`

- Active run tracking
- Phase/status card rendering
- Polling and run lifecycle updates
- Composer button state during active runs

### `frontend/src/legacy/runtime-config.ts`

- Loads runtime defaults from backend
- Loads model options
- Loads agent options
- Populates project settings and project creation runtime pickers

### `frontend/src/legacy/ui-helpers.ts`

- Toasts
- Escaping helpers
- Manual page opening
- Shared low-level UI utilities

## 3. Backend Entry Points

Main backend files:

```text
backend/
├── context.js
├── server.js
├── lib/
│   ├── memory-store.js
│   └── project-template.js
└── routes/
    ├── files.js
    ├── openclaw.js
    ├── projects.js
    ├── sessions.js
    ├── system.js
    └── tasks.js
```

### `backend/context.js`

- Resolves workspace paths
- Provides shared backend context such as projects directory access

### `backend/server.js`

- HTTP server setup
- Static file serving
- API route registration
- Health endpoint exposure

### `backend/routes/projects.js`

- Project list
- Project creation
- Project switch
- Project description update
- Project settings update
- Create-and-bind agent
- Project rename
- Project delete
- Project export
- Open project folder in Finder

### `backend/routes/sessions.js`

- Session list
- Session creation
- Session switch
- Session rename
- Session delete
- Session memory read/write
- Shared memory read/write
- Session entry append

### `backend/routes/tasks.js`

- Task list
- Task creation
- Task toggle complete
- Task delete

### `backend/routes/files.js`

- Project file listing
- Upload handling
- File delete
- File serving

### `backend/routes/openclaw.js`

- Gateway/local chat execution
- Active run lifecycle
- Reconnect/stop run APIs
- Runtime defaults
- Agent/model list APIs
- Compression
- Chat fast-path logic and memory-pollution prevention

### `backend/routes/system.js`

- Skills list
- Skills enable / disable
- Cron list
- Cron create / run / enable / disable / delete

### `backend/lib/memory-store.js`

- Session storage format
- Meta/hot/facts/summary handling
- Compatibility reads for older session files
- Memory filtering logic

### `backend/lib/project-template.js`

- Generates project bootstrap files such as `AGENTS.md`, `BOOTSTRAP.md`, and identity templates

## 4. User-Facing Feature Map

### Project Workspace

User sees:

- Project list
- Search
- Project info panel
- Project settings

Main frontend owners:

- `legacy/project-dashboard.ts`
- `legacy/project-management.ts`
- `legacy/runtime-config.ts`

Main backend owners:

- `routes/projects.js`

### Sessions And Conversation

User sees:

- Session list
- Open conversation
- Rename/delete session
- Composer
- Conversation messages
- Run controls

Main frontend owners:

- `legacy/project-dashboard.ts`
- `legacy/project-management.ts`
- `legacy/conversation-flow.ts`
- `legacy/conversation-ui.ts`
- `legacy/run-status.ts`
- `legacy/conversation-panels.ts`

Main backend owners:

- `routes/sessions.js`
- `routes/openclaw.js`
- `lib/memory-store.js`

### Tasks

User sees:

- Task list
- Add task
- Complete task
- Delete task

Main frontend owners:

- `legacy/project-dashboard.ts`
- `legacy/project-management.ts`

Main backend owners:

- `routes/tasks.js`

### Files And Uploads

User sees:

- Attachment preview in composer
- Project file list
- File delete

Main frontend owners:

- `legacy/conversation-ui.ts`
- `legacy/conversation-panels.ts`

Main backend owners:

- `routes/files.js`

### Skills And Cron

User sees:

- Skills list
- Skill enable / disable
- Cron list
- Create cron job
- Run/enable/disable/delete cron job

Main frontend owners:

- `legacy/operations-panels.ts`

Main backend owners:

- `routes/system.js`

### Built-In Manual

User sees:

- Product usage guide inside the app

Main files:

- `frontend/manual.html`
- `manual.html`

## 5. Compatibility Entry Files

The repo still includes compatibility files because older usage and deployment flows depend on them:

```text
app.html
api.js
manual.html
frontend/index.html
frontend/api.js
frontend/manual.html
```

These are refreshed by:

- `scripts/sync-compat.mjs`

Do not hand-edit them as the long-term source of truth. Prefer editing `frontend/src/` and then rebuilding.

## 6. Data And Workspace Layout

Primary runtime workspace:

```text
~/.openclaw/workspace/
```

Important data roots:

```text
projects/<project>/
├── .project.json
├── memory/
├── tasks/
└── uploads/
```

High-value files:

- `.project.json` stores project runtime/config state
- `memory/shared.md` stores project-level memory
- `memory/session-*.jsonl` stores raw message history
- `memory/session-*.hot.json` stores working memory
- `memory/session-*.facts.json` stores structured facts
- `tasks/tasks.json` stores task state

## 7. Automation Entry Points

### `scripts/smoke.mjs`

- Minimal boot-and-health verification

### `scripts/regression.mjs`

- Browser regression suite
- Verifies behavior preservation for the highest-risk user flows

### Current Regression Coverage

- project create / switch / rename / delete
- session create / switch / rename / delete
- task add / complete / delete
- project settings save flow
- skills enable / disable
- cron create / run / enable / disable / delete
- image preview and removal
- `Shift+Enter`
- double-Enter send
- reconnect run
- stop run

## 8. When You Touch A File, What Else Should You Check?

If you change:

`legacy/conversation-flow.ts`, `legacy/conversation-ui.ts`, or `legacy/run-status.ts`

- Re-run `npm test`
- Manually sanity-check composer behavior if the change is user-facing

`legacy/project-management.ts` or `routes/projects.js`

- Re-check project creation, rename, delete, and project settings

`legacy/operations-panels.ts` or `routes/system.js`

- Re-check Skills and Cron behavior

`routes/openclaw.js` or `lib/memory-store.js`

- Re-check real chat integrity, not only stubbed regression coverage

## 9. Current Design Rule

The current refactor rule is simple:

> Preserve product behavior. Improve implementation quality underneath.

That means contributors should treat UI layout, major interaction habits, and existing feature scope as stable unless a product change is explicitly intended.
