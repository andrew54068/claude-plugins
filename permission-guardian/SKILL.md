---
description: Analyzes project and generates Claude Code permissions for detected tech stacks
runManually: true
---

# Permission Guardian

Automatically detects your project's tech stack and generates appropriate Claude Code permission configurations.

## Workflow

1.  **Detect tech stack** - Scan project for package files and configs
2.  **Review detected technologies** - Confirm what was found
3.  **Generate permissions** - Create `.claude/settings.json` configuration
4.  **Apply to project** - Update or create settings file

## Installation via Marketplace

To install the Permission Guardian from the marketplace, you'll first need to add the marketplace, then install the skill:

1.  **Add the marketplace**:
    ```bash
    /plugin marketplace add /path/to/your/my-claude-marketplace
    ```
    (Replace `/path/to/your/my-claude-marketplace` with the actual path to the directory containing your `marketplace.json` file.)

2.  **Install the plugin**:
    ```bash
    /plugin install permission-guardian@claude-skills
    ```

Once installed, you can use the `/permission-guardian` slash command directly or let Claude Code automatically invoke the skill.

## Step 1: Detect Tech Stack

Run the detection script to scan the current project:

```bash
python scripts/detect_stack.py .
```

This will output JSON with detected technologies and their indicator files.

## Step 2: Review Detection Results

The script detects these tech stacks:

- **Node.js** - See [reference/node.md](reference/node.md) for details
- **Python** - See [reference/python.md](reference/python.md) for details
- **Rust** - See [reference/rust.md](reference/rust.md) for details
- **Go** - See [reference/go.md](reference/go.md) for details
- **Docker** - See [reference/docker.md](reference/docker.md) for details
- **Git** - See [reference/git.md](reference/git.md) for details
- **Shell Tools** - See [reference/shell-tools.md](reference/shell-tools.md) for details (recommended for all projects)

Only read reference files for stacks that were detected.

## Step 3: Generate Permissions

Run the generator with detected stacks:

```bash
python scripts/generate_permissions.py --stacks node,docker,git
```

This creates a permissions configuration based on templates in reference files.

## Step 4: Apply Configuration

The generator will:
1. Check if `.claude/settings.json` exists
2. Merge new permissions with existing ones (no duplicates)
3. Write updated configuration
4. Show summary of changes

## Implementation Notes

- Detection is deterministic (file-based, no LLM needed)
- Each tech stack has its own reference file
- Scripts handle all merging and validation
- Existing permissions are preserved
- Only detected tools get permissions added
