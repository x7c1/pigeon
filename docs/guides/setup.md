# Setup Guide

## How It Works

```
GitHub PR (Chrome) → Chrome Extension → Native Messaging → pigeon-host → tmux send-keys → CLI tool
```

Uses Chrome's Native Messaging instead of an HTTP server, so there's no need to open ports. Authentication is handled by extension ID, making it secure.

## Installation

### 1. Install the Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `chrome-extension/` directory
4. Copy the displayed **Extension ID**

### 2. Run install.sh

```bash
./install.sh
```

- Builds and installs the Rust binary to `~/.local/bin/`
- Places the Native Messaging manifest
- You will be prompted to enter the extension ID copied in step 1

### 3. Restart Chrome

## Usage

1. Start your CLI tool in tmux:
   ```bash
   tmux new-session -s claude
   cd /path/to/your/repo
   claude
   ```
2. Open a PR on GitHub → Files changed (or Changes)
3. Select some code
4. **Ctrl+Shift+L** or **right-click → "Send to tmux session"**
5. Enter your question in the prompt (leave empty for the default question)
6. The question is sent to the CLI tool running in tmux

## Changing the tmux Session Name

By default, the extension sends the repository name from the PR page as the tmux target. If that's not provided, it falls back to `claude`.

To override this at the machine level, edit `~/.config/pigeon/config`:

```
tmux_target=my-session
```

The config file takes precedence over the extension-sent value.

## Notes

- If GitHub's DOM structure changes, file path and line number extraction may break. Fix `content.js` in that case.
