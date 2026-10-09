import type { Size } from './layout'

// Every picture is handed to the terminal as PNG bytes, never as a file name: over ssh the
// terminal runs on another machine and cannot read this one's files. `Image` takes at most
// 2 MiB of PNG, so anything else (another format, a bigger PNG) is made into a PNG that fits.
export const MAX_PNG_BYTES = 2 * 1024 * 1024

/** An image as a PNG file on this machine: the source itself, or a converted copy. */
export type Master = { path: string; size: Size; bytes: number }

export const PNG = /\.png$/i
export const CONVERTIBLE = /\.(jpe?g|gif|webp)$/i
export const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

// Tried in order, 10 s each: sips ships with macOS, the others are common on Linux. Only these
// formats, only the first frame, file input only: a converter is a trust boundary.
// Adapted from cc-image-view (https://github.com/GGGODLIN/cc-mod-image-view), MIT; see NOTICE.
export const CONVERTERS = (src: string, out: string): string[][] => [
  ['sips', '-s', 'format', 'png', src, '--out', out],
  ['ffmpeg', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file', '-i', src, '-frames:v', '1', out],
  ['magick', '-limit', 'memory', '256MiB', '-limit', 'disk', '1GiB', `${src}[0]`, out],
  ['convert', '-limit', 'memory', '256MiB', '-limit', 'disk', '1GiB', `${src}[0]`, out],
]

/** Commands that shrink a PNG to `edge` on its longest side; only ever asked to shrink, as sips -Z would enlarge too. */
export const RESIZERS = (src: string, out: string, edge: number, size: Size): string[][] => {
  const scale = edge / Math.max(size.width, size.height)
  const width = Math.max(1, Math.round(size.width * scale))
  const height = Math.max(1, Math.round(size.height * scale))
  return [
    ['sips', '-Z', String(edge), src, '--out', out],
    ['ffmpeg', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file', '-i', src, '-vf', `scale=${width}:${height}`, out],
    ['magick', '-limit', 'memory', '256MiB', '-limit', 'disk', '1GiB', src, '-resize', `${width}x${height}!`, out],
    ['convert', '-limit', 'memory', '256MiB', '-limit', 'disk', '1GiB', src, '-resize', `${width}x${height}!`, out],
  ]
}

/** The longest side of the next try, shrinking by the square root of how far over the cap `bytes` is, with room to spare. */
export const shrunkEdge = (edge: number, bytes: number) => Math.floor(edge * Math.sqrt((MAX_PNG_BYTES * 0.8) / bytes))

// The copies are someone's pictures. A folder is only as private as the one holding it: if
// another account can rename entries in the temp root, it can swap our folder for its own. So the
// root must be ours, not a symlink, writable by no one else, and sit in a parent that is either
// closed to others or sticky; then both folders are made ours and 700. Run on every write, which
// also recreates a folder someone cleared.
// Adapted from cc-image-view (https://github.com/GGGODLIN/cc-mod-image-view), MIT; see NOTICE.
export const PRIVATE_DIRS = [
  'umask 077',
  'r="$1"; p=$(dirname "$r")',
  '[ -d "$r" ] && [ ! -L "$r" ] && [ -O "$r" ] || exit 1',
  '[ -z "$(find "$r" -maxdepth 0 \\( -perm -0020 -o -perm -0002 \\))" ] || exit 1',
  '[ -z "$(find "$p" -maxdepth 0 \\( -perm -0020 -o -perm -0002 \\) ! -perm -1000)" ] || exit 1',
  'for d in "$2" "$3"; do mkdir -p "$d" && [ ! -L "$d" ] && [ -O "$d" ] && chmod 700 "$d" || exit 1; done',
].join('; ')

/** A short stable name for `text`, to name scratch files and blobs by. */
export async function digest(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 20)
}

/** Commands that write `src` as a `width` × `height` BMP, the pixels the block drawing reads. */
export const BMP_CONVERTERS = (src: string, out: string, width: number, height: number): string[][] => [
  ['sips', '-s', 'format', 'bmp', '-z', String(height), String(width), src, '--out', out],
  ['ffmpeg', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file', '-i', src, '-frames:v', '1', '-vf', `scale=${width}:${height}`, '-pix_fmt', 'bgr24', out],
  ['magick', '-limit', 'memory', '256MiB', '-limit', 'disk', '1GiB', `${src}[0]`, '-resize', `${width}x${height}!`, `BMP3:${out}`],
  ['convert', '-limit', 'memory', '256MiB', '-limit', 'disk', '1GiB', `${src}[0]`, '-resize', `${width}x${height}!`, `BMP3:${out}`],
]

/**
 * A cache of loads by key that keeps the `limit` used last; a load that comes to null is
 * forgotten, so the next ask tries again.
 */
export function memo<T>(limit: number) {
  const entries = new Map<string, Promise<T | null>>()
  return (key: string, load: () => Promise<T | null>): Promise<T | null> => {
    const hit = entries.get(key)
    if (hit !== undefined) {
      entries.delete(key)
      entries.set(key, hit)
      return hit
    }
    const loading = load().then(
      value => {
        if (value === null) entries.delete(key)
        return value
      },
      () => {
        entries.delete(key)
        return null
      },
    )
    entries.set(key, loading)
    for (const old of entries.keys()) {
      if (entries.size <= limit) break
      entries.delete(old)
    }
    return loading
  }
}
