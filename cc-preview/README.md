# cc-preview

A Claude Code mod that previews the images and markdown files of a conversation: hover cards in
the transcript, thumbnails above the prompt, and a side pane to read or browse them.

- **Pasted images in the prompt:** while the draft holds `[Image #n]` tags, a row of thumbnails
  sits above the prompt. Press `#n ⤢` under one to open it in the pane.
- **Sent prompts:** each pasted image gets an `[ img #n ]` button. Hover it to see the picture;
  click it, or the card's `⤢ Zoom`, to open it in the pane.
- **Images and markdown in the conversation:** a reply, a prompt or a tool row that names an image
  (`.png .jpg .jpeg .gif .webp`) or a markdown file (`.md .markdown .mdx`) that exists gets a
  button per file (`▣ chart.png`, `≡ plan.md`). Hover for the picture or the file's first lines;
  click to open it in the pane. A tool that returns a picture (an MCP screenshot) gets one too.
- **Markdown as a preview draws it:** a file is read with markdown-it, the parser VS Code's
  preview uses, and drawn as it shows: headings, bold, italic, ~~strikethrough~~, links you can
  click, tables as grids at any width (cells wrap, column names stay whole), lists with ☐ / ☑
  tasks, quotes and GitHub's `> [!NOTE]` alerts, highlighted code, rules, footnotes, `$math$` in
  Unicode (`E = mc²`, `∑ᵢ₌₁ⁿ`), raw HTML (`<kbd>`, `<details>`, `<img>`, tables) and the pictures it
  shows from its folder. A long file is drawn in pages.
- **Browse everything:** `/preview` lists every artifact in the conversation, images first, newest
  first. In the pane: `1`–`9` pick, `p` / `n` page, `a` back to the list, `c` copies the path,
  `g` switches graphics and blocks, `i` / `o` zoom and `h` `j` `k` `l` move (blocks, docked),
  `b` / `f` turn a long file's pages, `r` refreshes, `Esc` closes. `/preview <path>` opens one file.

Hover and click need a mouse, which Claude Code has in its fullscreen layout (`"tui": "fullscreen"`).
The pane docks beside the transcript from 110 columns; narrower (a split terminal), it opens above
the prompt instead.

## Install

From the `andrew54068` marketplace:

```sh
claude plugin marketplace add andrew54068/claude-plugins
claude plugin install cc-preview@andrew54068 --scope user
```

Or for one session from a clone: `claude --plugin-dir /path/to/claude-plugins/cc-preview`.

Needs Claude Code 2.1.289 or later. Markdown draws in any terminal. Pictures use kitty graphics
by default. Set `pictures` to `blocks` for mosh or a terminal without kitty graphics. `auto`
chooses from `TERM_PROGRAM`, `TERM` and `CLAUDE_CODE_FORCE_TERMINAL_IMAGES` at startup; it does
not inspect processes or detect connection changes.

Herdr passes kitty graphics but reports `TERM=xterm-256color`, so Claude Code can't tell and
Claude Code may not send them. For graphics, tell it in `~/.zshrc` or `~/.bashrc` (new panes only):

```sh
if [ -n "$HERDR_ENV" ]; then
  export CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1
fi
```

The pane's mode button names what was found: `▣ Graphics · …` or `▦ Blocks · …`.

## Pictures over ssh, mosh and multiplexers

Every picture is sent to the terminal as bytes, never as a file name, so it shows when Claude Code
runs on another machine.

- **ssh:** kitty graphics pass through.
- **Graphics or characters (`pictures: auto`).** Reads terminal environment values once.
  No process-table scans, terminal-device checks or connection-detection timer. Environment
  values can stay unchanged after a multiplexer reconnect; use `g` or `pictures: blocks` if the
  current connection cannot carry graphics. The pane's mode button shows the terminal value.
- **mosh** keeps its own copy of the screen and sends only text and colors, so graphics never
  reach the client. Characters are a hard ceiling: a 100-column pane holds 200 pixels across. A
  short pane fills its width and scrolls (↑↓). Docked beside the transcript, the picture zooms:
  `i` / `o` step from the fit up to 100% (each pixel of the picture a pixel of the blocks across),
  and `h` `j` `k` `l` move the window. For the whole picture at full resolution at once, use ssh.
- The `pictures` option (`/config`) pins the choice: `graphics` (default), `auto` or `blocks`.
  `g` in the pane switches it for this plugin load; no background check resets your choice.

`Image` takes at most 2 MiB of PNG: a JPEG, GIF or WebP is converted once, a bigger PNG is shrunk
until it fits, and hover cards get a copy at most 512 px long. Block pictures are read from a BMP
the converter writes at twice the cell size each way. Converters are tried in order, 10 s each: `sips` (macOS),
`ffmpeg`, `magick`, `convert`; only `sips` has been tried. Copies go to
`<Claude Code temp dir>/cc-preview/<session id>/`, made private (700) after ownership and
permission checks; nothing is written when a check fails, and nothing is deleted.

## What it reads and runs

- Files the conversation names, only with the extensions above: stat to show a button, read for a
  hover card or the pane (markdown up to 4 MiB, drawn in pages of at most 60,000 characters, as a
  pane holds 100,000), and the pictures a markdown file shows from its folder. A picture's web
  address is never fetched: it is named instead (`▣ build`).
- The conversation through `$.session.messages`, when the list opens, after each turn while it is
  open, and once for a resumed conversation's pasted images; a sent prompt's images as it is stored.
- The draft every 1 s, only in an interactive terminal or after its draft band draws. Unchanged,
  resolved image tags do not scan files. Missing images get at most five attempts per image-tag
  list, with one image-folder listing per attempt. To retry after that limit, remove the image
  tags, wait at least 1 s, and paste again. Polling stops at session end. The paste cache is `<temp dir>/<project>/<session>/images/`.
- `~/.claude/settings.json` (or the one under `CLAUDE_CONFIG_DIR`) once, for the language.
- External commands: `id -u` (once if the temp directory is not configured), `sh`, `mkdir`,
  `chmod`, `find`, `head`, `base64`, `mv`, and converters for private scratch storage and image
  preparation. Arguments are passed separately, never spliced into shell code. No `ps`, shell
  `ls`, or terminal-device `stat` commands.
- No network, no model calls.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `pictures` | `auto`, `graphics`, `blocks` | `graphics` |
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

Markdown is read with [markdown-it](https://github.com/markdown-it/markdown-it) and
[markdown-it-footnote](https://github.com/markdown-it/markdown-it-footnote), MIT, bundled in
`hooks/vendor/` with what they import; their licenses are in `hooks/vendor/LICENSES.txt`.
