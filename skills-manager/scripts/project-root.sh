#!/usr/bin/env bash
# project-root.sh — Print the closest ancestor containing .git or .claude/.
# Skips $HOME so the global config dir is never treated as a project.
# Exits 0 with the path on success; 1 if no project root found; 2 on bad input.
set -euo pipefail

start="${1:-$PWD}"

if [ ! -d "$start" ]; then
  echo "project-root.sh: not a directory: $start" >&2
  exit 2
fi

dir="$(cd "$start" && pwd)"
home="${HOME:-}"

while true; do
  if [ -n "$home" ] && [ "$dir" = "$home" ]; then
    :  # Skip $HOME — treating it as a project would clobber global config.
  elif [ -e "$dir/.git" ] || [ -d "$dir/.claude" ]; then
    echo "$dir"
    exit 0
  fi
  parent="$(dirname "$dir")"
  if [ "$parent" = "$dir" ]; then
    echo "project-root.sh: no .git or .claude/ found in ancestry of $start (excluding \$HOME)" >&2
    exit 1
  fi
  dir="$parent"
done
