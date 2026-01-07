#!/usr/bin/env python3
"""
Generate Claude Code permissions configuration based on detected tech stacks.
Reads reference files and creates .claude/settings.json with appropriate permissions.
"""

import os
import sys
import json
import re
import shutil
from pathlib import Path

# Map each stack to its permission patterns
STACK_PERMISSIONS = {
    "node": {
        "allow": [
            "Bash(npm *)",
            "Bash(npx *)",
            "Bash(node *)",
            "Bash(yarn *)",
            "Bash(pnpm *)",
            "Bash(bun *)"
        ]
    },
    "python": {
        "allow": [
            "Bash(python *)",
            "Bash(python3 *)",
            "Bash(pip *)",
            "Bash(pip3 *)",
            "Bash(pytest *)",
            "Bash(poetry *)",
            "Bash(pipenv *)",
            "Bash(uv *)"
        ]
    },
    "rust": {
        "allow": [
            "Bash(cargo *)",
            "Bash(rustc *)",
            "Bash(rustup *)"
        ]
    },
    "go": {
        "allow": [
            "Bash(go *)"
        ]
    },
    "docker": {
        "allow": [
            "Bash(docker *)",
            "Bash(docker-compose *)"
        ],
        "ask": [
            "Bash(docker push *)",
            "Bash(docker system prune *)"
        ]
    },
    "git": {
        "allow": [
            "Bash(git status)",
            "Bash(git diff *)",
            "Bash(git log *)",
            "Bash(git branch *)",
            "Bash(git checkout *)",
            "Bash(git add *)",
            "Bash(git commit *)",
            "Bash(git pull *)",
            "Bash(git fetch *)"
        ],
        "ask": [
            "Bash(git push *)",
            "Bash(git reset --hard *)",
            "Bash(git rebase *)"
        ]
    },
    "make": {
        "allow": [
            "Bash(make *)"
        ]
    },
    "ruby": {
        "allow": [
            "Bash(bundle *)",
            "Bash(gem *)",
            "Bash(ruby *)"
        ]
    },
    "java": {
        "allow": [
            "Bash(mvn *)",
            "Bash(gradle *)",
            "Bash(./gradlew *)"
        ]
    },
    "shell-tools": {
        "allow": [
            "Bash(fd *)",
            "Bash(rg *)",
            "Bash(ast-grep *)",
            "Bash(fzf *)",
            "Bash(jq *)",
            "Bash(yq *)"
        ]
    }
}

def load_existing_settings(settings_path):
    """Load existing settings.json if it exists."""
    if settings_path.exists():
        try:
            with open(settings_path, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"Warning: Could not parse existing {settings_path}", file=sys.stderr)
            return {}
    return {}

def merge_permissions(existing, new_perms):
    """
    Merge new permissions into existing ones without duplicates.
    Returns merged permissions dict.
    """
    merged = existing.copy()

    for category in ['allow', 'ask', 'deny']:
        if category not in merged:
            merged[category] = []

        if category in new_perms:
            for perm in new_perms[category]:
                if perm not in merged[category]:
                    merged[category].append(perm)

    return merged

def generate_permissions(stacks, detected_results=None):
    """
    Generate permissions configuration for given stacks.
    If detected_results is provided, only include shell tools that are actually installed.
    """
    permissions = {
        "allow": [],
        "ask": [],
        "deny": []
    }

    for stack in stacks:
        if stack == "shell-tools" and detected_results:
            # Only add permissions for installed shell tools
            shell_info = detected_results.get("shell-tools", {})
            installed_tools = shell_info.get("indicators", [])

            if installed_tools:
                # Add only installed tools
                for tool in installed_tools:
                    perm = f"Bash({tool} *)"
                    if perm not in permissions["allow"]:
                        permissions["allow"].append(perm)
        elif stack in STACK_PERMISSIONS:
            stack_perms = STACK_PERMISSIONS[stack]
            permissions = merge_permissions(permissions, stack_perms)

    # Remove empty categories
    permissions = {k: v for k, v in permissions.items() if v}

    return permissions

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_permissions.py --stacks node,python,docker", file=sys.stderr)
        print("       python generate_permissions.py --auto  (detects stacks automatically)", file=sys.stderr)
        sys.exit(1)

    detected_results = None

    # Parse arguments
    if sys.argv[1] == "--auto":
        # Run detection script
        import subprocess
        result = subprocess.run(
            ["python3", str(Path(__file__).parent / "detect_stack.py"), "."],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            print("Error running detection script", file=sys.stderr)
            print(result.stderr, file=sys.stderr)
            sys.exit(1)

        detected_results = json.loads(result.stdout)
        stacks = list(detected_results.keys())
        print(f"Auto-detected stacks: {', '.join(stacks)}", file=sys.stderr)

    elif sys.argv[1] == "--stacks":
        if len(sys.argv) < 3:
            print("Error: --stacks requires a comma-separated list", file=sys.stderr)
            sys.exit(1)
        stacks = [s.strip() for s in sys.argv[2].split(',')]

    else:
        print(f"Error: Unknown option {sys.argv[1]}", file=sys.stderr)
        sys.exit(1)

    # Generate permissions (pass detected_results for shell-tools filtering)
    new_permissions = generate_permissions(stacks, detected_results)

    # Load existing settings
    claude_dir = Path(".claude")
    settings_path = claude_dir / "settings.json"

    existing_settings = load_existing_settings(settings_path)

    # Merge permissions
    if "permissions" in existing_settings:
        final_permissions = merge_permissions(existing_settings["permissions"], new_permissions)
    else:
        final_permissions = new_permissions

    existing_settings["permissions"] = final_permissions

    # Create .claude directory if it doesn't exist
    claude_dir.mkdir(exist_ok=True)

    # Write settings
    with open(settings_path, 'w') as f:
        json.dump(existing_settings, f, indent=2)

    # Print summary
    print(f"\n✓ Permissions updated in {settings_path}", file=sys.stderr)
    print(f"\nGenerated permissions for: {', '.join(stacks)}", file=sys.stderr)
    print(f"\nPermissions added:", file=sys.stderr)
    for category in ['allow', 'ask', 'deny']:
        if category in final_permissions and final_permissions[category]:
            print(f"\n{category.upper()}:", file=sys.stderr)
            for perm in final_permissions[category]:
                print(f"  - {perm}", file=sys.stderr)

    # Show installation recommendations if shell-tools were detected but some are missing
    if detected_results and "shell-tools" in detected_results:
        shell_info = detected_results["shell-tools"]
        missing = shell_info.get("missing", [])
        if missing:
            print(f"\n💡 Optional shell tools not installed: {', '.join(missing)}", file=sys.stderr)
            print("   Install them for better productivity:", file=sys.stderr)
            print("   macOS: brew install " + " ".join(missing), file=sys.stderr)
            print("   Linux: Use your package manager (apt, dnf, pacman, etc.)", file=sys.stderr)

if __name__ == "__main__":
    main()
