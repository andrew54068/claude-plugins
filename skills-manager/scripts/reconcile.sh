#!/usr/bin/env bash
# reconcile.sh — Detect drift between .globals and tool-specific skills dirs.
# .globals is authoritative. Checks both ~/.claude/skills (Claude Code) and
# ~/.agents/skills (cross-vendor, e.g. Codex).
#
# Usage: reconcile.sh [--fix]
#   (default) report drift; exit 0 if clean, 1 if drift.
#   --fix    bring symlinks into sync with .globals and drop orphan .globals entries.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BULLPEN="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOME_DIR="${HOME:-/Users/$USER}"
GLOBALS_FILE="$BULLPEN/.globals"
SKILLS_DIRS=("$HOME_DIR/.claude/skills" "$HOME_DIR/.agents/skills")

FIX=0
[ "${1:-}" = "--fix" ] && FIX=1

for d in "${SKILLS_DIRS[@]}"; do mkdir -p "$d"; done
touch "$GLOBALS_FILE"

globals=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  globals+=("$line")
done < "$GLOBALS_FILE"

contains() {
  local needle="$1"; shift
  for x in "$@"; do [ "$x" = "$needle" ] && return 0; done
  return 1
}

any_drift=0
broken_globals=()

# Check broken globals once (bullpen entry missing).
for g in "${globals[@]:-}"; do
  [ -z "$g" ] && continue
  [ -d "$BULLPEN/$g" ] || broken_globals+=("$g")
done

declare -a missing_per_dir=()  # entries: "<dir>\t<name>"
declare -a extra_per_dir=()

for SKILLS in "${SKILLS_DIRS[@]}"; do
  linked=()
  for entry in "$SKILLS"/*; do
    [ -L "$entry" ] || continue
    name="$(basename "$entry")"
    target="$(readlink "$entry")"
    case "$target" in
      "$BULLPEN/$name"|"$BULLPEN/$name/") linked+=("$name") ;;
    esac
  done

  for g in "${globals[@]:-}"; do
    [ -z "$g" ] && continue
    [ -d "$BULLPEN/$g" ] || continue
    contains "$g" "${linked[@]:-}" || missing_per_dir+=("$SKILLS"$'\t'"$g")
  done

  for l in "${linked[@]:-}"; do
    [ -z "$l" ] && continue
    contains "$l" "${globals[@]:-}" || extra_per_dir+=("$SKILLS"$'\t'"$l")
  done
done

if [ "${#missing_per_dir[@]}" -eq 0 ] \
   && [ "${#extra_per_dir[@]}" -eq 0 ] \
   && [ "${#broken_globals[@]}" -eq 0 ]; then
  echo "In sync: .globals (${#globals[@]}) ↔ ${SKILLS_DIRS[*]}"
  exit 0
fi

echo "Drift detected:"
for row in "${missing_per_dir[@]:-}"; do
  [ -z "$row" ] && continue
  IFS=$'\t' read -r dir name <<<"$row"
  echo "  missing symlink: $dir/$name"
done
for row in "${extra_per_dir[@]:-}"; do
  [ -z "$row" ] && continue
  IFS=$'\t' read -r dir name <<<"$row"
  echo "  extra symlink:   $dir/$name"
done
for s in "${broken_globals[@]:-}"; do
  [ -z "$s" ] && continue
  echo "  broken global (no bullpen dir): $s"
done

if [ $FIX -eq 0 ]; then
  echo ""
  echo "Run with --fix to reconcile."
  exit 1
fi

echo ""
echo "Fixing..."
for row in "${missing_per_dir[@]:-}"; do
  [ -z "$row" ] && continue
  IFS=$'\t' read -r dir name <<<"$row"
  ln -s "$BULLPEN/$name" "$dir/$name"
  echo "  linked $dir/$name"
done
for row in "${extra_per_dir[@]:-}"; do
  [ -z "$row" ] && continue
  IFS=$'\t' read -r dir name <<<"$row"
  rm "$dir/$name"
  echo "  unlinked $dir/$name"
done
for s in "${broken_globals[@]:-}"; do
  [ -z "$s" ] && continue
  grep -vxF "$s" "$GLOBALS_FILE" > "$GLOBALS_FILE.tmp" || true
  mv "$GLOBALS_FILE.tmp" "$GLOBALS_FILE"
  echo "  removed $s from .globals (no bullpen dir)"
done
echo "Done."
