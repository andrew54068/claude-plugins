#!/usr/bin/env python3
"""
Detect tech stacks in a project directory.
Outputs JSON with detected technologies and their indicator files.
"""

import os
import sys
import json
import shutil
from pathlib import Path

# Define indicator files for each tech stack
STACK_INDICATORS = {
    "node": ["package.json", "yarn.lock", "pnpm-lock.yaml", "package-lock.json", "bun.lockb"], # Added bun.lockb
    "python": ["requirements.txt", "setup.py", "pyproject.toml", "Pipfile", "poetry.lock", "uv.lock"],
    "rust": ["Cargo.toml", "Cargo.lock"],
    "go": ["go.mod", "go.sum"],
    "docker": ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".dockerignore"],
    "git": [".git/config"],
    "make": ["Makefile"],
    "ruby": ["Gemfile", "Gemfile.lock"],
    "java": ["pom.xml", "build.gradle", "build.gradle.kts"],
}

# Shell tools to check for installation
SHELL_TOOLS = ["fd", "rg", "ast-grep", "fzf", "jq", "yq"]

def check_shell_tools():
    """
    Check which modern shell tools are installed.
    Returns dict with installed tools and missing tools.
    """
    installed = []
    missing = []

    for tool in SHELL_TOOLS:
        if shutil.which(tool):
            installed.append(tool)
        else:
            missing.append(tool)

    return {
        "installed": installed,
        "missing": missing
    }

def detect_stacks(directory):
    """
    Scan directory for stack indicator files.
    Returns dict of detected stacks with confidence scores.
    """
    detected = {}

    for stack, indicators in STACK_INDICATORS.items():
        found = []
        for indicator in indicators:
            path = Path(directory) / indicator
            if path.exists():
                found.append(indicator)

        if found:
            detected[stack] = {
                "detected": True,
                "indicators": found,
                "confidence": round(len(found) / len(indicators), 2)
            }

    # Check for installed shell tools
    shell_tools = check_shell_tools()
    if shell_tools["installed"]:
        detected["shell-tools"] = {
            "detected": True,
            "indicators": shell_tools["installed"],
            "confidence": round(len(shell_tools["installed"]) / len(SHELL_TOOLS), 2),
            "missing": shell_tools["missing"]
        }

    return detected, shell_tools

def main():
    directory = sys.argv[1] if len(sys.argv) > 1 else "."

    if not Path(directory).exists():
        print(f"Error: Directory '{directory}' does not exist", file=sys.stderr)
        sys.exit(1)

    results, shell_tools = detect_stacks(directory)

    # Output JSON for machine parsing
    print(json.dumps(results, indent=2))

    # Also output human-readable summary to stderr
    print("\n=== Tech Stack Detection Summary ===", file=sys.stderr)
    if results:
        for stack, info in results.items():
            if stack == "shell-tools":
                installed_str = ", ".join(info['indicators'])
                print(f"✓ {stack}: {installed_str} installed", file=sys.stderr)
                if info.get('missing'):
                    missing_str = ", ".join(info['missing'])
                    print(f"  ℹ️  Optional tools not installed: {missing_str}", file=sys.stderr)
            else:
                indicators_str = ", ".join(info['indicators'])
                print(f"✓ {stack}: {indicators_str}", file=sys.stderr)
    else:
        print("No tech stacks detected in this directory.", file=sys.stderr)

    # Show shell tools installation recommendation if any are missing
    if shell_tools["missing"] and not shell_tools["installed"]:
        print("\n💡 Tip: Install modern shell tools for better productivity:", file=sys.stderr)
        print("   macOS: brew install fd ripgrep ast-grep fzf jq yq", file=sys.stderr)
        print("   Linux: Use your package manager (apt, dnf, pacman, etc.)", file=sys.stderr)
    elif shell_tools["missing"]:
        print(f"\n💡 Tip: {len(shell_tools['missing'])} optional shell tools not installed: {', '.join(shell_tools['missing'])}", file=sys.stderr)

if __name__ == "__main__":
    main()
