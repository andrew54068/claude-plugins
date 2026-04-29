# skills-manager

Manage which skills, plugins, and MCP servers are enabled per-project, via a **bullpen + symlink** pattern. One bullpen (skill content) shared between Claude Code and Codex; symlinks expose each skill to whichever entry directory the agent reads.

## Why

Skills consume context window. If every skill you've ever written is loaded globally, every conversation pays the tax — even when 90% of those skills are irrelevant.

The bullpen pattern fixes this:

1. **Bullpen** (`~/.agents/skills-bullpen/`) — every skill lives here, all the time. One source of truth.
2. **Symlinks** decide what's *enabled* where:
   - `~/.claude/skills/<name>` and `~/.agents/skills/<name>` → globally on for every project
   - `<project>/.claude/skills/<name>` and `<project>/.agents/skills/<name>` → on only inside that project
3. **`.globals` file** — newline-separated list of global skill names, the source of truth that `reconcile.sh` checks against.
4. **Filesystem as state** — no cache, no registry. `state.sh` re-reads the symlinks every invocation. Add a skill = drop a folder in the bullpen. Disable it = remove a symlink. That's it.

### What "vendor-neutral" actually means here

Only the **bullpen** is shared. The agent entry directories are NOT shared — each agent reads its own:

- Claude Code reads `~/.claude/skills/` (and project `.claude/skills/`)
- Codex reads `~/.agents/skills/` (and project `.agents/skills/`)

Tested empirically: a skill placed only under `~/.agents/skills/` is invisible to Claude Code.

So to make a skill global on both, you need a symlink in **both** `~/.claude/skills/` and `~/.agents/skills/`, both pointing at the same bullpen entry. `toggle-global.sh <skill> on` and `migrate.sh` create both for you. The "no duplication" win is at the **content** layer — one folder of source files in the bullpen — not at the symlink layer.

## Install

```bash
# In Claude Code
/plugin marketplace add https://github.com/andrew54068/claude-plugins
/plugin install skills-manager@andrew54068
```

After install, run `/skills-manager` once. If `~/.agents/skills-bullpen/` doesn't exist, the skill will offer to run `migrate.sh` — it moves your existing `~/.claude/skills/<name>/` directories into the bullpen, leaves symlinks for anything that's already linked, and detects which ones are referenced by hooks (those become global).

## Tell Claude and Codex to use it

For automatic use whenever you ask anything about skill management, drop a short rule into both agent configs:

**Claude Code** — append to `~/.claude/CLAUDE.md` (or create `~/.claude/rules/skills-management.md`):

```markdown
# Skills Management

Skills on this machine are managed via the **skills-manager** workflow (bullpen + symlink pattern).

- Skills live in `~/.agents/skills-bullpen/<skill-name>/`
- Global skills are symlinked into `~/.claude/skills/` and `~/.agents/skills/`; per-project skills are symlinked into `<project>/.claude/skills/` and `<project>/.agents/skills/`
- `~/.agents/skills-bullpen/.globals` is the source of truth for global skills
- When creating, editing, or enabling a skill, write to the bullpen and manage symlinks — never write a skill directly into `~/.claude/skills/` or a project's `.claude/skills/`
- For any skill management task (creating, enabling/disabling, making global), invoke the `skills-manager` skill first
```

**Codex** — append the same content to `~/.codex/AGENTS.md`. Codex doesn't load `rules/*.md`, so AGENTS.md is the only path.

## What you get

- `/skills-manager` slash command — interactive browse-and-toggle for skills, plugins, and MCP servers per project
- `scripts/state.sh <project>` — single-JSON snapshot of available/enabled/global skills, plugins, and MCP
- `scripts/browse.sh <skills|plugins|mcp> <project>` — fzf picker for bulk toggling
- `scripts/reconcile.sh [--fix]` — detect or repair drift between `.globals` and the global symlinks
- `scripts/toggle-global.sh <skill> on|off` — promote/demote a skill to global
- `scripts/list-projects.sh` — every project on this machine that's been configured
- `scripts/export-config.sh <project>` / `import-config.sh <project>` — versioned bundle for portability
- `scripts/migrate-to-agents.sh` — relocate a legacy `~/.claude/skills-bullpen/` to `~/.agents/skills-bullpen/`

## License

MIT
