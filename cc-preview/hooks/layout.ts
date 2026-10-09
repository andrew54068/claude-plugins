// Adapted from cc-image-view (https://github.com/GGGODLIN/cc-mod-image-view), MIT; see NOTICE.
export type Size = { width: number; height: number }
export type Cells = { columns: number; rows: number }

const TILE_ROWS = 6
const MAX_COLUMNS = 32
const MIN_COLUMNS = 4
// A terminal cell is about twice as tall as it is wide.
const CELL_ASPECT = 2
// Used when the size is unknown.
const FALLBACK: Size = { width: 16, height: 10 }
// Each tile adds a border on every side and a button row under the picture.
const TILE_CHROME_ROWS = 3
const TILE_CHROME_COLUMNS = 2
const GAP = 1

/** The distinct image numbers a draft references, in the order they first appear. */
export function imageNumbers(draft: string): number[] {
  const seen = new Set<number>()
  for (const match of draft.matchAll(/\[Image #(\d+)\]/g)) seen.add(Number(match[1]))
  return [...seen]
}

/** Width and height from a PNG's IHDR chunk, or null when the bytes aren't a PNG. */
export function pngSize(base64: string): Size | null {
  // 24 bytes cover the signature and IHDR's width and height; 32 base64 chars decode to exactly 24.
  let head: Uint8Array
  try {
    head = Uint8Array.from(atob(base64.slice(0, 32)), char => char.charCodeAt(0))
  } catch {
    return null
  }
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (head.length < 24 || signature.some((byte, i) => head[i] !== byte)) return null
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width > 0 && height > 0 ? { width, height } : null
}

/** How many bytes a base64 string decodes to. */
export function decodedLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

/** A picture box `rows` tall (at most `maxColumns` wide) that keeps the picture's aspect ratio. */
export function fitCells(size: Size | null, tileRows = TILE_ROWS, maxColumns = MAX_COLUMNS): Cells {
  const { width, height } = size ?? FALLBACK
  let rows = tileRows
  let columns = Math.round((rows * CELL_ASPECT * width) / height)
  if (columns > maxColumns) {
    columns = maxColumns
    rows = Math.max(1, Math.round((maxColumns * height) / (CELL_ASPECT * width)))
  }
  return { columns: Math.max(MIN_COLUMNS, columns), rows: Math.min(rows, tileRows) }
}

/** The largest box inside `maxColumns` × `maxRows` that keeps the picture's aspect ratio; Image caps both at 255. */
export function fitBox(size: Size | null, maxColumns: number, maxRows: number): Cells {
  const { width, height } = size ?? FALLBACK
  const columnsCap = Math.max(1, Math.min(255, maxColumns))
  const rowsCap = Math.max(1, Math.min(255, maxRows))
  const columns = Math.round((rowsCap * CELL_ASPECT * width) / height)
  if (columns <= columnsCap) return { columns: Math.max(1, columns), rows: rowsCap }
  return { columns: columnsCap, rows: Math.max(1, Math.round((columnsCap * height) / (CELL_ASPECT * width))) }
}

/**
 * Picture boxes for one row of tiles that fits the band whole, so it never scrolls:
 * the tallest tiles whose chrome fits in `maxRows` and whose total width fits in `bodyColumns`.
 */
export function fitRow(
  sizes: readonly (Size | null)[],
  maxRows: number,
  bodyColumns: number,
  chrome: Cells = { columns: TILE_CHROME_COLUMNS, rows: TILE_CHROME_ROWS },
): Cells[] {
  const tallest = Math.max(1, Math.min(TILE_ROWS, maxRows - chrome.rows))
  for (let tileRows = tallest; tileRows > 1; tileRows--) {
    const cells = sizes.map(size => fitCells(size, tileRows))
    const width = cells.reduce((sum, c) => sum + c.columns + chrome.columns, 0) + GAP * (cells.length - 1)
    if (width <= bodyColumns) return cells
  }
  return sizes.map(size => fitCells(size, 1))
}

// East Asian wide and fullwidth ranges a label may use; everything else here is one cell.
const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/

/** Terminal cells a string takes. */
export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) width += WIDE.test(char) ? 2 : 1
  return width
}

/** `text` cut to `max` cells, the middle dropped so a file keeps its extension. */
export function fitLabel(text: string, max: number): string {
  if (cellWidth(text) <= max) return text
  const chars = [...text]
  const tail = chars.slice(-Math.min(8, Math.floor(max / 2))).join('')
  let head = ''
  for (const char of chars) {
    if (cellWidth(head + char) + cellWidth(tail) + 1 > max) break
    head += char
  }
  return `${head}…${tail}`
}

/** Where each button of a row starts: the terminal draws `[ label ]`, one cell apart. */
export function buttonOffsets(labels: readonly string[]): number[] {
  const offsets: number[] = []
  let at = 0
  for (const label of labels) {
    offsets.push(at)
    at += cellWidth(label) + 4 + GAP
  }
  return offsets
}

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(Math.max(low, high), value))

// A zoomed picture is sampled to a BMP of 3 bytes a pixel, read whole: under $.fs.read's 4 MiB
export const MAX_ZOOM_PIXELS = 1_200_000

/**
 * The zoom scales of a picture fitted in `fit` cells of quadrant blocks, two pixels a cell each
 * way: 1 is the fit, then doubling, up to the scale that gives each pixel of the picture a pixel
 * of the blocks' across (100%), or as near as the pixel cap allows.
 */
export function zoomLevels(size: Size, fit: Cells): number[] {
  const oneToOne = size.width / (fit.columns * 2)
  const capped = Math.sqrt(MAX_ZOOM_PIXELS / (fit.columns * 2 * fit.rows * 2))
  const most = Math.min(oneToOne, capped)
  const levels = [1]
  for (let scale = 2; scale < most; scale *= 2) levels.push(scale)
  if (most > (levels.at(-1) ?? 1) * 1.1) levels.push(most)
  return levels
}

/** A zoomed picture: all its cells, and the window of them a box shows. */
export type Zoomed = { full: Cells; window: Cells }

export function zoomed(fit: Cells, box: Cells, scale: number): Zoomed {
  const full = { columns: Math.max(1, Math.round(fit.columns * scale)), rows: Math.max(1, Math.round(fit.rows * scale)) }
  return { full, window: { columns: Math.min(box.columns, full.columns), rows: Math.min(box.rows, full.rows) } }
}

/** Where the window goes when the zoom changes from `from` to `to`, so what was in its middle stays there. */
export function keepCenter(at: { x: number; y: number }, from: Zoomed, to: Zoomed): { x: number; y: number } {
  const middleX = (at.x + from.window.columns / 2) / from.full.columns
  const middleY = (at.y + from.window.rows / 2) / from.full.rows
  return {
    x: clamp(Math.round(middleX * to.full.columns - to.window.columns / 2), 0, to.full.columns - to.window.columns),
    y: clamp(Math.round(middleY * to.full.rows - to.window.rows / 2), 0, to.full.rows - to.window.rows),
  }
}
