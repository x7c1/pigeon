# Session Selection Modal

Status: Completed

## Overview

Replace `window.prompt` with a custom modal and add the ability to list and select tmux sessions. Also adds a `list-sessions` command to the server side (Rust).

## Background

Current flow:
- Select code → right-click or Ctrl+Shift+L → enter question via `window.prompt` → send

Current tmux target resolution (in `resolve_tmux_target`):
1. Config file (`~/.config/pigeon/config` `tmux_target=`) — highest priority
2. Repository name from the extension request
3. Default: `"claude"`

Limitations:
- Users cannot choose the tmux session
- `window.prompt` cannot be customized and does not support multiple input fields
- When the target session does not exist, the send silently fails
- The config file approach is inflexible and redundant once session selection exists

## Blocked By

- [001 — TypeScript + Biome Setup](../001-typescript-biome-setup/README.md)

## Implementation

### Server Side (Rust)

Redesign the Native Messaging protocol to use a tagged enum for request types.

**Current**: Requests use a single `AskRequest` struct and always execute `send-keys`. `resolve_tmux_target` resolves the target from config file, request, or default.

**After**: Replace `AskRequest` with a serde tagged enum:

```rust
#[serde(tag = "action")]
enum Request {
    #[serde(rename = "send")]
    Send { file: String, code: String, question: String, tmux_target: String, /* ... */ },
    #[serde(rename = "list-sessions")]
    ListSessions,
}
```

- `action: "send"` — send to the tmux session specified by `tmux_target` (user-selected, no fallback logic)
- `action: "list-sessions"` — run `tmux list-sessions -F "#{session_name}"` and return an array of session names

Remove `resolve_tmux_target` and the config file (`~/.config/pigeon/config` `tmux_target=`) support. The modal always provides an explicit target.

Response example (list-sessions):
```json
{
  "ok": true,
  "sessions": ["pigeon", "my-project", "dev"]
}
```

### Chrome Extension

Replace `window.prompt` with a custom modal injected into the GitHub page.

**Message actions** (content script ↔ background script):
- `"listSessions"` — request session list from native host
- `"sendToServer"` — send code to the selected tmux session (existing action name, kept for compatibility)

**Modal layout**:
- tmux session selection dropdown (populated from native host, no manual input)
- Question input textarea (multi-line)
- Send / Cancel buttons
- Loading spinner while fetching session list
- Keyboard support (Ctrl+Enter to send, Escape to cancel)

**Flow**:
- Select code → trigger (right-click or keyboard shortcut)
- content.js sends `"listSessions"` to background.js
- background.js relays to native host, receives session list
- content.js displays modal with session dropdown populated
- User selects a session and enters a question
- content.js sends `"sendToServer"` with the selected `tmux_target` to background.js
- Send

**Error handling**:
- Zero sessions: display error message inside modal
- Session list loading failure: show error via existing toast notification
- Native host connection failure: show error via existing toast notification

## Tasks

- Server: replace `AskRequest` with tagged enum `Request` (Send / ListSessions)
- Server: implement `list-sessions` command
- Server: remove `resolve_tmux_target` and config file support
- Server: add tests for both request variants
- Extension: add `"listSessions"` message handling to background script
- Extension: create custom modal HTML/CSS (with loading spinner)
- Extension: implement modal show/hide logic
- Extension: replace `window.prompt` with modal in content script
- Extension: implement keyboard handling (Ctrl+Enter/Escape)
- Verify existing flow is not broken

## Out of Scope

- Send history display
- Popup UI improvements (settings beyond debug mode)
- Webhooks or real-time notifications

## Estimates

- 5 points
