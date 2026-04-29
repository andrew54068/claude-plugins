#!/usr/bin/env bash
# toggle-global.sh — Add or remove a skill from global scope.
# Keeps .globals and ~/.claude/skills/<name> symlink in sync.
# Usage: toggle-global.sh <skill-name> on|off
set -euo pipefail

NAME="${1:?usage: toggle-global.sh <skill-name> on|off}"
STATE="${2:?usage: toggle-global.sh <skill-name> on|off}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BULLPEN="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOME_DIR="${HOME:-/Users/$USER}"
GLOBALS_FILE="$BULLPEN/.globals"
SKILLS_DIRS=("$HOME_DIR/.claude/skills" "$HOME_DIR/.agents/skills")

if [ ! -d "$BULLPEN/$NAME" ]; then
  echo "toggle-global.sh: skill not found in bullpen: $NAME" >&2
  exit 1
fi

for d in "${SKILLS_DIRS[@]}"; do mkdir -p "$d"; done
touch "$GLOBALS_FILE"

case "$STATE" in
  on)
    if ! grep -qxF "$NAME" "$GLOBALS_FILE"; then
      echo "$NAME" >> "$GLOBALS_FILE"
      echo "added $NAME to .globals"
    else
      echo "already in .globals: $NAME"
    fi
    for SKILLS in "${SKILLS_DIRS[@]}"; do
      if [ ! -e "$SKILLS/$NAME" ] && [ ! -L "$SKILLS/$NAME" ]; then
        ln -s "$BULLPEN/$NAME" "$SKILLS/$NAME"
        echo "linked $SKILLS/$NAME -> $BULLPEN/$NAME"
      else
        echo "already linked: $SKILLS/$NAME"
      fi
    done
    ;;
  off)
    if grep -qxF "$NAME" "$GLOBALS_FILE"; then
      grep -vxF "$NAME" "$GLOBALS_FILE" > "$GLOBALS_FILE.tmp" || true
      mv "$GLOBALS_FILE.tmp" "$GLOBALS_FILE"
      echo "removed $NAME from .globals"
    fi
    for SKILLS in "${SKILLS_DIRS[@]}"; do
      if [ -L "$SKILLS/$NAME" ]; then
        target="$(readlink "$SKILLS/$NAME")"
        case "$target" in
          "$BULLPEN/$NAME"|"$BULLPEN/$NAME/")
            rm "$SKILLS/$NAME"
            echo "removed symlink $SKILLS/$NAME"
            ;;
          *)
            echo "WARN: $SKILLS/$NAME points to $target (not bullpen) — leaving alone" >&2
            ;;
        esac
      fi
    done
    ;;
  *)
    echo "toggle-global.sh: state must be 'on' or 'off', got: $STATE" >&2
    exit 1
    ;;
esac
