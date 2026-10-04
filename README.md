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
| [tui-preview-mod](./tui-preview-mod) | 在 Claude Code 終端預覽 Markdown、圖片、無聲影片與送出前的貼圖；需要可載入 Mods 的 Claude Code、Node、ffmpeg／ffprobe |

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
/plugin install tui-preview-mod@andrew54068
```

Or from a local path:

```bash
/plugin marketplace add /path/to/claude-plugins
/plugin install permission-guardian@andrew54068
```

## 終端預覽 Mod

已加入 `andrew54068` 市集者，可在 shell 更新來源並安裝：

```sh
claude plugin marketplace update andrew54068
claude plugin install tui-preview-mod@andrew54068
```

若曾安裝 `tui-preview-mod@preview-mods`，先記錄其 `roots`／`autoPreview`，再卸載舊外掛，避免同名 Mod 同時載入；卸載會移除舊外掛的保存設定。新版本安裝後重新套用那些設定，尤其是 `autoPreview: false`。不需要為此移除其他市集。

執行程式公開放在 [tui-preview-mod/](./tui-preview-mod)，不需要私人 repo 存取權。版本 `0.1.2` 已附權限、相容性與驗證說明；**安裝成功不代表 Anthropic 的 Mod 開關允許載入，也不代表終端圖片像素已驗證**。

## License

MIT
