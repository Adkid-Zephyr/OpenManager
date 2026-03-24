# Publishing OpenManager

This project is prepared for an independent GitHub repository.

## Local Release Directory

A clean export can be created from this source directory into a separate folder, for example:

```bash
ditto skills/project-workspace releases/openmanager
```

## Before First Push

1. Set Git identity

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

2. Log in to GitHub CLI

```bash
gh auth login
```

3. Re-run verification

```bash
npm install
npm test
```

4. Add screenshots into:

```text
docs/screenshots/
```

## Suggested First Push

```bash
git init
git branch -M main
git add .
git commit -m "Initial public release"
gh repo create openmanager --public --source=. --remote=origin --push
```

## If You Want A Different Repo Name

Examples:

- `openmanager`
- `openmanager-for-openclaw`
- `openclaw-openmanager`

Pick the shortest name that is still easy to search and remember.
