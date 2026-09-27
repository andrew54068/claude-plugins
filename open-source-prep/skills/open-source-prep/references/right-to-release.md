# Right-to-release & dependency-license audit (Phase 3)

These are legal checks, not code changes. The skill's job is to **surface** them clearly and let the
user decide — never assert that something is legally fine.

## 1. Do you have the right to open-source this?

The guiding rule from opensource.guide: **"Do not assume you have the rights. Go look. Do an audit."**

**Who holds copyright?**

```bash
git shortlog -sne          # everyone with commits (starting point for "who contributed")
git log --format='%ae' | sort -u   # distinct author emails
```

- **Solo author, personal project** → you're the sole copyright holder; you can license freely.
- **Multiple contributors** → each contributor holds copyright in their contributions. The strict
  legal default is that **every** copyright holder must agree to the license. In practice large
  projects accept high-majority coverage, but flag unreachable/departed contributors as a risk.
- **Work-for-hire / employment** → if the code was written as part of a job, an employment or IP
  assignment agreement may vest copyright in the **employer**. Company-owned projects almost always
  need **explicit approval** (legal/management) before release. Treat this as a blocker until
  confirmed.

**Also check for embedded third-party material:** vendored code, copied snippets, assets/fonts/images
with their own licenses. Anything copied in must be license-compatible and attributed.

If any of the above is uncertain, the correct output is: *"This is a right-to-release blocker — you
need <X> before publishing,"* not a green light.

## 2. Dependency-license compatibility (advisory only)

Including a dependency generally means complying with its license, which can constrain the license
you may put on the whole project.

- **Permissive deps** (MIT, Apache-2.0, ISC, BSD-2/3-Clause) impose almost no constraint — you can
  license the project however you like.
- **Strong-copyleft deps** (GPLv2, GPLv3, AGPLv3) can require the *combined work* to be released
  under that same (or a compatible) license. A single GPL dependency can force the whole project to
  GPL.
- **Compatibility has edges** — e.g. Apache-2.0 is **incompatible with GPLv2** but **compatible with
  GPLv3**; GPLv2-only and GPLv3 don't mix. Because of this, present findings as *"worth checking with
  a real compatibility reference,"* not as a definitive ruling.

**How to survey dependencies (ecosystem-agnostic):**

- Read the dependency manifest/lockfile the project actually uses (e.g. `package.json`,
  `requirements.txt`/`pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile`).
- If a license-scanning tool is already installed, use it; otherwise just eyeball the direct
  dependencies' licenses. Do **not** install a new tool for this — flag copyleft deps manually.
- Report: list any GPL/AGPL/LGPL dependency and note it may constrain the outbound license choice in
  Phase 4.

This is advisory. When in doubt, tell the user to confirm with an authoritative source (SPDX license
list, the dependency's own LICENSE) or counsel — the skill does not give legal advice.
