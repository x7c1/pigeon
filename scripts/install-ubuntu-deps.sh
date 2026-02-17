#!/bin/bash

# Install common Ubuntu system dependencies
set -euo pipefail

echo "Installing common Ubuntu system dependencies..."

apt-get update
apt-get install -y \
    build-essential \
    curl \
    pkg-config \
    libssl-dev \
    yq \
    jq \
    tree

echo "Common Ubuntu dependencies installed successfully!"
