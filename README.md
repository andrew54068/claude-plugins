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
| [open-source-prep](./open-source-prep) | Prepare a private codebase for safe open-source release with secret scanning, license guidance, and standard repository documentation |
| [cc-preview](./cc-preview) | 在 Claude Code 預覽對話裡的圖片與 Markdown：滑鼠移上去看預覽、送出前的貼圖縮圖、側邊面板；ssh 顯示真實像素，mosh 用方塊字元畫圖 |

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
/plugin install open-source-prep@andrew54068
/plugin install cc-preview@andrew54068
```

Or from a local path:

```bash
/plugin marketplace add /path/to/claude-plugins
/plugin install permission-guardian@andrew54068
```

## 預覽 Mod：cc-preview

已加入 `andrew54068` 市集者，可在 shell 更新來源並安裝：

```sh
claude plugin marketplace update andrew54068
claude plugin install cc-preview@andrew54068
```

程式在 [cc-preview/](./cc-preview)，需要 Claude Code 2.1.289 以上。說明、ssh／mosh 的行為與權限範圍見該目錄的 README。

## License

MIT
