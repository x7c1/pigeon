# Session Selection Modal

Status: Draft

## Overview

Replace `window.prompt` with a custom modal and add the ability to list and select tmux sessions. Also adds a `list-sessions` command to the server side (Rust).

## Background

Current flow:
- Select code → right-click or Ctrl+Shift+L → enter question via `window.prompt` → send

Limitations:
- Users cannot choose the tmux session (automatically determined from repository name)
- `window.prompt` cannot be customized and does not support multiple input fields
- When the target session does not exist, the send silently fails

## Blocked By

- [001 — TypeScript + Biome Setup](../001-typescript-biome-setup/README.md)

## Implementation

### Server Side (Rust)

Add a new command type to the Native Messaging protocol.

**Current**: Requests use a single `AskRequest` struct and always execute `send-keys`.

**After**: Add an `action` field to branch request handling.

- `action: "send"` (default) — existing send behavior (backward compatible)
- `action: "list-sessions"` — run `tmux list-sessions -F "#{session_name}"` and return an array of session names

Response example (list-sessions):
```json
{
  "ok": true,
  "sessions": ["pigeon", "my-project", "dev"]
}
```

### Chrome Extension

Replace `window.prompt` with a custom modal injected into the GitHub page.

**Modal layout**:
- tmux session selection dropdown (populated from native host)
- Question input textarea (multi-line)
- Send / Cancel buttons
- Keyboard support (Ctrl+Enter to send, Escape to cancel)

**Flow**:
- Select code → trigger (right-click or keyboard shortcut)
- background.js sends `list-sessions` to native host
- Receives session list, asks content.js to display modal
- User selects a session and enters a question
- Send

**Error handling**:
- Zero sessions: display error message inside modal
- Native host connection failure: show error via existing toast notification

## Tasks

- Server: add action branching to request struct
- Server: implement `list-sessions` command
- Server: add tests
- Extension: create custom modal HTML/CSS
- Extension: implement modal show/hide logic
- Extension: add session list fetching to background script
- Extension: replace `window.prompt` with modal in content script
- Extension: implement keyboard handling (Ctrl+Enter/Escape)
- Verify existing flow is not broken

## Out of Scope

- Send history display
- Popup UI improvements (settings beyond debug mode)
- Webhooks or real-time notifications

## Estimates

- 5 points
