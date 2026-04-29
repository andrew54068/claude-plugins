#!/usr/bin/env bash
# export-config.sh — Emit a portable JSON bundle of a project's skills-manager config.
# Usage: export-config.sh <project-root>
set -euo pipefail

PROJECT="${1:?usage: export-config.sh <project-root>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BULLPEN="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_SKILLS_DIRS=("$PROJECT/.claude/skills" "$PROJECT/.agents/skills")
PROJECT_SETTINGS_CLAUDE="$PROJECT/.claude/settings.json"

enabled='[]'
for PSK in "${PROJECT_SKILLS_DIRS[@]}"; do
  [ -d "$PSK" ] || continue
  for entry in "$PSK"/*; do
    [ -L "$entry" ] || continue
    name="$(basename "$entry")"
    target="$(readlink "$entry")"
    case "$target" in
      "$BULLPEN/$name"|"$BULLPEN/$name/")
        enabled="$(echo "$enabled" | jq --arg n "$name" '. + [$n]')"
        ;;
    esac
  done
done
enabled="$(echo "$enabled" | jq 'unique')"

if [ -f "$PROJECT_SETTINGS_CLAUDE" ]; then
  settings="$(cat "$PROJECT_SETTINGS_CLAUDE")"
else
  settings='{}'
fi

jq -n \
  --argjson enabled  "$enabled" \
  --argjson settings "$settings" \
  --arg     exported "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{
     version: 1,
     exported_at: $exported,
     skills_enabled: $enabled,
     settings: $settings
   }'
