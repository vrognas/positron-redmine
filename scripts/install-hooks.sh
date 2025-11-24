#!/usr/bin/env bash
#
# Install git hooks for the repository

set -e

# Get the repository root (exit silently if not a git repo)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

HOOKS_DIR="$REPO_ROOT/.git/hooks"
SCRIPTS_DIR="$REPO_ROOT/scripts"

# Skip if .git doesn't exist (CI environment)
if [ ! -d "$REPO_ROOT/.git" ]; then
  exit 0
fi

# Install commit-msg hook
echo "Installing commit-msg hook..."
cp "$SCRIPTS_DIR/commit-msg" "$HOOKS_DIR/commit-msg"
chmod +x "$HOOKS_DIR/commit-msg"

echo "✓ Hooks installed successfully"
echo ""
echo "Installed hooks:"
echo "  - commit-msg: Validates commit message format"
echo "    • Subject line ≤ 50 chars"
echo "    • Blank line between subject and body"
echo "    • Body lines ≤ 72 chars"
echo "    • Exceptions: merge commits, revert commits"
