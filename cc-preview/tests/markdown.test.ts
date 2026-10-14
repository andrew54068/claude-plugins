import { describe, expect, test } from 'claude-code/testing'

import { PAGE_CHARS, PAGE_NODES, columnWidths, linkTarget, paginate, sizeOf, tableLines, wrapRuns } from '../hooks/document'
import { cellWidth } from '../hooks/layout'
import { htmlBlocks, markdownHead, parseMarkdown } from '../hooks/markdown'
import type { Block, Inline } from '../hooks/markdown'
import { texToText } from '../hooks/tex'

const plain = (content: readonly Inline[]) =>
  content.map(item => (item.type === 'text' ? item.text : item.type === 'break' ? '\n' : `[${item.alt}]`)).join('')
const lineText = (line: readonly Inline[]) => line.map(item => (item.type === 'text' ? item.text : '')).join('')
const only = <T extends Block['type']>(blocks: readonly Block[], type: T) => blocks.find(block => block.type === type) as Extract<Block, { type: T }>

describe('reading markdown', () => {
  test('runs keep their styles, links their targets, soft breaks a space', () => {
    const [heading, paragraph] = parseMarkdown('# Title\n\nSome **bold**, *it*, ~~gone~~, `code` and [a link](https://e.com)\nnext line.')
    expect(heading).toEqual({ type: 'heading', level: 1, content: [{ type: 'text', text: 'Title', style: {} }] })
    expect(paragraph?.type).toBe('paragraph')
    const content = paragraph?.type === 'paragraph' ? paragraph.content : []
    expect(plain(content)).toBe('Some bold, it, gone, code and a link next line.')
    const styleOf = (text: string) => {
      const item = content.find(known => known.type === 'text' && known.text === text)
      return item?.type === 'text' ? item.style : undefined
    }
    expect(styleOf('bold')).toEqual({ bold: true })
    expect(styleOf('it')).toEqual({ italic: true })
    expect(styleOf('gone')).toEqual({ strikethrough: true })
    expect(styleOf('code')).toEqual({ code: true })
    expect(styleOf('a link')).toEqual({ href: 'https://e.com' })
  })

  test('a soft break between CJK characters is no space', () => {
    const [paragraph] = parseMarkdown('第一行\n第二行')
    expect(paragraph?.type === 'paragraph' ? plain(paragraph.content) : '').toBe('第一行第二行')
  })

  test('only addresses with a scheme become links, as VS Code reads them', () => {
    const [paragraph] = parseMarkdown('see https://e.com/x and plan.md and www.e.com')
    const content = paragraph?.type === 'paragraph' ? paragraph.content : []
    expect(content.filter(item => item.type === 'text' && item.style.href !== undefined).map(item => (item.type === 'text' ? item.text : ''))).toEqual(['https://e.com/x'])
  })

  test('a table keeps its alignment, its cells their styles', () => {
    const table = only(parseMarkdown('| Name | Role | Score |\n| :-- | :-: | --: |\n| **Al** | eng | 92 |\n| Bo |  | 7 |'), 'table')
    expect(table.aligns).toEqual(['left', 'center', 'right'])
    expect(table.head.map(plain)).toEqual(['Name', 'Role', 'Score'])
    expect(table.rows.map(row => row.map(plain))).toEqual([
      ['Al', 'eng', '92'],
      ['Bo', '', '7'],
    ])
    expect(table.rows[0]?.[0]?.[0]).toEqual({ type: 'text', text: 'Al', style: { bold: true } })
  })

  test('lists: tight or loose, ordered from their start, tasks open and done', () => {
    const [tasks, ordered, loose] = parseMarkdown('- [ ] todo\n- [x] done\n- plain\n\n3. three\n4. four\n\n* a\n\n* b\n')
    expect(tasks?.type === 'list' && tasks.items.map(item => [item.task, plain(only(item.blocks, 'paragraph').content)])).toEqual([
      ['open', 'todo'],
      ['done', 'done'],
      [null, 'plain'],
    ])
    expect(ordered?.type === 'list' && [ordered.isOrdered, ordered.start, ordered.isTight]).toEqual([true, 3, true])
    expect(loose?.type === 'list' && loose.isTight).toBe(false)
  })

  test("GitHub's alerts and Obsidian's callouts, a title or the kind's own", () => {
    const [note, callout, quote] = parseMarkdown('> [!NOTE]\n> Useful *info*.\n\n> [!danger] Mind the gap\n> body\n\n> just a quote')
    expect(note?.type === 'quote' && [note.alert, note.title, plain(only(note.blocks, 'paragraph').content)]).toEqual(['note', null, 'Useful info.'])
    expect(callout?.type === 'quote' && [callout.alert, plain(callout.title ?? []), plain(only(callout.blocks, 'paragraph').content)]).toEqual(['caution', 'Mind the gap', 'body'])
    expect(quote?.type === 'quote' && quote.alert).toBeNull()
  })

  test('footnotes are numbered, and listed at the end', () => {
    const blocks = parseMarkdown('A claim[^src] and another[^b].\n\n[^src]: The source.\n[^b]: Second.')
    expect(plain(only(blocks, 'paragraph').content)).toBe('A claim[1] and another[2].')
    const notes = only(blocks, 'notes')
    expect(notes.notes.map(note => [note.n, plain(only(note.blocks, 'paragraph').content)])).toEqual([
      [1, 'The source.'],
      [2, 'Second.'],
    ])
  })

  test('math inline and on its own lines; a price is not math', () => {
    const blocks = parseMarkdown('Energy $E = mc^2$ costs $5 and $10.\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$')
    expect(plain(only(blocks, 'paragraph').content)).toBe('Energy E = mc² costs $5 and $10.')
    expect(only(blocks, 'math').text).toBe('∑ᵢ₌₁ⁿ i = n(n+1)/2')
  })

  test('code keeps its language; front matter shows as YAML', () => {
    const blocks = parseMarkdown('---\ntitle: x\n---\n```ts\nconst a = 1\n```\n\n    indented\r\n')
    expect(blocks.filter(block => block.type === 'code')).toEqual([
      { type: 'code', language: 'yaml', text: 'title: x' },
      { type: 'code', language: 'ts', text: 'const a = 1' },
      { type: 'code', language: '', text: 'indented' },
    ])
  })

  test("a hover card's head skips front matter and says where it was cut", () => {
    const head = markdownHead('---\na: 1\n---\n# Plan\n\none\ntwo\nthree\nfour', 3, 1_000)
    expect(head.map(block => block.type)).toEqual(['heading', 'paragraph', 'paragraph'])
    expect(plain(only(head, 'paragraph').content)).toBe('one')
    expect(markdownHead('# Short', 3, 1_000)).toEqual([{ type: 'heading', level: 1, content: [{ type: 'text', text: 'Short', style: {} }] }])
  })
})

describe('raw HTML', () => {
  test('inline tags style the text, a break breaks, a comment shows nothing', () => {
    const [paragraph] = parseMarkdown('Press <kbd>Ctrl</kbd>+<b>C</b><br>H<sub>2</sub>O x<sup>2</sup> <!-- hidden --> end')
    const content = paragraph?.type === 'paragraph' ? paragraph.content : []
    expect(plain(content)).toBe('Press Ctrl+C\nH₂O x²  end')
    expect(content.find(item => item.type === 'text' && item.text === 'Ctrl')).toEqual({ type: 'text', text: 'Ctrl', style: { key: true } })
  })

  test('blocks: a heading, a centred picture, a summary, a list and a table', () => {
    const blocks = htmlBlocks(
      '<h2 align="center">Logo</h2>\n<p align="center"><img src="logo.png" alt="The logo" width="200"></p>\n<details><summary>More &amp; less</summary>\n<ul><li>one</li><li>two</li></ul>\n<table><tr><th>K</th><th>V</th></tr><tr><td>a</td><td><b>1</b></td></tr></table>',
    )
    expect(blocks.map(block => block.type)).toEqual(['heading', 'paragraph', 'summary', 'paragraph', 'paragraph', 'table'])
    expect(only(blocks, 'paragraph').content).toEqual([{ type: 'image', src: 'logo.png', alt: 'The logo', style: {} }])
    expect(plain(only(blocks, 'summary').content)).toBe('More & less')
    const table = only(blocks, 'table')
    expect([table.head.map(plain), table.rows.map(row => row.map(plain))]).toEqual([['K', 'V'], [['a', '1']]])
  })
})

describe('TeX as text', () => {
  test('symbols, scripts, fractions, roots and sets', () => {
    expect(texToText('\\alpha + \\beta \\leq \\infty')).toBe('α + β ≤ ∞')
    expect(texToText('x^{2} + y_i - z^{n+1}')).toBe('x² + yᵢ - zⁿ⁺¹')
    expect(texToText('e^{i\\pi}')).toBe('e^(iπ)')
    expect(texToText('\\frac{a+b}{c} = \\sqrt{x} \\cdot \\sqrt[3]{y}')).toBe('(a+b)/c = √x · ³√y')
    expect(texToText('\\mathbb{R}^n \\to \\mathbb{N}')).toBe('ℝⁿ → ℕ')
    expect(texToText('\\text{if } x \\in A \\quad 50\\% % a comment')).toBe('if x ∈ A  50%')
    expect(texToText('\\begin{cases} 1 & x > 0 \\\\ 0 & \\text{else} \\end{cases}')).toBe('1  x > 0\n0  else')
  })
})

describe('tables in the pane', () => {
  const table = (source: string) => tableLines(only(parseMarkdown(source), 'table'), 73)

  test('a table that fits is drawn whole, right and centred columns aligned', () => {
    const lines = table('| Name | Role | Score |\n| :-- | :-: | --: |\n| Alice | Engineer | 92 |\n| Bob | Designer | 7 |').map(lineText)
    expect(lines).toEqual([
      '┌───────┬──────────┬───────┐',
      '│ Name  │   Role   │ Score │',
      '├───────┼──────────┼───────┤',
      '│ Alice │ Engineer │    92 │',
      '│ Bob   │ Designer │     7 │',
      '└───────┴──────────┴───────┘',
    ])
  })

  test('a table wider than the pane is still a grid: its cells wrap, every line as wide', () => {
    const head = '| Plugin | Version | Scope | Hooks | Commands | Skills | Agents | MCP servers | License | Notes |\n|---|---|---|---|---|---|---|---|---|---|\n'
    const row = '| cc-preview | 0.3.0 | user | ui.render, session.start | /preview | none | none | none | MIT | hover cards and a side pane |\n'
    const lines = table(head + row + row).map(lineText)
    const widths = new Set(lines.map(cellWidth))
    expect(widths.size).toBe(1)
    expect([...widths][0]).toBeLessThanOrEqual(73)
    expect(lines[0]?.startsWith('┌')).toBe(true)
    expect(lines.at(-1)?.startsWith('└')).toBe(true)
    // Rows that wrap are kept apart by a rule
    expect(lines.filter(line => line.startsWith('├')).length).toBe(2)
    expect(lines.every(line => /^[┌├└│]/.test(line))).toBe(true)
  })

  test('columns get their whole text when it fits, else their longest word first', () => {
    const cell = (text: string): Inline[] => [{ type: 'text', text, style: {} }]
    expect(columnWidths(null, [[cell('ab'), cell('cdef')]], 2, 40)).toEqual({ widths: [2, 4], pad: 1 })
    const { widths } = columnWidths(null, [[cell('short'), cell('a much longer cell of words that must wrap somewhere')]], 2, 40)
    expect(widths[0]).toBe(5)
    expect(widths.reduce((sum, cells) => sum + cells, 0)).toBe(40 - 3 - 4)
    // Too cramped for every word: the column names stay whole
    const names = ['Plugin', 'Version', 'Scope', 'License'].map(cell)
    const cramped = columnWidths(names, [['skills-manager', '0.1.0', 'project', 'MIT'].map(cell)], 4, 34)
    expect(cramped).toEqual({ widths: [9, 7, 6, 7], pad: 0 })
  })

  test('a cell wraps at spaces, after a hyphen or slash, between CJK characters', () => {
    const wrap = (text: string, width: number) => wrapRuns([{ type: 'text', text, style: {} }], width).map(lineText)
    expect(wrap('one two three', 7)).toEqual(['one two', 'three'])
    expect(wrap('skills-manager', 8)).toEqual(['skills-', 'manager'])
    expect(wrap('skills-manager', 6)).toEqual(['skills', '-manag', 'er'])
    expect(wrap('中文字很多', 4)).toEqual(['中文', '字很', '多'])
    expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  })
})

describe('links', () => {
  test('a relative link opens the file beside the document', () => {
    expect(linkTarget('https://e.com/a', '/w/docs')).toBe('https://e.com/a')
    expect(linkTarget('../spec%20one.md#part', '/w/my docs')).toBe('file:///w/spec%20one.md')
    expect(linkTarget('#heading', '/w')).toBeNull()
    expect(linkTarget('spec.md', undefined)).toBeNull()
  })
})

describe('pages', () => {
  test('a long file is cut between blocks into pages under the bounds of a tree', () => {
    const text = Array.from({ length: 3_000 }, (_, i) => `## Part ${i}\n\nSome words for part ${i}, ${'more '.repeat(10)}`).join('\n\n')
    const blocks = parseMarkdown(text)
    const pages = paginate(blocks, 80)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.flat()).toEqual(blocks)
    // No page ends on a heading: it goes on with its section
    for (const page of pages.slice(0, -1)) expect(page.at(-1)?.type).not.toBe('heading')
    for (const page of pages) {
      const chars = page.reduce((sum, block) => sum + sizeOf(block, 80).chars, 0)
      const nodes = page.reduce((sum, block) => sum + sizeOf(block, 80).nodes, 0)
      expect(chars).toBeLessThanOrEqual(PAGE_CHARS)
      expect(nodes).toBeLessThanOrEqual(PAGE_NODES)
    }
  })

  test('a block too big for a page is cut: code between lines, a table between rows', () => {
    const code = Array.from({ length: 4_000 }, (_, i) => `line ${i} ${'x'.repeat(30)}`).join('\n')
    const rows = Array.from({ length: 3_000 }, (_, i) => `| ${i} | ${'cell '.repeat(5)} |`).join('\n')
    const pages = paginate(parseMarkdown(`\`\`\`ts\n${code}\n\`\`\`\n\n| n | text |\n|---|---|\n${rows}`), 80)
    const blocks = pages.flat()
    const codes = blocks.filter(block => block.type === 'code')
    const tables = blocks.filter(block => block.type === 'table')
    expect(codes.length).toBeGreaterThan(1)
    expect(codes.map(block => (block.type === 'code' ? block.text : '')).join('\n')).toBe(code)
    expect(tables.length).toBeGreaterThan(1)
    for (const block of tables) expect(block.type === 'table' && block.head.map(plain)).toEqual(['n', 'text'])
    for (const page of pages) expect(page.reduce((sum, block) => sum + sizeOf(block, 80).chars, 0)).toBeLessThanOrEqual(PAGE_CHARS)
  })
})
