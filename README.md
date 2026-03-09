# Claude Plugins

A collection of Claude Code plugins. Each plugin can be installed independently.

## Plugins

| Plugin | Description |
|--------|-------------|
| [permission-guardian](./permission-guardian) | Detects tech stacks and generates Claude Code permission configurations |
| [browser-mcp-selector](./browser-mcp-selector) | Selects the best browser MCP tool for a given task |
| [security-scan](./security-scan) | 6-agent parallel security scanner for malicious code, credential leaks, and prompt injection |

## Install All Plugins

```bash
claude plugin add https://github.com/andrew54068/claude-plugins
```

## Install Individually

Each plugin has its own `.claude-plugin/` directory and can be installed on its own:

```bash
# Permission Guardian
claude plugin add https://github.com/andrew54068/claude-plugins/tree/main/permission-guardian

# Browser MCP Selector
claude plugin add https://github.com/andrew54068/claude-plugins/tree/main/browser-mcp-selector

# Security Scan
claude plugin add https://github.com/andrew54068/claude-plugins/tree/main/security-scan
```

Or from a local path:

```bash
claude plugin add /path/to/claude-plugins/permission-guardian
claude plugin add /path/to/claude-plugins/browser-mcp-selector
claude plugin add /path/to/claude-plugins/security-scan
```

## License

MIT
