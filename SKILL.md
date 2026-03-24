---
name: openmanager
description: Local-first OpenClaw project workspace manager with project memory, session memory, task tracking, uploads, agent binding, Skills, and Cron controls.
metadata:
  openclaw:
    requires:
      bins:
        - node
        - openclaw
---

# OpenManager

OpenManager is an OpenClaw-oriented workspace manager. Use it when you want one project to hold:

- shared memory
- multiple conversation sessions
- tasks
- uploaded files
- agent binding and model defaults

## Recommended Run

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:3456/
```

## CLI

```bash
# Create a project
node cli.js create <project-name> [description]

# List projects
node cli.js list

# Switch current project
node cli.js switch <project-name>

# Inspect project
node cli.js info [project-name]

# Create a session
node cli.js session create [session-name]

# Add a task
node cli.js task add "任务描述"
```

## Runtime Layout

Runtime data is stored in the OpenClaw workspace, by default:

```text
~/.openclaw/workspace/projects/
```

You can override that with:

- `OPENMANAGER_WORKSPACE_DIR`
- `OPENCLAW_WORKSPACE_DIR`
- `OPENCLAW_HOME`

## Usage Pattern

- One long-lived project for one real workstream
- One session for one stage of work
- Shared memory for durable project background
- Session memory for task-specific context
