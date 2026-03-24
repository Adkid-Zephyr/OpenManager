# Regression Checklist

This checklist exists to protect product behavior while the internals are refactored.

The standard is:

> Refactor freely under the hood. Keep the user experience stable.

## Project Management

- Create a project
- Switch between projects
- Rename a project
- Delete a project
- Open project settings
- Save project settings
- Bind or update agent/runtime settings

## Sessions

- Create a session
- Switch sessions
- Rename a session
- Delete a session
- Open a conversation from the session list

## Tasks

- Add a task
- Edit a task if the touched flow changes
- Mark a task complete
- Reopen a completed task if supported in the touched flow
- Delete a task

## Conversation Basics

- Send a plain text message
- Open an existing conversation and read prior messages
- Ensure conversation history still renders correctly
- Ensure assistant replies still append correctly

## Composer Behavior

- `Shift+Enter` inserts a newline
- single `Enter` does not accidentally send when double-Enter behavior is expected
- double `Enter` sends when that behavior is enabled
- send button enable/disable logic still matches message/file state
- recent-message up/down recall still works if touched

## Run Controls

- Active run shows progress state
- Stop run button appears when expected
- Stop run request works
- Reconnect run button appears when expected
- Reconnect run works when a live run exists
- Finished runs no longer show stale active controls

## Files And Uploads

- Upload an image
- Confirm image preview renders
- Upload a non-image file
- Confirm file card/preview renders
- Remove selected file before sending
- Open file panel
- Delete a file from the project file list if the touched flow changes

## Memory And Panels

- Open memory panel
- Copy memory content
- Compress memory
- Open file modal
- Open logs modal
- Ensure side-panel rendering still works after reopening a conversation

## Skills / Cron

- Skills list loads
- Skill enable/disable behavior works if touched
- Cron list loads
- Create a cron job if touched
- Enable/disable a cron job if touched
- Run a cron job manually if touched

## Manual / Navigation

- Root page loads
- Manual page loads
- Open Manual button still works
- Search input still responds if touched
- Main tabs still switch correctly

## Backend Chat Integrity

If you touched chat, memory, or runtime code, also verify:

- Gateway chat still completes on a real project
- Local runtime still completes if relevant
- Identity / presence / style-repair meta turns do not pollute session memory
- Real task execution still works after those meta-turn fixes

## Release-Minimum Verification

Before merging a risky refactor, the minimum recommended commands are:

```bash
npm run build
npm run typecheck
npm test
```

`npm test` now includes the first browser regression pack. Today it automatically checks:

- project creation
- project switching
- project rename
- project delete
- project settings save flow
- session creation and opening a conversation
- session switching
- session rename
- session delete
- task add / complete / delete
- skills enable / disable
- cron create / run / enable / disable / delete
- image upload preview and removal
- `Shift+Enter` newline
- single-Enter guard when double-Enter send is expected
- double-Enter send
- reconnect run
- stop run

Then do at least one real manual pass through the areas affected by the change.
