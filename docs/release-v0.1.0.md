# OpenManager v0.1.0

First public release of OpenManager.

## Highlights

- Local-first project workspace manager for OpenClaw
- Project memory plus session memory layering
- Task and file management inside each project
- OpenClaw agent binding and model configuration
- Skills and Cron control panels
- Optional local Codex execution path
- Built-in user manual
- GitHub-ready documentation in English and Chinese

## Best For

- OpenClaw users handling multiple ongoing projects
- People who want one workspace per project instead of one giant chat log
- Users who care about keeping memory, tasks, and uploads together
- Users who want a repo that another coding agent can clone and deploy locally with minimal setup

## Deploy

### Requirements

- Node.js 20+
- OpenClaw installed and available in your shell

### Quick start

```bash
git clone https://github.com/Adkid-Zephyr/OpenManager.git
cd OpenManager
npm install
npm start
```

Then open:

```text
http://127.0.0.1:3456/
```

Manual:

```text
http://127.0.0.1:3456/manual.html
```

### One-click prompt for OpenClaw

```text
Clone https://github.com/Adkid-Zephyr/OpenManager.git, install dependencies, start the local server, verify http://127.0.0.1:3456/ and http://127.0.0.1:3456/manual.html both load, then tell me how to keep it running and how to reopen it later.
```

## Known Limitations

- Local tool only, no multi-user auth
- Depends on a functioning OpenClaw CLI setup
- Some convenience features assume a desktop environment
- Skills and Cron affect the user's OpenClaw runtime, not just this repo

## Safety Notes

- Default host is `127.0.0.1`
- Browser API access is restricted to the local OpenManager origin by default
- Runtime data lives in the OpenClaw workspace, not in the repository
