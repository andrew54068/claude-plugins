# Rewriting git history to purge secrets (Phase 6 — GATED)

This is the destructive step. It rewrites commit hashes for the offending commit **and every commit
after it**, which invalidates commit/tag signatures and forces every clone and fork to re-sync. The
skill must present a plan and **wait for explicit user confirmation** — never run a rewrite command
autonomously.

## Step 0 — Rotate first (this is the real fix)

If the exposed data is a live credential (API key, token, password, connection string), the **first
and most important action is to revoke and/or rotate it.** Rotation is what actually neutralizes the
exposure — anyone who already cloned the repo still has the old value, so scrubbing history only
removes the record, not the risk. Frequently rotation *alone* is sufficient and the history rewrite
becomes optional cleanup. Confirm rotation is done (or a conscious decision to skip) before rewriting.

## Step 1 — Clean the current tree first

Make sure the latest commit no longer contains the secret (Phase 2: `git rm --cached` and/or edit the
file, then commit). This matters because **BFG will not modify the contents of your latest commit
(`HEAD`) by default** — it protects the tip so your working state is preserved. If the secret is
still in `HEAD`, BFG leaves it there.

## Step 2 — Rewrite

Two well-supported, purpose-built tools. Give the user the command; let them run it.

### Option A — git-filter-repo (GitHub's recommendation)

```bash
# Install: pip install git-filter-repo   (or brew install git-filter-repo)
# Work on a FRESH clone — filter-repo refuses to run on a repo with a configured remote by default.

# Remove a specific file from all history:
git filter-repo --path path/to/secret-file --invert-paths

# Or, with v2.47.0+, replace matched sensitive strings across all history:
#   put one secret per line in expressions.txt (supports literal:, regex:, glob:)
git filter-repo --sensitive-data-removal --replace-text expressions.txt
```

`--sensitive-data-removal` (added in 2.47.0) tunes the rewrite for the leak case. Verify the version:
`git filter-repo --version`.

### Option B — BFG Repo-Cleaner (fast bulk removal)

```bash
# Removes matched strings everywhere in history, replacing them with ***REMOVED***.
# passwords.txt = one secret/string per line.
bfg --replace-text passwords.txt   my-repo.git
# or drop whole files by name:
bfg --delete-files id_rsa          my-repo.git

# BFG leaves HEAD untouched by design — clean the current tree first (Step 1).
```

## Step 3 — Finalize and force-push

```bash
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force --all
git push --force --tags
```

## Step 4 — Tell the user about the fallout

- Every collaborator must re-clone or hard-reset — their old clones still contain the secret and will
  reintroduce it if pushed.
- Open pull requests built on rewritten commits may break.
- On GitHub, old commit SHAs can remain cached/reachable for a while and live in forks — this is
  another reason **rotation, not rewriting, is the true remediation.** Consider contacting GitHub
  Support to purge cached views if the secret is high-value.

If the user isn't ready to do all this, that's a valid choice — record "secrets remain in history" as
an open blocker in the final summary so the go/no-go verdict stays honest.
