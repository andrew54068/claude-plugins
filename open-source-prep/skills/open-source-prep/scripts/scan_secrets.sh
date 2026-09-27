#!/usr/bin/env bash
#
# scan_secrets.sh — Dependency-free secret/PII scanner for open-sourcing prep.
#
# Read-only. Never modifies the repo. Scans two surfaces that a public release
# exposes:
#   1. TRACKED WORKING TREE  — files `git` will publish (git ls-files)
#   2. FULL GIT HISTORY      — every added line across all branches (git log --all -p)
# Plus a filename sweep for high-risk files (.env, *.pem, id_rsa, ...) whether or
# not they are tracked, because an untracked-but-not-ignored secret file is one
# `git add .` away from being published.
#
# Uses ripgrep (rg) if available for speed, else falls back to grep -E.
# Exit code: 0 = clean, 1 = potential secrets found, 2 = not a git repo / usage error.
#
# Usage:
#   scan_secrets.sh [--worktree-only] [--history-only] [repo_path]
#
# The patterns intentionally err toward FLAGGING (false positives are cheap; a
# leaked credential in a public repo is not). Every hit is for a human to triage
# — this script decides nothing and rotates nothing.

set -uo pipefail

MODE="both"
REPO="."
for arg in "$@"; do
  case "$arg" in
    --worktree-only) MODE="worktree" ;;
    --history-only)  MODE="history" ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) REPO="$arg" ;;
  esac
done

cd "$REPO" 2>/dev/null || { echo "ERROR: cannot cd to '$REPO'" >&2; exit 2; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "ERROR: '$REPO' is not a git repository." >&2; exit 2; }

# --- Pattern catalog -------------------------------------------------------
# Kept in one place; also documented in references/secret-patterns.md.
# Each entry: "label|||ERE-pattern". Case-insensitive matching is applied.
PATTERNS=(
  "Private key block|||-----BEGIN [A-Z ]*PRIVATE KEY-----"
  "AWS access key id|||AKIA[0-9A-Z]{16}"
  "AWS secret access key (assignment)|||aws.{0,20}(secret|access).{0,20}[=:].{0,5}[A-Za-z0-9/+]{40}"
  "GitHub token|||(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}"
  "GitHub fine-grained PAT|||github_pat_[A-Za-z0-9_]{22,}"
  "Google API key|||AIza[0-9A-Za-z_-]{35}"
  "Slack token|||xox[baprs]-[0-9A-Za-z-]{10,}"
  "Slack webhook|||hooks\.slack\.com/services/[A-Za-z0-9/]+"
  "Stripe live key|||(sk|rk)_live_[0-9A-Za-z]{16,}"
  "Twilio account SID|||AC[0-9a-fA-F]{32}"
  "SendGrid key|||SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}"
  "npm token|||npm_[A-Za-z0-9]{36}"
  "OpenAI / sk- key|||sk-[A-Za-z0-9]{20,}"
  "JWT|||eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"
  "Generic secret assignment|||(password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|private[_-]?key)[\"' ]*[=:][\"' ]*[A-Za-z0-9/+._-]{8,}"
  "Connection string with creds|||[a-z][a-z0-9+.-]*://[^/\s:@]+:[^/\s:@]+@"
)

# High-risk filename globs (checked whether tracked or not).
RISKY_GLOBS=(
  ".env" ".env.*" "*.pem" "*.key" "*.pfx" "*.p12" "*.keystore" "*.jks"
  "id_rsa" "id_dsa" "id_ecdsa" "id_ed25519" "*.ppk"
  ".npmrc" ".pypirc" ".netrc" "credentials" "*.pgpass"
  "secrets.*" "*secret*.json" "*secret*.yml" "*secret*.yaml"
  "serviceaccount*.json" "*-key.json" "gcloud-*.json"
)

HAVE_RG=0; command -v rg >/dev/null 2>&1 && HAVE_RG=1
FOUND=0

hr() { printf '%.0s─' {1..70}; echo; }
section() { echo; hr; echo "▶ $1"; hr; }

scan_worktree() {
  section "WORKING TREE (tracked files — these WILL be published)"
  local files; files=$(git ls-files 2>/dev/null)
  if [ -z "$files" ]; then echo "  (no tracked files)"; return; fi
  for entry in "${PATTERNS[@]}"; do
    local label="${entry%%|||*}" pat="${entry##*|||}"
    local hits
    # Match the pattern across tracked file contents (rg if present, else grep).
    if [ "$HAVE_RG" -eq 1 ]; then
      hits=$(git ls-files -z | xargs -0 rg -nI --no-heading -i -e "$pat" 2>/dev/null)
    else
      hits=$(git ls-files -z | xargs -0 grep -nEIi -e "$pat" 2>/dev/null)
    fi
    if [ -n "$hits" ]; then
      FOUND=1
      echo "  ⚠ $label"
      echo "$hits" | head -20 | sed 's/\(.\{160\}\).*/\1…/' | sed 's/^/      /'
      local n; n=$(echo "$hits" | wc -l | tr -d ' ')
      [ "$n" -gt 20 ] && echo "      … and $((n-20)) more"
      echo
    fi
  done
  [ "$FOUND" -eq 0 ] && echo "  ✓ no obvious secrets in tracked files"
}

scan_filenames() {
  section "HIGH-RISK FILENAMES (present in the tree — verify each is not published)"
  local any=0
  for g in "${RISKY_GLOBS[@]}"; do
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      any=1
      local tracked="untracked"
      git ls-files --error-unmatch "$f" >/dev/null 2>&1 && tracked="TRACKED — will publish!"
      local ignored=""
      git check-ignore -q "$f" 2>/dev/null && ignored=" (gitignored)"
      echo "  ⚠ $f  [$tracked]$ignored"
    done < <(find . -path ./.git -prune -o -name "$g" -type f -print 2>/dev/null | sed 's|^\./||')
  done
  [ "$any" -eq 0 ] && echo "  ✓ no high-risk filenames found"
  [ "$any" -eq 1 ] && FOUND=1
}

scan_history() {
  section "GIT HISTORY (every added line, all branches — a public repo exposes ALL of this)"
  echo "  Scanning full history via 'git log --all -p'. On large repos this can take a while…"
  echo
  local diffdump; diffdump=$(git log --all -p --no-color 2>/dev/null)
  local hist_found=0
  for entry in "${PATTERNS[@]}"; do
    local label="${entry%%|||*}" pat="${entry##*|||}" hits
    if [ "$HAVE_RG" -eq 1 ]; then
      hits=$(printf '%s' "$diffdump" | rg -nI --no-heading -i -e "^\+.*($pat)" 2>/dev/null)
    else
      hits=$(printf '%s' "$diffdump" | grep -nEIi -e "^\+.*($pat)" 2>/dev/null)
    fi
    if [ -n "$hits" ]; then
      hist_found=1; FOUND=1
      echo "  ⚠ $label (in history)"
      echo "$hits" | head -12 | sed 's/\(.\{160\}\).*/\1…/' | sed 's/^/      /'
      local n; n=$(echo "$hits" | wc -l | tr -d ' ')
      [ "$n" -gt 12 ] && echo "      … and $((n-12)) more occurrences"
      echo
    fi
  done
  if [ "$hist_found" -eq 1 ]; then
    echo "  NOTE: history hits require history rewriting to remove — a GATED step."
    echo "        Rotate/revoke any real credential FIRST; rotation alone may suffice."
  else
    echo "  ✓ no obvious secrets found in git history"
  fi
}

echo "Secret & PII scan — $(git rev-parse --show-toplevel 2>/dev/null)"
echo "Scanner: $([ "$HAVE_RG" -eq 1 ] && echo ripgrep || echo 'grep (portable fallback)')  ·  Mode: $MODE"
echo "This is a heuristic, read-only flagging pass. Triage every hit by hand."

[ "$MODE" != "history" ] && { scan_worktree; scan_filenames; }
[ "$MODE" != "worktree" ] && scan_history

section "RESULT"
if [ "$FOUND" -eq 1 ]; then
  echo "  ⚠ POTENTIAL SECRETS FOUND — triage before going public."
  exit 1
else
  echo "  ✓ No obvious secrets detected. (Absence of hits ≠ proof; skim manually too.)"
  exit 0
fi
