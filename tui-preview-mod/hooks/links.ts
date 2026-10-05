// Media paths in a reply become file: links the Mod answers on a plain click;
// every other character of the reply is drawn as written. Nothing here reads a
// file: media.mjs still decides root containment, type and size on the click.

const EXTENSIONS = 'png|jpe?g|webp|gif|mp4|mov|webm|mkv';
const MEDIA = new RegExp(`\\.(?:${EXTENSIONS})$`, 'i');
const CONTROL = /[\u0000-\u001f\u007f]/;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const REFERENCE = /^( {0,3}\[[^\]\n]+\]:[ \t]*)<?([^\s<>]+)>?(.*)$/;
// Markdown link, code span, <autolink or HTML>, URL, then one maximal run of path
// characters: no nested quantifier, so a long unbroken token is scanned once. Bare
// paths are ASCII so prose glued to them (存到content/a.png了) stays outside the link.
const TOKEN = new RegExp([
  '(!?)\\[([^\\]\\n]*)\\]\\(([^()\\s]+)\\)',
  '(`+)([^`\\n]+?)\\4',
  '<[^>\\n]*>',
  '[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s<>()]*',
  '([\\w.~/-]+)',
].join('|'), 'g');

export const MAX_TEXT = 10_000;
export const MAX_LINKS = 256;
const MAX_HREF = 2048;

export type LinkedReply = { text: string; links: Map<string, string> };

export function fileHref(path: string) {
  return `file://${encodeURI(path).replace(/[?#()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

export function pathFromHref(href: string) {
  if (!href.startsWith('file:///')) return undefined;
  let path: string;
  try { path = decodeURIComponent(href.slice('file://'.length)); } catch { return undefined; }
  return CONTROL.test(path) ? undefined : path;
}

function normalize(path: string) {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part !== '..') parts.push(part);
    else if (parts.pop() === undefined) return undefined;
  }
  return `/${parts.join('/')}`;
}

export function linkifyMediaPaths(markdown: string, root: string, extraRoots: readonly string[]): LinkedReply | undefined {
  if (markdown.length > MAX_TEXT) return undefined;
  const roots = [root, ...extraRoots].map(normalize).filter((value): value is string => !!value);
  if (!roots.length) return undefined;
  const links = new Map<string, string>();
  const mediaPath = (raw: string) => {
    if (!MEDIA.test(raw) || CONTROL.test(raw) || raw.startsWith('~') || SCHEME.test(raw)) return undefined;
    const path = normalize(raw.startsWith('/') ? raw : `${roots[0]}/${raw}`);
    return path && roots.some(base => path.startsWith(base === '/' ? '/' : `${base}/`)) ? path : undefined;
  };
  // One href per path; past MAX_LINKS or the href ceiling the path stays plain text.
  const hrefOf = (path: string | undefined) => {
    if (!path) return undefined;
    const href = fileHref(path);
    if (href.length > MAX_HREF || (!links.has(href) && links.size >= MAX_LINKS)) return undefined;
    links.set(href, path);
    return href;
  };
  const linkLine = (line: string) => line.replace(TOKEN, (whole, bang, label, target, ticks, code, bare) => {
    if (target !== undefined) {
      if (bang) return whole;
      const href = hrefOf(target.startsWith('file:') ? mediaPath(pathFromHref(target) ?? '') : mediaPath(target));
      return href ? `[${label}](${href})` : whole;
    }
    if (ticks !== undefined) {
      const raw = code.trim();
      // A spaced span is a path only when it starts like one (`/Users/me/Screen Shot.png`), not a command.
      if (/\s/.test(raw) && !/^\.{0,2}\//.test(raw)) return whole;
      const href = hrefOf(mediaPath(raw));
      return href ? `[${whole}](${href})` : whole;
    }
    if (bare === undefined) return whole;
    // A sentence's closing dots trail the path; a bare token must hold a directory.
    const path = bare.replace(/\.+$/, '');
    const href = path.includes('/') ? hrefOf(mediaPath(path)) : undefined;
    return href ? `[${path}](${href})${bare.slice(path.length)}` : whole;
  });
  let fence: { char: string; size: number } | undefined;
  const lines = markdown.split('\n').map(line => {
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence.char && marker.length >= fence.size && /^ {0,3}[`~]+\s*$/.test(line)) fence = undefined;
      return line;
    }
    if (marker) { fence = { char: marker[0]!, size: marker.length }; return line; }
    // A reference definition keeps its shape: only its destination may become the file href.
    const definition = REFERENCE.exec(line);
    if (definition) {
      const target = definition[2]!;
      const href = hrefOf(target.startsWith('file:') ? mediaPath(pathFromHref(target) ?? '') : mediaPath(target));
      return href ? `${definition[1]}${href}${definition[3]}` : line;
    }
    return linkLine(line);
  });
  const text = lines.join('\n');
  return links.size && text.length <= MAX_TEXT ? { text, links } : undefined;
}
