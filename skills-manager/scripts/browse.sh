#!/usr/bin/env bash
# browse.sh — Interactive fzf picker for per-project skills / plugins / MCP.
# Usage: browse.sh <skills|plugins|mcp> <project-root>
#
# Keys:
#   space   toggle ON <-> OFF for the highlighted item (no-op on GLB)
#   ctrl-a  enable all (preserves GLB)
#   ctrl-n  disable all (preserves GLB)
#   enter   save; shows diff, asks to confirm, applies
#   esc     cancel (no changes)
#
# Exits 0 on success / no-op, 1 on cancel, 2 on usage or missing deps.

set -euo pipefail

CATEGORY="${1:-}"
PROJECT="${2:-}"

if [ -z "$CATEGORY" ] || [ -z "$PROJECT" ]; then
  echo "Usage: browse.sh <skills|plugins|mcp> <project-root>" >&2
  exit 2
fi

case "$CATEGORY" in skills|plugins|mcp) ;; *)
  echo "unknown category: $CATEGORY (expected skills|plugins|mcp)" >&2
  exit 2
;; esac

if [ ! -d "$PROJECT" ]; then
  echo "project root does not exist: $PROJECT" >&2
  exit 2
fi

PROJECT="$(cd "$PROJECT" && pwd)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BULLPEN="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOME_DIR="${HOME:-/Users/$USER}"

# Claude-specific: plugins + MCP config live in settings.json.
GLOBAL_SETTINGS_CLAUDE="$HOME_DIR/.claude/settings.json"
PROJECT_SETTINGS_CLAUDE="$PROJECT/.claude/settings.json"

# Skills are vendor-neutral: mirror across tool-specific skill dirs.
PROJECT_SKILLS_DIRS=("$PROJECT/.claude/skills" "$PROJECT/.agents/skills")

command -v fzf >/dev/null || { echo "fzf required (brew install fzf)" >&2; exit 2; }
command -v jq  >/dev/null || { echo "jq required (brew install jq)"   >&2; exit 2; }

state_json="$("$SCRIPT_DIR/state.sh" "$PROJECT")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STATE="$TMP/state.tsv"
ORIG="$TMP/original.tsv"

# ----- Build initial state TSV: STATUS<TAB>NAME<TAB>DESC -----

build_skills() {
  echo "$state_json" | jq -r '
    ((.skills.global  // []) | map({(.): "GLB"}) | add // {}) as $g |
    ((.skills.enabled // []) | map({(.): "ON"})  | add // {}) as $e |
    (.skills.available // [])[] | [ ($g[.] // $e[.] // "OFF"), . ] | @tsv
  ' | while IFS=$'\t' read -r status name; do
    desc=""
    local skill_md="$BULLPEN/$name/SKILL.md"
    if [ -f "$skill_md" ]; then
      desc="$(awk '
        /^---[[:space:]]*$/ { c++; next }
        c == 1 && /^description:/ {
          sub(/^description:[[:space:]]*/, "")
          sub(/[[:space:]]+$/, "")
          print
          exit
        }
      ' "$skill_md")"
    fi
    printf '%s\t%s\t%s\n' "$status" "$name" "$desc"
  done
}

build_plugins() {
  # Project override replaces global entirely once written, but the UI starts
  # from effective state: project value if set, else global.
  echo "$state_json" | jq -r '
    (.plugins.global  // {}) as $g |
    (.plugins.project // {}) as $p |
    (.plugins.project // .plugins.global // {}) as $eff |
    ($g | to_entries | map(.key)) as $gk |
    ($p | to_entries | map(.key)) as $pk |
    (($gk + $pk) | unique)[] as $name |
    [ (if ($eff[$name] == true) then "ON" else "OFF" end), $name, "" ] | @tsv
  '
}

build_mcp() {
  # ON   = configured in project settings
  # GLB  = configured globally, not overridden in project
  # (No OFF because MCP is identity + config, not a boolean toggle.)
  echo "$state_json" | jq -r '
    ((.mcp.global  // {}) | keys_unsorted) as $g |
    ((.mcp.project // {}) | keys_unsorted) as $p |
    (($g + $p) | unique)[] as $name |
    [
      (if ($p | index($name)) then "ON"
       elif ($g | index($name)) then "GLB"
       else "OFF" end),
      $name,
      ""
    ] | @tsv
  '
}

case "$CATEGORY" in
  skills)  build_skills  > "$STATE" ;;
  plugins) build_plugins > "$STATE" ;;
  mcp)     build_mcp     > "$STATE" ;;
esac

if [ ! -s "$STATE" ]; then
  echo "Nothing to configure for $CATEGORY." >&2
  exit 0
fi

cp "$STATE" "$ORIG"

# ----- Helper scripts for fzf bindings -----

cat > "$TMP/render" <<'RENDER_EOF'
#!/usr/bin/env bash
# Render STATE TSV as fzf-ready lines (tab-separated after rendering):
#   <colored-status>\t<name>\t<desc>
set -euo pipefail
while IFS=$'\t' read -r status name desc; do
  case "$status" in
    ON)  printf '\033[32m[ON] \033[0m\t%s\t%s\n' "$name" "$desc" ;;
    OFF) printf '\033[90m[OFF]\033[0m\t%s\t%s\n' "$name" "$desc" ;;
    GLB) printf '\033[36m[GLB]\033[0m\t%s\t%s  (global — always on)\n' "$name" "$desc" ;;
  esac
done < "$1"
RENDER_EOF
chmod +x "$TMP/render"

cat > "$TMP/toggle" <<'TOGGLE_EOF'
#!/usr/bin/env bash
# Flip ON<->OFF for target NAME in STATE TSV. GLB is a no-op.
set -euo pipefail
f="$1"; target="$2"
tmp="$(mktemp)"
while IFS=$'\t' read -r status name desc; do
  if [ "$name" = "$target" ]; then
    case "$status" in
      ON)  status=OFF ;;
      OFF) status=ON  ;;
    esac
  fi
  printf '%s\t%s\t%s\n' "$status" "$name" "$desc"
done < "$f" > "$tmp"
mv "$tmp" "$f"
TOGGLE_EOF
chmod +x "$TMP/toggle"

cat > "$TMP/bulk" <<'BULK_EOF'
#!/usr/bin/env bash
# Set all non-GLB rows to $2 (ON or OFF).
set -euo pipefail
f="$1"; new_status="$2"
tmp="$(mktemp)"
awk -F'\t' -v OFS='\t' -v s="$new_status" '$1!="GLB"{$1=s} 1' "$f" > "$tmp"
mv "$tmp" "$f"
BULK_EOF
chmod +x "$TMP/bulk"

# ----- Run fzf -----

bind_space=$(printf 'space:execute-silent(%q %q {2})+reload(%q %q)' \
  "$TMP/toggle" "$STATE" "$TMP/render" "$STATE")
bind_all_on=$(printf 'ctrl-a:execute-silent(%q %q ON)+reload(%q %q)' \
  "$TMP/bulk" "$STATE" "$TMP/render" "$STATE")
bind_all_off=$(printf 'ctrl-n:execute-silent(%q %q OFF)+reload(%q %q)' \
  "$TMP/bulk" "$STATE" "$TMP/render" "$STATE")

header="space toggle · ctrl-a all on · ctrl-n all off · enter save · esc cancel"
header="$header   [$CATEGORY @ $(basename "$PROJECT")]"

set +e
"$TMP/render" "$STATE" | fzf \
  --ansi \
  --delimiter=$'\t' \
  --with-nth=1,2,3 \
  --nth=2 \
  --no-sort \
  --height=90% \
  --reverse \
  --header="$header" \
  --bind="$bind_space" \
  --bind="$bind_all_on" \
  --bind="$bind_all_off" \
  --bind="enter:accept" \
  > /dev/null
rc=$?
set -e

if [ $rc -ne 0 ]; then
  echo "Cancelled." >&2
  exit 1
fi

# ----- Compute diff -----
#
# Implementation note: we use awk here because bash's `read` with IFS=$'\t'
# COALESCES consecutive tabs (tab is IFS-whitespace), collapsing the empty
# desc field between the two pasted rows and shifting all later fields by one.
# That silently made every toggle a no-op before awk was used here.

to_enable=()
to_disable=()
while IFS=$'\t' read -r action name; do
  [ -z "$action" ] && continue
  case "$action" in
    enable)  to_enable+=("$name")  ;;
    disable) to_disable+=("$name") ;;
  esac
done < <(paste "$ORIG" "$STATE" | awk -F'\t' '
  $1 != $4 {
    if      ($1 == "OFF" && $4 == "ON")  print "enable\t"  $2
    else if ($1 == "ON"  && $4 == "OFF") print "disable\t" $2
  }
')

if [ ${#to_enable[@]} -eq 0 ] && [ ${#to_disable[@]} -eq 0 ]; then
  echo "No changes."
  exit 0
fi

echo
echo "Pending changes ($CATEGORY):"
[ ${#to_enable[@]}  -gt 0 ] && printf '  Enable:  %s\n' "${to_enable[*]}"
[ ${#to_disable[@]} -gt 0 ] && printf '  Disable: %s\n' "${to_disable[*]}"
echo

read -r -p "Apply? [y/N] " answer
case "$answer" in
  y|Y|yes|YES) ;;
  *) echo "Aborted."; exit 1 ;;
esac

# ----- Apply -----

apply_skills() {
  for PSK in "${PROJECT_SKILLS_DIRS[@]}"; do
    mkdir -p "$PSK"
    for name in "${to_enable[@]}"; do
      ln -sfn "$BULLPEN/$name" "$PSK/$name"
    done
    for name in "${to_disable[@]}"; do
      local target="$PSK/$name"
      if [ -L "$target" ]; then
        rm "$target"
      elif [ -e "$target" ]; then
        echo "Warning: $target is not a symlink; leaving it alone." >&2
      fi
    done
  done
}

apply_plugins() {
  mkdir -p "$(dirname "$PROJECT_SETTINGS_CLAUDE")"
  [ -f "$PROJECT_SETTINGS_CLAUDE" ] || echo '{}' > "$PROJECT_SETTINGS_CLAUDE"
  # Project override replaces global entirely — emit every plugin explicitly.
  local plugins_obj
  plugins_obj="$(awk -F'\t' '
    BEGIN { printf "{" }
    { if (NR > 1) printf ","
      printf "\"%s\":%s", $2, ($1 == "ON" ? "true" : "false") }
    END { printf "}" }
  ' "$STATE")"
  local tmp
  tmp="$(mktemp)"
  jq --argjson p "$plugins_obj" '.enabledPlugins = $p' "$PROJECT_SETTINGS_CLAUDE" > "$tmp"
  mv "$tmp" "$PROJECT_SETTINGS_CLAUDE"
}

apply_mcp() {
  mkdir -p "$(dirname "$PROJECT_SETTINGS_CLAUDE")"
  [ -f "$PROJECT_SETTINGS_CLAUDE" ] || echo '{}' > "$PROJECT_SETTINGS_CLAUDE"
  local tmp
  for name in "${to_enable[@]}"; do
    local cfg
    cfg="$(jq --arg n "$name" '.mcpServers[$n] // empty' "$GLOBAL_SETTINGS_CLAUDE" 2>/dev/null || echo '')"
    if [ -z "$cfg" ] || [ "$cfg" = "null" ]; then
      echo "Warning: '$name' has no global MCP config to copy; skipping." >&2
      continue
    fi
    tmp="$(mktemp)"
    jq --arg n "$name" --argjson c "$cfg" '.mcpServers //= {} | .mcpServers[$n] = $c' \
      "$PROJECT_SETTINGS_CLAUDE" > "$tmp"
    mv "$tmp" "$PROJECT_SETTINGS_CLAUDE"
  done
  for name in "${to_disable[@]}"; do
    tmp="$(mktemp)"
    jq --arg n "$name" 'if .mcpServers then .mcpServers |= del(.[$n]) else . end' \
      "$PROJECT_SETTINGS_CLAUDE" > "$tmp"
    mv "$tmp" "$PROJECT_SETTINGS_CLAUDE"
  done
}

case "$CATEGORY" in
  skills)  apply_skills  ;;
  plugins) apply_plugins ;;
  mcp)     apply_mcp     ;;
esac

# ----- Summary -----

echo
echo "Applied ($CATEGORY):"
[ ${#to_enable[@]}  -gt 0 ] && printf '  Enabled:  %s\n' "${to_enable[*]}"
[ ${#to_disable[@]} -gt 0 ] && printf '  Disabled: %s\n' "${to_disable[*]}"
case "$CATEGORY" in
  skills)   echo "  Symlinks: ${PROJECT_SKILLS_DIRS[*]}" ;;
  plugins)  echo "  Wrote:    $PROJECT_SETTINGS_CLAUDE (enabledPlugins)" ;;
  mcp)      echo "  Wrote:    $PROJECT_SETTINGS_CLAUDE (mcpServers)" ;;
esac
