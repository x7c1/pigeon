#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY_SRC="$SCRIPT_DIR/server/target/release/pigeon-host"
BINARY_DST="$HOME/.local/bin/pigeon-host"

# Build and install the binary
if [ ! -f "$BINARY_SRC" ]; then
    echo "Building..."
    cd "$SCRIPT_DIR/server"
    cargo build --release
    cd "$SCRIPT_DIR"
fi

mkdir -p "$HOME/.local/bin"
cp "$BINARY_SRC" "$BINARY_DST"
chmod +x "$BINARY_DST"

# On macOS, re-sign the binary so it can be launched by Chrome Native Messaging
if [ "$(uname)" = "Darwin" ]; then
    codesign -s - -f "$BINARY_DST" 2>/dev/null
fi

echo "Installed binary: $BINARY_DST"

# Get the Chrome extension ID
echo ""
echo "Enter the Chrome extension ID"
echo "(Copy the Pigeon extension ID from chrome://extensions)"
read -p "Extension ID: " EXT_ID

if [ -z "$EXT_ID" ]; then
    echo "Error: Extension ID is required"
    exit 1
fi

# Place the Native Messaging manifest
MANIFEST='{
  "name": "pigeon",
  "description": "Bridge between Pigeon extension and tmux",
  "path": "'"$BINARY_DST"'",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://'"$EXT_ID"'/"]
}'

# Install for Chrome and Chromium (OS-dependent paths)
if [ "$(uname)" = "Darwin" ]; then
    MANIFEST_DIRS=(
        "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    )
else
    MANIFEST_DIRS=(
        "$HOME/.config/google-chrome/NativeMessagingHosts"
        "$HOME/.config/chromium/NativeMessagingHosts"
    )
fi

for dir in "${MANIFEST_DIRS[@]}"; do
    mkdir -p "$dir"
    echo "$MANIFEST" > "$dir/pigeon.json"
    echo "Installed manifest: $dir/pigeon.json"
done

echo ""
echo "Done! Please restart Chrome."

# Create default config file (only if it doesn't exist)
CONFIG_DIR="$HOME/.config/pigeon"
CONFIG_FILE="$CONFIG_DIR/config"
if [ ! -f "$CONFIG_FILE" ]; then
    mkdir -p "$CONFIG_DIR"
    echo "# tmux session name (default: claude)" > "$CONFIG_FILE"
    echo "# tmux_target=claude" >> "$CONFIG_FILE"
    echo "Created config: $CONFIG_FILE"
fi

echo ""
echo "Usage:"
echo "  1. tmux new -s claude && claude"
echo "  2. Select code in a GitHub PR -> Ctrl+Shift+L"
