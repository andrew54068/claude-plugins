#!/usr/bin/env bash
# migrate.sh — One-time migration of skills into the vendor-neutral bullpen
# Part of skills-manager. Safe to re-run (idempotent).
set -euo pipefail

CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
AGENTS_SKILLS_DIR="$HOME/.agents/skills"
BULLPEN="$HOME/.agents/skills-bullpen"
OLD_BULLPEN="$HOME/.claude/skills-bullpen"
SETTINGS="$HOME/.claude/settings.json"
HOOKS_DIR="$HOME/.claude/hooks"
GLOBALS_FILE="$BULLPEN/.globals"

# Skills to delete outright
DELETE_LIST="continuous-learning continuous-learning-v2"

# Counters
moved=0
kept_symlinks=0
deleted=0
linked_globals=0
patched_files=0

# Helper: check if a value is in a newline-separated list
in_list() {
  local needle="$1" haystack="$2"
  echo "$haystack" | grep -qx "$needle" 2>/dev/null
}

# -- 1. Idempotency ----------------------------------------------------------
if [ -d "$BULLPEN" ]; then
  echo "SKIP: Bullpen already exists"
  exit 0
fi

if [ -d "$OLD_BULLPEN" ]; then
  echo "ERROR: legacy bullpen exists at $OLD_BULLPEN" >&2
  echo "Run migrate-to-agents.sh to relocate it to $BULLPEN." >&2
  exit 1
fi

echo "=== Skills-Manager Migration ==="
echo ""

# -- 2. Create bullpen -------------------------------------------------------
mkdir -p "$BULLPEN"
echo "Created $BULLPEN"

# -- 3. Leave existing external symlinks alone -------------------------------
echo ""
echo "--- Checking existing Claude skills/ symlinks ---"
for entry in "$CLAUDE_SKILLS_DIR"/*/; do
  [ -d "$entry" ] || continue
  name="$(basename "$entry")"
  if [ -L "$CLAUDE_SKILLS_DIR/$name" ]; then
    target="$(readlink "$CLAUDE_SKILLS_DIR/$name")"
    echo "  Keeping symlink: $name -> $target"
    kept_symlinks=$((kept_symlinks + 1))
  fi
done

# -- 4. Delete continuous-learning skills -----------------------------------
echo ""
echo "--- Deleting deprecated skills ---"
for name in $DELETE_LIST; do
  if [ -d "$CLAUDE_SKILLS_DIR/$name" ] && [ ! -L "$CLAUDE_SKILLS_DIR/$name" ]; then
    rm -rf "$CLAUDE_SKILLS_DIR/$name"
    echo "  Deleted: $name"
    deleted=$((deleted + 1))
  fi
done

# -- 5. Move real skills to bullpen -----------------------------------------
echo ""
echo "--- Moving skills to bullpen ---"
for entry in "$CLAUDE_SKILLS_DIR"/*/; do
  [ -d "$entry" ] || continue
  name="$(basename "$entry")"

  # Skip symlinks (should already be removed, but be safe)
  [ -L "$CLAUDE_SKILLS_DIR/$name" ] && continue

  # Skip workspace dirs
  case "$name" in
    *-workspace) echo "  Skipping workspace: $name"; continue ;;
  esac

  # Skip learned/
  [ "$name" = "learned" ] && continue

  # Skip non-skills (no SKILL.md)
  if [ ! -f "$CLAUDE_SKILLS_DIR/$name/SKILL.md" ]; then
    echo "  Skipping non-skill: $name"
    continue
  fi

  # Move to bullpen
  mv "$CLAUDE_SKILLS_DIR/$name" "$BULLPEN/$name"
  echo "  Moved: $name"
  moved=$((moved + 1))
done

# -- 6. Clean up learned/ if empty ------------------------------------------
if [ -d "$CLAUDE_SKILLS_DIR/learned" ]; then
  if [ -z "$(ls -A "$CLAUDE_SKILLS_DIR/learned" 2>/dev/null)" ]; then
    rmdir "$CLAUDE_SKILLS_DIR/learned"
    echo ""
    echo "Removed empty learned/ directory"
  fi
fi

# -- 7. Remove continuous-learning hooks from settings.json ------------------
echo ""
echo "--- Cleaning hooks from settings.json ---"
if [ -f "$SETTINGS" ]; then
  cp "$SETTINGS" "$SETTINGS.bak"

  jq 'if .hooks then .hooks = (.hooks | to_entries | map(.value = (.value | map(select(.hooks | all(.command | test("continuous-learning") | not))))) | map(select(.value | length > 0)) | from_entries) else . end' \
    "$SETTINGS" > "$SETTINGS.tmp" && mv "$SETTINGS.tmp" "$SETTINGS"

  echo "  Removed continuous-learning hook entries"
  echo "  Backup saved to $SETTINGS.bak"
else
  echo "  WARNING: $SETTINGS not found, skipping hook cleanup"
fi

# -- 8. Auto-detect global requirements -------------------------------------
echo ""
echo "--- Detecting global skills ---"

# Build newline-separated list of skill names in bullpen
bullpen_names=""
for entry in "$BULLPEN"/*/; do
  [ -d "$entry" ] || continue
  name="$(basename "$entry")"
  if [ -z "$bullpen_names" ]; then
    bullpen_names="$name"
  else
    bullpen_names="$bullpen_names
$name"
  fi
done

# Newline-separated list of detected globals
globals=""

# Pass 1: Scan hook command values in settings.json for skill references.
if [ -f "$SETTINGS" ]; then
  hook_commands="$(jq -r '.hooks // {} | to_entries[] | .value[] | .hooks[]? | .command // empty' "$SETTINGS" 2>/dev/null || true)"

  while IFS= read -r cmd; do
    [ -z "$cmd" ] && continue
    skill_name="$(echo "$cmd" | grep -oE '(\.claude/skills|\.agents/skills|\.agents/skills-bullpen)/([^/]+)' | head -1 | awk -F/ '{print $NF}' || true)"
    if [ -n "$skill_name" ] && in_list "$skill_name" "$bullpen_names"; then
      if ! in_list "$skill_name" "$globals"; then
        if [ -z "$globals" ]; then
          globals="$skill_name"
        else
          globals="$globals
$skill_name"
        fi
        echo "  Pass 1 (hooks config): $skill_name (referenced by hook command)"
      fi
    fi
  done <<< "$hook_commands"
fi

# Pass 2: Scan ~/.claude/hooks/*.sh script contents for bullpen skill names.
if [ -d "$HOOKS_DIR" ]; then
  for hook_script in "$HOOKS_DIR"/*.sh; do
    [ -f "$hook_script" ] || continue
    hook_basename="$(basename "$hook_script")"
    while IFS= read -r skill_name; do
      [ -z "$skill_name" ] && continue
      if grep -q "$skill_name" "$hook_script" 2>/dev/null; then
        if ! in_list "$skill_name" "$globals"; then
          if [ -z "$globals" ]; then
            globals="$skill_name"
          else
            globals="$globals
$skill_name"
          fi
          echo "  Pass 2 (hook scripts): $skill_name (referenced in $hook_basename)"
        fi
      fi
    done <<< "$bullpen_names"
  done
fi

# -- 9. Symlink globals for Claude and cross-vendor agents -------------------
echo ""
echo "--- Symlinking global skills ---"
: > "$GLOBALS_FILE"
mkdir -p "$CLAUDE_SKILLS_DIR" "$AGENTS_SKILLS_DIR"

if [ -n "$globals" ]; then
  while IFS= read -r skill_name; do
    [ -z "$skill_name" ] && continue
    if [ -d "$BULLPEN/$skill_name" ]; then
      [ -e "$CLAUDE_SKILLS_DIR/$skill_name" ] || ln -s "$BULLPEN/$skill_name" "$CLAUDE_SKILLS_DIR/$skill_name"
      [ -e "$AGENTS_SKILLS_DIR/$skill_name" ] || ln -s "$BULLPEN/$skill_name" "$AGENTS_SKILLS_DIR/$skill_name"
      echo "$skill_name" >> "$GLOBALS_FILE"
      echo "  Linked: $CLAUDE_SKILLS_DIR/$skill_name -> $BULLPEN/$skill_name"
      echo "  Linked: $AGENTS_SKILLS_DIR/$skill_name -> $BULLPEN/$skill_name"
      linked_globals=$((linked_globals + 1))
    fi
  done <<< "$globals"
else
  echo "  (none detected)"
fi

# -- 10. Path reference patching --------------------------------------------
echo ""
echo "--- Patching path references ---"

while IFS= read -r skill_name; do
  [ -z "$skill_name" ] && continue

  # Skip globals — they stay accessible at the old path via symlink
  if in_list "$skill_name" "$globals" 2>/dev/null; then
    continue
  fi

  old_ref_tilde="~/.claude/skills/$skill_name"
  new_ref_tilde="~/.agents/skills-bullpen/$skill_name"

  # Scan bullpen files for tilde-style references
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if grep -q "$old_ref_tilde" "$file" 2>/dev/null; then
      sed -i '' "s|$old_ref_tilde|$new_ref_tilde|g" "$file"
      echo "  Patched (tilde): $file"
      patched_files=$((patched_files + 1))
    fi
  done < <(find "$BULLPEN" -type f \( -name '*.sh' -o -name '*.md' -o -name '*.json' -o -name '*.yaml' -o -name '*.yml' \) 2>/dev/null)

  # Scan hooks dir for tilde-style references.
  if [ -d "$HOOKS_DIR" ]; then
    while IFS= read -r file; do
      [ -z "$file" ] && continue
      if grep -q "$old_ref_tilde" "$file" 2>/dev/null; then
        sed -i '' "s|$old_ref_tilde|$new_ref_tilde|g" "$file"
        echo "  Patched (tilde): $file"
        patched_files=$((patched_files + 1))
      fi
    done < <(find "$HOOKS_DIR" -type f -name '*.sh' 2>/dev/null)
  fi

  # Scan bullpen files for $HOME-style references.
  old_ref_home="\$HOME/.claude/skills/$skill_name"
  new_ref_home="\$HOME/.agents/skills-bullpen/$skill_name"
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if grep -qF "\$HOME/.claude/skills/$skill_name" "$file" 2>/dev/null; then
      sed -i '' "s|\$HOME/.claude/skills/$skill_name|\$HOME/.agents/skills-bullpen/$skill_name|g" "$file"
      echo "  Patched (\$HOME): $file"
      patched_files=$((patched_files + 1))
    fi
  done < <(find "$BULLPEN" -type f \( -name '*.sh' -o -name '*.md' -o -name '*.json' -o -name '*.yaml' -o -name '*.yml' \) 2>/dev/null)

  if [ -d "$HOOKS_DIR" ]; then
    while IFS= read -r file; do
      [ -z "$file" ] && continue
      if grep -qF "\$HOME/.claude/skills/$skill_name" "$file" 2>/dev/null; then
        sed -i '' "s|\$HOME/.claude/skills/$skill_name|\$HOME/.agents/skills-bullpen/$skill_name|g" "$file"
        echo "  Patched (\$HOME): $file"
        patched_files=$((patched_files + 1))
      fi
    done < <(find "$HOOKS_DIR" -type f -name '*.sh' 2>/dev/null)
  fi
  # Scan for legacy bullpen references too.
  old_bullpen_ref_tilde="~/.claude/skills-bullpen/$skill_name"
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if grep -q "$old_bullpen_ref_tilde" "$file" 2>/dev/null; then
      sed -i '' "s|$old_bullpen_ref_tilde|$new_ref_tilde|g" "$file"
      echo "  Patched (legacy tilde): $file"
      patched_files=$((patched_files + 1))
    fi
  done < <(find "$BULLPEN" -type f \( -name '*.sh' -o -name '*.md' -o -name '*.json' -o -name '*.yaml' -o -name '*.yml' \) 2>/dev/null)

  if [ -d "$HOOKS_DIR" ]; then
    while IFS= read -r file; do
      [ -z "$file" ] && continue
      if grep -q "$old_bullpen_ref_tilde" "$file" 2>/dev/null; then
        sed -i '' "s|$old_bullpen_ref_tilde|$new_ref_tilde|g" "$file"
        echo "  Patched (legacy tilde): $file"
        patched_files=$((patched_files + 1))
      fi
    done < <(find "$HOOKS_DIR" -type f -name '*.sh' 2>/dev/null)
  fi

  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if grep -qF "\$HOME/.claude/skills-bullpen/$skill_name" "$file" 2>/dev/null; then
      sed -i '' "s|\$HOME/.claude/skills-bullpen/$skill_name|\$HOME/.agents/skills-bullpen/$skill_name|g" "$file"
      echo "  Patched (legacy \$HOME): $file"
      patched_files=$((patched_files + 1))
    fi
  done < <(find "$BULLPEN" -type f \( -name '*.sh' -o -name '*.md' -o -name '*.json' -o -name '*.yaml' -o -name '*.yml' \) 2>/dev/null)

  if [ -d "$HOOKS_DIR" ]; then
    while IFS= read -r file; do
      [ -z "$file" ] && continue
      if grep -qF "\$HOME/.claude/skills-bullpen/$skill_name" "$file" 2>/dev/null; then
        sed -i '' "s|\$HOME/.claude/skills-bullpen/$skill_name|\$HOME/.agents/skills-bullpen/$skill_name|g" "$file"
        echo "  Patched (legacy \$HOME): $file"
        patched_files=$((patched_files + 1))
      fi
    done < <(find "$HOOKS_DIR" -type f -name '*.sh' 2>/dev/null)
  fi
done <<< "$bullpen_names"

# -- 11. Summary -------------------------------------------------------------
echo ""
echo "=== Migration Summary ==="
echo "  Moved to bullpen:     $moved"
echo "  Existing symlinks kept: $kept_symlinks"
echo "  Deleted (deprecated): $deleted"
echo "  Linked as global:     $linked_globals"
echo "  Patched files:        $patched_files"
echo ""
echo "Bullpen: $BULLPEN"
echo "Globals: $GLOBALS_FILE"
echo ""
echo "Migration complete. Review the output above, then verify with:"
echo "  ls -la $CLAUDE_SKILLS_DIR"
echo "  ls -la $AGENTS_SKILLS_DIR"
echo "  ls -la $BULLPEN"
