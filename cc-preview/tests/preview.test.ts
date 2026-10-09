import { expect, mock, test } from 'claude-code/testing'

type On = Parameters<import('claude-code/testing').TestBody>[1]

const PLUGIN = 'cc-preview'
const PLAN = '/work/docs/plan.md'
const CHART = '/work/out/chart.png'
const PASTES = '/tmp/claude-501/-work/sess-1/images'

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/** The first bytes of a PNG: enough for its size. */
function pngBytes(width: number, height: number): string {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return toBase64(bytes)
}

/** A top-down 24-bit BMP, as sips writes one, every pixel `rgb`. */
function bmpBytes(width: number, height: number, rgb: number): string {
  const stride = Math.floor((24 * width + 31) / 32) * 4
  const bytes = new Uint8Array(54 + stride * height)
  const view = new DataView(bytes.buffer)
  bytes.set([0x42, 0x4d])
  view.setUint32(2, bytes.length, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, -height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) bytes.set([rgb & 0xff, (rgb >> 8) & 0xff, (rgb >> 16) & 0xff], 54 + y * stride + x * 3)
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const CHART_PNG = pngBytes(800, 400)
const PASTED_PNG = pngBytes(300, 300)
const base64Bytes = (base64: string) => Math.floor((base64.length * 3) / 4)

type Seen = { opened: string[]; ran: string[]; toasts: string[] }
type Screen = { via: 'mosh' | 'ssh' | 'local'; env: Record<string, string>; isCommandRefused?: boolean }

// The process above this one that the path to the screen ends at
const TOPS = { mosh: 'mosh-server', ssh: 'sshd-session: me@ttys001', local: '/Applications/Ghostty.app/Contents/MacOS/ghostty' }
const processTable = (via: Screen['via']) =>
  `100\n  100    90 ttys001  claude\n   90    80 ttys001  -zsh\n   80     1 ??       ${TOPS[via]}\n`
const seen = (): Seen => ({ opened: [], ran: [], toasts: [] })

// A machine with a plan, a chart and one cached paste on disk, a conversation that names them,
// and a sips that writes what it is asked for; `ran` records each command's first word
function machine(on: On, was: Seen, draft = { text: '' }, isPlaced = true, screen: Screen = { via: 'local', env: { TERM_PROGRAM: 'ghostty' } }) {
  const files: Record<string, string> = { [PLAN]: '# Plan\n\nShip it.', [CHART]: CHART_PNG, [`${PASTES}/1.png`]: PASTED_PNG }
  const entry = { size: 0, mtimeMs: 0, isLink: false }
  on('session.start', () => ({ cwd: '/work' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('env.get', ($, e) => ({ value: { CLAUDE_CODE_TMPDIR: '/tmp/claude-501', HOME: '/home/me', ...screen.env }[e.name] }))
  on('prompt.read', () => ({ value: { text: draft.text, cursor: draft.text.length } }))
  on('fs.stat', ($, e) => {
    const body = files[e.path]
    if (body === undefined) throw new Error(`ENOENT: ${e.path}`)
    const size = e.path.endsWith('.md') ? body.length : base64Bytes(body)
    return { value: { kind: 'file', size, mtimeMs: 1, isLink: false, ...(e.resolve ? { realPath: e.path } : {}) } }
  })
  on('fs.read', ($, e) => {
    const body = files[e.path]
    if (body === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: e.as === 'bytes' ? { base64: body } : body }
  })
  on('fs.exists', ($, e) => ({ value: e.path === PASTES || files[e.path] !== undefined }))
  on('fs.list', ($, e) => ({
    value: e.path === PASTES ? [{ name: '1.png', kind: 'file', ...entry }] : [{ name: '-work', kind: 'dir', ...entry }],
  }))
  on('process.run', ($, e) => {
    const argv = e.argv.map(String)
    const script = argv[0] === 'sh' ? (argv[2] ?? '') : ''
    was.ran.push(argv[0] === 'sh' ? `sh:${script.split(/\s/)[0]}` : (argv[0] ?? ''))
    let exitCode = 0
    let stdout = ''
    if (script.startsWith('head')) stdout = (files[argv[4] ?? ''] ?? '').slice(0, 44)
    else if (script.includes('base64 -d')) files[argv[4] ?? ''] = String(e.init?.stdin ?? '')
    else if (script.includes('ps -axo')) stdout = processTable(screen.via)
    else if (argv[0] === 'mv') {
      files[argv[3] ?? ''] = files[argv[2] ?? ''] ?? ''
      delete files[argv[2] ?? '']
    } else if (argv[0] === 'sips') {
      const out = argv.at(-1) ?? ''
      const at = argv.indexOf('-z')
      if (argv.includes('bmp')) {
        was.ran.push(`bmp ${argv[at + 2]}x${argv[at + 1]}`)
        files[out] = bmpBytes(Number(argv[at + 2]), Number(argv[at + 1]), 0x336699)
      }
      else if (argv[1] === '-Z') files[out] = pngBytes(Number(argv[2]), Number(argv[2]) / 2)
      else files[out] = pngBytes(640, 480)
    }
    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.messages', () => ({
    value: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PASTED_PNG } },
          { type: 'text', text: 'match this [Image #1]' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Wrote docs/plan.md and drew out/chart.png.' },
          { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: PLAN, content: '# Plan' } },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
    ],
  }))
  on('command.register', ($, e) => {
    if (screen.isCommandRefused === true) throw new Error('refused')
    return { value: { command: e.name } }
  })
  on('ui.open', ($, e) => {
    was.opened.push(e.id)
    return { value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'the terminal is 90 columns, under 144' } }
  })
  on('ui.toast', ($, e) => {
    was.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))
}

const PANE = {
  plugin: PLUGIN,
  component: 'Pane',
  requestId: 'cc-preview',
  viewport: { columns: 200, rows: 50, isFullscreen: true },
  props: { title: 'Preview', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } } as const

const reply = (text: string, surface: 'terminal' | 'desktop' = 'terminal') =>
  ({
    plugin: PLUGIN,
    component: 'AssistantMessage',
    surface,
    requestId: 'msg-1',
    viewport: { columns: 120, rows: 50 },
    props: { text, isFirstOfReply: true },
  }) as const

const prompt = (text: string) =>
  ({
    plugin: PLUGIN,
    component: 'UserMessage',
    surface: 'terminal',
    requestId: 'msg-2',
    viewport: { columns: 120, rows: 50 },
    props: { text, origin: { kind: 'composer' }, isExpanded: false },
  }) as const

test('a reply naming files gets a button each, a hover card each, and a press shows the file in the side pane', async ($, on) => {
  const was = seen()
  mock.clock(on)
  machine(on, was)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const row = await $.ui.mount(reply('Wrote `docs/plan.md`, drew out/chart.png, skipped missing.md.'))
  expect(await row.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  const buttons = (await row.findAll({ type: 'Button' })).filter(button => button.key?.startsWith('cc-preview:open:'))
  expect(buttons.map(button => button.props.label)).toEqual(['≡ plan.md', '▣ chart.png'])
  // Hover cards: the plan's first lines, and the chart sent small
  expect((await row.find({ type: 'Markdown' }))?.props.text).toBe('# Plan\n\nShip it.')
  const thumb = await row.find({ type: 'Image', key: 'cc-preview:card:1' })
  expect(thumb?.props.source).toEqual({ png: pngBytes(512, 256) })
  expect([thumb?.props.columns, thumb?.props.rows]).toEqual([32, 8])

  await row.press({ key: 'cc-preview:open:0' })
  expect(was.opened).toEqual(['cc-preview'])
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await pane.find({ type: 'Markdown' }))?.props.text).toBe('# Plan\n\nShip it.')
  expect(await pane.find({ type: 'Text', text: 'docs/' })).toBeDefined()

  await row.press({ key: 'cc-preview:zoom:1' })
  const image = await pane.find({ type: 'Image' })
  // Bytes, not a file name: the terminal may be across ssh
  expect(image?.props.source).toEqual({ png: CHART_PNG })
  expect([image?.props.columns, image?.props.rows]).toEqual([80, 20])
  await pane.unmount()
  await row.unmount()

  const desktop = await $.ui.mount(reply('Wrote docs/plan.md', 'desktop'))
  expect(await desktop.find({ type: 'Button' })).toBeUndefined()
  await desktop.unmount()

  const none = await $.ui.mount(reply('Nothing to see here.'))
  expect(await none.find({ type: 'Button' })).toBeUndefined()
  await none.unmount()
})

test('a sent prompt gets an img button per pasted image, its hover card the picture', async ($, on) => {
  const was = seen()
  mock.clock(on)
  machine(on, was)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const sent = await $.ui.mount(prompt('match this [Image #1]'))
  const open = (await sent.findAll({ type: 'Button' })).filter(button => button.key?.startsWith('cc-preview:open:'))
  expect(open.map(button => button.props.label)).toEqual(['img #1'])
  expect((await sent.find({ type: 'Image' }))?.props.source).toEqual({ png: PASTED_PNG })
  await sent.press({ key: 'cc-preview:zoom:0' })
  expect(was.opened).toEqual(['cc-preview'])
  await sent.unmount()

  // A typed tag in other words borrows nothing
  const typed = await $.ui.mount(prompt('what was [Image #1]?'))
  expect(await typed.find({ type: 'Button' })).toBeUndefined()
  await typed.unmount()
})

test('/preview lists every artifact, newest first, and pages through them', async ($, on) => {
  const was = seen()
  mock.clock(on)
  machine(on, was)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'preview', args: '', ...RUN })
  expect(was.opened).toEqual(['cc-preview'])

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const picks = (await pane.findAll({ type: 'Button' })).filter(button => button.key?.startsWith('cc-preview:pick:'))
  expect(picks.map(button => button.props.label)).toEqual(['▣ chart.png', '▣ Image #1', '≡ plan.md'])
  expect(await pane.find({ type: 'Text', text: 'pasted · match this' })).toBeDefined()

  await pane.press({ key: 'cc-preview:pick:1' })
  expect((await pane.find({ type: 'Image' }))?.props.source).toEqual({ png: PASTED_PNG })
  expect(await pane.find({ type: 'Text', text: '2/3' })).toBeDefined()
  await pane.press({ key: 'cc-preview:next' })
  expect(await pane.find({ type: 'Markdown' })).toBeDefined()
  await pane.press({ key: 'cc-preview:next' })
  expect(await pane.find({ type: 'Text', text: '1/3' })).toBeDefined()
  await pane.press({ key: 'cc-preview:all' })
  expect(await pane.find({ type: 'Text', text: 'Conversation artifacts' })).toBeDefined()
  await pane.unmount()

  const missing = await $.command.run({ command: 'preview', args: 'nope.md', ...RUN })
  expect(missing.text).toContain('Nothing to preview at nope.md')
})

test('a pane the surface cannot seat says why', async ($, on) => {
  const was = seen()
  mock.clock(on)
  machine(on, was, { text: '' }, false)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const row = await $.ui.mount(reply('See out/chart.png'))
  await row.press({ key: 'cc-preview:open:0' })
  expect(was.toasts).toEqual(['Preview pane is waiting for room: the terminal is 90 columns, under 144'])
  await row.unmount()
})

test('under mosh, pictures are drawn in block characters', { options: { pictures: 'blocks' } }, async ($, on) => {
  const was = seen()
  mock.clock(on)
  machine(on, was)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const row = await $.ui.mount(reply('See out/chart.png'))
  expect(await row.find({ type: 'Image' })).toBeUndefined()
  const card = await row.find({ type: 'Raster' })
  expect([card?.props.columns, card?.props.rows]).toEqual([48, 12])
  const cells = Uint8Array.from(atob(String(card?.props.cells)), char => char.charCodeAt(0))
  const first = new DataView(cells.buffer)
  // `▀`, its top and bottom halves the picture's color
  expect([first.getUint32(0, true), first.getUint32(4, true), first.getUint32(8, true)]).toEqual([0x2580, 0x336699, 0x336699])
  expect(was.ran).toContain('sips')
  await row.unmount()
})

test('the draft shows its pasted images above the prompt, each one press from the pane', async ($, on) => {
  const was = seen()
  const draft = { text: '' }
  const clock = mock.clock(on)
  machine(on, was, draft)
  const band = {
    plugin: PLUGIN,
    component: 'AbovePrompt',
    surface: 'terminal',
    requestId: 'above-prompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  } as const
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  draft.text = 'like [Image #1] but not [Image #2]'
  await clock.advance(200)
  const shown = await $.ui.mount(band)
  expect((await shown.findAll({ type: 'Image' })).map(image => image.props.source)).toEqual([{ png: PASTED_PNG }])
  expect(await shown.find({ type: 'Text', text: 'no preview' })).toBeDefined()
  await shown.press({ key: 'cc-preview:draft:1' })
  expect(was.opened).toEqual(['cc-preview'])
  await shown.unmount()
})

test('a short pane fills its width with the picture and lets it scroll, rather than shrink it to a few cells', async ($, on) => {
  const was = seen()
  mock.clock(on)
  machine(on, was)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const row = await $.ui.mount(reply('See out/chart.png'))
  await row.press({ key: 'cc-preview:open:0' })
  const short = { ...PANE.props, bodyColumns: 50, placement: 'inline', scroll: { offset: 0, bodyRows: 5 } } as const
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal', props: short })
  const image = await pane.find({ type: 'Image' })
  expect([image?.props.columns, image?.props.rows]).toEqual([50, 13])
  expect(await pane.find({ type: 'Text', text: '↑↓ scroll' })).toBeDefined()
  await pane.unmount()
  await row.unmount()
})

test('docked, a block picture zooms toward 100% and moves about; inline it does not', { options: { pictures: 'blocks' } }, async ($, on) => {
  const was = seen()
  mock.clock(on)
  machine(on, was)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const row = await $.ui.mount(reply('See out/chart.png'))
  await row.press({ key: 'cc-preview:open:0' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // 800 × 400 fitted in 80 × 36 cells: 80 × 20, 160 pixels across, 20%
  const raster = async () => {
    const found = await pane.find({ type: 'Raster' })
    return [found?.props.columns, found?.props.rows]
  }
  expect(await raster()).toEqual([80, 20])
  expect(await pane.find({ type: 'Text', text: '20%' })).toBeDefined()
  expect(await pane.find({ type: 'Button', key: 'cc-preview:left' })).toBeUndefined()

  await pane.press({ key: 'cc-preview:zoom-in' })
  expect(await pane.find({ type: 'Text', text: '40%' })).toBeDefined()
  expect(await raster()).toEqual([80, 36])
  expect(was.ran).toContain('bmp 320x80')
  await pane.press({ key: 'cc-preview:right' })
  await pane.press({ key: 'cc-preview:zoom-in' })
  await pane.press({ key: 'cc-preview:zoom-in' })
  // 100%: each pixel of the chart a pixel of the blocks across
  expect(await pane.find({ type: 'Text', text: '100%' })).toBeDefined()
  expect(was.ran).toContain('bmp 800x200')
  await pane.press({ key: 'cc-preview:zoom-in' })
  expect(await pane.find({ type: 'Text', text: '100%' })).toBeDefined()
  await pane.unmount()

  const inline = { ...PANE.props, bodyColumns: 50, placement: 'inline', scroll: { offset: 0, bodyRows: 5 } } as const
  const split = await $.ui.mount({ ...PANE, surface: 'terminal', props: inline })
  expect(await split.find({ type: 'Button', key: 'cc-preview:zoom-in' })).toBeUndefined()
  expect([(await split.find({ type: 'Raster' }))?.props.columns]).toEqual([50])
  await split.unmount()
  await row.unmount()
})

test('pictures are drawn in characters wherever kitty graphics would not reach the screen, and follow a reattach', async ($, on) => {
  const was = seen()
  const clock = mock.clock(on)
  const screen: Screen = { via: 'mosh', env: { CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1', TERM_PROGRAM: 'herdr' } }
  machine(on, was, { text: '' }, true, screen)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  // Under mosh: the hover card in characters
  const moshed = await $.ui.mount(reply('See out/chart.png'))
  expect(await moshed.find({ type: 'Image' })).toBeUndefined()
  expect(await moshed.find({ type: 'Raster' })).toBeDefined()
  await moshed.unmount()

  // Attached again over ssh: graphics within a few seconds
  screen.via = 'ssh'
  await clock.advance(5_000)
  const row = await $.ui.mount(reply('See out/chart.png'))
  expect(await row.find({ type: 'Image' })).toBeDefined()
  await row.press({ key: 'cc-preview:open:0' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const label = async () => (await pane.find({ type: 'Button', key: 'cc-preview:mode' }))?.props.label
  expect(await label()).toBe('▣ Graphics · ssh')

  // A switch in the pane stands while the path does, and gives way when it changes
  await pane.press({ key: 'cc-preview:mode' })
  await clock.advance(5_000)
  expect(await label()).toBe('▦ Blocks · ssh')
  screen.via = 'mosh'
  await clock.advance(5_000)
  expect(await label()).toBe('▦ Blocks · mosh')
  screen.via = 'local'
  await clock.advance(5_000)
  expect(await label()).toBe('▣ Graphics · ghostty')
  await pane.unmount()
  await row.unmount()
})

test('a terminal Claude Code sends no graphics to gets characters', async ($, on) => {
  const was = seen()
  mock.clock(on)
  machine(on, was, { text: '' }, true, { via: 'ssh', env: { TERM_PROGRAM: 'Apple_Terminal' } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const row = await $.ui.mount(reply('See out/chart.png'))
  expect(await row.find({ type: 'Raster' })).toBeDefined()
  await row.unmount()
})

test('under mosh, the draft band and a sent prompt draw their pasted images in characters', async ($, on) => {
  const was = seen()
  const draft = { text: '' }
  const clock = mock.clock(on)
  machine(on, was, draft, true, { via: 'mosh', env: { CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  draft.text = 'like [Image #1]'
  await clock.advance(200)
  const band = await $.ui.mount({
    plugin: PLUGIN,
    component: 'AbovePrompt',
    surface: 'terminal',
    requestId: 'above-prompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect(await band.find({ type: 'Image' })).toBeUndefined()
  expect(await band.find({ type: 'Raster' })).toBeDefined()
  await band.unmount()

  const sent = await $.ui.mount(prompt('match this [Image #1]'))
  expect(await sent.find({ type: 'Raster' })).toBeDefined()
  await sent.unmount()
})

test('a load session.start never reaches still feeds the band and finds the path, from the first hook that runs', async ($, on) => {
  const was = seen()
  const draft = { text: 'like [Image #1]' }
  const clock = mock.clock(on)
  machine(on, was, draft, true, { via: 'mosh', env: { CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' } })
  const band = {
    plugin: PLUGIN,
    component: 'AbovePrompt',
    surface: 'terminal',
    requestId: 'above-prompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  } as const
  // No session.start: the band's own draw starts the poll and the look at the path
  const first = await $.ui.mount(band)
  expect(await first.find({ type: 'Raster' })).toBeUndefined()
  await first.unmount()
  await clock.advance(200)
  const later = await $.ui.mount(band)
  expect(await later.find({ type: 'Raster' })).toBeDefined()
  expect(was.ran.some(command => command === 'sh:echo')).toBe(true)
  await later.unmount()
})

test('a refused /preview leaves the rest running', async ($, on) => {
  const was = seen()
  const draft = { text: '' }
  const clock = mock.clock(on)
  machine(on, was, draft, true, { via: 'local', env: { TERM_PROGRAM: 'ghostty' }, isCommandRefused: true })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  draft.text = 'like [Image #1]'
  await clock.advance(200)
  const band = await $.ui.mount({
    plugin: PLUGIN,
    component: 'AbovePrompt',
    surface: 'terminal',
    requestId: 'above-prompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect(await band.find({ type: 'Image' })).toBeDefined()
  await band.unmount()
})

test('a band squeezed by an inline pane drops borders, then pictures, so the rest still shows', async ($, on) => {
  const was = seen()
  const draft = { text: '' }
  const clock = mock.clock(on)
  machine(on, was, draft)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  draft.text = 'like [Image #1]'
  await clock.advance(200)
  const band = (maxRows: number) =>
    ({
      plugin: PLUGIN,
      component: 'AbovePrompt',
      surface: 'terminal',
      requestId: 'above-prompt',
      props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: 120, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
    }) as const

  const roomy = await $.ui.mount(band(20))
  expect((await roomy.find({ type: 'Box', key: undefined }))?.props).toBeDefined()
  expect(JSON.stringify(await roomy.drawn())).toContain('"borderStyle":"round"')
  await roomy.unmount()

  const tight = await $.ui.mount(band(3))
  expect(JSON.stringify(await tight.drawn())).not.toContain('borderStyle')
  expect((await tight.find({ type: 'Image' }))?.props.rows).toBe(2)
  await tight.unmount()

  const sliver = await $.ui.mount(band(1))
  expect(await sliver.find({ type: 'Image' })).toBeUndefined()
  expect(await sliver.find({ type: 'Button', key: 'cc-preview:draft:1' })).toBeDefined()
  await sliver.unmount()
})
