# Permission Guardian

A Claude Code plugin that automatically detects your project's tech stack and generates appropriate Claude Code permission configurations (`.claude/settings.json`).

## Install

```bash
claude plugin add /path/to/claude-plugins/permission-guardian
```

Or install from GitHub:

```bash
claude plugin add https://github.com/andrew54068/claude-plugins/tree/main/permission-guardian
```

## Usage

Once installed, run from any project:

```
/permission-guardian
```

## What It Does

1. **Detect tech stack** — Scans project for package files and configs
2. **Review detected technologies** — Confirms what was found
3. **Generate permissions** — Creates `.claude/settings.json` configuration
4. **Apply to project** — Updates or creates settings file

## Supported Tech Stacks

| Stack | Indicator Files |
|-------|----------------|
| **Node.js** | `package.json`, `tsconfig.json`, `.nvmrc` |
| **Python** | `requirements.txt`, `pyproject.toml`, `setup.py` |
| **Rust** | `Cargo.toml` |
| **Go** | `go.mod` |
| **Docker** | `Dockerfile`, `docker-compose.yml` |
| **Git** | `.git/` directory |
| **Shell Tools** | Recommended for all projects |

## How It Works

- Detection is deterministic (file-based, no LLM needed)
- Each tech stack has its own reference file with permission templates
- Existing permissions are preserved — new permissions are merged without duplicates
- Scripts handle all validation and configuration

## License

MIT
