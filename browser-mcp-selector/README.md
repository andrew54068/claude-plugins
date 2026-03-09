# Browser MCP Selector

A Claude Code plugin that helps you choose the best browser MCP tool for any given task. If you have multiple browser MCPs installed (Chrome DevTools MCP, Playwright MCP, Chrome MCP, Browser MCP, BrowserTools MCP), this skill analyzes your requirements and recommends the optimal tool.

## Install

```bash
claude plugin add /path/to/claude-plugins/browser-mcp-selector
```

Or install from GitHub:

```bash
claude plugin add https://github.com/andrew54068/claude-plugins/tree/main/browser-mcp-selector
```

## Usage

The skill is automatically invoked when Claude detects you need browser automation and have multiple MCP options available. You can also invoke it directly:

```
/browser-mcp-selector I need to run Lighthouse audits on my website
```

## What It Does

| Requirement | Recommended MCP |
|---|---|
| Cross-browser (Firefox/Safari/Edge) | Playwright MCP |
| Deep perf tracing, CPU/network emulation | Chrome DevTools MCP |
| Lighthouse-style audits (a11y, SEO, perf) | BrowserTools MCP |
| Bookmark/history management | Chrome MCP |
| Simple automation, minimal setup | Chrome DevTools MCP or Playwright MCP |
| Login state with zero config | Chrome MCP, Browser MCP, or BrowserTools MCP |

## Comparison Data

The plugin includes a comprehensive comparison table covering:

- Browser & page control capabilities
- Interaction & DOM operations
- Debugging & monitoring features
- Visual & environment simulation
- Performance analysis & auditing

See [references/comparison.md](references/comparison.md) for the full comparison.

## License

MIT
