// A Markdown element holds at most 10000 characters, tab and newline its only control characters.
// A longer file is drawn as several, cut between lines, and a code fence open at a cut is closed
// there and opened again in the next piece so both halves still draw as code.
export const CHUNK_CHARS = 9_000
export const MAX_CHUNKS = 40

const FENCE = /^ {0,3}(`{3,}|~{3,})/

export type Chunked = { chunks: string[]; isTruncated: boolean }

function clean(text: string): string {
  const unified = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
  // Front matter would draw as a rule and loose text; show it as the YAML it is
  const front = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(unified)
  return front === null ? unified : `\`\`\`yaml\n${front[1]}\n\`\`\`\n${unified.slice(front[0].length)}`
}

/** Splits `text` into pieces a Markdown element draws; at most `maxChunks`, the rest dropped. */
export function markdownChunks(text: string, limit = CHUNK_CHARS, maxChunks = MAX_CHUNKS): Chunked {
  const chunks: string[] = []
  let lines: string[] = []
  let size = 0
  let fence: { opener: string; marker: string } | null = null
  let isTruncated = false

  const flush = () => {
    if (lines.length === 0) return
    if (fence !== null) lines.push(fence.marker)
    chunks.push(lines.join('\n'))
    lines = fence === null ? [] : [fence.opener]
    size = lines.reduce((sum, line) => sum + line.length + 1, 0)
  }

  for (const line of clean(text).split('\n')) {
    if (chunks.length >= maxChunks) {
      isTruncated = true
      break
    }
    // A line longer than a piece is cut where it must be
    const pieces: string[] = []
    for (let at = 0; at < Math.max(1, line.length); at += limit / 2) pieces.push(line.slice(at, at + limit / 2))
    for (const piece of pieces) {
      const reserve = fence === null ? 0 : fence.marker.length + 1
      if (size + piece.length + 1 + reserve > limit) flush()
      lines.push(piece)
      size += piece.length + 1
    }
    const opened = FENCE.exec(line)
    if (opened !== null) {
      const marker = opened[1] ?? '```'
      const trimmed = line.trim()
      if (fence === null) fence = { opener: line, marker }
      else if (trimmed.length >= fence.marker.length && [...trimmed].every(char => char === fence?.marker[0])) fence = null
    } else if (fence === null && line.trim() === '' && size > limit * 0.8) {
      // Near the limit, a blank line is a kinder place to cut than wherever the limit falls
      flush()
    }
  }
  if (chunks.length < maxChunks) flush()
  else if (lines.length > 0 && lines.some(line => line.trim() !== '')) isTruncated = true
  return { chunks: chunks.filter(chunk => chunk.trim() !== ''), isTruncated }
}
