---
name: skills-manager
description: Manage per-project skills, plugins, and MCP servers via a bullpen + symlink pattern
---

# Skills Manager

Manage which skills, plugins, and MCP servers are enabled for the current project.

## First-Run Migration

If `~/.agents/skills-bullpen/` does not exist, run the migration script before anything else:

```
bash ~/.claude/skills/skills-manager/scripts/migrate.sh
```

The migration creates a vendor-neutral bullpen at `~/.agents/skills-bullpen/`, then links global skills into both `~/.claude/skills/` for Claude Code and `~/.agents/skills/` for Codex and other agent tools.

Show the output to the user. If the script reports a legacy bullpen at `~/.claude/skills-bullpen/`, run:

```
bash ~/.claude/skills-bullpen/skills-manager/scripts/migrate-to-agents.sh
```

If the script reports other errors, help the user resolve them before proceeding.

After migration completes, continue to the Browse-and-Toggle flow below.

## Project Detection

Run `bash ~/.agents/skills-bullpen/skills-manager/scripts/project-root.sh` to find the project root. The script walks up from the current working directory and returns the closest ancestor containing either `.git` (file or directory) or `.claude/`. `$HOME` is skipped so the global config dir is never treated as a project.

- Exit 0: use stdout as the project root.
- Exit 1: tell the user "No project root found. /skills-manager needs a `.git` or `.claude/` directory in the ancestry of the current directory (excluding $HOME)." and stop.

**Why both markers:** `.git` covers normal repos; `.claude/` lets you scope config inside non-git folders (scratch dirs, monorepo subprojects). Closest ancestor wins — if `.claude/` sits inside a git repo, that inner folder is the project, not the repo root.

## State Reading

Read current state from the filesystem every time. No cache, no registry.

**Preferred: run `scripts/state.sh <project-root>`** — emits a single JSON document with skills (`available`, `enabled`, `global`, `orphans`, `plain_dirs`), plugins (`global`, `project`), and MCP (`global`, `project`). Prefer this over reading files ad-hoc: orphan and plain-dir detection is already built in.

Fall back to the per-file logic below only if `state.sh` is unavailable or you need to explain to the user what's being read.

### Skills

1. **Available:** List all directories in `~/.agents/skills-bullpen/` that contain a `SKILL.md` file. Read each skill's `description` from the SKILL.md YAML frontmatter.
2. **Enabled for this project:** Check which entries in `<project>/.claude/skills/` and `<project>/.agents/skills/` are symlinks pointing to the bullpen. The union is enabled for the project; per-tool fields are available in `state.sh`.
3. **Global (always on):** Read `~/.agents/skills-bullpen/.globals` (one skill name per line). This is the source of truth for global skills. Verify each has matching symlinks in both `~/.claude/skills/` and `~/.agents/skills/`. These are marked `(global - always on)` and cannot be toggled off per-project.

### Plugins

1. **Available:** Read `enabledPlugins` from `~/.claude/settings.json` to get all known plugins and their global state.
2. **Project overrides:** Read `enabledPlugins` from `<project>/.claude/settings.json` if it exists.

### MCP Servers

1. **Global:** Read `mcpServers` from `~/.claude/settings.json`.
2. **Project:** Read `mcpServers` from `<project>/.claude/settings.json` if it exists.

## Browse-and-Toggle UI

### Pick the right UI mechanism

Three surfaces are available, from most native to most fallback. Use whichever fits the decision at hand:

1. **`AskUserQuestion`** — in-REPL native UI (arrow nav, space to toggle in `multiSelect`, enter to submit). Use whenever the choice has **≤4 options per question** (hard schema cap: 2–4 options, 1–4 questions). Ideal for category picks, binary forks, small-batch confirmations, and orphan cleanup. Cannot pre-select options, so don't use it for "confirm the 22 currently-enabled items" flows.
2. **`scripts/browse.sh` via `!` prefix** — external fzf TUI. Use for bulk toggling (5+ items) or when the user wants a picker rather than a conversation. Keys: `space` toggle, `ctrl-a` all on, `ctrl-n` all off, `enter` save, `esc` cancel. Items marked `[GLB]` are global and cannot be toggled per-project. Invocation: `! bash ~/.agents/skills-bullpen/skills-manager/scripts/browse.sh <skills|plugins|mcp> <project-root>`.
3. **Text list + typed commands** — the conversational flow further below. Use when fzf is unavailable, the user wants explanation as they go, or the operation is mixed enough that a picker would hide intent.

Default order: try AskUserQuestion first when the fork fits under 4 options; otherwise offer browse.sh; fall through to the text list if either fails or the user prefers it.

### Entry Point

Show a one-line header, then route the category pick through `AskUserQuestion` (3 options fits the 2–4 cap):

```
Project: <project-name> (<project-root>)
Config: .claude/settings.json (exists | not found)
State: N skills available · M project-enabled · K global · P plugins (Q on) · R MCP
```

Then:

```
AskUserQuestion({
  questions: [{
    question: "Which category would you like to configure?",
    header: "Category",
    multiSelect: false,
    options: [
      { label: "Skills",   description: "N available, M project-enabled, K global" },
      { label: "Plugins",  description: "P known, Q enabled" },
      { label: "MCP",      description: "R custom configured" }
    ]
  }]
})
```

Users can always pick "Other" to type a different intent (e.g. "all of them", "cancel"). Honor it.

### "No Config Found" Flow

If `<project>/.claude/settings.json` does NOT exist (missing entirely, not `{}`), use `AskUserQuestion` — 2 options is a perfect fit:

```
AskUserQuestion({
  questions: [{
    question: "No project config found. How should we start?",
    header: "Baseline",
    multiSelect: false,
    options: [
      { label: "Global defaults", description: "Pre-check everything currently enabled globally" },
      { label: "Clean",           description: "Everything unchecked — configure from scratch" }
    ]
  }]
})
```

An empty `{}` file means "configured to use nothing" — skip this prompt.

### Category View

When user selects a category, show each item with number, ON/OFF state, name, label, and description:

```
-- Skills --

1. [ON]  obsidian-secretary (global — always on)
         Knowledge secretary for Obsidian vault integration

2. [ON]  paperclip
         Interact with the Paperclip control plane API

3. [OFF] mcp-builder
         Guide for creating MCP servers with FastMCP
...

Toggle by number or name (e.g., "3 on", "team-builder on", "all off").
Or: "done" to save and exit, "back" to return to categories.
```

### Toggle Commands

Understand these toggle patterns:
- `3 on` / `3 off` — toggle by number
- `mcp-builder on` — toggle by name
- `all on` / `all off` — bulk toggle (excludes global skills)
- `1-5 on` — range toggle
- `enable everything except youtube-downloader` — natural language
- `only keep paperclip and mcp-builder` — natural language

### Applying Changes

When the user says "done", FIRST preview the full changeset (what will be enabled/disabled, which settings.json keys will change) and confirm before executing. No surprises.

Then:

**Skills:**
- Enable for Claude: `ln -s ~/.agents/skills-bullpen/<name> <project>/.claude/skills/<name>`
- Enable for cross-vendor agents: `ln -s ~/.agents/skills-bullpen/<name> <project>/.agents/skills/<name>`
- Disable: remove the matching project symlink from `<project>/.claude/skills/` and `<project>/.agents/skills/`
- Create project skills directories if needed: `mkdir -p <project>/.claude/skills <project>/.agents/skills`

**Plugins:**
- Read `<project>/.claude/settings.json` (or start with `{}`)
- Write ALL plugin states to `enabledPlugins` — project-level replaces global entirely. Every plugin must be explicitly listed.
- Preserve all other keys in the file.
- Use `jq` to read and write, or use the Edit tool for surgical JSON edits.

**MCP Servers:**
- Same file, `mcpServers` key.
- Add/remove server configs.
- Preserve other keys.

**Edge Cases:**
- If `settings.json` becomes `{}`: keep it — file existence means "project is configured"
- Never touch `settings.local.json`
- After first setup, suggest: "Consider adding `.claude/skills/` to your `.gitignore` since symlinks point to machine-specific bullpen paths."

### Summary

After applying, show a summary:

```
Changes applied:
  Skills enabled: paperclip, mcp-builder
  Skills disabled: youtube-downloader
  Plugins enabled: superpowers, context7
  Plugins disabled: playwright, ralph-loop

Config written to: <project>/.claude/settings.json
Symlinks in: <project>/.claude/skills/ and <project>/.agents/skills/
```

Ask if they want to configure another category or finish.

## Additional Commands

Beyond the Browse-and-Toggle flow, these scripts cover maintenance and portability:

- `scripts/browse.sh <skills|plugins|mcp> <project>` — interactive fzf picker (space toggle, enter save). Run via `!` prefix so fzf gets a TTY. Self-contained: reads state, previews the diff, confirms, and applies.
- `scripts/reconcile.sh [--fix]` — detect drift between `.globals` and global symlinks in `~/.claude/skills/` and `~/.agents/skills/`; report (exit 1) or repair (`--fix`). Authoritative source: `.globals`.
- `scripts/toggle-global.sh <skill> on|off` — add/remove a skill from global scope (keeps `.globals` plus Claude/Codex global symlinks in sync). Use this instead of hand-editing.
- `scripts/list-projects.sh` — list every project on this machine with a `.claude/settings.json`, excluding `$HOME/.claude` and common tooling dirs.
- `scripts/export-config.sh <project>` — emit a versioned JSON bundle (skills enabled + full settings.json) to stdout.
- `scripts/import-config.sh <project> [--dry-run]` — apply a bundle (from stdin) to a project. Use `--dry-run` to preview.
- `scripts/gitignore-check.sh <project>` — verify `.claude/skills/` is gitignored (exit 1 if missing). Call this after first configuring a project.

## Important

- NEVER modify `~/.claude/settings.json` during normal operation (only migration touches it)
- NEVER modify `~/.claude/settings.local.json`
- NEVER delete skills from `~/.agents/skills-bullpen/` — only manage symlinks
- ALWAYS read fresh state from disk — no caching between invocations
- Global skills CANNOT be toggled off per-project — warn if user tries
- When making a skill global: add its name to `~/.agents/skills-bullpen/.globals` AND create symlinks in `~/.claude/skills/` and `~/.agents/skills/`
- When removing a skill from global: remove its name from `.globals` AND remove both global symlinks
- `.globals`, `~/.claude/skills/`, and `~/.agents/skills/` symlinks must stay in sync. `.globals` is the source of truth. Use `toggle-global.sh` for changes; run `reconcile.sh` to detect drift.
- When the project's state includes `orphans` or `plain_dirs`, surface them to the user: orphans are likely renamed/deleted skills (suggest removal), plain_dirs are hand-dropped dirs that the skill won't manage (suggest converting to a bullpen entry + symlink). When 2–4 such entries exist, prefer `AskUserQuestion` with `multiSelect: true` for the cleanup pick (one option per orphan). For 5+, fall back to the text list.
