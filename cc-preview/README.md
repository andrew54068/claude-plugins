# cc-preview

A Claude Code mod that previews the images and markdown files of a conversation: hover cards in
the transcript, thumbnails above the prompt, and a side pane to read or browse them. It covers
everything [cc-image-view](https://github.com/GGGODLIN/cc-mod-image-view) does, so it replaces it.

- **Pasted images in the prompt:** while the draft holds `[Image #n]` tags, a row of thumbnails
  sits above the prompt. Press `#n ⤢` under one to open it in the pane.
- **Sent prompts:** each pasted image gets an `[ img #n ]` button. Hover it to see the picture;
  click it, or the card's `⤢ Zoom`, to open it in the pane.
- **Images and markdown in the conversation:** a reply, a prompt or a tool row that names an image
  (`.png .jpg .jpeg .gif .webp`) or a markdown file (`.md .markdown .mdx`) that exists gets a
  button per file (`▣ chart.png`, `≡ plan.md`). Hover for the picture or the file's first lines;
  click to open it in the pane. A tool that returns a picture (an MCP screenshot) gets one too.
- **Browse everything:** `/preview` lists every artifact in the conversation, images first, newest
  first. In the pane: `1`–`9` pick, `p` / `n` page, `a` back to the list, `c` copies the path,
  `g` switches graphics and blocks, `i` / `o` zoom and `h` `j` `k` `l` move (blocks, docked),
  `r` refreshes, `Esc` closes. `/preview <path>` opens one file.

Hover and click need a mouse, which Claude Code has in its fullscreen layout (`"tui": "fullscreen"`).
The pane docks beside the transcript from 110 columns; narrower (a split terminal), it opens above
the prompt instead.

## Install

From the `andrew54068` marketplace:

```sh
claude plugin marketplace add andrew54068/claude-plugins
claude plugin install cc-preview@andrew54068 --scope user
```

cc-preview replaces `tui-preview-mod` and `cc-image-view`: they draw in the same places, and
tui-preview-mod registers `/preview` too, so whichever sits above wins. Uninstall or disable them:

```sh
claude plugin uninstall tui-preview-mod@andrew54068
claude plugin disable cc-image-view@cc-mod-image-view
```

Or for one session from a clone: `claude --plugin-dir /path/to/claude-plugins/cc-preview`.

Needs Claude Code 2.1.289 or later. Pictures need a terminal with kitty graphics (Ghostty, kitty),
or block mode (below); markdown draws in any terminal.

## Pictures over ssh, mosh and multiplexers

Every picture is sent to the terminal as bytes, never as a file name, so it shows when Claude Code
runs on another machine.

- **ssh:** kitty graphics pass through. In Herdr, export `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` when
  `HERDR_ENV=1` (Herdr passes the graphics, but Claude Code can't tell).
- **Graphics or characters, found for you.** Pictures use kitty graphics only where they are known
  to reach the screen; everywhere else they are drawn in quadrant block characters (`▘▝▀▖▌▞▛`,
  four pixels a cell, 24-bit color), which every terminal and mosh carry. The terminal can't be
  asked directly (its reply would land in Claude Code's input), so the path to it is read: the
  processes above Claude Code, and through herdr, tmux, zellij or screen, the client whose
  terminal had input last. Graphics need all of: Claude Code sending them
  (`CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`, or a kitty, Ghostty or WezTerm terminal), no mosh on the
  path, and a local terminal app that draws them. Looked at again every 5 s, so detaching and
  attaching over another connection switches within seconds; the pane's mode button names what
  was found (`▦ Blocks · mosh`, `▣ Graphics · ssh`, `▣ Graphics · ghostty`).
- **mosh** keeps its own copy of the screen and sends only text and colors, so graphics never
  reach the client. Characters are a hard ceiling: a 100-column pane holds 200 pixels across. A
  short pane fills its width and scrolls (↑↓). Docked beside the transcript, the picture zooms:
  `i` / `o` step from the fit up to 100% (each pixel of the picture a pixel of the blocks across),
  and `h` `j` `k` `l` move the window. For the whole picture at full resolution at once, use ssh.
- The `pictures` option (`/config`) pins the choice: `auto` (default), `graphics` or `blocks`.
  `g` in the pane switches it until the path changes.

`Image` takes at most 2 MiB of PNG: a JPEG, GIF or WebP is converted once, a bigger PNG is shrunk
until it fits, and hover cards get a copy at most 512 px long. Block pictures are read from a BMP
the converter writes at twice the cell size each way. Converters are tried in order, 10 s each: `sips` (macOS),
`ffmpeg`, `magick`, `convert`; only `sips` has been tried. Copies go to
`<Claude Code temp dir>/cc-preview/<session id>/`, made private (700) after ownership and
permission checks; nothing is written when a check fails, and nothing is deleted.

## What it reads and runs

- Files the conversation names, only with the extensions above: stat to show a button, read for a
  hover card or the pane (markdown up to 4 MiB, drawn in pieces of 9000 characters, at most 40).
- The conversation through `$.session.messages`, when the list opens, after each turn while it is
  open, and once for a resumed conversation's pasted images; a sent prompt's images as it is stored.
- The draft every 200 ms, and the paste cache `<temp dir>/<project>/<session>/images/`.
- `~/.claude/settings.json` (or the one under `CLAUDE_CONFIG_DIR`) once, for the language.
- External commands: `id -u`, `sh`, `ps` and `stat` (every 5 s, for the path), `mkdir`, `chmod`, `find`, `head`, `base64`, `mv`, and the
  converters, arguments passed as arguments, never spliced into shell code.
- No network, no model calls.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `pictures` | `auto`, `graphics`, `blocks` | `auto` |
| `language` | `auto`, `en`, `zh-TW` (auto follows Claude Code's `language`, then `LC_ALL` / `LANG`) | `auto` |

## Checks

```sh
claude plugin validate .
claude plugin test .
tsc -p .   # TypeScript 5.5 or later
```

## Credits

The paste-cache lookup, converters, private-folder check, hover cards, thumbnail layout and
language picking are adapted from
[GGGODLIN/cc-mod-image-view](https://github.com/GGGODLIN/cc-mod-image-view) and
[jarrodwatts/claude-image-view](https://github.com/jarrodwatts/claude-image-view), MIT. See NOTICE.
