---
description: Manage per-project skills, plugins, and MCP servers via a bullpen + symlink pattern
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion
---

# /skills-manager

Follow the workflow defined in @~/.claude/skills/skills-manager/SKILL.md.

Quick reference:

- **First run:** if `~/.agents/skills-bullpen/` does not exist, run `bash ~/.claude/skills/skills-manager/scripts/migrate.sh` to create the vendor-neutral bullpen and link global skills into both `~/.claude/skills/` and `~/.agents/skills/`.
- **Project detection:** `bash ~/.agents/skills-bullpen/skills-manager/scripts/project-root.sh`
- **State (single JSON):** `bash ~/.agents/skills-bullpen/skills-manager/scripts/state.sh <project-root>`
- **Interactive picker:** `! bash ~/.agents/skills-bullpen/skills-manager/scripts/browse.sh <skills|plugins|mcp> <project-root>`
- **Reconcile global symlinks:** `bash ~/.agents/skills-bullpen/skills-manager/scripts/reconcile.sh [--fix]`
- **Toggle a global skill:** `bash ~/.agents/skills-bullpen/skills-manager/scripts/toggle-global.sh <skill> on|off`
