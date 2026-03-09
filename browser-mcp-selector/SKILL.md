---
name: browser-mcp-selector
description: Select the best browser MCP tool for a given task. Use when needing to automate, debug, test, or interact with web browsers and you have multiple browser MCP options available (Chrome DevTools MCP, Playwright MCP, Chrome MCP, Browser MCP, BrowserTools MCP). Helps choose the right tool based on task requirements like cross-browser support, debugging depth, performance analysis, auditing, or login state needs. When invoking, pass the task description and any browser/capability requirements as arguments.
context: fork
---

# Browser MCP Selector

You are helping select the best browser MCP tool for a user's task.

The user's request: $ARGUMENTS

## Instructions

1. Read the full comparison table at references/comparison.md
2. Analyze the user's requirements against the comparison data
3. Return a concise recommendation in this format:

**Recommended:** [MCP name(s)]
**Why:** [1-2 sentence reason]
**Key tools you'll use:** [specific tool names for the task]
**Setup note:** [any relevant setup info, e.g. "requires browser extension" or "no extension needed"]

If the task needs capabilities from multiple MCPs, recommend both and explain which handles what.

## Quick Reference (use if comparison.md is unavailable)

- Cross-browser (Firefox/Safari/Edge) → Playwright MCP (only option)
- Deep perf tracing, CPU/network emulation → Chrome DevTools MCP
- Lighthouse-style audits (a11y, SEO, perf) → BrowserTools MCP
- Bookmark/history management, cross-tab search → Chrome MCP
- Simple automation, minimal setup → Chrome DevTools MCP or Playwright MCP
- Login state with zero config → Chrome MCP, Browser MCP, or BrowserTools MCP
