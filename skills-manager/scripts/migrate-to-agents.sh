#!/usr/bin/env bash
# migrate-to-agents.sh — Relocate skills-bullpen to a vendor-neutral location
# and add Codex fan-out.
#
#   ~/.claude/skills-bullpen  ->  ~/.agents/skills-bullpen
#
# Rewrites absolute bullpen targets in:
#   - ~/.claude/skills/*                    (Claude globals)
#   - <project>/.claude/skills/*            (per-project symlinks)
#
# Creates, one per .globals entry:
#   - ~/.agents/skills/<name>  ->  ~/.agents/skills-bullpen/<name>
#
# Idempotent — safe to re-run. Supports --dry-run.

set -euo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

HOME_DIR="${HOME:-/Users/$USER}"
OLD_BULLPEN="$HOME_DIR/.claude/skills-bullpen"
NEW_BULLPEN="$HOME_DIR/.agents/skills-bullpen"
CLAUDE_SKILLS="$HOME_DIR/.claude/skills"
AGENTS_SKILLS="$HOME_DIR/.agents/skills"

log()  { echo "$@"; }
note() { echo "  $@"; }
run() {
  if [ $DRY_RUN -eq 1 ]; then
    note "[DRY] $*"
  else
    note "$*"
    "$@"
  fi
}

# ---------- Step 1: relocate bullpen ----------

log "Step 1: relocate bullpen"
if [ -d "$OLD_BULLPEN" ] && [ ! -d "$NEW_BULLPEN" ]; then
  note "$OLD_BULLPEN"
  note "  → $NEW_BULLPEN"
  run mkdir -p "$HOME_DIR/.agents"
  run mv "$OLD_BULLPEN" "$NEW_BULLPEN"
elif [ -d "$NEW_BULLPEN" ] && [ ! -d "$OLD_BULLPEN" ]; then
  note "already at $NEW_BULLPEN — skipping"
elif [ -d "$NEW_BULLPEN" ] && [ -d "$OLD_BULLPEN" ]; then
  echo "ERROR: both $OLD_BULLPEN and $NEW_BULLPEN exist — resolve manually" >&2
  exit 1
else
  echo "ERROR: no bullpen found at $OLD_BULLPEN or $NEW_BULLPEN" >&2
  exit 1
fi

# ---------- Step 2+3: rewrite absolute bullpen targets ----------

rewrite_symlinks_in_dir() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  local changed=0
  for entry in "$dir"/*; do
    [ -L "$entry" ] || continue
    local name; name="$(basename "$entry")"
    local target; target="$(readlink "$entry")"
    case "$target" in
      "$OLD_BULLPEN/$name"|"$OLD_BULLPEN/$name/")
        run ln -sfn "$NEW_BULLPEN/$name" "$entry"
        changed=1
        ;;
      "$NEW_BULLPEN/$name"|"$NEW_BULLPEN/$name/")
        : # already correct
        ;;
      *)
        note "[skip] $entry → $target (not bullpen)"
        ;;
    esac
  done
  [ $changed -eq 0 ] && note "(nothing to rewrite in $dir)"
  return 0
}

log ""
log "Step 2: rewrite $CLAUDE_SKILLS/*"
rewrite_symlinks_in_dir "$CLAUDE_SKILLS"

log ""
log "Step 3: rewrite per-project symlinks"

# Find every <project>/.claude/skills dir under $HOME, skipping common noise.
find_project_skill_dirs() {
  if command -v fd >/dev/null 2>&1; then
    fd --hidden --type d --no-ignore \
       --exclude node_modules --exclude .git --exclude .Trash --exclude Library \
       --exclude .npm --exclude .cache --exclude .antigravity --exclude .cargo \
       --exclude .rustup --exclude .vscode --exclude .vscode-server --exclude .cursor \
       --exclude .nvm --exclude .pyenv --exclude .rbenv --exclude .gem \
       --exclude .bundle --exclude .docker --exclude .pnpm-store --exclude go \
       --exclude .local \
       '^skills$' "$HOME_DIR" 2>/dev/null
  else
    find "$HOME_DIR" -type d -name skills \
      -not -path '*/node_modules/*' -not -path '*/.git/*' \
      -not -path '*/.Trash/*' -not -path '*/Library/*' \
      -not -path '*/.npm/*' -not -path '*/.cache/*' \
      -not -path '*/.antigravity/*' -not -path '*/.cargo/*' \
      -not -path '*/.rustup/*' -not -path '*/.vscode/*' \
      -not -path '*/.vscode-server/*' -not -path '*/.cursor/*' \
      -not -path '*/.nvm/*' -not -path '*/.pyenv/*' -not -path '*/.rbenv/*' \
      -not -path '*/.gem/*' -not -path '*/.bundle/*' -not -path '*/.docker/*' \
      -not -path '*/.pnpm-store/*' -not -path '*/go/*' -not -path '*/.local/*' \
      2>/dev/null
  fi
}

mirror_claude_to_agents() {
  local claude_dir="${1%/}"
  local project_root; project_root="$(dirname "$(dirname "$claude_dir")")"
  local agents_dir="$project_root/.agents/skills"
  [ -d "$claude_dir" ] || return 0
  local mirrored=0
  for entry in "$claude_dir"/*; do
    [ -L "$entry" ] || continue
    local name; name="$(basename "$entry")"
    local target; target="$(readlink "$entry")"
    # Accept both OLD and NEW bullpen targets so dry-run (where rewrite
    # hasn't actually happened) still shows what the mirror will do.
    case "$target" in
      "$NEW_BULLPEN/$name"|"$NEW_BULLPEN/$name/") ;;
      "$OLD_BULLPEN/$name"|"$OLD_BULLPEN/$name/") ;;
      *) continue ;;  # only mirror bullpen symlinks
    esac
    local mirror="$agents_dir/$name"
    if [ -L "$mirror" ]; then
      continue  # already mirrored (or pointed elsewhere, leave alone)
    fi
    if [ -e "$mirror" ] && [ ! -L "$mirror" ]; then
      note "[skip] $mirror exists (not a symlink)"
      continue
    fi
    if [ $mirrored -eq 0 ]; then
      run mkdir -p "$agents_dir"
      mirrored=1
    fi
    run ln -sfn "$NEW_BULLPEN/$name" "$mirror"
  done
}

while IFS= read -r d; do
  [ -z "$d" ] && continue
  d="${d%/}"
  # parent must be .claude
  [ "$(basename "$(dirname "$d")")" = ".claude" ] || continue
  # skip the global Claude skills dir (already handled in step 2)
  [ "$d" = "$CLAUDE_SKILLS" ] && continue
  # skip anything under ~/.claude/ (plugin caches, etc. — not user projects)
  case "$d" in "$HOME_DIR/.claude/"*) continue ;; esac
  log ""
  log "  $d"
  rewrite_symlinks_in_dir "$d"
  mirror_claude_to_agents "$d"
done < <(find_project_skill_dirs)

# ---------- Step 4: Codex fan-out ----------

log ""
log "Step 4: create $AGENTS_SKILLS/* from .globals"

run mkdir -p "$AGENTS_SKILLS"

# In dry-run, the move hasn't happened yet, so .globals may still live at the
# old path. Look at both.
GLOBALS_FILE=""
for candidate in "$NEW_BULLPEN/.globals" "$OLD_BULLPEN/.globals"; do
  if [ -f "$candidate" ] && [ -s "$candidate" ]; then
    GLOBALS_FILE="$candidate"
    break
  fi
done
if [ -z "$GLOBALS_FILE" ]; then
  note "(no .globals — skipping)"
else
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    # Post-move, bullpen lives at NEW. Pre-move (dry-run), it's at OLD.
    if [ ! -d "$NEW_BULLPEN/$name" ] && [ ! -d "$OLD_BULLPEN/$name" ]; then
      note "[skip] $name: no bullpen dir"
      continue
    fi
    target="$AGENTS_SKILLS/$name"
    if [ -L "$target" ]; then
      existing="$(readlink "$target")"
      case "$existing" in
        "$NEW_BULLPEN/$name"|"$NEW_BULLPEN/$name/")
          note "(already linked: $name)"
          continue ;;
      esac
    fi
    if [ -e "$target" ] && [ ! -L "$target" ]; then
      note "[skip] $target exists (not a symlink)"
      continue
    fi
    run ln -sfn "$NEW_BULLPEN/$name" "$target"
  done < "$GLOBALS_FILE"
fi

log ""
log "Done."
if [ $DRY_RUN -eq 1 ]; then
  log "(dry-run — no changes made)"
fi
