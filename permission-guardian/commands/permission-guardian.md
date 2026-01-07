---
description: Analyzes project and generates Claude Code permissions for detected tech stacks
allowed-tools: Bash, Read, Write, Edit, Glob
---

# Permission Guardian

Automatically detect the tech stack and generate appropriate Claude Code permission configurations.

## Step 1: Detect Tech Stack

Run the detection script to scan the current project:

!python ~/.claude/skills/permission-guardian/scripts/detect_stack.py .

## Step 2: Review Detection Results

The script detects these tech stacks:
- **Node.js** - @~/.claude/skills/permission-guardian/reference/node.md
- **Python** - @~/.claude/skills/permission-guardian/reference/python.md
- **Rust** - @~/.claude/skills/permission-guardian/reference/rust.md
- **Go** - @~/.claude/skills/permission-guardian/reference/go.md
- **Docker** - @~/.claude/skills/permission-guardian/reference/docker.md
- **Git** - @~/.claude/skills/permission-guardian/reference/git.md
- **Shell Tools** - @~/.claude/skills/permission-guardian/reference/shell-tools.md (recommended for all projects)

Only read reference files for stacks that were detected.

## Step 3: Generate Permissions

After confirming detected stacks, run the generator:

!python ~/.claude/skills/permission-guardian/scripts/generate_permissions.py --stacks [detected_stacks]

Replace `[detected_stacks]` with comma-separated list of detected technologies (e.g., node,docker,git).

## Step 4: Apply Configuration

The generator will:
1. Check if `.claude/settings.json` exists
2. Merge new permissions with existing ones (no duplicates)
3. Write updated configuration
4. Show summary of changes

Your project is now configured with appropriate permissions for detected tools!
