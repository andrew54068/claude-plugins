// A markdown file read the way VS Code's preview reads it: markdown-it (bundled in vendor/, the
// parser VS Code uses) with GitHub's tables and strikethrough, raw HTML, bare links, footnotes and
// `$` math. Its tokens are turned into the few kinds of block and run the pane draws.
import { isWide } from './layout'
import { lowered, raised, texToText } from './tex'
import { footnote, markdownIt } from './vendor/markdown-it.js'
import type { BlockRule, InlineRule, MarkdownIt, Token } from './vendor/markdown-it.js'

/** How a run of text is drawn. */
export type Style = {
  bold?: boolean
  italic?: boolean
  strikethrough?: boolean
  underline?: boolean
  /** Inline code, `<code>`, `<samp>`. */
  code?: boolean
  /** `<kbd>`: a key. */
  key?: boolean
  /** `<mark>`: highlighted. */
  mark?: boolean
  math?: boolean
  /** A footnote reference, `[1]`. */
  ref?: boolean
  /** `<small>`, `<sub>` and `<sup>` text without a Unicode form. */
  dim?: boolean
  /** `<sub>` / `<sup>`: drawn lowered or raised where Unicode has the glyphs. */
  sub?: boolean
  sup?: boolean
  /** Inside a link: where it goes, as written. */
  href?: string
}

export type Inline =
  /** `isSoft`: a line break in the source, drawn as a space (none between CJK characters). */
  | { type: 'text'; text: string; style: Style; isSoft?: true }
  | { type: 'break' }
  | { type: 'image'; src: string; alt: string; style: Style }

export type Align = 'left' | 'center' | 'right'
export type Alert = 'note' | 'tip' | 'important' | 'warning' | 'caution'
export type Task = 'open' | 'done'

export type Item = { task: Task | null; blocks: Block[] }
export type Note = { n: number; blocks: Block[] }

export type Block =
  | { type: 'heading'; level: number; content: Inline[] }
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'code'; language: string; text: string }
  | { type: 'math'; text: string }
  | { type: 'quote'; alert: Alert | null; title: Inline[] | null; blocks: Block[] }
  | { type: 'list'; isOrdered: boolean; start: number; isTight: boolean; items: Item[] }
  | { type: 'table'; aligns: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { type: 'rule' }
  | { type: 'summary'; content: Inline[] }
  | { type: 'notes'; notes: Note[] }

// ── Math ─────────────────────────────────────────────────────────────────────
// `$...$` and `$$...$$` as VS Code's math extension reads them: an opening `$` not followed by a
// space, a closing one not preceded by a space nor followed by a digit, so `$5 and $10` is text.

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char)

const mathInline: InlineRule = (state, silent) => {
  const src = state.src
  if (src[state.pos] !== '$') return false
  const isDisplay = src[state.pos + 1] === '$'
  const open = state.pos + (isDisplay ? 2 : 1)
  if (isSpace(src[open])) return false
  let close = open
  for (;;) {
    close = src.indexOf(isDisplay ? '$$' : '$', close)
    if (close < 0 || close >= state.posMax) return false
    let slashes = 0
    while (src[close - 1 - slashes] === '\\') slashes++
    if (slashes % 2 === 0 && !isSpace(src[close - 1])) break
    close++
  }
  const after = close + (isDisplay ? 2 : 1)
  if (!isDisplay && /[0-9]/.test(src[after] ?? '')) return false
  if (close === open) return false
  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.markup = isDisplay ? '$$' : '$'
    token.content = src.slice(open, close)
  }
  state.pos = after
  return true
}

const mathBlock: BlockRule = (state, startLine, endLine, silent) => {
  const begin = state.bMarks[startLine] ?? 0
  const start = begin + (state.tShift[startLine] ?? 0)
  const max = state.eMarks[startLine] ?? 0
  if ((state.sCount[startLine] ?? 0) - state.blkIndent >= 4) return false
  if (state.src.slice(start, start + 2) !== '$$') return false
  const first = state.src.slice(start + 2, max)
  let body: string
  let next = startLine
  if (first.trim().endsWith('$$') && first.trim().length >= 2) {
    body = first.trim().slice(0, -2)
  } else {
    let last: string | null = null
    for (next = startLine + 1; next < endLine; next++) {
      const from = (state.bMarks[next] ?? 0) + (state.tShift[next] ?? 0)
      const line = state.src.slice(from, state.eMarks[next] ?? from)
      if ((state.sCount[next] ?? 0) < state.blkIndent && line.trim() !== '') return false
      if (line.trimEnd().endsWith('$$')) {
        last = line.trimEnd().slice(0, -2)
        break
      }
    }
    // Never closed: not math
    if (last === null) return false
    body = [first, state.getLines(startLine + 1, next, state.tShift[startLine] ?? 0, false), last].filter(part => part.trim() !== '').join('\n')
  }
  if (silent) return true
  state.line = next + 1
  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = body
  token.markup = '$$'
  token.map = [startLine, state.line]
  return true
}

function math(md: MarkdownIt) {
  md.inline.ruler.after('escape', 'math_inline', mathInline)
  md.block.ruler.after('blockquote', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })
}

// As VS Code sets it up: raw HTML, bare https:// and mailto links (no guessing at `plan.md`)
const md = markdownIt({ html: true, linkify: true }).use(footnote).use(math)
md.linkify.set({ fuzzyLink: false })

// ── Runs ─────────────────────────────────────────────────────────────────────

const STYLE_TAGS: Record<string, Style> = {
  b: { bold: true },
  strong: { bold: true },
  i: { italic: true },
  em: { italic: true },
  cite: { italic: true },
  dfn: { italic: true },
  var: { italic: true },
  u: { underline: true },
  ins: { underline: true },
  s: { strikethrough: true },
  del: { strikethrough: true },
  strike: { strikethrough: true },
  code: { code: true },
  tt: { code: true },
  samp: { code: true },
  kbd: { key: true },
  mark: { mark: true },
  small: { dim: true },
  sub: { sub: true },
  sup: { sup: true },
}

/** One attribute of an HTML tag, entities decoded; undefined when absent. */
function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i').exec(tag)
  if (match === null) return undefined
  return md.utils.unescapeAll(match[1] ?? match[2] ?? match[3] ?? '')
}

/** Builds a list of runs, keeping the styles open at each point. */
class Runs {
  readonly out: Inline[] = []
  private frames: { tag: string; style: Style }[] = []
  private softs: number[] = []

  constructor(private readonly base: Style = {}) {}

  get style(): Style {
    return Object.assign({}, this.base, ...this.frames.map(frame => frame.style)) as Style
  }

  open(tag: string, style: Style) {
    this.frames.push({ tag, style })
  }

  close(tag: string) {
    const at = this.frames.map(frame => frame.tag).lastIndexOf(tag)
    if (at >= 0) this.frames.splice(at, 1)
  }

  text(text: string, extra?: Style) {
    if (text === '') return
    const style = extra === undefined ? this.style : { ...this.style, ...extra }
    let shown = text.replace(/\t/g, '    ')
    if (style.sup === true || style.sub === true) {
      const script = style.sup === true ? raised(shown) : lowered(shown)
      if (script === null) style.dim = true
      else shown = script
    }
    this.out.push({ type: 'text', text: shown, style })
  }

  /** A line break in the source: a space, or nothing between two CJK characters. */
  soft() {
    this.softs.push(this.out.length)
    this.out.push({ type: 'text', text: ' ', style: this.style, isSoft: true })
  }

  hard() {
    this.out.push({ type: 'break' })
  }

  image(src: string, alt: string) {
    this.out.push({ type: 'image', src, alt, style: this.style })
  }

  /** An inline HTML tag: a style opened or closed, a break, a picture; others are dropped. */
  html(raw: string) {
    const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>$/s.exec(raw.trim())
    if (match === null) return
    const [, slash = '', name = '', attrs = '', selfClosing = ''] = match
    const tag = name.toLowerCase()
    if (tag === 'br') return this.hard()
    if (tag === 'img') return this.image(attribute(attrs, 'src') ?? '', attribute(attrs, 'alt') ?? '')
    const style = tag === 'a' ? (attribute(attrs, 'href') === undefined ? undefined : { href: attribute(attrs, 'href') }) : STYLE_TAGS[tag]
    if (slash !== '') this.close(tag)
    else if (style !== undefined && selfClosing === '') this.open(tag, style)
  }

  done(): Inline[] {
    for (const at of this.softs) {
      const before = this.out[at - 1]
      const after = this.out[at + 1]
      const soft = this.out[at]
      const last = before?.type === 'text' ? [...before.text].at(-1) : undefined
      const next = after?.type === 'text' ? [...after.text][0] : undefined
      if (soft?.type === 'text' && last !== undefined && next !== undefined && isWide(last) && isWide(next)) this.out[at] = { ...soft, text: '' }
    }
    return this.out.filter(item => item.type !== 'text' || item.text !== '' || item.isSoft === true)
  }
}

function runsOf(tokens: readonly Token[] | null, base: Style = {}): Inline[] {
  const runs = new Runs(base)
  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'text':
        runs.text(token.content)
        break
      case 'softbreak':
        runs.soft()
        break
      case 'hardbreak':
        runs.hard()
        break
      case 'strong_open':
        runs.open('strong', { bold: true })
        break
      case 'em_open':
        runs.open('em', { italic: true })
        break
      case 's_open':
        runs.open('s', { strikethrough: true })
        break
      case 'link_open':
        runs.open('a', { href: String(token.attrGet('href') ?? '') })
        break
      case 'strong_close':
      case 'em_close':
      case 's_close':
      case 'link_close':
        runs.close(token.type === 'link_close' ? 'a' : token.type.slice(0, -'_close'.length))
        break
      case 'code_inline':
        runs.text(token.content, { code: true })
        break
      case 'math_inline':
        runs.text(texToText(token.content).replace(/\n/g, ' '), { math: true })
        break
      case 'image':
        runs.image(String(token.attrGet('src') ?? ''), token.content)
        break
      case 'footnote_ref':
        runs.text(`[${Number((token.meta as { id?: number } | null)?.id ?? 0) + 1}]`, { ref: true })
        break
      case 'html_inline':
        runs.html(token.content)
        break
      case 'footnote_anchor':
        break
      default:
        if (token.content !== '') runs.text(token.content)
    }
  }
  return runs.done()
}

// ── Blocks ───────────────────────────────────────────────────────────────────

// GitHub's five, and Obsidian's callouts drawn as the nearest of them
const ALERTS: Record<string, Alert> = {
  note: 'note', info: 'note', todo: 'note', abstract: 'note', summary: 'note', tldr: 'note', question: 'note',
  help: 'note', faq: 'note', example: 'note', quote: 'note', cite: 'note',
  tip: 'tip', hint: 'tip', success: 'tip', check: 'tip', done: 'tip',
  important: 'important',
  warning: 'warning', attention: 'warning',
  caution: 'caution', danger: 'caution', error: 'caution', failure: 'caution', fail: 'caution', missing: 'caution', bug: 'caution',
}

/** A quote that opens with `[!NOTE]` (and maybe a title) is an alert. */
function quoteOf(blocks: Block[]): Block {
  const first = blocks[0]
  const lead = first?.type === 'paragraph' ? first.content[0] : undefined
  const match = lead?.type === 'text' ? /^\[!([A-Za-z]+)\][+-]?(?: +(.*))?$/.exec(lead.text) : null
  const alert = match === null ? undefined : ALERTS[(match[1] ?? '').toLowerCase()]
  if (first?.type !== 'paragraph' || match === null || alert === undefined) return { type: 'quote', alert: null, title: null, blocks }
  // The title runs to the end of the first line
  const rest = first.content.slice(1)
  const end = rest.findIndex(item => item.type === 'break' || (item.type === 'text' && item.isSoft === true))
  const titled = match[2] === undefined || match[2] === '' ? [] : [{ type: 'text' as const, text: match[2], style: {} }]
  const title = [...titled, ...(end < 0 ? rest : rest.slice(0, end))]
  const body = end < 0 ? [] : rest.slice(end + 1)
  return {
    type: 'quote',
    alert,
    title: title.length === 0 ? null : title,
    blocks: [...(body.length === 0 ? [] : [{ type: 'paragraph' as const, content: body }]), ...blocks.slice(1)],
  }
}

/** A list item that opens with `[ ]` or `[x]` is a task. */
function itemOf(blocks: Block[]): Item {
  const first = blocks[0]
  const lead = first?.type === 'paragraph' ? first.content[0] : undefined
  const match = lead?.type === 'text' ? /^\[([ xX])\](?:\s+|$)/.exec(lead.text) : null
  if (first?.type !== 'paragraph' || lead?.type !== 'text' || match === null) return { task: null, blocks }
  const rest = lead.text.slice(match[0].length)
  const content = rest === '' ? first.content.slice(1) : [{ ...lead, text: rest }, ...first.content.slice(1)]
  return { task: match[1] === ' ' ? 'open' : 'done', blocks: [...(content.length === 0 ? [] : [{ type: 'paragraph' as const, content }]), ...blocks.slice(1)] }
}

function alignOf(token: Token): Align {
  const style = String(token.attrGet('style') ?? '')
  return style.includes('right') ? 'right' : style.includes('center') ? 'center' : 'left'
}

class Reader {
  at = 0

  constructor(private readonly tokens: readonly Token[]) {}

  /** Blocks up to the token of type `until` (consumed), or the end. */
  blocks(until: string | null): Block[] {
    const out: Block[] = []
    while (this.at < this.tokens.length) {
      const token = this.tokens[this.at++]
      if (token === undefined || token.type === until) break
      switch (token.type) {
        case 'heading_open':
          out.push({ type: 'heading', level: Number(token.tag.slice(1)) || 1, content: runsOf(this.inline()) })
          break
        case 'paragraph_open': {
          const content = runsOf(this.inline())
          if (content.length > 0) out.push({ type: 'paragraph', content })
          break
        }
        case 'fence':
        case 'code_block':
          out.push({ type: 'code', language: token.info.trim().split(/\s+/)[0] ?? '', text: token.content.replace(/\n$/, '') })
          break
        case 'math_block':
          out.push({ type: 'math', text: texToText(token.content) })
          break
        case 'blockquote_open':
          out.push(quoteOf(this.blocks('blockquote_close')))
          break
        case 'bullet_list_open':
        case 'ordered_list_open':
          out.push(this.list(token))
          break
        case 'table_open':
          out.push(this.table())
          break
        case 'hr':
          out.push({ type: 'rule' })
          break
        case 'html_block':
          out.push(...htmlBlocks(token.content))
          break
        case 'footnote_block_open':
          out.push(this.notes())
          break
        default:
          break
      }
    }
    return out
  }

  /** The children of the inline token that follows, which is consumed. */
  private inline(): Token[] | null {
    const next = this.tokens[this.at]
    if (next?.type !== 'inline') return null
    this.at++
    return next.children
  }

  private list(open: Token): Block {
    const isOrdered = open.type === 'ordered_list_open'
    const close = isOrdered ? 'ordered_list_close' : 'bullet_list_close'
    // markdown-it hides the paragraphs of a tight list's items
    let isTight = true
    for (let at = this.at; at < this.tokens.length; at++) {
      const token = this.tokens[at]
      if (token === undefined || (token.type === close && token.level === open.level)) break
      if (token.type === 'paragraph_open' && token.level === open.level + 2 && !token.hidden) isTight = false
    }
    const items: Item[] = []
    while (this.at < this.tokens.length) {
      const token = this.tokens[this.at++]
      if (token === undefined || token.type === close) break
      if (token.type === 'list_item_open') items.push(itemOf(this.blocks('list_item_close')))
    }
    const start = Number(open.attrGet('start') ?? 1)
    return { type: 'list', isOrdered, start: Number.isFinite(start) ? start : 1, isTight, items }
  }

  private table(): Block {
    const aligns: Align[] = []
    const head: Inline[][] = []
    const rows: Inline[][][] = []
    let row: Inline[][] = []
    let isHead = false
    while (this.at < this.tokens.length) {
      const token = this.tokens[this.at++]
      if (token === undefined || token.type === 'table_close') break
      if (token.type === 'thead_open') isHead = true
      else if (token.type === 'thead_close') isHead = false
      else if (token.type === 'tr_open') row = []
      else if (token.type === 'tr_close') {
        if (isHead) head.push(...row)
        else rows.push(row)
      } else if (token.type === 'th_open' && isHead) aligns.push(alignOf(token))
      else if (token.type === 'inline') row.push(runsOf(token.children))
    }
    return { type: 'table', aligns, head, rows }
  }

  private notes(): Block {
    const notes: Note[] = []
    while (this.at < this.tokens.length) {
      const token = this.tokens[this.at++]
      if (token === undefined || token.type === 'footnote_block_close') break
      if (token.type === 'footnote_open') {
        const id = Number((token.meta as { id?: number } | null)?.id ?? notes.length)
        notes.push({ n: id + 1, blocks: this.blocks('footnote_close') })
      }
    }
    return { type: 'notes', notes }
  }
}

// ── HTML blocks ──────────────────────────────────────────────────────────────
// Raw HTML a file holds (a centred logo, a <details>, a layout table) drawn as what it shows:
// tags that make blocks start and end them, the rest style the text or are dropped.

const HTML_TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<![^>]*>|<\?[\s\S]*?(?:\?>|$)/g
const BLOCK_TAGS = new Set([
  'p', 'div', 'center', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'figure',
  'figcaption', 'address', 'blockquote', 'dl', 'dt', 'dd', 'details', 'fieldset', 'form', 'picture',
  'ul', 'ol', 'body', 'html', 'head', 'caption', 'thead', 'tbody', 'tfoot',
])
const HIDDEN_TAGS = new Set(['script', 'style', 'template', 'noscript', 'title', 'head'])

export function htmlBlocks(html: string): Block[] {
  const out: Block[] = []
  let runs = new Runs()
  let heading = 0
  let isSummary = false
  let pre: string | null = null
  let hidden: string | null = null
  let table: { head: Inline[][]; rows: Inline[][][]; row: Inline[][] | null; cell: Runs | null; hasHeader: boolean } | null = null
  const lists: { isOrdered: boolean; n: number }[] = []

  const target = () => table?.cell ?? runs
  const flush = () => {
    const content = trimRuns(runs.done())
    runs = new Runs()
    if (content.length === 0) return
    if (isSummary) out.push({ type: 'summary', content })
    else if (heading > 0) out.push({ type: 'heading', level: heading, content })
    else out.push({ type: 'paragraph', content })
  }
  const text = (raw: string) => {
    if (hidden !== null || raw === '') return
    const decoded = md.utils.unescapeAll(raw)
    if (pre !== null) {
      pre += decoded
      return
    }
    const into = target()
    const last = into.out.at(-1)
    const atStart = last === undefined || last.type === 'break' || (last.type === 'text' && last.text.endsWith(' '))
    const folded = decoded.replace(/\s+/g, ' ')
    into.text(atStart ? folded.replace(/^ /, '') : folded)
  }

  let at = 0
  for (const match of html.matchAll(HTML_TOKEN)) {
    text(html.slice(at, match.index))
    at = (match.index ?? 0) + match[0].length
    const name = match[2]?.toLowerCase()
    if (name === undefined) continue
    const isClose = match[1] === '/'
    const attrs = match[3] ?? ''
    if (hidden !== null) {
      if (isClose && name === hidden) hidden = null
      continue
    }
    if (pre !== null && !(isClose && name === 'pre')) continue
    if (HIDDEN_TAGS.has(name) && !isClose) {
      if (!/\/\s*$/.test(attrs)) hidden = name
    } else if (name === 'pre') {
      if (isClose) {
        out.push({ type: 'code', language: '', text: (pre ?? '').replace(/^\n/, '').replace(/\n$/, '') })
        pre = null
      } else {
        flush()
        pre = ''
      }
    } else if (/^h[1-6]$/.test(name)) {
      flush()
      heading = isClose ? 0 : Number(name.slice(1))
    } else if (name === 'summary') {
      flush()
      isSummary = !isClose
    } else if (name === 'hr') {
      flush()
      out.push({ type: 'rule' })
    } else if (name === 'br') {
      target().hard()
    } else if (name === 'img') {
      target().image(attribute(attrs, 'src') ?? '', attribute(attrs, 'alt') ?? '')
    } else if (name === 'table') {
      flush()
      if (!isClose) table = { head: [], rows: [], row: null, cell: null, hasHeader: false }
      else if (table !== null) {
        const width = Math.max(table.head.length, ...table.rows.map(row => row.length))
        if (width > 0) out.push({ type: 'table', aligns: Array.from({ length: width }, () => 'left'), head: table.head, rows: table.rows })
        table = null
      }
    } else if (name === 'tr' && table !== null) {
      if (!isClose) table.row = []
      else if (table.row !== null) {
        const isHeader = table.hasHeader && table.head.length === 0 && table.rows.length === 0
        if (isHeader) table.head = table.row
        else table.rows.push(table.row)
        table.row = null
        table.hasHeader = false
      }
    } else if ((name === 'td' || name === 'th') && table !== null) {
      if (!isClose) {
        table.cell = new Runs()
        if (name === 'th') table.hasHeader = true
      } else if (table.cell !== null) {
        table.row = [...(table.row ?? []), trimRuns(table.cell.done())]
        table.cell = null
      }
    } else if (name === 'li') {
      flush()
      const list = lists.at(-1)
      if (!isClose) {
        if (list !== undefined) list.n++
        runs.text(list?.isOrdered === true ? `${list.n}. ` : '• ')
      }
    } else if (name === 'ul' || name === 'ol') {
      flush()
      if (isClose) lists.pop()
      else lists.push({ isOrdered: name === 'ol', n: Number(attribute(attrs, 'start') ?? 1) - 1 })
    } else if (BLOCK_TAGS.has(name)) {
      flush()
    } else {
      target().html(match[0])
    }
  }
  text(html.slice(at))
  if (pre !== null) out.push({ type: 'code', language: '', text: pre })
  flush()
  return out
}

/** Runs without the spaces HTML would not show at their ends. */
function trimRuns(runs: Inline[]): Inline[] {
  const out = [...runs]
  while (out[0]?.type === 'break') out.shift()
  while (out.at(-1)?.type === 'break') out.pop()
  const first = out[0]
  if (first?.type === 'text') out[0] = { ...first, text: first.text.replace(/^\s+/, '') }
  const last = out.at(-1)
  if (last?.type === 'text') out[out.length - 1] = { ...last, text: last.text.replace(/\s+$/, '') }
  return out.filter(item => item.type !== 'text' || item.text !== '')
}

// ── The file ─────────────────────────────────────────────────────────────────

/** A file's text with tab and newline its only control characters, as the terminal draws it. */
function clean(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
}

const FRONT = /^---\n([\s\S]*?)\n---(?:\n|$)/

/** A markdown file as the blocks the pane draws. Front matter is shown as the YAML it is. */
export function parseMarkdown(text: string): Block[] {
  const unified = clean(text)
  const front = FRONT.exec(unified)
  const body = front === null ? unified : unified.slice(front[0].length)
  const blocks = new Reader(md.parse(body, {})).blocks(null)
  return front === null ? blocks : [{ type: 'code', language: 'yaml', text: front[1] ?? '' }, ...blocks]
}

/** The first `lines` lines of a file's body (at most `chars` characters), past any front matter, for a hover card. */
export function markdownHead(text: string, lines: number, chars: number): Block[] {
  const unified = clean(text)
  const body = unified.slice(FRONT.exec(unified)?.[0].length ?? 0).replace(/^\n+/, '').trimEnd()
  const head = body.split('\n').slice(0, lines).join('\n').slice(0, chars)
  const isCut = head.length < body.length
  return parseMarkdown(isCut ? `${head}\n\n…` : head)
}
