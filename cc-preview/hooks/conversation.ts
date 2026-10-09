import { cleanPath, pathsIn } from './paths'

// What the conversation holds, read from `$.session.messages({ as: 'api' })` (or a row
// `session.append` hands over): blocks as the Messages API spells them, media inline.
export type Block = { readonly type: string; readonly [field: string]: unknown }
export type Message = { readonly role: string; readonly content: readonly Block[] }

/** An image the conversation holds as bytes: a paste, or a tool's picture (a screenshot). */
export type Picture = { mediaType: string; base64: string; label: string; detail: string }

/** One thing the conversation shows, in the order it first appears. */
export type Item = { type: 'path'; raw: string } | { type: 'picture'; picture: Picture }

/** A prompt the person sent with images: its words, as its row shows them, and its pictures. */
export type PromptImages = { text: string; pictures: Picture[] }

export type Scanned = { items: Item[]; prompts: PromptImages[] }

/** The captions' words, in the person's language. */
export type Words = { pasted: string; toolResult: string }

// Text the engine adds beside what was written; a reminder can quote whole files full of paths
const INJECTED = /<(system-reminder|local-command-stdout|local-command-caveat)>[\s\S]*?<\/\1>/g
// Inputs that name a file
const PATH_KEYS = ['file_path', 'notebook_path', 'path', 'filePath', 'output_path', 'outputPath', 'filename']
// A Read's result holds the file's picture, but the file itself is the better source
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const textOf = (blocks: readonly Block[]) =>
  blocks
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text as string)
    .join('\n')

/** The bytes of an image block in either spelling: the Messages API's `source`, or MCP's `data` and `mimeType`. */
export function imageOf(block: unknown): { mediaType: string; base64: string } | null {
  if (!isRecord(block) || block.type !== 'image') return null
  const source = block.source
  if (isRecord(source) && typeof source.data === 'string' && source.data !== '') {
    return { mediaType: String(source.media_type ?? ''), base64: source.data }
  }
  if (typeof block.data === 'string' && block.data !== '') return { mediaType: String(block.mimeType ?? ''), base64: block.data }
  return null
}

/** Every image block in a tool's result, however deep it sits (an MCP result nests them in `content`). */
export function imagesIn(value: unknown, depth = 0): { mediaType: string; base64: string }[] {
  if (depth > 4) return []
  const own = imageOf(value)
  if (own !== null) return [own]
  if (Array.isArray(value)) return value.flatMap(item => imagesIn(item, depth + 1))
  if (isRecord(value) && Array.isArray(value.content)) return imagesIn(value.content, depth + 1)
  return []
}

/** The image and markdown files a tool call names in its input. */
export function toolPaths(tool: string, input: unknown): string[] {
  if (!isRecord(input)) return []
  const found: string[] = []
  for (const key of PATH_KEYS) {
    const value = input[key]
    const path = typeof value === 'string' ? cleanPath(value) : null
    if (path !== null && !found.includes(path)) found.push(path)
  }
  if (tool === 'Bash' && typeof input.command === 'string') {
    for (const path of pathsIn(input.command)) if (!found.includes(path)) found.push(path)
  }
  return found
}

/** `mcp__playwright__browser_take_screenshot` reads as `browser_take_screenshot`. */
export const shortTool = (tool: string) => tool.replace(/^mcp__.*?__/, '')

/** The labels of a prompt's pasted images: `Image #n` from its tags when they pair one to one. */
function pasteLabels(text: string, count: number): string[] {
  const tags = [...text.matchAll(/\[Image #(\d+)\]/g)].map(match => match[1])
  return Array.from({ length: count }, (_, i) => (tags.length === count ? `Image #${tags[i]}` : `Pasted image ${i + 1}`))
}

/** A prompt's words for a caption: tags dropped, one line, short. */
function gist(text: string): string {
  const words = text.replace(/\[Image #\d+\]/g, '').replace(/\s+/g, ' ').trim()
  return words.length > 40 ? `${words.slice(0, 39)}…` : words
}

/** The pictures of a prompt row: its top-level image blocks. */
export function promptImages(content: readonly Block[], words: Words): PromptImages | null {
  const images = content.map(imageOf).filter((image): image is { mediaType: string; base64: string } => image !== null)
  if (images.length === 0) return null
  // A request folds the engine's reminders into the prompt's message; the row shows only the words
  const text = textOf(content).replace(INJECTED, '').trim()
  const labels = pasteLabels(text, images.length)
  const said = gist(text)
  return {
    text,
    pictures: images.map((image, i) => ({ ...image, label: labels[i] ?? 'Pasted image', detail: said === '' ? words.pasted : `${words.pasted} · ${said}` })),
  }
}

/** Every image and markdown file the conversation names or shows, oldest first. */
export function scan(messages: readonly Message[], words: Words): Scanned {
  const items: Item[] = []
  const prompts: PromptImages[] = []
  const calls = new Map<string, { tool: string; input: unknown }>()
  const addPaths = (paths: string[]) => {
    for (const raw of paths) items.push({ type: 'path', raw })
  }

  for (const message of messages) {
    const content = Array.isArray(message.content) ? message.content : []
    if (message.role === 'assistant') {
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') addPaths(pathsIn(block.text))
        if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
          calls.set(block.id, { tool: block.name, input: block.input })
          addPaths(toolPaths(block.name, block.input))
        }
      }
      continue
    }
    const prompt = promptImages(content, words)
    if (prompt !== null) {
      prompts.push(prompt)
      for (const picture of prompt.pictures) items.push({ type: 'picture', picture })
    }
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') addPaths(pathsIn(block.text.replace(INJECTED, '')))
      if (block.type !== 'tool_result') continue
      const call = typeof block.tool_use_id === 'string' ? calls.get(block.tool_use_id) : undefined
      if (call === undefined || FILE_TOOLS.has(call.tool)) continue
      const images = imagesIn(block.content)
      images.forEach((image, i) => {
        const label = images.length > 1 ? `${shortTool(call.tool)} ${i + 1}` : shortTool(call.tool)
        items.push({ type: 'picture', picture: { ...image, label, detail: words.toolResult } })
      })
    }
  }
  return { items, prompts }
}
