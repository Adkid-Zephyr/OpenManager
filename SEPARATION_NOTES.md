# Separation Notes

This project keeps two ideas separate:

- repo source code
- user runtime data

That separation is important for open source, privacy, and maintainability.

## Source Code

The repository contains the app itself:

```text
openmanager/
├── frontend/
├── backend/
├── scripts/
├── cli.js
├── app.html
├── api.js
└── manual.html
```

`frontend/*` is the source-of-truth for the browser UI.

The root-level `app.html`, `api.js`, and `manual.html` are compatibility entry files. If you change the frontend source, run:

```bash
npm run sync:compat
```

## Runtime Data

Runtime data lives in your OpenClaw workspace, not in this repo:

```text
projects/
├── .projects-index.json
└── <project>/
    ├── .project.json
    ├── memory/
    ├── tasks/
    └── uploads/
```

By default that workspace is:

```text
~/.openclaw/workspace
```

You can override it with:

- `OPENMANAGER_WORKSPACE_DIR`
- `OPENCLAW_WORKSPACE_DIR`
- `OPENCLAW_HOME`

## Local Run

```bash
npm install
npm start
```

Then open:

```text
http://127.0.0.1:3456/
```

## Why This Split Matters

- The repo stays safe to publish
- Project chats and uploads stay local to each user
- Contributors can work on the app without inheriting private runtime data
- Backup strategy becomes clearer: source code and runtime state can be versioned differently
