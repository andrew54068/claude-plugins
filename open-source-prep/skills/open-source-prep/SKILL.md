---
name: open-source-prep
description: >-
  Prepare a private codebase to be safely open-sourced: scan the working tree AND full git
  history for leaked secrets/PII, untrack sensitive files and fix .gitignore, choose and write
  a LICENSE, and generate the standard repo artifacts (README, CONTRIBUTING, CODE_OF_CONDUCT,
  SECURITY.md, CHANGELOG, issue/PR templates). Runs the safe, reversible steps automatically and
  GATES the irreversible ones (git-history rewrite, credential rotation, going public) behind
  explicit human confirmation. Use this whenever the user wants to open-source, publish, make
  public, or release a currently-private project or repo — including phrasings like "make this
  repo public", "I want to open source this", "get this ready for GitHub", "add a license and
  README so I can release it", or "is it safe to make this public?" — even if they don't name a
  specific file or step.
---

# Open-Source Prep

Take a private repository from "not shareable" to "safely public." This is a guided,
phase-ordered checklist. Two rules govern everything:

1. **Do the safe, reversible work automatically** — scanning, generating LICENSE/README/etc.,
   `git rm --cached`, editing `.gitignore`. These can be reviewed and undone, so don't make the
   user babysit them.
2. **Never perform an irreversible or outward-facing action on your own.** Three things are
   *gated* — they require the user to explicitly say "yes, do it" and must never run
   automatically:
   - **Rewriting git history** (rewrites commit hashes, invalidates signatures, forces everyone
     to re-clone).
   - **Rotating/revoking a credential** (service-specific; only the user can do it safely).
   - **Publishing** (flipping the repo to public / pushing to a public remote) — you cannot take
     it back once the internet has seen it.

Work the phases in order. It's fine to skip a phase the repo already satisfies — say so and move
on. At the end, give the user a single go/no-go summary.

> **Why history matters more than the current files:** making a repo public exposes *every past
> commit on every branch*, not just the current tree. A secret that was committed and later
> "deleted" is still sitting in history — and on GitHub it stays reachable by commit SHA even
> after a force-push, in clones, and in forks. So the current tree and the full history are two
> separate surfaces, and both must be checked.

---

## Phase 0 — Orient

Establish where you are before changing anything.

- Confirm the working directory is a git repo and note the toplevel: `git rev-parse --show-toplevel`.
- Snapshot state so nothing is a surprise later: `git status --short`, current branch, whether a
  remote exists (`git remote -v`), and roughly how much history there is (`git rev-list --count --all`).
- Ask the user (once, briefly) two things you can't infer: **who wrote the code** (solo, a team,
  or work-for-hire) and **whether they already know which license they want**. You'll use these in
  Phases 3–4; don't block on them now.

State the plan in one line ("I'll scan for secrets, sort out .gitignore, add a license and the
standard docs, then flag anything that needs your sign-off") and proceed.

---

## Phase 1 — Secret & PII scan  *(auto-run; remediation is gated)*

Run the bundled scanner. It's read-only, dependency-free (ripgrep if present, else grep), and
covers both surfaces plus a high-risk-filename sweep:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/open-source-prep/scripts/scan_secrets.sh" <repo_path>
```

(Use `--worktree-only` for a fast pre-check, `--history-only` to re-scan history after edits.)

**Interpreting results — every hit is a human-triage item, not an auto-fix:**

- **Working-tree hit in a tracked file** → it *will* be published. If it's a real secret, the file
  must be cleaned (Phase 2 if the whole file is sensitive) *and* the credential treated as leaked.
- **High-risk filename** (`.env`, `*.pem`, `id_rsa`, `credentials`, …) → if `TRACKED`, untrack it
  in Phase 2; if untracked, make sure `.gitignore` covers it so it's never `git add`-ed.
- **History hit** → the secret is in past commits. Removing it needs a **history rewrite (Phase 6,
  gated)**. But first: **if it's a live credential, tell the user to rotate/revoke it before
  anything else.** Rotation is the only step that actually neutralizes exposure — a rewrite just
  removes the record. Often rotation *alone* is enough and the rewrite becomes optional.

Never call a hit a false positive on the user's behalf without showing it to them. Summarize what
was found, grouped by surface, and get their read before treating anything as safe.

If the scan is clean, say so plainly ("no obvious secrets in tree or history") and note that a
clean scan is reassuring but not proof — a quick manual skim of config/ and any `*.json` creds is
still worth it.

---

## Phase 2 — Untrack sensitive/unnecessary files & fix `.gitignore`  *(auto)*

The single most common open-sourcing mistake lives here, so be precise about the mechanics:

> **`.gitignore` only affects *untracked* files.** Adding an already-committed file to
> `.gitignore` does **not** stop Git from tracking it — the file keeps getting published. To
> actually untrack it you must remove it from the index.

For each file that should not be in the public repo (secrets, local config, build output, large
binaries, editor cruft):

```bash
git rm --cached <path>          # stop tracking, KEEP the local copy (safe & reversible)
# then add <path> (or a glob) to .gitignore so it isn't re-added
```

Use `git rm -r --cached <dir>` for directories. This only removes the file from the *current*
commit forward — if the file also contains secrets that are already in history, it still needs
Phase 6. Say that explicitly so the user isn't lulled into thinking `git rm --cached` scrubbed the
past.

Build/refresh `.gitignore` from `assets/gitignore-additions.txt` (language-agnostic starters:
env files, credentials, OS/editor junk, common build dirs). Merge, don't clobber, an existing one.

---

## Phase 3 — Right-to-release & dependency licenses  *(advisory; you flag, the user decides)*

Two checks that are legal, not technical — so surface them clearly and let the user judge.

- **Do they have the right to release it?** "Don't assume — audit." A solo author (or their
  company) can license freely. Multiple contributors means every copyright holder needs to agree;
  start from `git shortlog -sne` to list who has commits. Work-for-hire / an employment IP
  agreement can mean the *employer* owns the code — company projects usually need explicit
  approval. If any of this is uncertain, flag it as a blocker for the user to resolve.
- **Dependency-license compatibility (advisory only).** Permissive dependencies (MIT, Apache-2.0,
  ISC, BSD) let them pick any license. A strong-copyleft dependency (GPLv2/GPLv3, AGPLv3) can force
  the whole project to that license. Point out anything copyleft in their manifest, but present it
  as "worth checking," not legal advice — real compatibility has edge cases (e.g. Apache-2.0 is
  incompatible with GPLv2 but fine with GPLv3).

See `references/right-to-release.md` for the checklist and the exact commands.

---

## Phase 4 — Choose & write the LICENSE  *(auto once the choice is made)*

> **A public repo with no LICENSE is *not* open source.** Code is under exclusive copyright by
> default; making the repo public (or letting people view/fork it) grants **no** legal right to
> use, modify, or distribute. Adding a LICENSE file is what makes it reusable.

Help the user pick — the decision is short. See `references/licenses.md` for the full chooser and
license texts. Quick guide:

| Goal | License |
|------|---------|
| Maximally permissive, minimal fuss (default) | **MIT** |
| Permissive **and** an explicit patent grant (corporate / patent-exposed code) | **Apache-2.0** |
| Require derivatives to stay open (copyleft) | **GPLv3** |
| Copyleft that also covers network/SaaS use | **AGPLv3** |

Once chosen, write `LICENSE` at the repo root from the template in `references/licenses.md`,
filling in the current year and copyright holder. If they're unsure, recommend MIT and explain the
one tradeoff that usually matters (MIT lets others build closed-source versions; GPL prevents that).

---

## Phase 5 — Generate the standard repo artifacts  *(auto)*

Create the community-health files a healthy public repo is expected to have. Draft each from the
templates in `assets/`, then tailor to *this* project (name, purpose, real setup steps) — a
template checked in verbatim reads worse than none.

**Core (always):**
- `README.md` — what it does, why it matters, how to install/run, where to get help. This is the
  front door; spend the most effort here. (`assets/README.template.md`)
- `LICENSE` — from Phase 4.
- `CONTRIBUTING.md` — how to set up, branch, test, and submit changes. (`assets/CONTRIBUTING.template.md`)
- `CODE_OF_CONDUCT.md` — the Contributor Covenant, with the user's contact email filled in.
  (`assets/CODE_OF_CONDUCT.template.md`)
- `SECURITY.md` — how to privately report a vulnerability. (`assets/SECURITY.template.md`)

**Optional (offer; add if it fits):**
- `.github/ISSUE_TEMPLATE/` + `PULL_REQUEST_TEMPLATE.md` — from `assets/`.
- `CHANGELOG.md` — Keep a Changelog format. (`assets/CHANGELOG.template.md`)
- `CITATION.cff` — only for research/academic software.

Pull actual details (project name, description, language, run commands) from the repo — read the
manifest/README/entrypoint rather than inventing. Fill every `{{PLACEHOLDER}}`; never leave one in
a committed file.

---

## Phase 6 — Rewrite history to purge secrets  *(GATED — only on explicit "yes")*

Only relevant if Phase 1 found secrets *in history*. Do **not** run any rewrite command yourself
until the user explicitly confirms — it rewrites commit hashes for the bad commit and everything
after it, invalidates commit/tag signatures, and forces every clone/fork to reset.

Order of operations to walk the user through (details in `references/history-rewrite.md`):

1. **Rotate/revoke first.** If the secret is live, rotating it is what actually protects them; the
   rewrite only cleans the record. Confirm this is done or consciously skipped.
2. **Clean the current tree** (Phase 2) so the latest commit has no secret — some tools (BFG) won't
   touch `HEAD` by default.
3. **Rewrite**, then force-push. Recommend **`git-filter-repo`** (GitHub's recommendation; v2.47+
   has `--sensitive-data-removal`) or **BFG Repo-Cleaner** for bulk password/blob removal. Give the
   exact command, but let the user run it.
4. Note the fallout: collaborators must re-clone or hard-reset; open PRs may break.

Present this as a plan and stop for confirmation. If the user isn't ready, that's fine — record it
as an open blocker in the final summary.

---

## Phase 7 — Publish  *(GATED — the point of no return)*

Publishing is outward-facing and effectively irreversible (search engines, clones, and forks cache
public code instantly). Never flip visibility or push to a public remote without an explicit
green light.

Before you even offer to publish, confirm the go/no-go checklist is clean:
- [ ] Secret scan clean on tree **and** history (or history rewrite done / consciously deferred)
- [ ] Rotations done for anything that was exposed
- [ ] Right-to-release confirmed
- [ ] LICENSE present
- [ ] README + CONTRIBUTING + CODE_OF_CONDUCT + SECURITY present
- [ ] `.gitignore` covers secrets/build artifacts; no sensitive file still tracked

When the user confirms, remind them that GitHub turns on free automatic secret scanning for public
repos — a useful backstop, but it runs *after* exposure, so it never replaces the pre-release scan.

---

## Final summary — always end here

Give one compact status block the user can act on:

```
Open-source readiness: <READY | BLOCKED>
✓ done:        <phases completed>
⚠ needs you:   <gated/advisory items — rotations, history rewrite, contributor consent>
✗ blockers:    <anything that must be resolved before going public>
Next step:     <the single most important action>
```

Be honest: if secrets are still in history or right-to-release is unconfirmed, the verdict is
BLOCKED even if everything else is done.

---

## Bundled resources

- `scripts/scan_secrets.sh` — the read-only secret/PII scanner (Phase 1).
- `references/licenses.md` — license chooser + full MIT text and pointers for Apache/GPL/AGPL.
- `references/right-to-release.md` — ownership & dependency-license audit checklist (Phase 3).
- `references/history-rewrite.md` — git-filter-repo / BFG commands and caveats (Phase 6).
- `references/secret-patterns.md` — what the scanner looks for and how to extend it.
- `assets/` — templates for README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, issue/PR
  templates, and `.gitignore` starters.
