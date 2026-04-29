#!/usr/bin/env bash
# state.sh — Print JSON describing current skills/plugins/MCP state for a project.
# Usage: state.sh <project-root>
set -euo pipefail

PROJECT="${1:?usage: state.sh <project-root>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BULLPEN="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOME_DIR="${HOME:-/Users/$USER}"
GLOBALS_FILE="$BULLPEN/.globals"

# Claude-specific: plugins + MCP live here.
GLOBAL_SETTINGS_CLAUDE="$HOME_DIR/.claude/settings.json"
PROJECT_SETTINGS_CLAUDE="$PROJECT/.claude/settings.json"

# Skills are vendor-neutral: scan both tool-specific dirs.
PROJECT_SKILLS_CLAUDE="$PROJECT/.claude/skills"
PROJECT_SKILLS_AGENTS="$PROJECT/.agents/skills"
PROJECT_SKILLS_DIRS=("$PROJECT_SKILLS_CLAUDE" "$PROJECT_SKILLS_AGENTS")

# --- Skills: available ---
available='[]'
if [ -d "$BULLPEN" ]; then
  available="$(find "$BULLPEN" -maxdepth 2 -mindepth 2 -name SKILL.md -type f 2>/dev/null \
    | sed "s|$BULLPEN/||; s|/SKILL.md||" | sort | jq -R . | jq -s .)"
fi

# --- Skills: global (.globals) ---
if [ -f "$GLOBALS_FILE" ] && [ -s "$GLOBALS_FILE" ]; then
  globals="$(grep -v '^[[:space:]]*$' "$GLOBALS_FILE" | jq -R . | jq -s .)"
else
  globals='[]'
fi

# --- Skills: enabled / orphans / plain_dirs ---
# `enabled` is the UNION across both dirs (enabled for any tool in this project).
# `enabled_claude` / `enabled_agents` expose per-tool state for callers that need it.
enabled_claude='[]'
enabled_agents='[]'
orphans='[]'
plain_dirs='[]'

scan_project_skills_dir() {
  local dir="$1"
  local var="$2"  # name of the per-tool enabled var to append to
  [ -d "$dir" ] || return 0
  local entry name target abs_target
  for entry in "$dir"/*; do
    [ -e "$entry" ] || [ -L "$entry" ] || continue
    name="$(basename "$entry")"
    if [ -L "$entry" ]; then
      target="$(readlink "$entry")"
      case "$target" in
        /*) abs_target="$target" ;;
        *)  abs_target="$dir/$target" ;;
      esac
      if [ -d "$abs_target" ]; then
        eval "$var=\"\$(echo \"\$$var\" | jq --arg n \"\$name\" '. + [\$n]')\""
      else
        orphans="$(echo "$orphans" | jq --arg n "$name" --arg d "$dir" '. + [{name: $n, dir: $d}]')"
      fi
    elif [ -d "$entry" ]; then
      plain_dirs="$(echo "$plain_dirs" | jq --arg n "$name" --arg d "$dir" '. + [{name: $n, dir: $d}]')"
    fi
  done
}

scan_project_skills_dir "$PROJECT_SKILLS_CLAUDE" enabled_claude
scan_project_skills_dir "$PROJECT_SKILLS_AGENTS" enabled_agents

enabled="$(jq -n --argjson a "$enabled_claude" --argjson b "$enabled_agents" '$a + $b | unique')"

# --- Plugins ---
global_plugins='{}'; project_plugins='null'
[ -f "$GLOBAL_SETTINGS_CLAUDE"  ] && global_plugins="$(jq '.enabledPlugins // {}' "$GLOBAL_SETTINGS_CLAUDE")"
[ -f "$PROJECT_SETTINGS_CLAUDE" ] && project_plugins="$(jq '.enabledPlugins // {}' "$PROJECT_SETTINGS_CLAUDE")"

# --- MCP ---
global_mcp='{}'; project_mcp='null'
[ -f "$GLOBAL_SETTINGS_CLAUDE"  ] && global_mcp="$(jq '.mcpServers // {}' "$GLOBAL_SETTINGS_CLAUDE")"
[ -f "$PROJECT_SETTINGS_CLAUDE" ] && project_mcp="$(jq '.mcpServers // {}' "$PROJECT_SETTINGS_CLAUDE")"

jq -n \
  --argjson avail    "$available" \
  --argjson enabled  "$enabled" \
  --argjson enabled_claude "$enabled_claude" \
  --argjson enabled_agents "$enabled_agents" \
  --argjson globals  "$globals" \
  --argjson orphans  "$orphans" \
  --argjson plain    "$plain_dirs" \
  --argjson gpg      "$global_plugins" \
  --argjson ppg      "$project_plugins" \
  --argjson gmcp     "$global_mcp" \
  --argjson pmcp     "$project_mcp" \
  --arg     project  "$PROJECT" \
  --arg     config   "$([ -f "$PROJECT_SETTINGS_CLAUDE" ] && echo found || echo missing)" \
  '{
     project: $project,
     project_settings: $config,
     skills: {
       available:      $avail,
       enabled:        $enabled,
       enabled_claude: $enabled_claude,
       enabled_agents: $enabled_agents,
       global:         $globals,
       orphans:        $orphans,
       plain_dirs:     $plain
     },
     plugins: { global: $gpg, project: $ppg },
     mcp:     { global: $gmcp, project: $pmcp }
   }'
