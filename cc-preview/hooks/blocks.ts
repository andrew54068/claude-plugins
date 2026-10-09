// Under mosh no terminal graphics get through: mosh keeps its own copy of the screen and sends
// only text and colors. A picture still can, drawn in quadrant block characters: each cell holds
// four pixels, two across and two down, in two colors (the foreground and the background), the
// split of the four that loses least picked per cell.

export type Pixels = { width: number; height: number; rgb: (x: number, y: number) => number }

// By which of a cell's pixels take the foreground: top left 1, top right 2, bottom left 4,
// bottom right 8. A mask and its complement are one split with the colors swapped, so the eight
// masks without the bottom right cover every split; 0 is the cell in one color.
const QUADRANTS = [0x2580, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b]

/** A BMP's pixels (24 or 32 bits, top-down or bottom-up), as `sips`, `ffmpeg` and ImageMagick write it; null for any other. */
export function parseBmp(base64: string): Pixels | null {
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
  } catch {
    return null
  }
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const offset = view.getUint32(10, true)
  const width = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const bits = view.getUint16(28, true)
  const compression = view.getUint32(30, true)
  const height = Math.abs(rawHeight)
  // Uncompressed, or 32-bit with the usual BGRA masks
  if (width <= 0 || height === 0 || (bits !== 24 && bits !== 32) || (compression !== 0 && compression !== 3)) return null
  const stride = Math.floor((bits * width + 31) / 32) * 4
  if (offset + stride * height > bytes.length) return null
  const step = bits / 8
  const isBottomUp = rawHeight > 0
  return {
    width,
    height,
    rgb: (x, y) => {
      const row = isBottomUp ? height - 1 - y : y
      const at = offset + row * stride + x * step
      return ((bytes[at + 2] ?? 0) << 16) | ((bytes[at + 1] ?? 0) << 8) | (bytes[at] ?? 0)
    },
  }
}

function meanOf(quad: readonly number[], mask: number, isForeground: boolean): number | null {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < 4; i++) {
    if ((((mask >> i) & 1) === 1) !== isForeground) continue
    const color = quad[i] ?? 0
    r += color >> 16
    g += (color >> 8) & 0xff
    b += color & 0xff
    n++
  }
  return n === 0 ? null : (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
}

function distance(a: number, b: number): number {
  const dr = (a >> 16) - (b >> 16)
  const dg = ((a >> 8) & 0xff) - ((b >> 8) & 0xff)
  const db = (a & 0xff) - (b & 0xff)
  return dr * dr + dg * dg + db * db
}

/** Raster cells for `pixels` drawn `columns` × `rows`, four pixels a cell; base64 of u32 triplets. */
export function quadrants(pixels: Pixels, columns: number, rows: number): string {
  const words = new DataView(new ArrayBuffer(columns * rows * 12))
  const quad = [0, 0, 0, 0]
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      for (let i = 0; i < 4; i++) {
        quad[i] = pixels.rgb(Math.min(pixels.width - 1, x * 2 + (i & 1)), Math.min(pixels.height - 1, y * 2 + (i >> 1)))
      }
      let best = { mask: 0, fg: 0, bg: 0, error: Infinity }
      for (let mask = 0; mask < 8; mask++) {
        // The bottom right pixel is always background here, so that side is never empty
        const bg = meanOf(quad, mask, false) ?? 0
        const fg = meanOf(quad, mask, true) ?? bg
        let error = 0
        for (let i = 0; i < 4; i++) error += distance(quad[i] ?? 0, ((mask >> i) & 1) === 1 ? fg : bg)
        if (error < best.error) best = { mask, fg, bg, error }
      }
      const at = (y * columns + x) * 12
      words.setUint32(at, QUADRANTS[best.mask] ?? 0x2580, true)
      words.setUint32(at + 4, best.fg, true)
      words.setUint32(at + 8, best.bg, true)
    }
  }
  const bytes = new Uint8Array(words.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
