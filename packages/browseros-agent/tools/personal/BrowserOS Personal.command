#!/bin/bash
# Double-clickable launcher for the personal BrowserOS stack.
# Drag this file onto the Dock (right side, near the Trash) for one-click start.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
exec bun run personal:start
