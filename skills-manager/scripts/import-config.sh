#!/usr/bin/env bash
# import-config.sh — Apply an exported config bundle to a project.
# Usage: import-config.sh <project-root> [--dry-run]  (bundle on stdin)
set -euo pipefail

PROJECT="${1:?usage: import-config.sh <project-root> [--dry-run]}"
DRY_RUN=0
[ "${2:-}" = "--dry-run" ] && DRY_RUN=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BULLPEN="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_DIR="$PROJECT/.claude"
PROJECT_SKILLS_DIRS=("$PROJECT/.claude/skills" "$PROJECT/.agents/skills")
PROJECT_SETTINGS_CLAUDE="$PROJECT_DIR/settings.json"

bundle="$(cat)"

if ! echo "$bundle" | jq -e '.version == 1' > /dev/null; then
  echo "import-config.sh: unsupported bundle (need version: 1)" >&2
  exit 1
fi

wanted=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  wanted+=("$line")
done < <(echo "$bundle" | jq -r '.skills_enabled[]?')
settings="$(echo "$bundle" | jq '.settings')"

if [ $DRY_RUN -eq 1 ]; then
  echo "-- would enable skills --"
  printf '  %s\n' "${wanted[@]:-}"
  echo "-- would write $PROJECT_SETTINGS_CLAUDE --"
  echo "$settings"
  exit 0
fi

for PSK in "${PROJECT_SKILLS_DIRS[@]}"; do
  mkdir -p "$PSK"
done

for name in "${wanted[@]:-}"; do
  [ -z "$name" ] && continue
  if [ ! -d "$BULLPEN/$name" ]; then
    echo "WARN: not in bullpen, skipping: $name" >&2
    continue
  fi
  for PSK in "${PROJECT_SKILLS_DIRS[@]}"; do
    if [ -e "$PSK/$name" ] || [ -L "$PSK/$name" ]; then
      echo "skip (exists): $PSK/$name"
      continue
    fi
    ln -s "$BULLPEN/$name" "$PSK/$name"
    echo "linked $PSK/$name"
  done
done

echo "$settings" | jq . > "$PROJECT_SETTINGS_CLAUDE"
echo "wrote $PROJECT_SETTINGS_CLAUDE"
