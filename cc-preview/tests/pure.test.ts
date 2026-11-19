import { describe, expect, test } from 'claude-code/testing'

import { parseBmp, quadrants } from '../hooks/blocks'
import { drawsGraphics } from '../hooks/connection'
import { scan } from '../hooks/conversation'
import { pickLocale } from '../hooks/i18n'
import { buttonOffsets, cellWidth, fitLabel, keepCenter, zoomLevels, zoomed } from '../hooks/layout'
import { cleanPath, folderOf, pathsIn, resolvePath } from '../hooks/paths'

describe('paths', () => {
  test('finds image and markdown paths in prose, code spans, links and quotes', () => {
    const text = [
      'Saved the chart to `out/chart.png` and the plan to docs/plan.md.',
      'See [the spec](./specs/design.md) and "/Users/me/Desktop/Screen Shot 1.png".',
      'Edited README.md:12, ignored https://example.com/logo.png and *.md globs.',
      'file:///tmp/a%20b.webp',
    ].join('\n')
    expect(pathsIn(text)).toEqual(['out/chart.png', '/Users/me/Desktop/Screen Shot 1.png', 'docs/plan.md', './specs/design.md', 'README.md', '/tmp/a b.webp'])
  })

  test('skips quoted prose and other files', () => {
    expect(pathsIn("it's a 'nice day' for notes.txt")).toEqual([])
    expect(cleanPath('src/index.ts')).toBeNull()
    expect(cleanPath('(plan.md),')).toBe('plan.md')
  })

  test('resolves relative, home and dotted paths', () => {
    expect(resolvePath('docs/../plan.md', '/work', '/home/me')).toBe('/work/plan.md')
    expect(resolvePath('~/notes.md', '/work', '/home/me')).toBe('/home/me/notes.md')
    expect(resolvePath('~bob/notes.md', '/work', '/home/me')).toBeNull()
    expect(resolvePath('/a//b/./c.png', '/work', undefined)).toBe('/a/b/c.png')
  })

  test('captions a file by its folder', () => {
    expect(folderOf('/work/docs/plan.md', '/work', '/home/me')).toBe('docs/')
    expect(folderOf('/work/plan.md', '/work', '/home/me')).toBe('./')
    expect(folderOf('/home/me/Desktop/a.png', '/work', '/home/me')).toBe('~/Desktop/')
    expect(folderOf('/tmp/a.png', '/work', '/home/me')).toBe('/tmp/')
  })
})

describe('conversation', () => {
  const png = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }

  test('collects pasted images, tool pictures and named files in order', () => {
    const { items, prompts } = scan(
      [
      {
        role: 'user',
        content: [png, { type: 'text', text: 'fix this [Image #3] <system-reminder>see /etc/x.md</system-reminder>' }],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will write `docs/plan.md`.' },
          { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '/work/docs/plan.md', content: 'see other.md' } },
          { type: 'tool_use', id: 't2', name: 'mcp__playwright__browser_take_screenshot', input: {} },
          { type: 'tool_use', id: 't3', name: 'Read', input: { file_path: '/work/shot.png' } },
          { type: 'tool_use', id: 't4', name: 'Bash', input: { command: 'sips -Z 100 a.jpg --out b.png' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
          { type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'shot' }, { type: 'image', data: 'BBBB', mimeType: 'image/jpeg' }] },
          { type: 'tool_result', tool_use_id: 't3', content: [png] },
        ],
      },
      ],
      { pasted: 'pasted', toolResult: 'tool result' },
    )
    expect(items).toEqual([
      { type: 'picture', picture: { mediaType: 'image/png', base64: 'AAAA', label: 'Image #3', detail: 'pasted · fix this' } },
      { type: 'path', raw: 'docs/plan.md' },
      { type: 'path', raw: '/work/docs/plan.md' },
      { type: 'path', raw: '/work/shot.png' },
      { type: 'path', raw: 'a.jpg' },
      { type: 'path', raw: 'b.png' },
      { type: 'picture', picture: { mediaType: 'image/jpeg', base64: 'BBBB', label: 'browser_take_screenshot', detail: 'tool result' } },
    ])
    expect(prompts.map(prompt => prompt.pictures.length)).toEqual([1])
  })
})

describe('blocks', () => {
  test('a bottom-up BMP reads right side up', () => {
    // 1 × 2 pixels, bottom-up: the red row is stored last, so it is the top
    const bytes = new Uint8Array(54 + 4 * 2)
    const view = new DataView(bytes.buffer)
    bytes.set([0x42, 0x4d])
    view.setUint32(10, 54, true)
    view.setInt32(18, 1, true)
    view.setInt32(22, 2, true)
    view.setUint16(28, 24, true)
    bytes.set([0xff, 0, 0], 54) // blue, bottom row
    bytes.set([0, 0, 0xff], 58) // red, top row
    const pixels = parseBmp(btoa(String.fromCharCode(...bytes)))
    expect([pixels?.width, pixels?.height, pixels?.rgb(0, 0), pixels?.rgb(0, 1)]).toEqual([1, 2, 0xff0000, 0x0000ff])
  })

  test('each cell takes the split of its four pixels that loses least', () => {
    const cell = (rgb: (x: number, y: number) => number) => {
      const words = new DataView(Uint8Array.from(atob(quadrants({ width: 2, height: 2, rgb }, 1, 1)), char => char.charCodeAt(0)).buffer)
      return [words.getUint32(0, true), words.getUint32(4, true), words.getUint32(8, true)]
    }
    // Left red, right blue: the left half block
    expect(cell(x => (x === 0 ? 0xff0000 : 0x0000ff))).toEqual([0x258c, 0xff0000, 0x0000ff])
    // White on the diagonal: the other diagonal's quadrants in black
    expect(cell((x, y) => (x === y ? 0xffffff : 0))).toEqual([0x259e, 0, 0xffffff])
    // One color: one color
    expect(cell(() => 0x336699)).toEqual([0x2580, 0x336699, 0x336699])
  })

  test('anything but a BMP is refused', () => {
    expect(parseBmp(btoa('not a bitmap at all, no header to read here at all......'))).toBeNull()
    expect(parseBmp('%%%')).toBeNull()
  })
})

describe('labels and language', () => {
  test('a long name keeps its ends, a wide one counts two cells a glyph', () => {
    expect(fitLabel('2026-10-03-remote-file-preview-design.md', 20)).toBe('2026-10-03-…esign.md')
    expect(cellWidth('設計稿.png')).toBe(10)
    expect(buttonOffsets(['img #1', '圖 #2'])).toEqual([0, 11])
  })

  test('the language follows the option, then Claude Code, then the locale', () => {
    expect(pickLocale({ option: 'zh-TW', claudeLanguage: 'english', envLang: 'en_US' })).toBe('zh-TW')
    expect(pickLocale({ option: 'auto', claudeLanguage: '繁體中文', envLang: 'en_US' })).toBe('zh-TW')
    expect(pickLocale({ option: 'auto', claudeLanguage: undefined, envLang: 'zh_TW.UTF-8' })).toBe('zh-TW')
    expect(pickLocale({ option: 'auto', claudeLanguage: undefined, envLang: undefined })).toBe('en')
  })
})

describe('zoom', () => {
  test('levels double from the fit up to 100%, or as near as the pixel cap allows', () => {
    // 1440 × 1080 fitted in 60 × 22 cells: 120 pixels across, so 100% is 12×
    expect(zoomLevels({ width: 1440, height: 1080 }, { columns: 60, rows: 22 })).toEqual([1, 2, 4, 8, 12])
    // A picture no bigger than the fit has nothing to zoom to
    expect(zoomLevels({ width: 100, height: 100 }, { columns: 60, rows: 30 })).toEqual([1])
    // A huge one stops where its BMP would pass 1.2 M pixels
    const levels = zoomLevels({ width: 12000, height: 9000 }, { columns: 60, rows: 22 })
    const most = levels.at(-1) ?? 1
    expect(120 * most * 44 * most).toBeLessThanOrEqual(1_200_001)
    expect(most).toBeGreaterThan(8)
  })

  test('a zoom keeps what was in the middle of the window there', () => {
    const box = { columns: 60, rows: 20 }
    const fit = { columns: 60, rows: 20 }
    const from = zoomed(fit, box, 1)
    const to = zoomed(fit, box, 2)
    expect(to).toEqual({ full: { columns: 120, rows: 40 }, window: { columns: 60, rows: 20 } })
    expect(keepCenter({ x: 0, y: 0 }, from, to)).toEqual({ x: 30, y: 10 })
    // and back out, never past an edge
    expect(keepCenter({ x: 60, y: 20 }, to, from)).toEqual({ x: 0, y: 0 })
  })
})

describe('terminal environment', () => {
  test('auto uses known terminal support or an explicit force flag, without process discovery', () => {
    const unknown = { force: undefined, termProgram: undefined, term: 'xterm-256color' }
    expect(drawsGraphics(unknown)).toBe(false)
    expect(drawsGraphics({ ...unknown, termProgram: 'ghostty' })).toBe(true)
    expect(drawsGraphics({ ...unknown, term: 'xterm-kitty' })).toBe(true)
    expect(drawsGraphics({ ...unknown, termProgram: 'Apple_Terminal' })).toBe(false)
    expect(drawsGraphics({ ...unknown, force: '1' })).toBe(true)
    expect(drawsGraphics({ ...unknown, force: '0' })).toBe(false)
    expect(drawsGraphics({ ...unknown, force: 'false' })).toBe(false)
  })
})
