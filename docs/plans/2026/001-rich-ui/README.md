# Rich UI

Status: Completed

## Overview

Enrich the Chrome extension UI for pigeon. Currently it relies on `window.prompt` for simple input and a hardcoded tmux target for message delivery. This plan introduces a custom modal with session selection to improve usability.

## Background

Current UI limitations:

- `window.prompt` is a browser-native dialog with no design customization
- The tmux target is automatically determined from the repository name, config file, or a default value — users cannot choose the target session
- When the target session does not exist, the send silently fails

## Sub-Plans

### [001 — TypeScript + Biome Setup](plans/001-typescript-biome-setup/README.md)

Migrate the Chrome extension codebase from JavaScript to TypeScript and introduce Biome as the linter/formatter. This establishes the development foundation for subsequent UI work.

### [002 — Session Selection Modal](plans/002-session-selection-modal/README.md)

Replace `window.prompt` with a custom modal and add the ability to list and select tmux sessions. Also adds a `list-sessions` command to the server side (Rust).

## Dependencies

```
001 TypeScript + Biome Setup
 ↓
002 Session Selection Modal
```

## Priority

High — implement soon.
