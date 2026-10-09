export type ArtifactKind = 'image' | 'markdown'

const IMAGE = /\.(png|jpe?g|gif|webp)$/i
const MARKDOWN = /\.(md|markdown|mdx)$/i
// Most text names no such file; this cheap test skips the full scan for it
const ANY = /\.(png|jpe?g|gif|webp|md|markdown|mdx)\b/i

export function kindOf(path: string): ArtifactKind | null {
  if (IMAGE.test(path)) return 'image'
  if (MARKDOWN.test(path)) return 'markdown'
  return null
}

export const mentionsArtifact = (text: string) => ANY.test(text)

/** A path as written, cleaned of what surrounds it in prose; null when it is no image or markdown file. */
export function cleanPath(raw: string): string | null {
  let path = raw.trim()
  if (/^file:\/\//i.test(path)) {
    path = path.slice('file://'.length)
    try {
      path = decodeURIComponent(path)
    } catch {
      // keep it as written
    }
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    // A web address: never fetched
    return null
  }
  path = path.replace(/^[<([{]+/, '').replace(/[>)\]},.;:!?]+$/, '')
  // `plan.md:12` or `plan.md:12-20` names lines of the file
  path = path.replace(/:\d+(?:[:-]\d+)?$/, '')
  if (path === '' || path.length > 1024 || /[*?<>|\n\r\t]/.test(path)) return null
  return kindOf(path) === null ? null : path
}

/**
 * The image and markdown paths a text names, in order, each once: inside backticks or quotes
 * (where a path may hold spaces) and as bare words. Nothing here touches the disk.
 */
export function pathsIn(text: string): string[] {
  const found: string[] = []
  const add = (raw: string) => {
    const path = cleanPath(raw)
    if (path !== null && !found.includes(path)) found.push(path)
  }
  if (!mentionsArtifact(text)) return found
  const SPANS = /`([^`\n]+)`|"([^"\n]+)"|'([^'\n]+)'/g
  let rest = text
  for (const match of text.matchAll(SPANS)) {
    const span = match[1] ?? match[2] ?? match[3] ?? ''
    // Words in quotes are prose unless they look like a path
    if (/\s/.test(span.trim()) && !span.includes('/')) continue
    add(span)
    // Its words are not read again one by one (`Screen Shot 1.png` names no `1.png`)
    rest = rest.replace(match[0], ' ')
  }
  for (const match of rest.matchAll(/[^\s`'"()<>[\]{}]+/g)) add(match[0])
  return found
}

/** `abs` with `.`, `..` and repeated slashes folded. */
export function normalize(abs: string): string {
  const parts: string[] = []
  for (const part of abs.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

/** An absolute path for one as written: `~/` under home, a relative one under cwd. */
export function resolvePath(raw: string, cwd: string, home: string | undefined): string | null {
  let path = raw
  if (path === '~' || path.startsWith('~/')) {
    if (home === undefined) return null
    path = home + path.slice(1)
  } else if (path.startsWith('~')) {
    return null
  }
  if (!path.startsWith('/')) path = `${cwd}/${path}`
  return normalize(path)
}

export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** Where a file sits, for a caption: relative to `root` when inside it, `~/` under home, else absolute. */
export function folderOf(path: string, root: string, home: string | undefined): string {
  const dir = path.slice(0, Math.max(1, path.lastIndexOf('/')))
  if (dir === root) return './'
  if (dir.startsWith(`${root}/`)) return `${dir.slice(root.length + 1)}/`
  if (home !== undefined && dir.startsWith(`${home}/`)) return `~/${dir.slice(home.length + 1)}/`
  return `${dir}/`
}
