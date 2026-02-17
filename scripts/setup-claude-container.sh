#!/bin/bash

# Script to setup Claude container environment

set -e

main() {
    check_prerequisites
    mkdir -p claude.local/.claude claude.local/.npm-global claude.local/.local
    setup_claude_config
    setup_bash_history
    echo "Setup completed successfully!"
    echo "Original ~/.claude.json preserved"
}

check_prerequisites() {
    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        echo "Error: jq is required but not installed. Please install jq first."
        exit 1
    fi

    # Check if ~/.claude.json exists
    if [ ! -f ~/.claude.json ]; then
        echo "Error: ~/.claude.json not found"
        exit 1
    fi

    # Check if git config uses XDG location
    if [ ! -f ~/.config/git/config ]; then
        echo "Error: ~/.config/git/config not found."
        echo "This container mounts ~/.config/git for git configuration."
        echo ""
        echo "Please migrate from ~/.gitconfig to ~/.config/git/config:"
        echo "  mkdir -p ~/.config/git"
        echo "  mv ~/.gitconfig ~/.config/git/config"
        exit 1
    fi
}

setup_claude_config() {

    # Check if claude.local/.claude.json already exists
    if [ -f claude.local/.claude.json ]; then
        echo "claude.local/.claude.json already exists. Skipping Claude config setup."
        return
    fi

    # Copy ~/.claude.json to claude.local/
    echo "Copying ~/.claude.json to claude.local/.claude.json..."
    cp ~/.claude.json claude.local/.claude.json

    # Empty the projects history using jq
    echo "Emptying project history..."
    jq '.projects = {}' claude.local/.claude.json > claude.local/.claude.json.tmp && \
        mv claude.local/.claude.json.tmp claude.local/.claude.json

    echo "Successfully created claude.local/.claude.json with empty project history"
}

setup_bash_history() {
    # Check if .bash_history already exists
    if [ -f claude.local/.bash_history ]; then
        echo "claude.local/.bash_history already exists. Skipping bash history setup."
        return
    fi

    # Create empty .bash_history file for Docker volume mount
    echo "Creating empty .bash_history file..."
    touch claude.local/.bash_history

    echo "Created claude.local/.bash_history for Docker history persistence"
}

main
