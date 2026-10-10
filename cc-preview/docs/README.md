# Design history

Notes from 2026-10-03, written before cc-preview and kept for the record. They describe earlier
designs, not how cc-preview works. `<project root>`, `<worktree>` and `<session id>` stand for
local folders and ids.

- [Remote preview design](superpowers/specs/2026-10-03-claude-code-remote-preview-mod-design.md)
  and [plan](superpowers/plans/2026-10-03-claude-code-remote-preview-mod.md): pictures on a remote
  machine shown in the conversation, through a Claude Code mod over ssh backed by an MCP server
  and MCP App.
- [Native preview design](superpowers/specs/2026-10-03-claude-code-preview-mod-design.md) and
  [plan](superpowers/plans/2026-10-03-claude-code-preview-mod.md): a terminal mod for markdown,
  images, video and pasted images.
- [Claude Code 2.1.288 TUI API probe](probes/tui-2.1.288.md): what the mod API and the paste cache
  did when tried.
