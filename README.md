# OpenManager

OpenManager is a local project workspace manager built for OpenClaw.

It is designed around three ideas:

- A project is the workspace boundary
- An agent is the execution boundary
- A session is the conversation boundary

## What It Does

- Manage multiple local projects
- Keep project-level shared memory
- Keep session-level conversation memory
- Track tasks and uploads per project
- Bind a project to a dedicated OpenClaw agent
- Open multiple project windows for parallel work

## Current Structure

```text
project-workspace/
├── app.html
├── api.js
├── test-entry.html
├── frontend/
│   ├── index.html
│   └── api.js
├── backend/
│   ├── context.js
│   ├── server.js
│   ├── lib/
│   │   ├── router.js
│   │   └── memory-store.js
│   └── routes/
│       ├── projects.js
│       ├── sessions.js
│       ├── tasks.js
│       ├── files.js
│       ├── openclaw.js
│       └── system.js
├── USER_GUIDE.md
└── SEPARATION_NOTES.md
```

## Local Development

Start the backend:

```bash
node backend/server.js
```

Then open:

```text
test-entry.html
```

From there you can launch the frontend and verify API connectivity.

## Data Model

Runtime project data lives under the workspace `projects/` directory:

```text
projects/<project>/
├── .project.json
├── memory/
│   ├── shared.md
│   ├── session-<id>.meta.json
│   ├── session-<id>.jsonl
│   ├── session-<id>.summary.md
│   └── session-<id>.md
├── tasks/
│   └── tasks.json
└── uploads/
```

## Open Source Direction

The long-term goal is:

1. Keep this as a clean GitHub project
2. Continue modularizing frontend and backend
3. Package it as an OpenClaw skill

To support that direction, the codebase is being shaped to be:

- file-based and dependency-light
- modular instead of monolithic
- documented for contributors
- decoupled from private runtime data

## Docs

- [USER_GUIDE.md](./USER_GUIDE.md)
- [SEPARATION_NOTES.md](./SEPARATION_NOTES.md)
