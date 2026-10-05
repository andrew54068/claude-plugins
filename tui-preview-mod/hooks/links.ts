// Media paths in a reply become file: links the Mod answers on a plain click;
// every other character of the reply is drawn as written. Nothing here reads a
// file: media.mjs still decides root containment, type and size on the click.

const EXTENSIONS = 'png|jpe?g|webp|gif|mp4|mov|webm|mkv';
const MEDIA = new RegExp(`\\.(?:${EXTENSIONS})$`, 'i');
const CONTROL = /[\u0000-\u001f\u007f]/;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const EMAIL = /^[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
// The targets a plugin-drawn Markdown keeps clickable; a reply with any other keeps core's drawing.
const KEPT_SCHEME = /^(?:https?|file):/i;
const KEPT_RELATIVE = /^[A-Za-z0-9._~-]/;
// A fence may sit under a list item or in a quote; over-detection only leaves text unlinked.
const FENCE = /^[ \t>]*(`{3,}|~{3,})/;
const FENCE_CLOSE = /^[ \t>]*[`~]+\s*$/;
// A definition is its label, its destination and at most a title; anything else on the line is prose.
const REFERENCE = /^( {0,3}\[[^\]\n]+\]:[ \t]*)<?([^\s<>]+)>?((?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?[ \t]*)$/;
// Markdown link with an optional title, code span, <autolink or HTML>, URL, then one maximal run
// of path characters. A label or <…> stops at its own opener, a code span starts only at the
// head of a backtick run and a scheme is at most 32 characters, so no position is rescanned.
// Bare paths are ASCII so prose glued to them (存到content/a.png了) stays outside the link.
const TOKEN = new RegExp([
  '(?<bang>!?)\\[(?<label>[^\\[\\]\\n]*)\\]\\((?<target>[^()\\s]+)(?<title>[ \\t]+(?:"[^"\\n]*"|\'[^\'\\n]*\'|\\([^()\\n]*\\)))?[ \\t]*\\)',
  '(?<!`)(?=(?<ticks>`+))\\k<ticks>(?<code>[^`\\n]+?)\\k<ticks>',
  '<(?<angle>[^<>\\n]*)>',
  '(?:[A-Za-z][A-Za-z0-9+.-]{0,31}:\\/\\/|www\\.)[^\\s<>()]*',
  '(?<bare>[\\w.~/@-]+)',
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
  // A link the plugin Markdown would draw as `text (url)` makes the whole reply keep core's drawing.
  let keepsCore = false;
  const keep = (target: string) => { if (!(SCHEME.test(target) ? KEPT_SCHEME : KEPT_RELATIVE).test(target)) keepsCore = true; };
  const escaped = (line: string, offset: number) => /\\*$/.exec(line.slice(0, offset))![0].length % 2 === 1;
  const linkLine = (line: string) => line.replace(TOKEN, (...args) => {
    const whole = args[0] as string;
    const offset = args.at(-3) as number;
    const { bang, label, target, title = '', ticks, code, angle, bare } = args.at(-1) as Record<string, string | undefined>;
    if (target !== undefined) {
      if (bang || escaped(line, offset)) return whole;
      const href = hrefOf(target.startsWith('file:') ? mediaPath(pathFromHref(target) ?? '') : mediaPath(target));
      if (href) return `[${label}](${href}${title})`;
      keep(target);
      return whole;
    }
    if (ticks !== undefined) {
      const raw = code!.trim();
      // A spaced span is a path only when it starts like one (`/Users/me/Screen Shot.png`), not a command.
      if (escaped(line, offset) || (/\s/.test(raw) && !/^\.{0,2}\//.test(raw))) return whole;
      const href = hrefOf(mediaPath(raw));
      return href ? `[${whole}](${href})` : whole;
    }
    if (angle !== undefined) {
      if (SCHEME.test(angle) || EMAIL.test(angle)) keep(EMAIL.test(angle) ? `mailto:${angle}` : angle);
      return whole;
    }
    if (bare === undefined) return whole;
    if (EMAIL.test(bare)) { keepsCore = true; return whole; }
    // The target of a link the link pattern could not take (nested brackets, an escape) stays as written.
    if (line.slice(Math.max(0, offset - 2), offset) === '](') return whole;
    // A sentence's closing dots trail the path; a bare token must hold a directory.
    const path = bare.replace(/\.+$/, '');
    const href = path.includes('/') ? hrefOf(mediaPath(path)) : undefined;
    return href ? `[${path}](${href})${bare.slice(path.length)}` : whole;
  });
  let fence: { char: string; size: number } | undefined;
  // A definition starts the text, follows a blank line, a fence or another definition; it cannot interrupt a paragraph.
  let definitionMayStart = true;
  const lines = markdown.split('\n').map(line => {
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence.char && marker.length >= fence.size && FENCE_CLOSE.test(line)) { fence = undefined; definitionMayStart = true; }
      return line;
    }
    if (marker) { fence = { char: marker[0]!, size: marker.length }; return line; }
    const definition = definitionMayStart ? REFERENCE.exec(line) : null;
    if (definition) {
      // Only the destination may become the file href; label and title stay as written.
      const target = definition[2]!;
      const href = hrefOf(target.startsWith('file:') ? mediaPath(pathFromHref(target) ?? '') : mediaPath(target));
      if (!href) keep(target);
      return href ? `${definition[1]}${href}${definition[3]}` : line;
    }
    definitionMayStart = !line.trim();
    return linkLine(line);
  });
  const text = lines.join('\n');
  return links.size && !keepsCore && text.length <= MAX_TEXT ? { text, links } : undefined;
}
