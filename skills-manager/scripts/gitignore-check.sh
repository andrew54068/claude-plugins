#!/usr/bin/env bash
# gitignore-check.sh — Check whether project .gitignore excludes .claude/skills.
# Usage: gitignore-check.sh <project-root>
# Exit 0 if covered (or not a git repo); exit 1 if missing.
set -euo pipefail

PROJECT="${1:?usage: gitignore-check.sh <project-root>}"
GITIGNORE="$PROJECT/.gitignore"

if [ ! -e "$PROJECT/.git" ]; then
  echo "not a git repo, skipping: $PROJECT"
  exit 0
fi

patterns=(
  '.claude/skills'
  '.claude/skills/'
  '.claude/skills/*'
  '.claude/'
  '.claude'
  '/.claude/skills'
  '/.claude/'
)

if [ -f "$GITIGNORE" ]; then
  for p in "${patterns[@]}"; do
    if grep -qxF "$p" "$GITIGNORE"; then
      echo "ok: .gitignore covers .claude/skills via pattern: $p"
      exit 0
    fi
  done
fi

cat <<EOF
MISSING: $GITIGNORE does not exclude .claude/skills/

Suggested addition:
  .claude/skills/

Rationale: symlinks in .claude/skills/ point to machine-specific bullpen paths
(\$HOME/.claude/skills-bullpen/...) and should not be committed.
EOF
exit 1
