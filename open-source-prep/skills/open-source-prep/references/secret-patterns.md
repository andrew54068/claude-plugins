# Secret-scan pattern catalog

`scripts/scan_secrets.sh` ships its own regex patterns so it has **no external dependencies** (it
uses ripgrep if available, otherwise plain `grep -E`). This file documents what it looks for and how
to extend it. The patterns deliberately over-flag: a false positive costs a few seconds of triage; a
real credential in a public repo costs a lot more.

## What it scans

Three surfaces, because a public release exposes all of them:

1. **Tracked working-tree files** (`git ls-files`) — what will be published right now.
2. **Full git history** (`git log --all -p`, added lines only) — every secret ever committed, even
   if later deleted.
3. **High-risk filenames** (present in the tree, tracked or not) — files that are secrets by nature.

## Token/credential patterns

| Label | Catches |
|-------|---------|
| Private key block | `-----BEGIN … PRIVATE KEY-----` (RSA/EC/OpenSSH/PGP/DSA) |
| AWS access key id | `AKIA…` (20 chars) |
| AWS secret access key | 40-char secret near an `aws … secret/access =` assignment |
| GitHub token | `ghp_/gho_/ghu_/ghs_/ghr_…` |
| GitHub fine-grained PAT | `github_pat_…` |
| Google API key | `AIza…` |
| Slack token / webhook | `xoxb-/xoxp-…`, `hooks.slack.com/services/…` |
| Stripe live key | `sk_live_/rk_live_…` |
| Twilio SID | `AC…` (32 hex) |
| SendGrid key | `SG.…` |
| npm token | `npm_…` |
| OpenAI-style key | `sk-…` |
| JWT | `eyJ….eyJ….…` |
| Generic secret assignment | `password/secret/token/api_key/… = "…"` |
| Connection string with creds | `scheme://user:pass@host` |

## High-risk filename globs

`.env`, `.env.*`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.keystore`, `*.jks`, `id_rsa`/`id_dsa`/
`id_ecdsa`/`id_ed25519`, `*.ppk`, `.npmrc`, `.pypirc`, `.netrc`, `credentials`, `*.pgpass`,
`secrets.*`, `*secret*.{json,yml,yaml}`, `serviceaccount*.json`, `*-key.json`, `gcloud-*.json`.

## Known limitations (tell the user)

- **Heuristic, not exhaustive.** High-entropy secrets with no recognizable prefix (a random 32-char
  password with no `password=` nearby) can slip through. A clean scan is reassuring, not proof.
- **No PII deep-scan.** Emails/IPs/names are too noisy to auto-flag; if the project handles personal
  data, a manual review of fixtures/seed data/logs is still warranted.
- **History scan cost.** `git log --all -p` dumps every diff; on very large repos it can be slow. Use
  `--worktree-only` for a fast first pass, then run the full scan once.

## Extending

Add a line to the `PATTERNS` array in `scan_secrets.sh`, format `"Label|||ERE-pattern"` (matching is
case-insensitive). Add filename globs to `RISKY_GLOBS`. Keep patterns anchored enough to avoid
drowning the user in noise — if a pattern fires on every file, tighten it.
