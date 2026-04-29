#!/usr/bin/env bash
# list-projects.sh — Find all projects on this machine with a .claude/settings.json.
# Excludes $HOME/.claude itself. Prints one project-root path per line.
set -euo pipefail

HOME_DIR="${HOME:-/Users/$USER}"

emit() {
  local dir="$1"
  [ -f "$dir/settings.json" ] || return 0
  local parent
  parent="$(dirname "$dir")"
  [ "$parent" = "$HOME_DIR" ] && return 0
  echo "$parent"
}

export -f emit
export HOME_DIR

EXCLUDES=(
  node_modules .git .Trash Library .npm .cache
  .antigravity .cargo .rustup .vscode .vscode-server .cursor
  .nvm .pyenv .rbenv .gem .bundle .docker .pnpm-store
  go .local
)

if command -v fd >/dev/null 2>&1; then
  args=()
  for e in "${EXCLUDES[@]}"; do args+=(--exclude "$e"); done
  fd --hidden --type d --no-ignore "${args[@]}" '^\.claude$' "$HOME_DIR" 2>/dev/null \
    | while read -r dir; do emit "$dir"; done
else
  prunes=()
  for e in "${EXCLUDES[@]}"; do prunes+=(-not -path "*/$e/*"); done
  find "$HOME_DIR" -type d -name .claude "${prunes[@]}" 2>/dev/null \
    | while read -r dir; do emit "$dir"; done
fi
