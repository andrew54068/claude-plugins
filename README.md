# Claude Plugins

A collection of Claude Code plugins. Each plugin can be installed independently.

## Plugins

| Plugin | Description |
|--------|-------------|
| [permission-guardian](./permission-guardian) | Detects tech stacks and generates Claude Code permission configurations |
| [browser-mcp-selector](./browser-mcp-selector) | Selects the best browser MCP tool for a given task |
| [security-scan](./security-scan) | 6-agent parallel security scanner for malicious code, credential leaks, and prompt injection |
| [skills-manager](./skills-manager) | Manage per-project skills, plugins, and MCP servers via a bullpen + symlink pattern (Claude + Codex) |
| [ralph-expert](./ralph-expert) | Turn a vague task into a well-structured Ralph Loop prompt with completion criteria and a max-iteration safety net (requires the `ralph-loop` plugin) |

## Install

Add the marketplace, then install plugins:

```bash
# Add the marketplace
/plugin marketplace add https://github.com/andrew54068/claude-plugins

# Install individual plugins
/plugin install permission-guardian@andrew54068
/plugin install browser-mcp-selector@andrew54068
/plugin install security-scan@andrew54068
/plugin install skills-manager@andrew54068
/plugin install ralph-expert@andrew54068
```

Or from a local path:

```bash
/plugin marketplace add /path/to/claude-plugins
/plugin install permission-guardian@andrew54068
```

## License

MIT
