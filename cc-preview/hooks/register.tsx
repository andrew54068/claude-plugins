import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginOptions, Register, RenderElement, RenderViewport } from 'claude-code'

import type { Artifact, DraftImage, PictureMode, ZoomView } from '../types'
import { parseBmp, quadrants } from './blocks'
import type { Pixels } from './blocks'
import { clientTerminals, drawsGraphics, parseInputTimes, parseProcesses, pathLabel, pathOf } from './connection'
import type { Path, TerminalEnv } from './connection'
import { imagesIn, promptImages, scan, shortTool, toolPaths } from './conversation'
import type { Block, Message, Picture, PromptImages, Words } from './conversation'
import { pickLocale, stringsFor } from './i18n'
import type { Strings } from './i18n'
import {
  buttonOffsets,
  cellWidth,
  clamp,
  fitBox,
  fitCells,
  fitLabel,
  fitRow,
  imageNumbers,
  keepCenter,
  pngSize,
  zoomLevels,
  zoomed,
} from './layout'
import type { Cells, Size, Zoomed } from './layout'
import { markdownChunks } from './markdown'
import type { Chunked } from './markdown'
import {
  BMP_CONVERTERS,
  CONVERTERS,
  CONVERTIBLE,
  EXTENSIONS,
  MAX_PNG_BYTES,
  PNG,
  PRIVATE_DIRS,
  RESIZERS,
  digest,
  memo,
  shrunkEdge,
} from './media'
import type { Master } from './media'
import { basename, cleanPath, folderOf, kindOf, mentionsArtifact, pathsIn, resolvePath } from './paths'

const PANE = 'cc-preview'
// Pasting an image raises no prompt.edit (the tag only shows up on the next keystroke),
// so the draft is polled instead.
const POLL_MS = 200
// Files checked per scan, so a conversation full of paths can't stall it
const MAX_STATS = 400
// A file's existence is trusted this long, since transcript rows draw again and again
const STAT_MS = 3_000
const MAX_MARKDOWN_BYTES = 4 * 1024 * 1024
// Tools whose input names the file they touched; their row gets a button for it
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
// A hover card's picture is sent at most this long on its longest side: sharp, and light to send
const THUMB_EDGE = 512
// A hover card's picture box; block pictures get a bigger one, two pixels a cell being coarse
const CARD_BOX: Record<PictureMode, { rows: number; columns: number }> = { graphics: { rows: 8, columns: 40 }, blocks: { rows: 12, columns: 48 } }
// A markdown file's hover card shows its first lines
const CARD_LINES = 14
const CARD_CHARS = 1_200
// A button's widest label; a longer file name loses its middle
const LABEL_CELLS = 28

const artifacts = atom({ plugin: 'cc-preview', key: 'artifacts' } as const, [] as Artifact[])
const selected = atom({ plugin: 'cc-preview', key: 'selected' } as const, null as Artifact | null)
const draft = atom({ plugin: 'cc-preview', key: 'draft' } as const, [] as DraftImage[])
const mode = atom({ plugin: 'cc-preview', key: 'mode' } as const, 'blocks' as PictureMode)
const link = atom({ plugin: 'cc-preview', key: 'link' } as const, '')
const zoom = atom({ plugin: 'cc-preview', key: 'zoom' } as const, { id: '', level: 0, x: 0, y: 0 } as ZoomView)

type Terminal = Elements['terminal']
type Place = { cwd: string; root: string; home: string | undefined }

// English until session.start has read the language settings
let strings: Strings = stringsFor('en')
const words = (): Words => ({ pasted: strings.pasted, toolResult: strings.toolResult })

let place: Place | undefined

async function placeOf($: EngineInterface): Promise<Place> {
  place ??= { cwd: await $.session.cwd(), root: await $.session.root(), home: await $.env.get('HOME') }
  return place
}

async function settingsLanguage($: EngineInterface): Promise<unknown> {
  const home = await $.env.get('HOME')
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
  try {
    return (JSON.parse(await $.fs.read(`${config}/settings.json`)) as { language?: unknown }).language
  } catch {
    return undefined
  }
}

// Kitty graphics or characters: looked at again every few seconds, since the person may detach
// from a multiplexer and attach again over another connection
const DETECT_MS = 5_000
// This process (the shell's parent) and every process, in one call
const PROCESSES = 'echo "$PPID"; ps -axo pid=,ppid=,tty=,comm='
// When each terminal last had input: BSD stat, else GNU
const INPUT_TIMES = 'stat -f "%a %N" "$@" 2>/dev/null || stat -c "%X %n" "$@" 2>/dev/null; true'

// A background run that has not finished in this long is taken for lost, and the next one goes
const STUCK_MS = 10_000

let terminalEnv: TerminalEnv = { force: undefined, termProgram: undefined, term: undefined }
// What was last found, so a switch made in the pane stands until the path changes
let detected: string | undefined
let detectingSince = 0

async function pathNow($: EngineInterface): Promise<Path | null> {
  const run = await $.process.run(['sh', '-c', PROCESSES], { timeoutMs: 5_000 }).catch(() => null)
  if (run === null || run.exitCode !== 0 || run.isStdoutTruncated) return null
  const [start = '', ...rest] = run.stdout.split('\n')
  const processes = parseProcesses(rest.join('\n'))
  const terminals = clientTerminals(processes)
  const times =
    terminals.length === 0
      ? null
      : await $.process.run(['sh', '-c', INPUT_TIMES, 'sh', ...terminals.map(tty => `/dev/${tty}`)], { timeoutMs: 5_000 }).catch(() => null)
  return pathOf(processes, Number(start.trim()), parseInputTimes(times?.stdout ?? ''))
}

async function detect($: EngineInterface, option: unknown) {
  if (Date.now() - detectingSince < STUCK_MS) return
  detectingSince = Date.now()
  try {
    const path = await pathNow($)
    if (path === null) return
    const isPinned = option === 'graphics' || option === 'blocks'
    const look: PictureMode = isPinned ? option : drawsGraphics(path, terminalEnv) ? 'graphics' : 'blocks'
    const label = pathLabel(path)
    if (`${label}|${look}` === detected) return
    detected = `${label}|${look}`
    note($, `path ${path.via}${path.terminal === null ? '' : ` (${path.terminal})`} -> ${look}${isPinned ? ' (pinned)' : ''}`)
    await update($, link, () => label)
    await update($, mode, () => look)
  } finally {
    detectingSince = 0
  }
}

// ── The trail ────────────────────────────────────────────────────────────────
// What the mod did lately, kept in this session's scratch folder as debug.log (the last 200
// lines), so a picture that doesn't show can be traced without a --debug session

const TRAIL_LINES = 200
const trail: string[] = []
let trailPath: Promise<string | null> | undefined
let isTrailPending = false

function note($: EngineInterface, line: string) {
  trail.push(`${new Date().toISOString().slice(11, 23)} ${line}`)
  if (trail.length > TRAIL_LINES) trail.splice(0, trail.length - TRAIL_LINES)
  if (isTrailPending) return
  isTrailPending = true
  // Written a moment later, outside whatever dispatch noted it, many lines at once
  $.clock.after(300, () => {
    isTrailPending = false
    trailPath ??= scratch($, 'debug.log')
    void trailPath.then(path => (path === null ? undefined : $.fs.write(path, `${trail.join('\n')}\n`))).catch(() => undefined)
  })
}

// ── Artifacts ────────────────────────────────────────────────────────────────

const files = new Map<string, { at: number; artifact: Artifact | null }>()

/** The image or markdown file a path as written leads to, if it exists. */
async function fileArtifact($: EngineInterface, raw: string): Promise<Artifact | null> {
  const here = await placeOf($)
  const path = resolvePath(raw, here.cwd, here.home)
  const kind = path === null ? null : kindOf(path)
  if (path === null || kind === null) return null
  const known = files.get(path)
  if (known !== undefined && Date.now() - known.at < STAT_MS) return known.artifact
  const stat = await $.fs.stat(path, { resolve: true }).catch(() => null)
  const real = stat?.kind === 'file' ? (stat.realPath ?? path) : null
  const artifact: Artifact | null =
    real === null
      ? null
      : { id: `file:${real}`, kind, label: basename(path), detail: folderOf(path, here.root, here.home), source: { type: 'file', path: real } }
  files.set(path, { at: Date.now(), artifact })
  return artifact
}

/** The files among `raws` that exist, each once. */
async function existing($: EngineInterface, raws: readonly string[]): Promise<Artifact[]> {
  const list: Artifact[] = []
  for (const raw of raws.slice(0, 12)) {
    const artifact = await fileArtifact($, raw)
    if (artifact !== null && !list.some(known => known.id === artifact.id)) list.push(artifact)
  }
  return list
}

// Image bytes the conversation holds, by digest, the last used kept. Module memory: a reload
// (or the cap) drops them, and the next look reads them from the conversation again.
const MAX_BLOBS = 100
const blobs = new Map<string, { mediaType: string; base64: string }>()

async function blobArtifact(picture: Picture): Promise<Artifact> {
  const id = await digest(picture.base64)
  blobs.delete(id)
  blobs.set(id, { mediaType: picture.mediaType, base64: picture.base64 })
  for (const old of blobs.keys()) {
    if (blobs.size <= MAX_BLOBS) break
    blobs.delete(old)
  }
  return { id: `blob:${id}`, kind: 'image', label: picture.label, detail: picture.detail, source: { type: 'blob', id } }
}

// A sent prompt's pictures, by its words. A row says only its words, so two prompts with the
// same words and different pictures are null: no preview beats the wrong one.
type PromptIndex = Map<string, Artifact[] | null>
let prompts: PromptIndex = new Map()
let isIndexed = false

async function indexPrompt(index: PromptIndex, prompt: PromptImages) {
  const list = await Promise.all(prompt.pictures.map(blobArtifact))
  const key = prompt.text.trim()
  const known = index.get(key)
  const ids = (some: Artifact[]) => some.map(artifact => artifact.id).join(',')
  if (known === undefined) index.set(key, list)
  else if (known !== null && ids(known) !== ids(list)) index.set(key, null)
}

let reading: Promise<Artifact[]> | undefined

/**
 * Reads the whole conversation: rebuilds the prompt index and the bytes, and answers every
 * artifact, newest first. Writes no state, so a draw may wait on it.
 */
function readConversation($: EngineInterface): Promise<Artifact[]> {
  reading ??= (async () => {
    const messages = (await $.session.messages({ as: 'api' })) as readonly Message[]
    const found = scan(messages, words())
    const index: PromptIndex = new Map()
    for (const prompt of found.prompts) await indexPrompt(index, prompt)
    prompts = index
    isIndexed = true
    const list: Artifact[] = []
    const seen = new Set<string>()
    let stats = 0
    // Newest first: a file named again lately is near the top
    for (const item of [...found.items].reverse()) {
      let artifact: Artifact | null = null
      if (item.type === 'picture') artifact = await blobArtifact(item.picture)
      else if (stats++ < MAX_STATS) artifact = await fileArtifact($, item.raw)
      if (artifact !== null && !seen.has(artifact.id)) {
        seen.add(artifact.id)
        list.push(artifact)
      }
    }
    // Pictures, then documents: the order the list shows and Prev / Next walk
    return [...list.filter(artifact => artifact.kind === 'image'), ...list.filter(artifact => artifact.kind === 'markdown')]
  })().finally(() => {
    reading = undefined
  })
  return reading
}

async function refresh($: EngineInterface) {
  const list = await readConversation($)
  await update($, artifacts, () => list)
}

type Call = { tool_use_id?: string; tool: string; input: unknown; output?: unknown }

// A call's pictures by its id: its row draws again and again, and a digest of each would cost
const toolPictures = new Map<string, Artifact[]>()

/** The pictures of tool results that carry them (a screenshot), and the files a file tool touched. */
async function toolArtifacts($: EngineInterface, call: Call, kinds: 'all' | 'images'): Promise<Artifact[]> {
  if (FILE_TOOLS.has(call.tool)) {
    const list = await existing($, toolPaths(call.tool, call.input))
    return kinds === 'all' ? list : list.filter(artifact => artifact.kind === 'image')
  }
  if (call.tool === 'Bash') return []
  const known = call.tool_use_id === undefined ? undefined : toolPictures.get(call.tool_use_id)
  if (known !== undefined) return known
  const images = imagesIn(call.output)
  const name = shortTool(call.tool)
  const list = await Promise.all(
    images.map((image, i) => blobArtifact({ ...image, label: images.length > 1 ? `${name} ${i + 1}` : name, detail: strings.toolResult })),
  )
  if (call.tool_use_id !== undefined) toolPictures.set(call.tool_use_id, list)
  return list
}

const draftArtifact = (n: number, path: string): Artifact => ({
  id: `draft:${path}`,
  kind: 'image',
  label: `Image #${n}`,
  detail: strings.inPrompt,
  source: { type: 'file', path },
})

// ── Pictures ─────────────────────────────────────────────────────────────────
// $ is only followed into functions of this file, so everything that calls it lives here.
// Every picture reaches the terminal as bytes (a PNG, or block cells), never as a file name:
// over ssh the terminal runs on another machine and cannot read this one's files.

let tmpRoot: string | undefined

/** Claude Code's own temp folder: `CLAUDE_CODE_TMPDIR`, else `/tmp/claude-<uid>`. */
async function tempRoot($: EngineInterface): Promise<string> {
  if (tmpRoot === undefined) {
    const fromEnv = await $.env.get('CLAUDE_CODE_TMPDIR')
    tmpRoot = fromEnv ?? `/tmp/claude-${(await $.process.run(['id', '-u'])).stdout.trim()}`
  }
  return tmpRoot
}

/** A path in this session's private scratch folder, made (and checked) first; null when it can't be. */
async function scratch($: EngineInterface, name: string): Promise<string | null> {
  const top = await tempRoot($)
  const base = `${top}/cc-preview`
  const dir = `${base}/${await $.session.id()}`
  const run = await $.process.run(['sh', '-c', PRIVATE_DIRS, 'sh', top, base, dir], { timeoutMs: 5_000 }).catch(() => null)
  return run?.exitCode === 0 ? `${dir}/${name}` : null
}

// One job per output, so two draws asking for the same picture never write it at once
const jobs = new Map<string, Promise<string | null>>()

function once(out: string, make: () => Promise<string | null>): Promise<string | null> {
  const running = jobs.get(out)
  if (running !== undefined) return running
  const job = make().finally(() => jobs.delete(out))
  jobs.set(out, job)
  return job
}

// Written under a temporary name and renamed into place, so a reader never sees half a file
async function publish($: EngineInterface, temp: string, out: string): Promise<string | null> {
  const run = await $.process.run(['mv', '-f', temp, out], { timeoutMs: 5_000 }).catch(() => null)
  return run?.exitCode === 0 ? out : null
}

/** Runs each command until one writes the temp file, then moves it to `out`; a file already there is kept. */
function produce($: EngineInterface, out: string, commands: (temp: string) => string[][]): Promise<string | null> {
  return once(out, async () => {
    if (await $.fs.exists(out)) return out
    // Same extension: a converter picks its output format by it
    const temp = out.replace(/(\.[A-Za-z0-9]+)$/, '.part$1')
    for (const argv of commands(temp)) {
      const ok = await $.process.run(argv, { timeoutMs: 10_000 }).then(run => run.exitCode === 0, () => false)
      if (ok && (await $.fs.exists(temp))) return publish($, temp, out)
    }
    return null
  })
}

/** Writes base64 bytes to `out`, for a picture the conversation holds. */
function writeBytes($: EngineInterface, out: string, base64: string): Promise<string | null> {
  return once(out, async () => {
    if (await $.fs.exists(out)) return out
    const temp = `${out}.part`
    const run = await $.process
      .run(['sh', '-c', 'umask 077; base64 -d > "$1"', 'sh', temp], { stdin: base64, timeoutMs: 10_000 })
      .catch(() => null)
    return run?.exitCode === 0 && (await $.fs.exists(temp)) ? publish($, temp, out) : null
  })
}

/** A PNG's size from its first bytes, read without loading a file that may be past $.fs.read's 4 MiB. */
async function headerSize($: EngineInterface, path: string): Promise<Size | null> {
  const run = await $.process.run(['sh', '-c', 'head -c 32 "$1" | base64', 'sh', path], { timeoutMs: 5_000 }).catch(() => null)
  return run?.exitCode === 0 ? pngSize(run.stdout.replace(/\s/g, '')) : null
}

async function sizeOnDisk($: EngineInterface, path: string): Promise<number> {
  return (await $.fs.stat(path).catch(() => null))?.size ?? -1
}

async function readBase64($: EngineInterface, path: string): Promise<string | null> {
  return (await $.fs.read(path, { as: 'bytes' }).catch(() => null))?.base64 ?? null
}

/** An image file as a PNG on disk: itself, or a converted copy. */
async function masterFromFile($: EngineInterface, path: string, bytes: number, key: string): Promise<Master | null> {
  if (PNG.test(path)) {
    const size = await headerSize($, path)
    return size === null ? null : { path, size, bytes }
  }
  if (!CONVERTIBLE.test(path)) return null
  const out = await scratch($, `${await digest(key)}.png`)
  const png = out === null ? null : await produce($, out, temp => CONVERTERS(path, temp))
  const size = png === null ? null : await headerSize($, png)
  const pngBytes = png === null ? -1 : await sizeOnDisk($, png)
  return png === null || size === null || pngBytes < 0 ? null : { path: png, size, bytes: pngBytes }
}

const masters = memo<Master>(64)

/** The PNG every drawing of an artifact's picture is made from. */
async function masterOf($: EngineInterface, artifact: Artifact): Promise<Master | null> {
  if (artifact.source.type === 'file') {
    const path = artifact.source.path
    const stat = await $.fs.stat(path).catch(() => null)
    if (stat?.kind !== 'file') return null
    const key = `${path}|${stat.mtimeMs}|${stat.size}`
    return masters(key, () => masterFromFile($, path, stat.size, key))
  }
  const id = artifact.source.id
  return masters(`blob:${id}`, async () => {
    // A reload emptied the bytes; the conversation still has them
    if (!blobs.has(id)) await readConversation($)
    const blob = blobs.get(id)
    const extension = blob === undefined ? undefined : EXTENSIONS[blob.mediaType]
    const out = blob === undefined || extension === undefined ? null : await scratch($, `${id}.${extension}`)
    const file = blob === undefined || out === null ? null : await writeBytes($, out, blob.base64)
    const bytes = file === null ? -1 : await sizeOnDisk($, file)
    return file === null || bytes < 0 ? null : masterFromFile($, file, bytes, `blob:${id}`)
  })
}

const pngs = memo<string>(24)

/** PNG bytes of a picture, at most `edge` on its longest side (null: as is) and 2 MiB, which `Image` takes. */
function pngOf($: EngineInterface, master: Master, edge: number | null): Promise<string | null> {
  return pngs(`${master.path}|${master.bytes}|${edge ?? 'full'}`, async () => {
    const longest = Math.max(master.size.width, master.size.height)
    const isTooBig = master.bytes > MAX_PNG_BYTES
    if ((edge === null || longest <= edge) && !isTooBig) return readBase64($, master.path)
    const name = await digest(`${master.path}|${master.bytes}`)
    let target = Math.min(edge ?? longest, longest, isTooBig ? shrunkEdge(longest, master.bytes) : longest)
    for (let tries = 0; tries < 4 && target >= 16; tries++) {
      const edgeNow = target
      const out = await scratch($, `${name}-${edgeNow}.png`)
      const shrunk = out === null ? null : await produce($, out, temp => RESIZERS(master.path, temp, edgeNow, master.size))
      const bytes = shrunk === null ? -1 : await sizeOnDisk($, shrunk)
      if (shrunk === null || bytes < 0) return null
      if (bytes <= MAX_PNG_BYTES) return readBase64($, shrunk)
      target = shrunkEdge(target, bytes)
    }
    return null
  })
}

const bitmaps = memo<Pixels>(3)

/** A picture's pixels at `width` × `height`, read from a BMP the converter writes. */
function pixelsOf($: EngineInterface, master: Master, width: number, height: number): Promise<Pixels | null> {
  return bitmaps(`${master.path}|${master.bytes}|${width}x${height}`, async () => {
    const out = await scratch($, `${await digest(`${master.path}|${master.bytes}`)}-${width}x${height}.bmp`)
    const bmp = out === null ? null : await produce($, out, temp => BMP_CONVERTERS(master.path, temp, width, height))
    const base64 = bmp === null ? null : await readBase64($, bmp)
    return base64 === null ? null : parseBmp(base64)
  })
}

type Crop = Cells & { x: number; y: number }

const rasters = memo<string>(48)

/**
 * A picture `full` cells big as quadrant blocks, four pixels a cell, for a terminal mosh stands
 * before: the cells of `crop`, the whole picture unless a zoomed pane shows a part.
 */
function blocksOf($: EngineInterface, master: Master, full: Cells, crop: Crop = { x: 0, y: 0, ...full }): Promise<string | null> {
  const area = `${full.columns}x${full.rows}|${crop.x},${crop.y},${crop.columns}x${crop.rows}`
  return rasters(`${master.path}|${master.bytes}|${area}`, async () => {
    const pixels = await pixelsOf($, master, full.columns * 2, full.rows * 2)
    if (pixels === null) return null
    const window: Pixels = {
      width: Math.max(1, pixels.width - crop.x * 2),
      height: Math.max(1, pixels.height - crop.y * 2),
      rgb: (x, y) => pixels.rgb(x + crop.x * 2, y + crop.y * 2),
    }
    return quadrants(window, crop.columns, crop.rows)
  })
}

/** The element that draws a picture in `cells`: an Image, or under mosh a Raster of blocks. */
async function drawPicture(
  $: EngineInterface,
  ui: Terminal,
  master: Master,
  cells: Cells,
  look: { mode: PictureMode; edge: number | null; key: string; alt: string },
): Promise<RenderElement | null> {
  const { Image, Raster } = ui
  if (look.mode === 'blocks') {
    const raster = await blocksOf($, master, cells)
    return raster === null ? null : <Raster key={look.key} columns={cells.columns} rows={cells.rows} cells={raster} />
  }
  const png = await pngOf($, master, look.edge)
  return png === null ? null : <Image key={look.key} source={{ png }} columns={cells.columns} rows={cells.rows} alt={look.alt} />
}

// ── Documents ────────────────────────────────────────────────────────────────

const documents = memo<Chunked>(4)

/** A markdown file as Markdown pieces, or why it can't be shown. */
async function documentOf($: EngineInterface, path: string): Promise<Chunked | string> {
  const stat = await $.fs.stat(path).catch(() => null)
  if (stat?.kind !== 'file') return strings.documentGone
  if (stat.size > MAX_MARKDOWN_BYTES) return strings.documentTooBig
  const chunked = await documents(`${path}|${stat.mtimeMs}|${stat.size}`, async () => {
    const text = await $.fs.read(path).catch(() => null)
    return text === null ? null : markdownChunks(text)
  })
  return chunked ?? strings.documentUnreadable
}

/** A markdown file's first lines, for its hover card. */
async function documentHead($: EngineInterface, path: string): Promise<string | null> {
  const document = await documentOf($, path)
  const first = typeof document === 'string' ? undefined : document.chunks[0]
  if (first === undefined) return null
  const lines = first.split('\n')
  const head = lines.slice(0, CARD_LINES).join('\n').slice(0, CARD_CHARS)
  const isCut = lines.length > CARD_LINES || head.length < first.length
  return markdownChunks(isCut ? `${head}\n\n…` : head, CARD_CHARS + 200, 1).chunks[0] ?? null
}

// ── The pane ─────────────────────────────────────────────────────────────────

/** The dock's width: under half the terminal, room for a picture or a page of text. */
const paneColumns = (columns: number | undefined) => Math.max(50, Math.min(120, Math.floor((columns ?? 120) * 0.45)))
/** The inline pane's height, where it opens above the prompt (a narrow terminal, a split). */
const paneRows = (rows: number | undefined) => Math.max(12, Math.floor((rows ?? 40) * 0.6))

/**
 * Shows `artifact` in the pane (null: the list). The pane is opened before anything is awaited,
 * while the press or command that asked for it is the one running: an asked pane is seated at
 * any width, an unasked one only from 144 columns, which a split terminal never has.
 */
function open($: EngineInterface, artifact: Artifact | null, viewport: { columns?: number; rows?: number } | undefined) {
  const opening = $.ui.open({
    id: PANE,
    title: strings.paneTitle,
    focus: true,
    closeOnEscape: true,
    columns: paneColumns(viewport?.columns),
    rows: paneRows(viewport?.rows),
  })
  void update($, selected, () => artifact)
  return opening.then(opened => {
    note($, `open ${artifact?.label ?? 'list'} -> ${opened.isPlaced ? 'placed' : `waiting: ${opened.reason}`}`)
    if (!opened.isPlaced) $.ui.toast(strings.notPlaced(opened.reason))
    // The band above the prompt has less room beside an inline pane: drawn again for it
    $.clock.after(150, () => $.ui.invalidate('ui.render'))
    return opened
  })
}

// The docked pane's last drawn zoom, which its buttons step from: a press handler may not read
// what a draw computed any other way
type Geometry = { id: string; levels: number[]; fit: Cells; box: Cells; level: number; x: number; y: number; shape: Zoomed }
let geometry: Geometry | undefined

/** One zoom level in (1) or out (-1), what was in the window's middle kept there. */
function zoomBy($: EngineInterface, delta: number) {
  const now = geometry
  if (now === undefined) return
  void update($, zoom, view => {
    // Presses ahead of the redraw step on from each other
    const at = view.id === now.id ? view : now
    const from = zoomed(now.fit, now.box, now.levels[at.level] ?? 1)
    const level = clamp(at.level + delta, 0, now.levels.length - 1)
    return { id: now.id, level, ...keepCenter(at, from, zoomed(now.fit, now.box, now.levels[level] ?? 1)) }
  })
}

/** Moves a zoomed picture's window half its size, `dx` across and `dy` down. */
function pan($: EngineInterface, dx: number, dy: number) {
  const now = geometry
  if (now === undefined) return
  void update($, zoom, view => {
    const at = view.id === now.id ? view : now
    const { full, window } = zoomed(now.fit, now.box, now.levels[at.level] ?? 1)
    return {
      id: now.id,
      level: at.level,
      x: clamp(at.x + dx * Math.max(1, Math.floor(window.columns / 2)), 0, full.columns - window.columns),
      y: clamp(at.y + dy * Math.max(1, Math.floor(window.rows / 2)), 0, full.rows - window.rows),
    }
  })
}

async function step($: EngineInterface, list: readonly Artifact[], delta: number) {
  await update($, selected, current => {
    const at = list.findIndex(artifact => artifact.id === current?.id)
    return at < 0 || list.length === 0 ? current : (list[(at + delta + list.length) % list.length] ?? current)
  })
}

const glyph = (artifact: Artifact) => (artifact.kind === 'image' ? '▣' : '≡')

/** A button's label: `img #n` for a paste, as cc-image-view had it; the file's name otherwise. */
function buttonLabel(artifact: Artifact): string {
  const paste = /^Image #(\d+)$/.exec(artifact.label)
  if (paste !== null) return strings.sentButton(Number(paste[1]))
  return `${glyph(artifact)} ${fitLabel(artifact.label, LABEL_CELLS)}`
}

// ── Transcript rows ──────────────────────────────────────────────────────────

type Site = { requestId: string; viewport?: RenderViewport }
type Card = { node: RenderElement; width: number }

/** What hovering a button shows: the picture, or a markdown file's first lines; and a button to open it in the pane. */
async function cardOf($: EngineInterface, ui: Terminal, site: Site, artifact: Artifact, at: number, room: number): Promise<Card | null> {
  const { Box, Button, Markdown } = ui
  const zoom = (
    <Button
      key={`cc-preview:zoom:${at}`}
      label={artifact.kind === 'image' ? strings.zoom : strings.open}
      dimColor
      onPress={() => void open($, artifact, site.viewport)}
    />
  )
  if (artifact.kind === 'markdown') {
    const head = artifact.source.type === 'file' ? await documentHead($, artifact.source.path) : null
    if (head === null) return null
    const width = Math.min(72, room)
    return {
      width,
      node: (
        <Box width={width} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Markdown text={head} />
          {zoom}
        </Box>
      ),
    }
  }
  const master = await masterOf($, artifact)
  if (master === null) return null
  const look = await read($, mode)
  const box = CARD_BOX[look]
  const cells = fitCells(master.size, box.rows, Math.min(box.columns, room - 2))
  const picture = await drawPicture($, ui, master, cells, { mode: look, edge: THUMB_EDGE, key: `cc-preview:card:${at}`, alt: artifact.label })
  if (picture === null) return null
  return {
    width: Math.max(cells.columns, cellWidth(strings.zoom) + 4) + 2,
    node: (
      <Box flexDirection="column" alignItems="center" borderStyle="round" borderDimColor>
        {picture}
        {zoom}
      </Box>
    ),
  }
}

/**
 * A row of buttons under a transcript row, one per artifact, each lighting a card on hover
 * (cc-image-view's way): the card sits in the flow under the buttons, shifted under its own
 * button, so the rows below move down while it shows and the buttons never do.
 */
async function previewRow($: EngineInterface, ui: Terminal, site: Site, list: readonly Artifact[]): Promise<RenderElement> {
  const { Box, Button } = ui
  // Indented as a reply's text is, a few cells spare at the right
  const room = Math.max(24, (site.viewport?.columns ?? 100) - 8)
  const labels: string[] = []
  let used = 0
  for (const artifact of list) {
    const label = buttonLabel(artifact)
    const width = cellWidth(label) + 5
    const isLast = labels.length === list.length - 1
    // Room kept for the `+n more` button unless this is the last
    if (used + width > room - (isLast ? 0 : 14)) break
    labels.push(label)
    used += width
  }
  const shown = list.slice(0, labels.length)
  const more = list.length - shown.length
  const offsets = buttonOffsets(labels)
  // A hover group spans every site, so each row names its own
  const scopeOf = (at: number) => `cc-preview:${site.requestId.slice(-40)}:${at}`
  const cards = await Promise.all(shown.map((artifact, at) => cardOf($, ui, site, artifact, at, room)))
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box flexDirection="row" columnGap={1}>
        {shown.map((artifact, at) => (
          <Box hover={{ scope: scopeOf(at) }}>
            <Button key={`cc-preview:open:${at}`} label={labels[at] ?? ''} dimColor onPress={() => void open($, artifact, site.viewport)} />
          </Box>
        ))}
        {more > 0 && (
          <Button
            key="cc-preview:more"
            label={strings.more(more)}
            dimColor
            onPress={() => {
              void open($, null, site.viewport)
              void refresh($)
            }}
          />
        )}
      </Box>
      {cards.map((card, at) =>
        card === null ? null : (
          <Box
            display="none"
            hover={{ scope: scopeOf(at), display: 'flex' }}
            marginLeft={Math.max(0, Math.min(offsets[at] ?? 0, room - card.width))}
            flexDirection="column"
            alignItems="flex-start"
          >
            {card.node}
          </Box>
        ),
      )}
    </Box>
  )
}

/** The engine's row with the preview row under it. */
async function withRow($: EngineInterface, ui: Terminal, site: Site, row: RenderElement, list: readonly Artifact[]): Promise<RenderElement> {
  const { Box } = ui
  return (
    <Box flexDirection="column">
      {row}
      {await previewRow($, ui, site, list)}
    </Box>
  )
}

// ── The draft's pasted images ────────────────────────────────────────────────

let found: { sessionId: string; dir: string } | undefined

// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.<ext>. The project
// folder is named after a working directory that may since have moved, so find it by the
// session id instead of rebuilding it.
// Adapted from cc-image-view (https://github.com/GGGODLIN/cc-mod-image-view), MIT; see NOTICE.
async function imagesDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (found?.sessionId === sessionId) return found.dir
  const base = await tempRoot($)
  for (const entry of await $.fs.list(base).catch(() => [])) {
    const dir = `${base}/${entry.name}/${sessionId}/images`
    if (entry.kind === 'dir' && (await $.fs.exists(dir))) {
      found = { sessionId, dir }
      return dir
    }
  }
  return undefined
}

/** The cached paste for image `n`, whatever its extension (a JPEG paste is `<n>.jpg`). */
async function cachedFile($: EngineInterface, dir: string | undefined, n: number): Promise<string | null> {
  if (dir === undefined) return null
  const entries = await $.fs.list(dir).catch(() => [])
  const hit = entries.find(entry => entry.kind === 'file' && new RegExp(`^${n}\\.[A-Za-z0-9]+$`).test(entry.name))
  return hit === undefined ? null : `${dir}/${hit.name}`
}

// The image numbers last found whole, so an unchanged draft doesn't look again; undefined
// while one's file is still missing, so the next poll does.
let draftKey: string | undefined
let written = '[]'
let checkingSince = 0

async function checkDraft($: EngineInterface) {
  if (Date.now() - checkingSince < STUCK_MS) return
  checkingSince = Date.now()
  try {
    const numbers = imageNumbers((await $.prompt.read()).text)
    const key = numbers.join(',')
    if (key === draftKey) return
    const dir = numbers.length > 0 ? await imagesDir($) : undefined
    const list: DraftImage[] = []
    for (const n of numbers) list.push({ n, path: await cachedFile($, dir, n) })
    draftKey = list.every(image => image.path !== null) ? key : undefined
    const json = JSON.stringify(list)
    if (json === written) return
    written = json
    note($, `draft ${list.map(image => `#${image.n}=${image.path === null ? 'missing' : 'found'}`).join(' ') || 'empty'}`)
    await update($, draft, () => list)
  } finally {
    checkingSince = 0
  }
}

// ── Starting ─────────────────────────────────────────────────────────────────

let isStarted = false

/** The language, what Claude Code was told about the terminal, and a first look at the path. */
async function configure($: EngineInterface, options: PluginOptions) {
  // An empty LC_ALL means unset to the C library, so it must not hide LANG
  const lcAll = await $.env.get('LC_ALL')
  const envLang = lcAll !== undefined && lcAll !== '' ? lcAll : await $.env.get('LANG')
  strings = stringsFor(pickLocale({ option: options.language, claudeLanguage: await settingsLanguage($), envLang }))
  terminalEnv = {
    force: await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
    termProgram: await $.env.get('TERM_PROGRAM'),
    term: await $.env.get('TERM'),
  }
  note($, `env force=${terminalEnv.force ?? '-'} TERM_PROGRAM=${terminalEnv.termProgram ?? '-'} TERM=${terminalEnv.term ?? '-'}`)
  await detect($, options.pictures)
  $.ui.invalidate('ui.render')
}

/**
 * Starts the background work once per load: the draft poll that feeds the band above the prompt,
 * and the look at the path to the screen. From session.start, and from whichever hook runs first
 * should session.start not get there (it is not seen to run after every mid-session load), so a
 * lost start can't leave the band empty and the pictures in a mode the screen can't show.
 */
function startBackground($: EngineInterface, options: PluginOptions, isAwaited = false): Promise<void> | undefined {
  if (isStarted) return undefined
  isStarted = true
  note($, `start from ${isAwaited ? 'session.start' : 'a hook'}`)
  $.clock.every(POLL_MS, () => checkDraft($))
  $.clock.every(DETECT_MS, () => detect($, options.pictures))
  // session.start is awaited before the first prompt, so the first draw is in the right mode;
  // from any other hook, outside its dispatch, since a draw may not write state
  if (isAwaited) return configure($, options)
  $.clock.after(0, () => void configure($, options))
  return undefined
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await startBackground($, options, true)
    // A refused command costs /preview alone, never the rest
    await $.command
      .register({
        name: 'preview',
        description: 'Browse the images and markdown files of this conversation in a side pane',
        argumentHint: '[path]',
        immediate: true,
      })
      .catch(() => undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    startBackground($, options)
    return next(e)
  })

  on('command.run', { command: 'preview' }, async ($, e) => {
    startBackground($, options)
    const arg = e.args.trim().replace(/^(["'`])(.*)\1$/, '$2')
    let artifact: Artifact | null = null
    if (arg !== '') {
      artifact = await fileArtifact($, cleanPath(arg) ?? arg)
      if (artifact === null) return { text: strings.notFound(arg) }
    }
    const opening = open($, artifact, { columns: e.presentation.columns })
    await refresh($)
    const opened = await opening
    return opened.isPlaced ? {} : { text: strings.notPlaced(opened.reason) }
  })

  // A sent prompt's pictures are indexed as its row is stored, before the row draws
  on('session.append', { door: 'prompt' }, async ($, e, next) => {
    startBackground($, options)
    const prompt = promptImages(e.message.content as readonly Block[], words())
    if (prompt !== null) await indexPrompt(prompts, prompt)
    const stored = await next(e)
    if (prompt !== null) $.ui.invalidate('ui.render')
    return stored
  })

  on('turn.complete', async ($, e, next) => {
    startBackground($, options)
    const result = await next(e)
    if (e.agentId !== undefined) return result
    // The working directory may have moved, and files named before they were written exist now:
    // look again, and draw the rows again so their buttons catch up
    place = undefined
    files.clear()
    $.ui.invalidate('ui.render')
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) $.clock.after(0, () => void refresh($))
    return result
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    startBackground($, options)
    if (e.surface !== 'terminal' || !mentionsArtifact(e.props.text)) return next(e)
    const list = await existing($, pathsIn(e.props.text))
    if (list.length === 0) return next(e)
    return withRow($, $.ui.resolve(e), e, await next(e), list)
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    startBackground($, options)
    if (e.surface !== 'terminal' || e.props.origin.kind !== 'composer') return next(e)
    const text = e.props.text
    const hasTags = imageNumbers(text).length > 0
    if (!hasTags && !mentionsArtifact(text)) return next(e)
    // A resumed conversation was never appended here: read it once
    if (hasTags && !isIndexed) await readConversation($)
    const pictures = hasTags ? (prompts.get(text.trim()) ?? []) : []
    const list = [...pictures, ...(await existing($, pathsIn(text)))]
    if (list.length === 0) return next(e)
    return withRow($, $.ui.resolve(e), e, await next(e), list)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    startBackground($, options)
    if (e.surface !== 'terminal' || e.props.isRunning || e.props.isErrored || e.props.isInterrupted) return next(e)
    const list = await toolArtifacts($, e.props, 'all')
    if (list.length === 0) return next(e)
    return withRow($, $.ui.resolve(e), e, await next(e), list)
  })

  // A folded run of reads: only its pictures get buttons, so a run of doc reads stays one line
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    startBackground($, options)
    if (e.surface !== 'terminal' || e.props.isExpanded) return next(e)
    const list: Artifact[] = []
    for (const call of e.props.calls) {
      if (call.isRunning || call.isErrored || call.isInterrupted) continue
      for (const artifact of await toolArtifacts($, call, 'images')) {
        if (!list.some(known => known.id === artifact.id)) list.push(artifact)
      }
    }
    if (list.length === 0) return next(e)
    return withRow($, $.ui.resolve(e), e, await next(e), list)
  })

  // Thumbnails of the images the prompt being typed refers to
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    startBackground($, options)
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const list = await read($, draft)
    if (list.length === 0) return next(e)
    const look = await read($, mode)
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // Squeezed (a pane opened inline above the prompt takes the room), the tiles drop their
    // borders, then their pictures, so what is left shows whole rather than scroll out of sight
    const room = e.props.maxRows
    const isBordered = room >= 5
    const hasPictures = room >= 2
    const tiles = list.map(image => ({ image, artifact: image.path === null ? null : draftArtifact(image.n, image.path) }))
    const sources = await Promise.all(tiles.map(tile => (hasPictures && tile.artifact !== null ? masterOf($, tile.artifact) : null)))
    const cells = fitRow(
      sources.map(master => master?.size ?? null),
      room,
      e.props.bodyColumns,
      isBordered ? { columns: 2, rows: 3 } : { columns: 0, rows: 1 },
    )
    const pictures = await Promise.all(
      tiles.map(({ image }, i) => {
        const master = sources[i] ?? null
        const box = cells[i]
        return master === null || box === undefined
          ? null
          : drawPicture($, ui, master, box, { mode: look, edge: THUMB_EDGE, key: `draft-${image.n}`, alt: `[Image #${image.n}]` })
      }),
    )
    note(
      $,
      `band rows=${room} columns=${e.props.bodyColumns} ${look} ${tiles
        .map(({ image }, i) => `#${image.n}:${pictures[i] === null ? 'none' : `${cells[i]?.columns}x${cells[i]?.rows}`}`)
        .join(' ')}`,
    )
    const below = await next(e)
    const label = (image: DraftImage, artifact: Artifact | null) =>
      artifact === null ? (
        <Text dimColor>#{image.n}</Text>
      ) : (
        <Button key={`cc-preview:draft:${image.n}`} label={`#${image.n} ⤢`} plain dimColor onPress={() => void open($, artifact, e.viewport)} />
      )
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          {tiles.map(({ image, artifact }, i) => {
            const picture = pictures[i] ?? null
            const { columns, rows } = cells[i] ?? { columns: 4, rows: 1 }
            if (!hasPictures) return label(image, artifact)
            return (
              <Box flexDirection="column" alignItems="center" {...(isBordered ? { borderStyle: 'round', borderDimColor: true } : {})}>
                {picture ?? (
                  <Box width={columns} height={rows} alignItems="center" justifyContent="center">
                    <Text dimColor wrap="truncate">{strings.noPreview}</Text>
                  </Box>
                )}
                {label(image, picture === null ? null : artifact)}
              </Box>
            )
          })}
        </Box>
        {below}
      </Box>
    )
  }).catch(($, e, next) => {
    note($, `band failed: ${next.error.kind} ${next.error.message ?? ''}`)
    return next(e)
  })

  // The band's room changes with an inline pane's: drawn again once it closes
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    $.clock.after(150, () => $.ui.invalidate('ui.render'))
    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    startBackground($, options)
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>{strings.terminalOnly}</Text>
    }
    const ui = $.ui.resolve(e)
    const { Box, Button, Markdown, Text } = ui
    const list = await read($, artifacts)
    const current = await read($, selected)
    const look = await read($, mode)
    const via = await read($, link)
    const columns = e.props.bodyColumns
    const rows = e.props.scroll.bodyRows
    note($, `pane ${e.props.placement} ${columns}x${rows} ${look}: ${current === null ? 'list' : current.label}`)

    if (current === null) {
      const entry = (artifact: Artifact) => {
        const at = list.indexOf(artifact)
        const hotkey = at < 9 ? { hotkey: String(at + 1) } : {}
        return (
          <Box flexDirection="row" columnGap={1}>
            <Button key={`cc-preview:pick:${at}`} {...hotkey} plain label={`${glyph(artifact)} ${artifact.label}`} onPress={() => void update($, selected, () => artifact)} />
            <Text dimColor wrap="truncate-middle">{artifact.detail}</Text>
          </Box>
        )
      }
      const images = list.filter(artifact => artifact.kind === 'image')
      const markdown = list.filter(artifact => artifact.kind === 'markdown')
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={1}>
            <Text bold>{strings.listTitle}</Text>
            <Text dimColor>{String(list.length)}</Text>
            <Button key="cc-preview:refresh" label={strings.refresh} hotkey="r" dimColor onPress={() => void refresh($)} />
          </Box>
          {list.length === 0 && <Text dimColor>{strings.empty}</Text>}
          {images.length > 0 && <Text bold>{strings.images}</Text>}
          {images.map(entry)}
          {markdown.length > 0 && <Text bold>{strings.markdown}</Text>}
          {markdown.map(entry)}
        </Box>
      )
    }

    const at = list.findIndex(artifact => artifact.id === current.id)
    const path = current.source.type === 'file' ? current.source.path : null
    const header = (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        {at >= 0 && list.length > 1 && <Button key="cc-preview:prev" label={strings.prev} hotkey="p" dimColor onPress={() => void step($, list, -1)} />}
        {at >= 0 && <Text dimColor>{`${at + 1}/${list.length}`}</Text>}
        {at >= 0 && list.length > 1 && <Button key="cc-preview:next" label={strings.next} hotkey="n" dimColor onPress={() => void step($, list, 1)} />}
        <Button
          key="cc-preview:all"
          label={strings.all}
          hotkey="a"
          dimColor
          onPress={() => {
            void update($, selected, () => null)
            void refresh($)
          }}
        />
        {path !== null && (
          <Button key="cc-preview:copy" label={strings.copy} hotkey="c" dimColor onPress={press => void $.ui.copy({ text: path, surface: press.surface })} />
        )}
        {current.kind === 'image' && (
          <Button
            key="cc-preview:mode"
            label={`${look === 'blocks' ? strings.blocks : strings.graphics}${via === '' ? '' : ` · ${via}`}`}
            hotkey="g"
            dimColor
            onPress={() => void update($, mode, now => (now === 'blocks' ? 'graphics' : 'blocks'))}
          />
        )}
      </Box>
    )
    const title = (
      <Box flexDirection="row" columnGap={1}>
        <Text bold wrap="truncate">{`${glyph(current)} ${current.label}`}</Text>
        <Text dimColor wrap="truncate-middle">{current.detail}</Text>
      </Box>
    )

    if (current.kind === 'image') {
      const master = await masterOf($, current)
      // Docked beside the transcript, a block picture zooms in toward one pixel of the picture to
      // each of the blocks', and moves about: all its detail, a part at a time
      if (master !== null && look === 'blocks' && e.props.placement === 'dock') {
        const { Raster } = ui
        // Header, zoom bar and title, one to spare should the buttons wrap
        const box = { columns, rows: Math.max(1, rows - 4) }
        const fit = fitBox(master.size, box.columns, box.rows)
        const levels = zoomLevels(master.size, fit)
        const saved = await read($, zoom)
        const view = saved.id === current.id ? saved : { id: current.id, level: 0, x: 0, y: 0 }
        const level = clamp(view.level, 0, levels.length - 1)
        const shape = zoomed(fit, box, levels[level] ?? 1)
        const x = clamp(view.x, 0, shape.full.columns - shape.window.columns)
        const y = clamp(view.y, 0, shape.full.rows - shape.window.rows)
        geometry = { id: current.id, levels, fit, box, level, x, y, shape }
        const raster = await blocksOf($, master, shape.full, { x, y, ...shape.window })
        note($, `pane zoom ${levels[level]?.toFixed(2)}x window ${shape.window.columns}x${shape.window.rows} -> ${raster === null ? 'none' : 'drawn'}`)
        const canMove = shape.full.columns > shape.window.columns || shape.full.rows > shape.window.rows
        return (
          <Box flexDirection="column">
            {header}
            {levels.length > 1 && (
              <Box flexDirection="row" columnGap={1}>
                <Button key="cc-preview:zoom-out" label="−" hotkey="o" dimColor onPress={() => zoomBy($, -1)} />
                <Text dimColor>{`${Math.round((200 * shape.full.columns) / master.size.width)}%`}</Text>
                <Button key="cc-preview:zoom-in" label="+" hotkey="i" dimColor onPress={() => zoomBy($, 1)} />
                {canMove && (
                  <Box flexDirection="row" columnGap={1}>
                    <Button key="cc-preview:left" label="◀" hotkey="h" dimColor onPress={() => pan($, -1, 0)} />
                    <Button key="cc-preview:up" label="▲" hotkey="k" dimColor onPress={() => pan($, 0, -1)} />
                    <Button key="cc-preview:down" label="▼" hotkey="j" dimColor onPress={() => pan($, 0, 1)} />
                    <Button key="cc-preview:right" label="▶" hotkey="l" dimColor onPress={() => pan($, 1, 0)} />
                  </Box>
                )}
                <Text dimColor>{canMove ? strings.zoomPanHint : strings.zoomHint}</Text>
              </Box>
            )}
            {title}
            {raster === null ? (
              <Text dimColor>{strings.imageGone}</Text>
            ) : (
              <Box flexDirection="column" alignItems="center">
                <Raster key="cc-preview:view" columns={shape.window.columns} rows={shape.window.rows} cells={raster} />
              </Box>
            )}
          </Box>
        )
      }
      // Two rows of header, one to spare should the buttons wrap. A short pane (inline above the
      // prompt, a split terminal) would shrink the picture to a few cells: there it fills the
      // width instead, and the arrows scroll it.
      const fit = master === null ? null : fitBox(master.size, columns, rows - 3)
      const cells = master === null || fit === null ? null : fit.columns >= columns * 0.6 ? fit : fitBox(master.size, columns, 255)
      const scrolls = cells !== null && cells.rows > rows - 3
      const picture =
        master === null || cells === null
          ? null
          : await drawPicture($, ui, master, cells, { mode: look, edge: null, key: 'cc-preview:view', alt: current.label })
      note($, `pane picture ${master === null ? 'no source' : picture === null ? 'none' : `${cells?.columns}x${cells?.rows}`}`)
      return (
        <Box flexDirection="column">
          {header}
          <Box flexDirection="row" columnGap={1}>
            {title}
            {scrolls && <Text dimColor>{strings.scroll}</Text>}
          </Box>
          {picture === null ? (
            <Text dimColor>{strings.imageGone}</Text>
          ) : (
            <Box flexDirection="column" alignItems="center">
              {picture}
            </Box>
          )}
        </Box>
      )
    }

    const document = path === null ? strings.documentGone : await documentOf($, path)
    return (
      <Box flexDirection="column">
        {header}
        {title}
        {typeof document === 'string' ? (
          <Text dimColor>{document}</Text>
        ) : (
          document.chunks.map((text, i) => <Markdown key={`cc-preview:md:${i}`} text={text} />)
        )}
        {typeof document !== 'string' && document.isTruncated && <Text dimColor>{strings.truncated}</Text>}
      </Box>
    )
  }).catch(($, e, next) => {
    note($, `pane failed: ${next.error.kind} ${next.error.message ?? ''}`)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{`cc-preview: ${next.error.kind === 'timeout' ? 'took too long' : (next.error.message ?? 'failed')}`}</Text>
  })
}
