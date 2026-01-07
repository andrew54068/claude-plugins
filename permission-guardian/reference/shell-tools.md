# Modern Shell Tools (Optional)

Modern replacements for traditional Unix commands that provide better performance and user experience.

**These tools are optional** and will only be included in permissions if they are detected as installed on your system. The permission guardian will remind you to install any missing tools if you'd like to use them.

## Recommended Permissions

Permissions are generated dynamically based on which tools are actually installed:

```json
{
  "allowed_commands": [
    {
      "command": "fd",
      "description": "Modern find replacement - fast file searching",
      "patterns": ["*"]
    },
    {
      "command": "rg",
      "description": "Ripgrep - fast text search tool",
      "patterns": ["*"]
    },
    {
      "command": "ast-grep",
      "description": "Structural code search and analysis",
      "patterns": ["*"]
    },
    {
      "command": "fzf",
      "description": "Fuzzy finder for interactive selection",
      "patterns": ["*"]
    },
    {
      "command": "jq",
      "description": "JSON processor and query tool",
      "patterns": ["*"]
    },
    {
      "command": "yq",
      "description": "YAML/XML processor and query tool",
      "patterns": ["*"]
    }
  ]
}
```

## Tools Overview

| Tool | Purpose | Replaces |
|------|---------|----------|
| `fd` | Find files | `find`, `ls -R` |
| `rg` (ripgrep) | Search text | `grep`, `ag` |
| `ast-grep` | Analyze code structure | `grep`, `sed` |
| `fzf` | Interactive selection | Manual filtering |
| `jq` | Process JSON | `python -m json.tool` |
| `yq` | Process YAML/XML | Manual parsing |

## Installation

These tools are recommended but not required. Install any or all of them:

**macOS:**
```bash
brew install fd ripgrep ast-grep fzf jq yq
```

**Linux (Ubuntu/Debian):**
```bash
apt install fd-find ripgrep fzf jq
cargo install ast-grep
snap install yq
```

**Linux (Fedora):**
```bash
dnf install fd-find ripgrep fzf jq yq
cargo install ast-grep
```

**Rust-based (any platform):**
```bash
cargo install fd-find ripgrep ast-grep
```

## Usage Examples

**fd** - Fast file finding:
```bash
fd '\.js$'              # Find all .js files
fd -e py                # Find all Python files
fd -t f config          # Find files named config
```

**rg** - Fast text search:
```bash
rg "TODO"               # Search for TODO in all files
rg -t js "import"       # Search only in JavaScript files
rg -i "error" --json    # Case-insensitive with JSON output
```

**ast-grep** - Structural code search:
```bash
ast-grep -p 'function $NAME() { $$$ }'  # Find function declarations
ast-grep --lang typescript -p 'interface $$$'  # Find interfaces
```

**jq** - JSON processing:
```bash
cat package.json | jq '.dependencies'
echo '{"name":"test"}' | jq -r '.name'
```

**yq** - YAML/XML processing:
```bash
yq '.services.web.image' docker-compose.yml
yq -i '.version = "2.0"' config.yaml
```
