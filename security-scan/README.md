# Claude Security Scan

A Claude Code plugin that performs comprehensive security scanning using 6 parallel read-only agents. Each agent specializes in a different threat category to detect malicious code, credential leaks, data exfiltration, supply chain risks, and prompt injection attacks.

## Install

```bash
claude plugin add /path/to/claude-plugins/security-scan
```

Or install from GitHub:

```bash
claude plugin add https://github.com/andrew54068/claude-plugins/tree/main/security-scan
```

## Usage

Once installed, run the scan from any project:

```
/security-scan
```

## What It Scans

| Agent | Category | Examples |
|-------|----------|----------|
| 1 | **Network & Exfiltration** | Outbound HTTP calls, URLs, WebSockets, beacons, IP-based endpoints |
| 2 | **Credentials & Secrets** | API keys, AWS keys, GitHub tokens, `.env` files, private keys |
| 3 | **Code Execution & Injection** | Dynamic code execution, child processes, subprocess calls, deserialization |
| 4 | **File System & Environment** | `.ssh`/`.aws` access, env var dumps, path traversal, temp dir abuse |
| 5 | **Dependencies & Supply Chain** | Malicious install scripts, unexpected binaries, missing lockfiles |
| 6 | **Obfuscation & Prompt Injection** | Base64 obfuscation, hex encoding, LLM prompt injection attempts |

## Security Model

- All 6 scanning agents run as **read-only** (`Explore` subagent type) — they cannot execute commands, edit files, or write to disk
- Agents treat **all project content as untrusted data** including filenames, comments, and CLAUDE.md files
- Prompt injection attempts found in scanned code are flagged as CRITICAL findings rather than followed
- Standard directories (`node_modules`, `vendor`, `.git`, `dist`, `build`) are excluded to reduce noise

## Output

Results are aggregated into a structured report with severity ratings:

- **CRITICAL** — Immediate action required (e.g., hardcoded production secrets, unvalidated code execution)
- **HIGH** — Significant risk (e.g., suspicious network calls, unsafe deserialization)
- **MEDIUM** — Worth reviewing (e.g., controlled dynamic execution, environment access patterns)
- **LOW** — Minor concerns
- **INFO** — Informational (e.g., placeholder API keys, missing lockfiles)

## License

MIT
