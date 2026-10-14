// Draws a markdown file's blocks (markdown.ts) with the pane's own elements, the way a terminal
// previewer such as glow lays one out: real grids for tables, at any width; bullets, numbers and
// ☐ ☑ beside their text; quotes and GitHub's alerts behind a bar; code in a box, highlighted.
import type { Elements, RenderElement, RenderNode, TextProps } from 'claude-code'

import { cellWidth, isWide } from './layout'
import type { Alert, Align, Block, Inline, Style } from './markdown'
import { normalize } from './paths'

export type DocUi = Pick<Elements['terminal'], 'Box' | 'Text' | 'Link' | 'Code'>

/** A picture a file names: its address as written, and the cells across it may take. */
export type PictureAsk = { src: string; columns: number }

export const pictureKey = (ask: PictureAsk) => `${ask.columns}|${ask.src}`

export type Drawing = {
  ui: DocUi
  /** The five alerts' titles, in the pane's language. */
  alerts: Record<Alert, string>
  /** The file's folder, which a relative link points from; without it such a link is only text. */
  folder?: string
  /** Pictures drawn for the asks of an earlier pass, by `pictureKey`; null for one that can't be. */
  pictures?: ReadonlyMap<string, RenderElement | null>
  /** Gathers the pictures this pass has no drawing for. Without it or `pictures`, images are named. */
  asks?: PictureAsk[]
}

// Theme keys, so the colors follow Claude Code's light, dark and ANSI themes
const ACCENT = 'claude'
const CODE = 'permission'
const LINK = 'suggestion'
const ALERT_COLORS: Record<Alert, string> = { note: 'suggestion', tip: 'success', important: 'merged', warning: 'warning', caution: 'error' }
const ALERT_GLYPHS: Record<Alert, string> = { note: 'ⓘ', tip: '✦', important: '❢', warning: '⚠', caution: '⊘' }
const BULLETS = ['•', '◦', '▪']
// A Text's string is bounded; a longer run is handed over in pieces
const MAX_STRING = 4_000
// A Code's source is bounded at 10000 characters; a longer block is drawn as several
const CODE_CHARS = 9_000
// A tree is at most 32 deep: containers past this many are drawn without their frames
const MAX_NEST = 6

/** Whether the rows just above and below a block are blank: a gap, or a quote's empty frame row. */
type Place = { isTopOpen: boolean; isBottomOpen: boolean }

// ── Runs ─────────────────────────────────────────────────────────────────────

function propsOf(style: Style): TextProps {
  const props: TextProps = {}
  if (style.bold === true) props.bold = true
  if (style.italic === true || style.math === true) props.italic = true
  if (style.strikethrough === true) props.strikethrough = true
  if (style.underline === true) props.underline = true
  if (style.key === true) props.inverse = true
  if (style.mark === true) {
    props.color = 'inverseText'
    props.backgroundColor = 'warning'
  }
  if (style.code === true) props.color = CODE
  if (style.ref === true || style.href !== undefined) props.color = LINK
  if (style.dim === true) props.dimColor = true
  return props
}

const basename = (src: string) => src.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').at(-1) ?? src

/** What a run shows: an image not drawn as a picture is named, a key padded like a keycap. */
function shown(item: Inline): string {
  if (item.type === 'break') return '\n'
  if (item.type === 'image') return `▣ ${item.alt.trim() === '' ? basename(item.src) : item.alt}`
  return item.style.key === true ? ` ${item.text} ` : item.text
}

function pieces(text: string): string[] {
  const out: string[] = []
  for (let at = 0; at < text.length; at += MAX_STRING) out.push(text.slice(at, at + MAX_STRING))
  return out
}

/** Where a link goes: as written with a scheme, a file:// URL for a relative one, null for none. */
export function linkTarget(href: string, folder: string | undefined): string | null {
  if (href === '' || href.startsWith('#')) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href
  if (folder === undefined) return null
  const path = href.replace(/[?#].*$/, '')
  return `file://${normalize(path.startsWith('/') ? path : `${encodeURI(folder)}/${path}`)}`
}

const hrefOf = (item: Inline | undefined) => (item === undefined || item.type === 'break' ? undefined : item.style.href)

/** Runs as Text children, the runs that look alike merged. */
function styledNodes(items: readonly Inline[], Text: DocUi['Text']): RenderNode[] {
  const nodes: RenderNode[] = []
  let text = ''
  let props: TextProps = {}
  let key = ''
  const flush = () => {
    if (text === '') return
    if (Object.keys(props).length === 0) nodes.push(...pieces(text))
    else nodes.push(<Text {...props}>{pieces(text)}</Text>)
    text = ''
  }
  for (const item of items) {
    const next =
      item.type === 'break' ? {} : item.type === 'image' && item.style.href === undefined ? { ...propsOf(item.style), dimColor: true } : propsOf(item.style)
    const nextKey = JSON.stringify(next)
    if (nextKey !== key) {
      flush()
      props = next
      key = nextKey
    }
    text += shown(item)
  }
  flush()
  return nodes
}

/** Runs as a Text's children: a link's runs inside its Link. */
function runNodes(content: readonly Inline[], d: Drawing): RenderNode[] {
  const { Link, Text } = d.ui
  const out: RenderNode[] = []
  let at = 0
  while (at < content.length) {
    const href = hrefOf(content[at])
    const group: Inline[] = []
    while (at < content.length && hrefOf(content[at]) === href) group.push(content[at++] as Inline)
    const nodes = styledNodes(group, Text)
    const target = href === undefined ? null : linkTarget(href, d.folder)
    if (target === null) out.push(...nodes)
    else out.push(<Link href={target}>{nodes}</Link>)
  }
  return out
}

const isBlank = (item: Inline | undefined) => item !== undefined && (item.type === 'break' || (item.type === 'text' && item.text.trim() === ''))

/** Runs without the spaces and breaks at their ends. */
function trimmed(content: readonly Inline[]): Inline[] {
  const out = [...content]
  while (isBlank(out[0])) out.shift()
  while (isBlank(out.at(-1))) out.pop()
  const first = out[0]
  if (first?.type === 'text') out[0] = { ...first, text: first.text.trimStart() }
  const last = out.at(-1)
  if (last?.type === 'text') out[out.length - 1] = { ...last, text: last.text.trimEnd() }
  return out
}

/** Which runs are images on a line of their own (beside other images at most): those are drawn as pictures. */
function standalone(content: readonly Inline[]): Set<number> {
  const alone = new Set<number>()
  let line: number[] = []
  const end = () => {
    if (line.every(at => content[at]?.type === 'image' || isBlank(content[at]))) for (const at of line) if (content[at]?.type === 'image') alone.add(at)
    line = []
  }
  content.forEach((item, at) => {
    if (item.type === 'break' || (item.type === 'text' && item.isSoft === true)) end()
    else line.push(at)
  })
  end()
  return alone
}

// ── Pictures ─────────────────────────────────────────────────────────────────

function pictureOf(src: string, columns: number, d: Drawing): RenderElement | null {
  if (d.pictures === undefined && d.asks === undefined) return null
  const ask = { src, columns }
  const key = pictureKey(ask)
  const drawn = d.pictures?.get(key)
  if (drawn !== undefined) return drawn
  if (d.asks !== undefined && !d.asks.some(known => pictureKey(known) === key)) d.asks.push(ask)
  return null
}

// ── Tables ───────────────────────────────────────────────────────────────────

type Unit = { char: string; width: number; style: Style }
type Line = Inline[]

const isBreakAfter = (char: string) => char === ' ' || char === '-' || char === '/' || isWide(char)

function merged(units: readonly Unit[]): Line {
  const line: Line = []
  for (const unit of units) {
    const last = line.at(-1)
    if (last?.type === 'text' && last.style === unit.style) line[line.length - 1] = { ...last, text: last.text + unit.char }
    else line.push({ type: 'text', text: unit.char, style: unit.style })
  }
  return line
}

/**
 * A cell's runs in lines of at most `width` cells: broken at spaces, after `-` and `/`, around CJK
 * characters, and inside a word only where it can't fit whole.
 */
export function wrapRuns(content: readonly Inline[], width: number): Line[] {
  const lines: Unit[][] = []
  let line: Unit[] = []
  let used = 0
  const end = () => {
    while (line.at(-1)?.char === ' ') line.pop()
    lines.push(line)
    line = []
    used = 0
  }
  for (const item of content) {
    if (item.type === 'break') {
      end()
      continue
    }
    const style = item.type === 'image' && item.style.href === undefined ? { ...item.style, dim: true } : item.style
    for (const char of shown(item).replace(/[\t\n]/g, ' ')) {
      const unit = { char, width: cellWidth(char), style }
      if (char === ' ' && line.length === 0) continue
      if (used + unit.width > width && line.length > 0) {
        if (char === ' ') {
          end()
          continue
        }
        // The last place the line may end, a CJK character itself being one; never after a
        // hyphen or slash that would stand alone
        let at = isWide(char) ? line.length - 1 : -1
        for (let i = line.length - 1; at < 0 && i >= 0; i--) {
          const known = line[i]?.char ?? ''
          if ((isBreakAfter(known) && (i > 0 || known === ' ' || isWide(known))) || isWide(line[i + 1]?.char ?? '')) at = i
        }
        const tail = at >= 0 && at < line.length - 1 ? line.slice(at + 1) : []
        line = line.slice(0, line.length - tail.length)
        end()
        while (tail[0]?.char === ' ') tail.shift()
        line = tail
        used = tail.reduce((sum, known) => sum + known.width, 0)
      }
      line.push(unit)
      used += unit.width
    }
  }
  end()
  return lines.map(merged)
}

const lineWidth = (line: Line) => line.reduce((sum, item) => sum + (item.type === 'text' ? cellWidth(item.text) : 0), 0)

/** Spread `room` cells over shares weighed by `weights`, whole cells, the remainders to the largest fractions. */
function spread(room: number, weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0 || room <= 0) return weights.map(() => 0)
  const exact = weights.map(weight => (room * weight) / total)
  const whole = exact.map(Math.floor)
  let left = room - whole.reduce((sum, cells) => sum + cells, 0)
  const order = exact.map((value, i) => ({ i, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction)
  for (const { i } of order) {
    if (left <= 0) break
    whole[i] = (whole[i] ?? 0) + 1
    left--
  }
  return whole
}

const sum = (cells: readonly number[]) => cells.reduce((total, cell) => total + cell, 0)

/** The widest line and the longest word (24 cells at most counted) of each column. */
function measure(rows: readonly (readonly (readonly Inline[])[])[], columns: number): { natural: number[]; word: number[] } {
  const natural = Array.from({ length: columns }, () => 1)
  const word = Array.from({ length: columns }, () => 1)
  for (const row of rows) {
    row.forEach((cell, i) => {
      const text = cell.map(shown).join('')
      for (const part of text.split('\n')) natural[i] = Math.max(natural[i] ?? 1, cellWidth(part))
      for (const part of text.split(/\s+/)) word[i] = Math.max(word[i] ?? 1, Math.min(cellWidth(part), 24))
    })
  }
  return { natural, word }
}

/**
 * Column widths for a table drawn `width` cells wide, and the padding each side of a cell. Columns
 * get their whole text when it fits; else each its longest word, the rest going where the most text
 * is left; else the header's words first, so a column's name never breaks while it can be helped.
 * Cramped, the padding goes first.
 */
export function columnWidths(head: readonly (readonly Inline[])[] | null, rows: readonly (readonly (readonly Inline[])[])[], columns: number, width: number): { widths: number[]; pad: number } {
  const { natural, word } = measure(head === null ? rows : [head, ...rows], columns)
  const least = natural.map((cells, i) => Math.min(cells, word[i] ?? 1))
  const named = head === null ? natural.map(cells => Math.min(cells, 2)) : measure([head], columns).word.map((cells, i) => Math.min(cells, least[i] ?? 1))
  const roomFor = (pad: number) => width - (columns + 1) - 2 * pad * columns
  const pad = roomFor(1) >= sum(head === null ? least : named) ? 1 : 0
  const room = Math.max(columns, roomFor(pad))
  if (sum(natural) <= room) return { widths: natural, pad }
  if (sum(least) <= room) {
    const extra = spread(room - sum(least), natural.map((cells, i) => cells - (least[i] ?? 0)))
    return { widths: least.map((cells, i) => cells + (extra[i] ?? 0)), pad }
  }
  const floor = sum(named) <= room ? named : spread(room, named).map(cells => Math.max(1, cells))
  const extra = spread(room - sum(floor), least.map((cells, i) => cells - (floor[i] ?? 0)))
  return { widths: floor.map((cells, i) => Math.max(1, cells + (extra[i] ?? 0))), pad }
}

const BORDER: Style = { dim: true }

/** A table as lines of runs, borders among them, each line exactly as wide as the table. */
export function tableLines(block: Extract<Block, { type: 'table' }>, width: number): Line[] {
  const columns = Math.max(1, block.aligns.length, block.head.length, ...block.rows.map(row => row.length))
  const head = block.head.length === 0 ? null : block.head.map(cell => cell.map(item => (item.type === 'break' ? item : { ...item, style: { ...item.style, bold: true } })))
  const rows = block.rows
  const { widths, pad } = columnWidths(head, rows, columns, width)
  const space = ' '.repeat(pad)
  const rule = (left: string, middle: string, right: string): Line => [
    { type: 'text', text: left + widths.map(cells => '─'.repeat(cells + 2 * pad)).join(middle) + right, style: BORDER },
  ]
  const rowLines = (row: readonly (readonly Inline[])[]): Line[] => {
    const wrapped = widths.map((cells, i) => wrapRuns(row[i] ?? [], cells))
    const height = Math.max(1, ...wrapped.map(lines => lines.length))
    return Array.from({ length: height }, (_, k) => {
      const line: Line = []
      const border = (text: string) => {
        const last = line.at(-1)
        if (last?.type === 'text' && last.style === BORDER) line[line.length - 1] = { ...last, text: last.text + text }
        else line.push({ type: 'text', text, style: BORDER })
      }
      border('│' + space)
      widths.forEach((cells, i) => {
        const content = wrapped[i]?.[k] ?? []
        const left = cells - lineWidth(content)
        const align: Align = block.aligns[i] ?? 'left'
        const before = align === 'right' ? left : align === 'center' ? Math.floor(left / 2) : 0
        if (before > 0) border(' '.repeat(before))
        line.push(...content)
        border(' '.repeat(Math.max(0, left - before)) + space + (i === widths.length - 1 ? '│' : '│' + space))
      })
      return line
    })
  }
  const body = rows.map(rowLines)
  const isTall = body.some(lines => lines.length > 1)
  const out: Line[] = [rule('┌', '┬', '┐')]
  if (head !== null) out.push(...rowLines(head), rule('├', '┼', '┤'))
  body.forEach((lines, i) => {
    if (i > 0 && isTall) out.push(rule('├', '┼', '┤'))
    out.push(...lines)
  })
  out.push(rule('└', '┴', '┘'))
  return out
}

// ── Blocks ───────────────────────────────────────────────────────────────────

function drawBlock(block: Block, width: number, d: Drawing, nest: number, place: Place): RenderElement[] {
  const { Box, Code, Text } = d.ui
  switch (block.type) {
    case 'heading': {
      const props: TextProps =
        block.level <= 3 ? { bold: true, color: ACCENT } : block.level === 4 ? { bold: true } : block.level === 5 ? { bold: true, dimColor: true } : { italic: true, dimColor: true }
      const title = <Text {...props}>{runNodes(block.content, d)}</Text>
      if (block.level > 2) return [title]
      return [
        <Box flexDirection="column">
          {title}
          {block.level === 1 ? <Text color={ACCENT}>{'━'.repeat(width)}</Text> : <Text dimColor>{'─'.repeat(width)}</Text>}
        </Box>,
      ]
    }
    case 'paragraph':
      return drawParagraph(block.content, width, d)
    case 'summary':
      return [
        <Text bold>
          {'▾ '}
          {runNodes(block.content, d)}
        </Text>,
      ]
    case 'code': {
      const parts = codeParts(block.text)
      return [
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          {parts.map(source => (block.language === '' ? <Code source={source} /> : <Code source={source} language={block.language} />))}
        </Box>,
      ]
    }
    case 'math':
      return [
        <Box flexDirection="column" alignItems="center">
          {block.text.split('\n').map(line => (
            <Text italic>{line}</Text>
          ))}
        </Box>,
      ]
    case 'rule':
      return [<Text dimColor>{'─'.repeat(width)}</Text>]
    case 'table':
      return [
        <Box flexDirection="column">
          {tableLines(block, width).map(line => (
            <Text wrap="truncate-end">{runNodes(line, d)}</Text>
          ))}
        </Box>,
      ]
    case 'quote': {
      const color = block.alert === null ? undefined : ALERT_COLORS[block.alert]
      const title =
        block.alert === null ? null : (
          <Text bold color={color}>
            {`${ALERT_GLYPHS[block.alert]} `}
            {block.title === null ? d.alerts[block.alert] : runNodes(block.title, d)}
          </Text>
        )
      if (nest >= MAX_NEST) return [...(title === null ? [] : [title]), ...drawBlocks(block.blocks, width, d, nest)]
      const body = drawBlocks(block.blocks, Math.max(1, width - 3), d, nest + 1, 1, { top: title === null, bottom: true })
      // The bar's frame has an empty row above and below it: laid over blank rows next to it
      const margins = { ...(place.isTopOpen ? { marginTop: -1 } : {}), ...(place.isBottomOpen ? { marginBottom: -1 } : {}) }
      return [
        <Box flexDirection="column" borderStyle="quote" {...(color === undefined ? { borderDimColor: true } : { borderColor: color })} paddingLeft={1} {...margins}>
          {title}
          {body.length > 0 && (
            <Box flexDirection="column" rowGap={1}>
              {body}
            </Box>
          )}
        </Box>,
      ]
    }
    case 'list': {
      const digits = String(block.start + block.items.length - 1).length
      const markers = block.items.map((item, i): [string, TextProps] => {
        if (item.task === 'done') return ['☑', { color: 'success' }]
        if (item.task === 'open') return ['☐', { dimColor: true }]
        if (block.isOrdered) return [`${String(block.start + i).padStart(digits)}.`, {}]
        return [BULLETS[nest % BULLETS.length] ?? '•', { dimColor: true }]
      })
      return [drawItems(markers, block.items.map(item => item.blocks), block.isTight, width, d, nest)]
    }
    case 'notes':
      return [
        <Box flexDirection="column">
          <Text dimColor>{'─'.repeat(Math.min(width, 24))}</Text>
          {drawItems(
            block.notes.map(note => [`[${note.n}]`, { color: LINK }]),
            block.notes.map(note => note.blocks),
            true,
            width,
            d,
            nest,
          )}
        </Box>,
      ]
  }
}

function drawItems(markers: readonly [string, TextProps][], items: readonly Block[][], isTight: boolean, width: number, d: Drawing, nest: number): RenderElement {
  const { Box, Text } = d.ui
  const markerWidth = Math.max(1, ...markers.map(([marker]) => cellWidth(marker))) + 1
  const inner = Math.max(1, width - markerWidth)
  const gap = isTight ? 0 : 1
  if (nest >= MAX_NEST) {
    return (
      <Box flexDirection="column" rowGap={gap}>
        {items.flatMap((blocks, i) => [<Text {...(markers[i]?.[1] ?? {})}>{markers[i]?.[0] ?? ''}</Text>, ...drawBlocks(blocks, width, d, nest, gap)])}
      </Box>
    )
  }
  return (
    <Box flexDirection="column" rowGap={gap}>
      {items.map((blocks, i) => {
        const [marker = '', props = {}] = markers[i] ?? []
        return (
          <Box flexDirection="row">
            <Text {...props}>{`${' '.repeat(markerWidth - 1 - cellWidth(marker))}${marker} `}</Text>
            <Box flexDirection="column" width={inner} rowGap={gap}>
              {drawBlocks(blocks, inner, d, nest + 1, gap)}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** A paragraph: its text, broken where a picture stands on a line of its own; one inside a sentence is named. */
function drawParagraph(content: readonly Inline[], width: number, d: Drawing): RenderElement[] {
  const { Text } = d.ui
  const out: RenderElement[] = []
  let run: Inline[] = []
  const flush = () => {
    const text = trimmed(run)
    if (text.length > 0) out.push(<Text>{runNodes(text, d)}</Text>)
    run = []
  }
  const alone = standalone(content)
  for (const [at, item] of content.entries()) {
    const picture = item.type === 'image' && alone.has(at) ? pictureOf(item.src, width, d) : null
    if (picture === null) {
      run.push(item)
      continue
    }
    flush()
    out.push(picture)
  }
  flush()
  return out
}

function codeParts(text: string): string[] {
  if (text.length <= CODE_CHARS) return [text === '' ? ' ' : text]
  const parts: string[] = []
  let part = ''
  for (const line of text.split('\n')) {
    for (let at = 0; at < Math.max(1, line.length); at += CODE_CHARS) {
      const piece = line.slice(at, at + CODE_CHARS)
      if (part !== '' && part.length + piece.length + 1 > CODE_CHARS) {
        parts.push(part)
        part = ''
      }
      part = part === '' ? piece : `${part}\n${piece}`
    }
  }
  if (part !== '') parts.push(part)
  return parts
}

function drawBlocks(blocks: readonly Block[], width: number, d: Drawing, nest: number, gap = 1, edges = { top: false, bottom: false }): RenderElement[] {
  return blocks.flatMap((block, i) =>
    drawBlock(block, width, d, nest, { isTopOpen: i > 0 ? gap > 0 : edges.top, isBottomOpen: i < blocks.length - 1 ? gap > 0 : edges.bottom }),
  )
}

/** A file's blocks drawn `width` cells wide: one column, a blank row between blocks. */
export function drawDocument(blocks: readonly Block[], width: number, d: Drawing): RenderElement {
  const { Box } = d.ui
  return (
    <Box flexDirection="column" rowGap={1}>
      {drawBlocks(blocks, Math.max(10, width), d, 0)}
    </Box>
  )
}

// ── Pages ────────────────────────────────────────────────────────────────────
// A tree holds at most 100,000 characters of text and 20,000 nodes, or the engine draws none of
// it. A long file is cut into pages well under both, between blocks, and a block too big for a
// page alone into halves (a code block between lines, a table between rows, with its header).

export const PAGE_CHARS = 60_000
export const PAGE_NODES = 8_000

export type Size = { chars: number; nodes: number }

const runsSize = (content: readonly Inline[]): Size => ({
  chars: content.reduce((sum, item) => sum + shown(item).length, 0),
  nodes: content.length * 3,
})

const plus = (a: Size, b: Size): Size => ({ chars: a.chars + b.chars, nodes: a.nodes + b.nodes })

/** About how much text, and how many nodes, a block draws as: never less. */
export function sizeOf(block: Block, width: number): Size {
  switch (block.type) {
    case 'heading':
      return plus(runsSize(block.content), { chars: width, nodes: 4 })
    case 'paragraph':
    case 'summary':
      return plus(runsSize(block.content), { chars: 2, nodes: 2 })
    case 'code':
      return { chars: block.text.length, nodes: 2 + Math.ceil(block.text.length / CODE_CHARS) * 2 }
    case 'math':
      return { chars: block.text.length, nodes: 2 + block.text.split('\n').length * 2 }
    case 'rule':
      return { chars: width, nodes: 2 }
    case 'table': {
      const lines = tableLines(block, width)
      return lines.reduce((sum, line) => plus(sum, runsSize(line)), { chars: 0, nodes: 1 + lines.length })
    }
    case 'quote':
      return block.blocks.reduce((sum, child) => plus(sum, sizeOf(child, width)), plus(runsSize(block.title ?? []), { chars: 12, nodes: 4 }))
    case 'list':
      return block.items.reduce((sum, item) => item.blocks.reduce((total, child) => plus(total, sizeOf(child, width)), plus(sum, { chars: 8, nodes: 5 })), { chars: 0, nodes: 1 })
    case 'notes':
      return block.notes.reduce((sum, note) => note.blocks.reduce((total, child) => plus(total, sizeOf(child, width)), plus(sum, { chars: 8, nodes: 5 })), { chars: width, nodes: 3 })
  }
}

function halve<T>(list: readonly T[]): [T[], T[]] {
  const middle = Math.ceil(list.length / 2)
  return [list.slice(0, middle), list.slice(middle)]
}

/** A block cut in two where it may be, or null where it can't. */
function halves(block: Block): [Block, Block] | null {
  switch (block.type) {
    case 'code':
    case 'math': {
      const lines = block.text.split('\n')
      if (lines.length < 2) {
        const middle = Math.ceil(block.text.length / 2)
        return block.text.length < 2 ? null : [{ ...block, text: block.text.slice(0, middle) }, { ...block, text: block.text.slice(middle) }]
      }
      const [a, b] = halve(lines)
      return [{ ...block, text: a.join('\n') }, { ...block, text: b.join('\n') }]
    }
    case 'table': {
      if (block.rows.length < 2) return null
      const [a, b] = halve(block.rows)
      return [{ ...block, rows: a }, { ...block, rows: b }]
    }
    case 'list': {
      if (block.items.length < 2) return null
      const [a, b] = halve(block.items)
      return [{ ...block, items: a }, { ...block, items: b, start: block.start + a.length }]
    }
    case 'quote': {
      if (block.blocks.length < 2) return null
      const [a, b] = halve(block.blocks)
      return [{ ...block, blocks: a }, { ...block, blocks: b }]
    }
    case 'notes': {
      if (block.notes.length < 2) return null
      const [a, b] = halve(block.notes)
      return [{ ...block, notes: a }, { ...block, notes: b }]
    }
    case 'paragraph':
    case 'heading':
    case 'summary': {
      if (block.content.length < 2) {
        const only = block.content[0]
        if (only?.type !== 'text' || only.text.length < 2) return null
        const middle = Math.ceil(only.text.length / 2)
        return [
          { ...block, content: [{ ...only, text: only.text.slice(0, middle) }] },
          { ...block, content: [{ ...only, text: only.text.slice(middle) }] },
        ]
      }
      const [a, b] = halve(block.content)
      return [{ ...block, content: a }, { ...block, content: b }]
    }
    case 'rule':
      return null
  }
}

const fits = (size: Size) => size.chars <= PAGE_CHARS && size.nodes <= PAGE_NODES

/** `block`, or its parts when it is too big for a page alone. */
function fitted(block: Block, width: number): Block[] {
  if (fits(sizeOf(block, width))) return [block]
  const parts = halves(block)
  return parts === null ? [block] : parts.flatMap(part => fitted(part, width))
}

/** A file's blocks as pages that each draw under the engine's bounds `width` cells wide. */
export function paginate(blocks: readonly Block[], width: number): Block[][] {
  const pages: Block[][] = []
  let page: Block[] = []
  let used: Size = { chars: 0, nodes: 0 }
  for (const block of blocks.flatMap(block => fitted(block, width))) {
    const size = sizeOf(block, width)
    if (page.length > 0 && !fits(plus(used, size))) {
      // A heading goes on with what it heads
      const carried = page.length > 1 && page.at(-1)?.type === 'heading' ? page.splice(-1) : []
      pages.push(page)
      page = carried
      used = carried.reduce((total, known) => plus(total, sizeOf(known, width)), { chars: 0, nodes: 0 })
    }
    page.push(block)
    used = plus(used, size)
  }
  if (page.length > 0 || pages.length === 0) pages.push(page)
  return pages
}
