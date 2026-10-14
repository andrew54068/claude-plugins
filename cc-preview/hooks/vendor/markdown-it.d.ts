/*
 * The vendored markdown-it bundle (markdown-it.js beside this file): only what cc-preview uses.
 * markdown-it's own typings are in its package as dist/markdown-it.d.mts.
 */

export type Token = {
  type: string
  tag: string
  attrs: [string, string | number][] | null
  map: [number, number] | null
  nesting: -1 | 0 | 1
  level: number
  children: Token[] | null
  content: string
  markup: string
  info: string
  meta: Record<string, unknown> | null
  block: boolean
  hidden: boolean
  attrGet(name: string): string | number | null
}

export type StateInline = {
  src: string
  pos: number
  posMax: number
  pending: string
  push(type: string, tag: string, nesting: -1 | 0 | 1): Token
}

export type StateBlock = {
  src: string
  bMarks: number[]
  eMarks: number[]
  tShift: number[]
  sCount: number[]
  blkIndent: number
  line: number
  push(type: string, tag: string, nesting: -1 | 0 | 1): Token
  getLines(begin: number, end: number, indent: number, keepLastLF: boolean): string
}

export type InlineRule = (state: StateInline, silent: boolean) => boolean
export type BlockRule = (state: StateBlock, startLine: number, endLine: number, silent: boolean) => boolean

type Ruler<Rule> = {
  after(afterName: string, ruleName: string, fn: Rule, options?: { alt?: string[] }): void
  before(beforeName: string, ruleName: string, fn: Rule, options?: { alt?: string[] }): void
}

export type MarkdownIt = {
  parse(src: string, env: object): Token[]
  use(plugin: (md: MarkdownIt) => void): MarkdownIt
  inline: { ruler: Ruler<InlineRule> }
  block: { ruler: Ruler<BlockRule> }
  linkify: { set(options: { fuzzyLink?: boolean; fuzzyEmail?: boolean; fuzzyIP?: boolean }): unknown }
  utils: { unescapeAll(text: string): string }
}

export type MarkdownItOptions = { html?: boolean; linkify?: boolean; typographer?: boolean; breaks?: boolean }

export declare function markdownIt(options?: MarkdownItOptions): MarkdownIt
export declare function footnote(md: MarkdownIt): void
