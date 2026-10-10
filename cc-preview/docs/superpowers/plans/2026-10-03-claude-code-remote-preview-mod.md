# Claude Code Remote Preview Mod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code Mod that renders remote PNG previews over SSH, backed by a least-privilege TypeScript MCP/MCP Apps transport that also supports compatible Agent clients.

**Architecture:** The stdio MCP server runs on the same machine as the image, validates every path against explicit roots, and issues short-lived opaque preview IDs. MCP Apps-capable hosts fetch image bytes through an app-only tool so model content contains metadata but not image bytes; a separate opt-in tool returns ordinary MCP image content for clients that need it. The Claude Code Mod is attempted only after a feasibility gate proves it can call the app-only tool without adding bytes to the model transcript.

**Tech Stack:** Node.js 20+, TypeScript 7, Yarn 1, Node's built-in test runner through `tsx`, MCP TypeScript SDK v2, MCP Apps v2, Zod 4, Vite 8 with a single-file build, Claude Code 2.1.287+.

**Spec:** `docs/superpowers/specs/2026-10-03-claude-code-remote-preview-mod-design.md`

## Global Constraints

- Work only in `<worktree>`; do not modify other projects.
- Use TypeScript and Yarn; do not run `npm install`, `npm exec`, or add an npm lockfile.
- Minimum runtime is Node.js 20; local verification currently uses Node.js 26.8.1 and Yarn 1.22.22.
- Claude Code Mod work requires Claude Code 2.1.287 or later; the observed local version before execution was 2.1.281.
- Do not add image decoders, native runtime binaries, lifecycle scripts, telemetry, analytics, HTTP listeners, public tunnels, or external network calls.
- The server must require at least one explicit absolute `--root`; never default to the home directory.
- Supported image formats are PNG, JPEG, WebP, and GIF, identified by magic bytes rather than extension.
- Default limits are 8 MiB, 8192 px per dimension, and 40 megapixels; hard byte ceiling is 32 MiB.
- SVG, PDF, video, audio, directories, devices, sockets, and non-regular files are rejected.
- Model-visible `content` must not contain image bytes in the default path.
- The direct MCP image tool is absent unless `--enable-model-image-output` is explicitly supplied.
- Do not silently replace a failed app-only Mod call with `$.fs.read`; stop at the feasibility gate and return to design review.
- Every feature task follows failing test → minimum implementation → passing test → refactor if needed → commit.
- Preserve unrelated working-tree changes; this repository starts with only the approved spec commit `c333b80`.

## Review Focus

- A symlink or file replacement between prepare and read must never escape an allowed root; Task 4 adds both replacement and symlink-race regression tests.
- Malformed or truncated JPEG/WebP headers and dimensions near integer limits must return stable errors without large allocation; Task 3 adds table-driven malformed-header tests.
- A host without MCP Apps support, with model-image output disabled, must receive metadata rather than a false preview-success claim; Task 5 adds the capability-fallback test.
- App-only image delivery must keep base64 out of model-visible `content`; Tasks 1, 5, and 6 pin this at probe, handler, and wire-contract levels.
- SSH, tmux, or a terminal without Kitty Graphics Protocol must produce alt text/fallback without corrupting the conversation; Tasks 9 and 11 add adapter and real-device checks.

---

## Planned File Structure

```text
claude-code-remote-preview-mod/
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vite.config.ts
├── yarn.lock
├── src/
│   ├── cli.ts
│   ├── config.ts
│   ├── errors.ts
│   ├── image-inspector.ts
│   ├── path-policy.ts
│   ├── preview-store.ts
│   ├── safe-read.ts
│   ├── server.ts
│   └── tools.ts
├── ui/
│   ├── app.ts
│   ├── index.html
│   ├── result.ts
│   └── style.css
├── claude-plugin/
│   ├── .claude-plugin/plugin.json
│   ├── .mcp.json
│   ├── hooks/hooks.json
│   ├── hooks/register.ts
│   └── tests/register.test.ts
├── tests/
│   ├── config.test.ts
│   ├── docs.test.ts
│   ├── fixtures.ts
│   ├── image-inspector.test.ts
│   ├── path-policy.test.ts
│   ├── preview-store.test.ts
│   ├── safe-read.test.ts
│   ├── server.test.ts
│   ├── tools.test.ts
│   └── ui-result.test.ts
├── docs/
│   ├── compatibility.md
│   ├── mcp-config.example.json
│   ├── probes/2026-10-03-feasibility.md
│   ├── research.zh-TW.md
│   └── superpowers/
├── LICENSE
├── README.md
└── SECURITY.md
```

Responsibilities:

- `path-policy.ts` is the only module that resolves roots and authorizes a filesystem path.
- `image-inspector.ts` is the only module that recognizes formats and dimensions.
- `preview-store.ts` owns opaque IDs, TTL, and file-identity revalidation.
- `tools.ts` converts domain results into MCP tool results; it does not resolve paths itself.
- `server.ts` registers MCP tools/resources and accepts injected dependencies for tests.
- `cli.ts` parses flags and owns stdio startup; it never writes to stdout except through MCP.
- `ui/` contains the sandboxed human-facing MCP App.
- `claude-plugin/` contains only the Claude-specific adapter and config.

### Task 1: Establish the toolchain and pass both feasibility gates

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `.gitignore`
- Create temporarily: `probes/app-only.ts`
- Create temporarily: `probes/probe-server.ts`
- Create temporarily: `probes/claude-plugin/.claude-plugin/plugin.json`
- Create temporarily: `probes/claude-plugin/hooks/hooks.json`
- Create temporarily: `probes/claude-plugin/hooks/register.ts`
- Create temporarily: `probes/mcp.json`
- Create: `docs/probes/2026-10-03-feasibility.md`

**Interfaces:**
- Consumes: approved design spec and installed Node/Yarn/Claude binaries.
- Produces: pinned dependencies, test/build scripts, and evidence that the required extension paths are feasible.

- [ ] **Step 1: Verify tool versions and update Claude Code if required**

Run:

```bash
node --version
yarn --version
claude --version
```

Expected before update: Node `v26.8.1`, Yarn `1.22.22`, Claude Code `2.1.281`.

If Claude remains below `2.1.287`, run the product updater rather than a package-manager install:

```bash
claude update
claude --version
```

Expected: Claude Code reports `2.1.287` or newer. If the updater fails or changes the install channel unexpectedly, stop and report the exact output.

- [ ] **Step 2: Create the minimal package manifest and compiler configs**

Create `package.json`:

```json
{
  "name": "claude-code-remote-preview-mod",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --import tsx --test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build:server": "tsc -p tsconfig.build.json",
    "build:app": "vite build",
    "build": "yarn build:server && yarn build:app",
    "check": "yarn typecheck && yarn test && yarn build"
  },
  "dependencies": {
    "@modelcontextprotocol/core": "2.3.0",
    "@modelcontextprotocol/server": "2.3.0",
    "@modelcontextprotocol/ext-apps": "2.0.3",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@modelcontextprotocol/client": "2.3.0",
    "@types/node": "26.6.4",
    "tsx": "4.23.15",
    "typescript": "7.0.2",
    "vite": "8.3.2",
    "vite-plugin-singlefile": "2.3.3"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023", "DOM"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "ui", "tests", "probes"]
}
```

Create `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
.claude-plugin/types/
*.log
```

- [ ] **Step 3: Install without lifecycle scripts and inspect the lockfile**

Run:

```bash
yarn install --ignore-scripts
yarn check --integrity
rg -n 'preinstall|postinstall|install' package.json yarn.lock || true
```

Expected: installation and integrity check succeed; the project manifest contains no lifecycle scripts. Review any dependency metadata match before continuing.

- [ ] **Step 4: Write and run the MCP Apps/app-only contract probe**

Create `probes/app-only.ts` using an in-memory server/client pair. Register a model-visible `prepare_probe` and app-only `read_probe`, then assert the image exists only in the app-only result:

```ts
import assert from 'node:assert/strict'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import * as z from 'zod/v4'

const server = new McpServer({ name: 'claude-code-remote-preview-mod-probe', version: '0.0.0' })
registerAppTool(server, 'prepare_probe', {
  description: 'Prepare a probe preview',
  inputSchema: z.object({}),
  _meta: { ui: { resourceUri: 'ui://claude-code-remote-preview-mod/probe.html' } },
}, async () => ({
  content: [{ type: 'text', text: 'preview prepared: probe-1' }],
  structuredContent: { previewId: 'probe-1' },
}))
registerAppTool(server, 'read_probe', {
  description: 'Read a probe preview',
  inputSchema: z.object({ previewId: z.literal('probe-1') }),
  _meta: { ui: { visibility: ['app'] } },
}, async () => ({
  content: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
}))

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
const client = new Client({ name: 'probe-host', version: '0.0.0' })
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
const prepared = await client.callTool({ name: 'prepare_probe', arguments: {} })
assert.equal(JSON.stringify(prepared.content).includes('iVBOR'), false)
const read = await client.callTool({ name: 'read_probe', arguments: { previewId: 'probe-1' } })
assert.equal(read.content[0]?.type, 'image')
assert.deepEqual((await client.listTools()).tools.find(t => t.name === 'read_probe')?._meta?.ui, {
  visibility: ['app'],
})
await client.close()
await server.close()
console.error('PASS app-only image bytes are absent from prepare content')
```

Run:

```bash
yarn tsx probes/app-only.ts
```

Expected stderr: `PASS app-only image bytes are absent from prepare content` and exit 0. Failure blocks every later task.

- [ ] **Step 5: Write the temporary Claude Mod probe**

Create a temporary plugin whose only command calls the app-only tool:

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'preview-probe', description: 'Run app-only MCP probe' })
    return next(e)
  })
  on('command.run', { command: 'preview-probe' }, async $ => {
    const result = await $.mcp.call('remote_file_preview_probe', 'read_probe', { previewId: 'probe-1' })
    const image = result.content.find(block => block.type === 'image')
    return { text: image ? 'PASS mod received app-only image' : 'FAIL no image block' }
  })
}
```

The plugin manifest name is `claude-code-remote-preview-mod-probe`; `hooks/hooks.json` names `./register.ts`. `probes/probe-server.ts` serves `read_probe` through `serveStdio`, and `probes/mcp.json` registers server key `remote_file_preview_probe` and launches it with `yarn tsx probes/probe-server.ts`.

- [ ] **Step 6: Validate and run the Claude Mod probe in a real session**

Run:

```bash
claude plugin validate --strict probes/claude-plugin
claude --plugin-dir probes/claude-plugin --mcp-config probes/mcp.json
```

At the interactive prompt run `/preview-probe`.

Expected transcript text: `PASS mod received app-only image`. Inspect the transcript/debug output and verify `iVBORw0KGgo` is absent from model-visible messages. If the command cannot discover or call `read_probe`, stop here and report the architecture blocker; do not continue to Task 2.

- [ ] **Step 7: Record evidence and remove temporary probe source**

Write `docs/probes/2026-10-03-feasibility.md` with exact versions, commands, exit codes, whether the base64 marker appeared in transcript data, and any debug log used. Delete `probes/` after the evidence file is complete.

Run:

```bash
test ! -d probes
rg -n 'PASS|Claude Code|MCP Apps|iVBOR' docs/probes/2026-10-03-feasibility.md
yarn typecheck
```

Expected: probe directory absent, evidence contains both PASS results, typecheck passes.

- [ ] **Step 8: Commit the feasibility gate**

```bash
git add package.json yarn.lock tsconfig.json tsconfig.build.json .gitignore docs/probes/2026-10-03-feasibility.md
git commit -m "chore: verify remote preview extension paths"
```

### Task 2: Enforce explicit roots and canonical path containment

**Files:**
- Create: `src/errors.ts`
- Create: `src/path-policy.ts`
- Create: `tests/path-policy.test.ts`

**Interfaces:**
- Consumes: Node filesystem APIs and configured absolute root strings.
- Produces: `PreviewError`, `AllowedRoot`, `ResolvedFile`, `loadAllowedRoots()`, and `resolveAllowedFile()` for every later filesystem operation.

- [ ] **Step 1: Write failing path-policy tests**

Create `tests/path-policy.test.ts` with cases for a file inside a root, an in-root filename beginning `..evil`, an absolute outside path whether it exists or not, `../` escape, a symlink that resolves outside, multiple roots, a missing root, a directory, and a missing file. Both existing and missing outside paths must return `OUTSIDE_ALLOWED_ROOT` so the error does not disclose existence:

```ts
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadAllowedRoots, resolveAllowedFile } from '../src/path-policy.js'

test('rejects a symlink whose real path escapes every root', async () => {
  const base = await mkdtemp(join(tmpdir(), 'rfp-path-'))
  const root = join(base, 'root')
  const outside = join(base, 'outside.png')
  await mkdir(root)
  await writeFile(outside, 'outside')
  await symlink(outside, join(root, 'escape.png'))
  const roots = await loadAllowedRoots([root])
  await assert.rejects(
    resolveAllowedFile('escape.png', roots),
    (error: unknown) => error instanceof Error && error.message === 'OUTSIDE_ALLOWED_ROOT',
  )
})
```

Add equivalent assertions for `ROOT_REQUIRED`, `ROOT_NOT_FOUND`, `FILE_NOT_FOUND`, and `NOT_A_REGULAR_FILE`.

- [ ] **Step 2: Run tests and verify the missing-module failure**

Run:

```bash
yarn test tests/path-policy.test.ts
```

Expected: FAIL with module-not-found for `src/path-policy.ts`.

- [ ] **Step 3: Implement stable errors and containment**

Create `src/errors.ts`:

```ts
export type PreviewErrorCode =
  | 'ROOT_REQUIRED'
  | 'ROOT_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'NOT_A_REGULAR_FILE'
  | 'OUTSIDE_ALLOWED_ROOT'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_DIMENSIONS_TOO_LARGE'
  | 'PREVIEW_EXPIRED'
  | 'FILE_CHANGED'
  | 'CLIENT_UI_UNSUPPORTED'
  | 'TERMINAL_IMAGE_UNSUPPORTED'

export class PreviewError extends Error {
  constructor(public readonly code: PreviewErrorCode, public readonly displayName?: string) {
    super(code)
    this.name = 'PreviewError'
  }
}
```

Create `src/path-policy.ts`:

```ts
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { PreviewError } from './errors.js'

export type AllowedRoot = { requested: string; realPath: string }
export type ResolvedFile = {
  displayName: string
  realPath: string
  root: AllowedRoot
  fingerprint: { dev: bigint; ino: bigint; size: number; mtimeMs: number }
}

const isInside = (root: string, candidate: string): boolean => {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

export async function loadAllowedRoots(inputs: readonly string[]): Promise<AllowedRoot[]> {
  if (inputs.length === 0) throw new PreviewError('ROOT_REQUIRED')
  return Promise.all(inputs.map(async requested => {
    if (!isAbsolute(requested)) throw new PreviewError('ROOT_NOT_FOUND')
    const realPath = await realpath(requested).catch(() => { throw new PreviewError('ROOT_NOT_FOUND') })
    const info = await stat(realPath, { bigint: true })
    if (!info.isDirectory()) throw new PreviewError('ROOT_NOT_FOUND')
    return { requested, realPath }
  }))
}

export async function resolveAllowedFile(input: string, roots: readonly AllowedRoot[]): Promise<ResolvedFile> {
  if (roots.length === 0) throw new PreviewError('ROOT_REQUIRED')
  const spelled = isAbsolute(input) ? input : resolve(roots[0]!.realPath, input)
  if (!roots.some(candidate => isInside(candidate.realPath, spelled))) {
    throw new PreviewError('OUTSIDE_ALLOWED_ROOT')
  }
  const realPath = await realpath(spelled).catch(() => { throw new PreviewError('FILE_NOT_FOUND') })
  const root = roots.find(candidate => isInside(candidate.realPath, realPath))
  if (!root) throw new PreviewError('OUTSIDE_ALLOWED_ROOT')
  const info = await stat(realPath, { bigint: true })
  if (!info.isFile()) throw new PreviewError('NOT_A_REGULAR_FILE')
  return {
    displayName: realPath.split('/').at(-1) || 'image',
    realPath,
    root,
    fingerprint: { dev: info.dev, ino: info.ino, size: Number(info.size), mtimeMs: Number(info.mtimeMs) },
  }
}
```

- [ ] **Step 4: Run path-policy tests**

Run:

```bash
yarn test tests/path-policy.test.ts
yarn typecheck
```

Expected: all path tests PASS and typecheck succeeds.

- [ ] **Step 5: Commit the path boundary**

```bash
git add src/errors.ts src/path-policy.ts tests/path-policy.test.ts
git commit -m "feat: constrain previews to explicit roots"
```

### Task 3: Recognize image formats and reject resource bombs

**Files:**
- Create: `src/image-inspector.ts`
- Create: `src/safe-read.ts`
- Create: `tests/fixtures.ts`
- Create: `tests/image-inspector.test.ts`
- Create: `tests/safe-read.test.ts`

**Interfaces:**
- Consumes: `ResolvedFile` from Task 2 and `ImageLimits`.
- Produces: `readVerifiedFile()`, `ImageInfo`, and `inspectImage()` for every later file read.

- [ ] **Step 1: Write failing format and malformed-header tests**

Create `tests/fixtures.ts` with functions that return minimal valid headers instead of committed opaque binaries:

```ts
export const pngHeader = (width: number, height: number): Buffer => {
  const bytes = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(bytes)
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

export const gifHeader = (width: number, height: number): Buffer => {
  const bytes = Buffer.alloc(10)
  bytes.write('GIF89a', 0, 'ascii')
  bytes.writeUInt16LE(width, 6)
  bytes.writeUInt16LE(height, 8)
  return bytes
}
```

Add minimal JPEG SOF0, WebP VP8X, VP8, and VP8L builders. In `tests/image-inspector.test.ts`, add table-driven success cases and explicit failures for truncated buffers, bad magic, zero dimensions, 8193 px width, 40,000,001 pixels, and a 32 MiB + 1 file.

Create `tests/safe-read.test.ts` to replace a verified path with a symlink immediately before open, replace the file after open, and enlarge it past the byte limit. Every case must return `FILE_CHANGED`, `OUTSIDE_ALLOWED_ROOT`, or `IMAGE_TOO_LARGE` without reading the replacement.

- [ ] **Step 2: Run tests and verify failure**

```bash
yarn test tests/image-inspector.test.ts
```

Expected: FAIL with missing `src/image-inspector.ts`.

- [ ] **Step 3: Implement bounded parsing**

Create `src/safe-read.ts` first. Open with `O_NOFOLLOW`, compare the open handle's fingerprint before and after reading, and always close:

```ts
import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { PreviewError } from './errors.js'
import type { ResolvedFile } from './path-policy.js'

type OpenFile = (path: string, flags: number) => Promise<FileHandle>

export function createVerifiedReader(openFile: OpenFile = open) {
  return async (file: ResolvedFile, maxBytes: number): Promise<Buffer> => {
    const handle = await openFile(file.realPath, constants.O_RDONLY | constants.O_NOFOLLOW)
      .catch(() => { throw new PreviewError('FILE_CHANGED', file.displayName) })
    try {
      const before = await handle.stat({ bigint: true })
      const expected = file.fingerprint
      if (!before.isFile() || before.dev !== expected.dev || before.ino !== expected.ino ||
          Number(before.size) !== expected.size || Number(before.mtimeMs) !== expected.mtimeMs) {
        throw new PreviewError('FILE_CHANGED', file.displayName)
      }
      if (Number(before.size) > maxBytes || Number(before.size) > 32 * 1024 * 1024) {
        throw new PreviewError('IMAGE_TOO_LARGE', file.displayName)
      }
      const bytes = await handle.readFile()
      const after = await handle.stat({ bigint: true })
      if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size ||
          after.mtimeMs !== before.mtimeMs) {
        throw new PreviewError('FILE_CHANGED', file.displayName)
      }
      return bytes
    } finally {
      await handle.close()
    }
  }
}

export const readVerifiedFile = createVerifiedReader()
```

Then create `src/image-inspector.ts`:

```ts
import { PreviewError } from './errors.js'
import type { ResolvedFile } from './path-policy.js'
import { readVerifiedFile } from './safe-read.js'

export type SupportedMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
export type ImageLimits = { maxBytes: number; maxDimension: number; maxPixels: number }
export type ImageInfo = {
  path: ResolvedFile
  mimeType: SupportedMime
  width: number
  height: number
  size: number
}

export const DEFAULT_LIMITS: ImageLimits = {
  maxBytes: 8 * 1024 * 1024,
  maxDimension: 8192,
  maxPixels: 40_000_000,
}

function assertDimensions(width: number, height: number, limits: ImageLimits): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new PreviewError('UNSUPPORTED_MEDIA_TYPE')
  }
  if (width > limits.maxDimension || height > limits.maxDimension || width * height > limits.maxPixels) {
    throw new PreviewError('IMAGE_DIMENSIONS_TOO_LARGE')
  }
}

export async function inspectImage(path: ResolvedFile, limits = DEFAULT_LIMITS): Promise<ImageInfo> {
  const bytes = await readVerifiedFile(path, limits.maxBytes)
  const parsed = parseImageHeader(bytes)
  assertDimensions(parsed.width, parsed.height, limits)
  return { path, ...parsed, size: bytes.byteLength }
}
```

Implement `parseImageHeader(bytes)` with bounded helpers:

```ts
type ParsedImage = { mimeType: SupportedMime; width: number; height: number }

const failMedia = (): never => { throw new PreviewError('UNSUPPORTED_MEDIA_TYPE') }
const has = (bytes: Buffer, offset: number, hex: string): boolean =>
  bytes.subarray(offset, offset + hex.length / 2).equals(Buffer.from(hex, 'hex'))
const u24le = (bytes: Buffer, offset: number): number =>
  bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)

function parseJpeg(bytes: Buffer): ParsedImage {
  if (!has(bytes, 0, 'ffd8')) return failMedia()
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return failMedia()
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (offset + 2 > bytes.length) return failMedia()
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.length) return failMedia()
    if (sof.has(marker)) {
      if (length < 7) return failMedia()
      return { mimeType: 'image/jpeg', height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) }
    }
    offset += length
  }
  return failMedia()
}

function parseWebp(bytes: Buffer): ParsedImage {
  if (bytes.length < 25 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP') return failMedia()
  const kind = bytes.toString('ascii', 12, 16)
  if (kind === 'VP8X' && bytes.length >= 30) {
    return { mimeType: 'image/webp', width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 }
  }
  if (kind === 'VP8 ' && bytes.length >= 30 && has(bytes, 23, '9d012a')) {
    return {
      mimeType: 'image/webp',
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    }
  }
  if (kind === 'VP8L' && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21)
    return { mimeType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  return failMedia()
}

function parseImageHeader(bytes: Buffer): ParsedImage {
  if (bytes.length >= 24 && has(bytes, 0, '89504e470d0a1a0a') && bytes.toString('ascii', 12, 16) === 'IHDR') {
    return { mimeType: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  const gif = bytes.toString('ascii', 0, 6)
  if (bytes.length >= 10 && (gif === 'GIF87a' || gif === 'GIF89a')) {
    return { mimeType: 'image/gif', width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
  }
  if (has(bytes, 0, 'ffd8')) return parseJpeg(bytes)
  if (bytes.toString('ascii', 0, 4) === 'RIFF') return parseWebp(bytes)
  return failMedia()
}
```

Every unknown or truncated shape returns `UNSUPPORTED_MEDIA_TYPE`; tests must exercise each bounds branch.

- [ ] **Step 4: Run parser tests and typecheck**

```bash
yarn test tests/safe-read.test.ts tests/image-inspector.test.ts
yarn typecheck
```

Expected: valid formats PASS; malformed/oversized cases return exact error codes.

- [ ] **Step 5: Commit the image boundary**

```bash
git add src/safe-read.ts src/image-inspector.ts tests/safe-read.test.ts tests/fixtures.ts tests/image-inspector.test.ts
git commit -m "feat: validate preview image formats and limits"
```

### Task 4: Issue opaque preview IDs and revalidate changed files

**Files:**
- Create: `src/preview-store.ts`
- Create: `tests/preview-store.test.ts`

**Interfaces:**
- Consumes: `ImageInfo`, `resolveAllowedFile()`, configured roots, and an injectable clock.
- Produces: `PreviewStore.issue()`, `PreviewStore.get()`, and `revalidatePreview()`.

- [ ] **Step 1: Write failing TTL, replacement, and race tests**

Cover UUID opacity/uniqueness, success before five minutes, expiry at five minutes, mtime/size/inode replacement, replacing an in-root file with an outside symlink, and unknown IDs. Use an injected clock rather than sleeping.

- [ ] **Step 2: Run tests and verify failure**

```bash
yarn test tests/preview-store.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement the in-memory store**

Create `src/preview-store.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { PreviewError } from './errors.js'
import { resolveAllowedFile, type AllowedRoot } from './path-policy.js'
import type { ImageInfo } from './image-inspector.js'

export type PreviewRecord = { id: string; image: ImageInfo; expiresAt: number }

export class PreviewStore {
  readonly #records = new Map<string, PreviewRecord>()
  constructor(private readonly now: () => number = Date.now, private readonly ttlMs = 300_000) {}

  issue(image: ImageInfo): PreviewRecord {
    const record = { id: randomUUID(), image, expiresAt: this.now() + this.ttlMs }
    this.#records.set(record.id, record)
    return record
  }

  get(id: string): PreviewRecord {
    const record = this.#records.get(id)
    if (!record || this.now() >= record.expiresAt) {
      this.#records.delete(id)
      throw new PreviewError('PREVIEW_EXPIRED')
    }
    return record
  }
}

export async function revalidatePreview(
  store: PreviewStore,
  id: string,
  roots: readonly AllowedRoot[],
): Promise<PreviewRecord> {
  const record = store.get(id)
  const current = await resolveAllowedFile(record.image.path.realPath, roots)
  const before = record.image.path.fingerprint
  const after = current.fingerprint
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new PreviewError('FILE_CHANGED', record.image.path.displayName)
  }
  return record
}
```

- [ ] **Step 4: Run store tests**

```bash
yarn test tests/preview-store.test.ts
yarn typecheck
```

Expected: all store and race tests PASS.

- [ ] **Step 5: Commit the preview lifecycle**

```bash
git add src/preview-store.ts tests/preview-store.test.ts
git commit -m "feat: add short-lived preview identities"
```

### Task 5: Register the prepare tool and MCP App resource

**Files:**
- Create: `src/tools.ts`
- Create: `src/server.ts`
- Create: `tests/tools.test.ts`
- Create: `tests/server.test.ts`

**Interfaces:**
- Consumes: roots, image limits, inspector, and preview store.
- Produces: `createPrepareHandler()`, `createServer()`, tool-name constants, and the `ui://claude-code-remote-preview-mod/view.html` resource contract.

- [ ] **Step 1: Write failing prepare-handler tests**

Create `tests/tools.test.ts` asserting that a valid image returns one text `content` block and structured metadata with `previewId`; serialized model-visible content contains neither fixture base64 nor absolute path; outside-root/unsupported files return stable errors; and a non-Apps host gets honest metadata rather than “preview displayed”.

Pin the result shape:

```ts
const result = await prepare({ path: 'chart.png' })
assert.deepEqual(result.content, [{
  type: 'text',
  text: 'Preview prepared: chart.png · image/png · 64×32 · 120 bytes. Inline UI depends on client support.',
}])
assert.equal(typeof result.structuredContent.previewId, 'string')
assert.equal(JSON.stringify(result.content).includes(result.structuredContent.previewId), false)
```

- [ ] **Step 2: Run handler tests and verify failure**

```bash
yarn test tests/tools.test.ts
```

Expected: FAIL with missing exports.

- [ ] **Step 3: Implement tool handlers**

Create `src/tools.ts`:

```ts
export const TOOL_PREPARE = 'prepare_image_preview'
export const TOOL_READ_APP = 'read_preview_image'
export const TOOL_READ_MODEL = 'preview_image_for_model'
export const UI_RESOURCE = 'ui://claude-code-remote-preview-mod/view.html'

export type ToolDeps = {
  roots: readonly AllowedRoot[]
  limits: ImageLimits
  store: PreviewStore
}

export function createPrepareHandler(deps: ToolDeps) {
  return async ({ path }: { path: string }) => {
    try {
      const resolved = await resolveAllowedFile(path, deps.roots)
      const image = await inspectImage(resolved, deps.limits)
      const preview = deps.store.issue(image)
      return {
        content: [{ type: 'text' as const, text: metadataText(image) }],
        structuredContent: {
          previewId: preview.id,
          name: image.path.displayName,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          size: image.size,
        },
      }
    } catch (error) {
      return publicToolError(error)
    }
  }
}
```

Implement `metadataText()` and `publicToolError()` in the same module. Neither text nor structured content may include `realPath`.

```ts
function metadataText(image: ImageInfo): string {
  return `Preview prepared: ${image.path.displayName} · ${image.mimeType} · ${image.width}×${image.height} · ${image.size} bytes. Inline UI depends on client support.`
}
```

Use a closed error mapping and rethrow unknown programmer errors:

```ts
const publicMessages: Record<PreviewErrorCode, string> = {
  ROOT_REQUIRED: 'No preview root was configured.',
  ROOT_NOT_FOUND: 'A configured preview root is unavailable.',
  FILE_NOT_FOUND: 'The requested image was not found.',
  NOT_A_REGULAR_FILE: 'The requested path is not a regular file.',
  OUTSIDE_ALLOWED_ROOT: 'The requested image is outside the allowed roots.',
  UNSUPPORTED_MEDIA_TYPE: 'The requested file is not a supported image.',
  IMAGE_TOO_LARGE: 'The requested image exceeds the byte limit.',
  IMAGE_DIMENSIONS_TOO_LARGE: 'The requested image exceeds the dimension limit.',
  PREVIEW_EXPIRED: 'The preview expired. Prepare it again.',
  FILE_CHANGED: 'The image changed after the preview was prepared.',
  CLIENT_UI_UNSUPPORTED: 'This client does not expose inline preview UI.',
  TERMINAL_IMAGE_UNSUPPORTED: 'This terminal does not expose image rendering.',
}

function publicToolError(error: unknown) {
  if (!(error instanceof PreviewError)) throw error
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: `${error.code}: ${publicMessages[error.code]}` }],
  }
}
```

- [ ] **Step 4: Write the failing server registration test**

In `tests/server.test.ts`, connect `createServer()` to a v2 `Client` through `InMemoryTransport`, then assert:

- `prepare_image_preview` has `_meta.ui.resourceUri`.
- `read_preview_image` has `_meta.ui.visibility: ['app']`.
- `preview_image_for_model` is absent by default.
- reading `ui://claude-code-remote-preview-mod/view.html` returns `text/html;profile=mcp-app`.

Run `yarn test tests/server.test.ts`; expect FAIL because `createServer()` is missing.

- [ ] **Step 5: Implement the server factory and injectable UI resource**

Create `src/server.ts` using `McpServer`, `registerAppTool`, and `registerAppResource`. Accept `{ roots, limits, enableModelImageOutput, appHtml }` so tests never read build output from disk.

The prepare tool config is:

```ts
{
  title: 'Preview remote image',
  description: 'Prepare a read-only preview for an image inside an explicitly allowed root.',
  inputSchema: z.object({ path: z.string().min(1).max(4096) }),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { resourceUri: UI_RESOURCE, visibility: ['model', 'app'] } }
}
```

- [ ] **Step 6: Run tool/server tests and typecheck**

```bash
yarn test tests/tools.test.ts tests/server.test.ts
yarn typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the prepare protocol**

```bash
git add src/tools.ts src/server.ts tests/tools.test.ts tests/server.test.ts
git commit -m "feat: prepare safe MCP image previews"
```

### Task 6: Deliver bytes only through app-only or explicit model tools

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/server.ts`
- Modify: `tests/tools.test.ts`
- Modify: `tests/server.test.ts`

**Interfaces:**
- Consumes: `PreviewStore`, `revalidatePreview()`, and `ToolDeps`.
- Produces: `createReadHandler()` and conditional registration of `preview_image_for_model`.

- [ ] **Step 1: Add failing byte-delivery tests**

Add tests proving:

- valid ID returns exactly one MCP image block with original MIME and base64.
- expired, changed, and replaced files return stable errors and no image block.
- `prepare_image_preview` remains base64-free.
- tool listing excludes the model tool when flag false and includes it when true.
- model tool description contains the privacy warning and uses the same path policy.

- [ ] **Step 2: Run tests and verify failure**

```bash
yarn test tests/tools.test.ts tests/server.test.ts
```

Expected: FAIL because read/model handlers are absent.

- [ ] **Step 3: Implement app-only byte delivery**

Add to `src/tools.ts`:

```ts
import { readVerifiedFile } from './safe-read.js'

export function createReadHandler(deps: ToolDeps) {
  return async ({ previewId }: { previewId: string }) => {
    try {
      const record = await revalidatePreview(deps.store, previewId, deps.roots)
      const bytes = await readVerifiedFile(record.image.path, deps.limits.maxBytes)
      return {
        content: [{
          type: 'image' as const,
          data: bytes.toString('base64'),
          mimeType: record.image.mimeType,
        }],
      }
    } catch (error) {
      return publicToolError(error)
    }
  }
}
```

Register it with `_meta.ui.visibility: ['app']` and no model visibility.

- [ ] **Step 4: Implement the conditional model-image tool**

Register `preview_image_for_model` only when `enableModelImageOutput === true`. It accepts a path, performs a fresh prepare/read through shared dependencies, and returns the image plus this text warning:

```text
This image was returned in model-visible MCP content because the server was started with --enable-model-image-output.
```

Do not add a second path validator or direct `readFile(path)` route.

- [ ] **Step 5: Run tests and inspect base64 call sites**

```bash
yarn test tests/tools.test.ts tests/server.test.ts
rg -n "toString\('base64'\)" src
yarn typecheck
```

Expected: PASS; the only base64 conversion is in the guarded read handler.

- [ ] **Step 6: Commit byte delivery**

```bash
git add src/tools.ts src/server.ts tests/tools.test.ts tests/server.test.ts
git commit -m "feat: separate human and model image delivery"
```

### Task 7: Build the sandboxed MCP App viewer

**Files:**
- Create: `ui/result.ts`
- Create: `ui/app.ts`
- Create: `ui/index.html`
- Create: `ui/style.css`
- Create: `vite.config.ts`
- Create: `tests/ui-result.test.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: prepare `structuredContent` and app-only image results.
- Produces: bundled `dist/ui/index.html` plus `parsePreviewDescriptor()` and `imageBlockToBlob()` helpers.

- [ ] **Step 1: Write failing UI data tests**

Create tests for valid descriptors, missing fields, non-image results, MIME mismatch, and base64 decoding:

```ts
test('rejects a tool result with no image block', () => {
  assert.throws(
    () => imageBlockToBlob({ content: [{ type: 'text', text: 'no image' }] }, 'image/png'),
    /CLIENT_UI_UNSUPPORTED/,
  )
})
```

- [ ] **Step 2: Run tests and verify failure**

```bash
yarn test tests/ui-result.test.ts
```

Expected: FAIL with missing `ui/result.ts`.

- [ ] **Step 3: Implement pure UI helpers**

Create `ui/result.ts` with Zod validation for preview ID, name, MIME, dimensions, and size. Accept only an MCP image block whose MIME equals the descriptor. Decode with `Uint8Array.fromBase64()` when available and an `atob` fallback otherwise.

- [ ] **Step 4: Implement the MCP App**

Create `ui/app.ts`:

```ts
import { App } from '@modelcontextprotocol/ext-apps'
import { imageBlockToBlob, parsePreviewDescriptor } from './result.js'

const app = new App()
let objectUrl: string | undefined

app.ontoolresult = async result => {
  const descriptor = parsePreviewDescriptor(result.structuredContent)
  const imageResult = await app.callServerTool({
    name: 'read_preview_image',
    arguments: { previewId: descriptor.previewId },
  })
  const blob = imageBlockToBlob(imageResult, descriptor.mimeType)
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(blob)
  renderPreview(descriptor, objectUrl)
}

window.addEventListener('beforeunload', () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
})
await app.connect()
```

`ui/index.html` provides elements `#preview`, `#meta`, `#fit`, `#actual`, and `#background`. Implement rendering without `innerHTML`:

```ts
const image = document.querySelector<HTMLImageElement>('#preview')!
const meta = document.querySelector<HTMLElement>('#meta')!

function renderPreview(descriptor: PreviewDescriptor, url: string): void {
  image.src = url
  image.alt = descriptor.name
  image.classList.add('fit')
  meta.textContent = `${descriptor.name} · ${descriptor.mimeType} · ${descriptor.width}×${descriptor.height} · ${descriptor.size} bytes`
}

document.querySelector<HTMLButtonElement>('#fit')!.addEventListener('click', () => {
  image.classList.add('fit')
})
document.querySelector<HTMLButtonElement>('#actual')!.addEventListener('click', () => {
  image.classList.remove('fit')
})
document.querySelector<HTMLButtonElement>('#background')!.addEventListener('click', () => {
  document.body.classList.toggle('checkerboard')
})
```

- [ ] **Step 5: Create the viewer HTML/CSS and single-file build**

The UI contains one image stage, fit/actual-size controls, background toggle, metadata, loading, expired, and unsupported states. It makes no external request.

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  root: 'ui',
  plugins: [viteSingleFile()],
  build: { outDir: '../dist/ui', emptyOutDir: true, target: 'es2022' },
})
```

- [ ] **Step 6: Run tests and build**

```bash
yarn test tests/ui-result.test.ts
yarn build:app
test -s dist/ui/index.html
if rg -n 'https?://|<script[^>]+src=|<link[^>]+href=' dist/ui/index.html; then exit 1; fi
```

Expected: PASS, one non-empty HTML file, no external script/style/network reference.

- [ ] **Step 7: Load built HTML at production startup**

Update `src/server.ts` so CLI startup supplies `dist/ui/index.html`; tests continue injecting HTML. Missing build output must fail on stderr with non-zero exit.

- [ ] **Step 8: Commit the MCP App**

```bash
git add ui vite.config.ts tests/ui-result.test.ts src/server.ts
git commit -m "feat: render previews with an MCP App"
```

### Task 8: Add strict CLI configuration and stdio startup

**Files:**
- Create: `src/config.ts`
- Create: `src/cli.ts`
- Create: `tests/config.test.ts`
- Create: `docs/mcp-config.example.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createServer()`, `loadAllowedRoots()`, image limits.
- Produces: `parseArgs(argv)`, `ServerConfig`, compiled `dist/cli.js`, and portable config through `REMOTE_FILE_PREVIEW_ROOT`.

- [ ] **Step 1: Write failing CLI parsing tests**

Cover no root, relative root, repeated roots, numerical values inside/outside bounds, unknown flags, missing values, and the model-image opt-in. Pin this shape:

```ts
assert.deepEqual(parseArgs([
  '--root', '/work/a', '--root', '/work/b', '--max-bytes', '4194304',
  '--enable-model-image-output',
]), {
  roots: ['/work/a', '/work/b'],
  limits: { maxBytes: 4_194_304, maxDimension: 8192, maxPixels: 40_000_000 },
  enableModelImageOutput: true,
  debug: false,
})
```

- [ ] **Step 2: Run tests and verify failure**

```bash
yarn test tests/config.test.ts
```

Expected: FAIL with missing config module.

- [ ] **Step 3: Implement bounded argument parsing**

Reject relative roots and numerical values outside: bytes 1–33,554,432; dimension 1–8192; pixels 1–40,000,000. No environment variable may silently widen limits.

- [ ] **Step 4: Implement stdio entry point**

Create `src/cli.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { parseArgs } from './config.js'
import { loadAllowedRoots } from './path-policy.js'
import { createServer } from './server.js'

const config = parseArgs(process.argv.slice(2))
const roots = await loadAllowedRoots(config.roots)
const appUrl = new URL('./ui/index.html', import.meta.url)
const appHtml = await readFile(fileURLToPath(appUrl), 'utf8')
await serveStdio(() => createServer({ ...config, roots, appHtml }))
```

Diagnostics go to stderr. Never use `console.log` in server code because stdout is MCP.

- [ ] **Step 5: Add portable MCP configuration**

Create `docs/mcp-config.example.json`:

```json
{
  "mcpServers": {
    "remote_file_preview": {
      "command": "node",
      "args": [
        "${REMOTE_FILE_PREVIEW_ROOT}/dist/cli.js",
        "--root",
        "${CLAUDE_PROJECT_DIR}"
      ]
    }
  }
}
```

Document that `REMOTE_FILE_PREVIEW_ROOT` is the clone path on the machine that owns the image.

- [ ] **Step 6: Run tests and compiled smoke test**

```bash
yarn test tests/config.test.ts
yarn build
test -s dist/cli.js
node dist/cli.js 2>&1 </dev/null | rg 'ROOT_REQUIRED'
```

Expected: tests/build PASS; no-root startup fails clearly.

- [ ] **Step 7: Commit the executable server**

```bash
git add src/config.ts src/cli.ts tests/config.test.ts docs/mcp-config.example.json package.json
git commit -m "feat: expose a strict stdio preview server"
```

### Task 9: Implement the Claude Code terminal adapter after the gate

**Files:**
- Create: `claude-plugin/.claude-plugin/plugin.json`
- Create: `claude-plugin/.mcp.json`
- Create: `claude-plugin/hooks/hooks.json`
- Create: `claude-plugin/hooks/register.ts`
- Create: `claude-plugin/tests/register.test.ts`

**Interfaces:**
- Consumes: `prepare_image_preview` structured content and app-only `read_preview_image` result.
- Produces: terminal-only PNG `Image` beneath this server's ToolResult, with honest format/protocol fallback.

- [ ] **Step 1: Write the failing Claude Mod tests**

Using `claude-code/testing`, test that a PNG descriptor calls only server `remote_file_preview` tool `read_preview_image`; PNG renders an `Image` with alt text and bounded rows/columns; JPEG/WebP/GIF render metadata only; desktop adds no terminal Image; missing/expired/unsupported results preserve the engine row and add a dim fallback; and no prompt, tool-check, filesystem, process, HTTP, model, or session-send hook is registered.

The representative PNG test mounts the real render hook and stubs only the engine row and MCP call:

```ts
test('renders the app-only PNG beneath the engine result', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['engine result'] }))
  on('mcp.call', () => ({ value: {
    content: [{ type: 'image', mimeType: 'image/png', data: PNG }],
    isError: false,
  } }))
  const ui = await $.ui.mount({
    plugin: 'claude-code-remote-preview-mod',
    surface: 'terminal',
    component: 'ToolResult',
    props: {
      tool_use_id: 'toolu_preview',
      tool: 'mcp__remote_file_preview__prepare_image_preview',
      output: { structuredContent: {
        previewId: 'preview-1', name: 'chart.png', mimeType: 'image/png', width: 64, height: 32,
      } },
      isErrored: false,
    },
    viewport: { columns: 120, rows: 40, isFullscreen: false },
  } as any)
  assert.equal((await ui.find({ type: 'Image' }))?.props.alt, 'chart.png')
})
```

- [ ] **Step 2: Run the test and verify failure**

```bash
claude plugin test claude-plugin
```

Expected: FAIL because the plugin files do not exist.

- [ ] **Step 3: Create manifests**

Create `claude-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "claude-code-remote-preview-mod",
  "version": "0.1.0",
  "description": "Render verified remote PNG previews inline in Claude Code terminals.",
  "license": "MIT"
}
```

Create `hooks/hooks.json` with only `./register.ts`. Create `.mcp.json` from the reviewed MCP config, using `${REMOTE_FILE_PREVIEW_ROOT}` and `${CLAUDE_PROJECT_DIR}`.

- [ ] **Step 4: Implement the narrowly matched render hook**

Register only:

```ts
on('ui.render', {
  component: 'ToolResult',
  props: { tool: 'mcp__remote_file_preview__prepare_image_preview' },
}, async ($, e, next) => {
  const engineRow = await next(e)
  return renderPreparedResult($, e, engineRow)
})
```

The hook calls `next(e)` first, parses only known structured output, rejects non-PNG for terminal rendering, and calls:

```ts
await $.mcp.call('remote_file_preview', 'read_preview_image', { previewId })
```

Implement `renderPreparedResult` with this exact boundary:

```ts
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

type Descriptor = {
  previewId: string
  name: string
  mimeType: string
  width: number
  height: number
}

const adapterMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function descriptorFrom(output: unknown): Descriptor | undefined {
  const value = (output as { structuredContent?: unknown } | undefined)?.structuredContent
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  if (typeof item.previewId !== 'string' || item.previewId.length === 0 ||
      typeof item.name !== 'string' || item.name.length === 0 ||
      typeof item.mimeType !== 'string' || !adapterMimes.has(item.mimeType) ||
      !Number.isSafeInteger(item.width) || Number(item.width) < 1 ||
      !Number.isSafeInteger(item.height) || Number(item.height) < 1) return undefined
  return item as Descriptor
}

async function renderPreparedResult(
  $: EngineInterface,
  e: RenderInput<'ToolResult'>,
  engineRow: RenderElement,
): Promise<RenderElement> {
  if (e.surface !== 'terminal') return engineRow
  const descriptor = descriptorFrom(e.props.output)
  if (!descriptor) return engineRow
  const { Box, Text, Image } = $.ui.resolve(e)
  if (descriptor.mimeType !== 'image/png') {
    return Box({ flexDirection: 'column', children: [engineRow,
      Text({ dimColor: true, children: [`${descriptor.name}: terminal adapter supports PNG only`] }),
    ] })
  }
  const result = await $.mcp.call('remote_file_preview', 'read_preview_image', {
    previewId: descriptor.previewId,
  })
  const block = result.content.find(item => item.type === 'image' && item.mimeType === 'image/png')
  if (!block || typeof block.data !== 'string' || Math.floor(block.data.length * 3 / 4) > 2 * 1024 * 1024) {
    return Box({ flexDirection: 'column', children: [engineRow,
      Text({ dimColor: true, children: [`${descriptor.name}: terminal preview unavailable`] }),
    ] })
  }
  const columns = Math.max(8, Math.min(80, (e.viewport?.columns ?? 88) - 8))
  const rows = Math.max(4, Math.min(20,
    Math.round(columns / ((descriptor.width / descriptor.height) * 2))))
  return Box({ flexDirection: 'column', children: [engineRow,
    Image({ source: { png: block.data }, columns, rows, alt: descriptor.name }),
  ] })
}
```

Wrap the MCP call in a catch that returns the same `terminal preview unavailable` fallback. Never call `$.fs`, `$.process`, `$.http`, `$.model`, `$.prompt`, or `$.session.send`.

- [ ] **Step 5: Validate footprint and run tests**

```bash
claude plugin validate --strict claude-plugin
claude plugin test claude-plugin
```

Expected: validation calls list only `$.mcp.call`, `$.ui.resolve`, and UI methods actually used; tests PASS. If `$.mcp.call` cannot address the app-only tool despite Task 1, stop and record the version mismatch. Do not add `$.fs.read`.

- [ ] **Step 6: Perform a local interactive PNG check**

```bash
REMOTE_FILE_PREVIEW_ROOT="$PWD" claude --plugin-dir claude-plugin --mcp-config claude-plugin/.mcp.json
```

Ask Claude to call `prepare_image_preview` on an in-root PNG. Verify the terminal shows the image or a truthful protocol fallback, then record terminal name/version in `docs/compatibility.md`.

- [ ] **Step 7: Commit the Claude adapter**

```bash
git add claude-plugin docs/compatibility.md
git commit -m "feat: add Claude terminal preview adapter"
```

### Task 10: Write security, installation, and sharing documentation

**Files:**
- Create: `README.md`
- Create: `SECURITY.md`
- Create: `LICENSE`
- Create: `docs/research.zh-TW.md`
- Modify: `docs/compatibility.md`
- Create: `tests/docs.test.ts`

**Interfaces:**
- Consumes: actual validation output, supported clients, and verified limitations.
- Produces: open-source onboarding, threat model, uninstall steps, compatibility evidence, and Traditional Chinese sharing content.

- [ ] **Step 1: Write documentation assertions as a failing test**

Create `tests/docs.test.ts` that reads the documents and asserts they contain exact supported formats/limits, `REMOTE_FILE_PREVIEW_ROOT`, model-image opt-in warning, unsandboxed Mod warning, expected Mod footprint, SSH/tmux limitations, disable/removal instructions, and no claim of support for unverified clients.

- [ ] **Step 2: Run the docs test and verify failure**

```bash
yarn test tests/docs.test.ts
```

Expected: FAIL because the documents are absent.

- [ ] **Step 3: Write README and SECURITY**

README order:

1. Outcome and screenshot/GIF only after real verification.
2. Support matrix.
3. Architecture diagram.
4. Clone → `yarn install --ignore-scripts` → build → MCP config.
5. MCP Apps default path.
6. Claude Mod optional adapter.
7. Privacy warning for `--enable-model-image-output`.
8. Troubleshooting and removal.

SECURITY states explicit roots/realpath policy, which bytes reach the model, Mod capability footprint, absence of listener/network/temp/decoder, dependency policy, and disclosure instructions.

- [ ] **Step 4: Write the Traditional Chinese research report**

`docs/research.zh-TW.md` covers Claude Mods vs MCP image vs MCP Apps, the Air/Pro transport, why remote paths fail, app-only privacy, high-permission risks, format/client limits, and evidence-based compatibility. Separate confirmed behavior from unverified assumptions.

- [ ] **Step 5: Add MIT license and pass docs tests**

```bash
yarn test tests/docs.test.ts
if rg -n -i 'TODO|TBD|FIXME' README.md SECURITY.md docs/research.zh-TW.md docs/compatibility.md; then exit 1; fi
```

Expected: PASS and no unfinished-marker terms.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md SECURITY.md LICENSE docs tests/docs.test.ts
git commit -m "docs: explain remote preview security and limits"
```

### Task 11: Verify the MacBook Air → MacBook Pro path

**Files:**
- Modify: `docs/compatibility.md`
- Modify: `docs/probes/2026-10-03-feasibility.md` only when live evidence changes a feasibility claim.

**Interfaces:**
- Consumes: built server, Claude adapter, current Tailscale state, and an interactive Air terminal.
- Produces: real-device evidence or an explicit remote-verification blocker.

- [ ] **Step 1: Rediscover current Tailscale identities**

On the Pro:

```bash
'/Applications/Tailscale.app/Contents/MacOS/Tailscale' status --json \
  | jq '{self:{name:.Self.DNSName,ips:.Self.TailscaleIPs,online:.Self.Online},peers:[.Peer[]|select(.Online==true)|{name:.DNSName,ips:.TailscaleIPs}]}'
```

Expected: Pro and Air online. Record live DNS names; do not reuse previously observed addresses without this check.

- [ ] **Step 2: Establish SSH through a trusted host identity**

From the Air, use its existing SSH config or the live Pro MagicDNS name. If SSH presents a new host key, stop for fingerprint verification; never pass `StrictHostKeyChecking=no`.

Once connected:

```bash
hostname
pwd
node --version
claude --version
printf 'TERM=%s TERM_PROGRAM=%s\n' "$TERM" "$TERM_PROGRAM"
```

Expected: session is on Pro, Node >=20, Claude >=2.1.287, and Air terminal identity is recorded.

- [ ] **Step 3: Run the MCP Apps path in a compatible host**

Configure the host to launch `dist/cli.js` on Pro with the repository root allowed. Call `prepare_image_preview` for one fixture of each format. Verify image renders on Air, model-visible transcript has metadata but no fixture base64, Air gains no persistent copy, and expired/outside-root requests show stable errors.

- [ ] **Step 4: Run the Claude terminal PNG path over SSH**

From Air's SSH session on Pro:

```bash
cd <worktree>
REMOTE_FILE_PREVIEW_ROOT="$PWD" claude --plugin-dir claude-plugin --mcp-config claude-plugin/.mcp.json
```

Call `prepare_image_preview` on the PNG fixture. Verify inline rendering in Air's terminal. Repeat inside tmux only when tmux is already available; do not install it for this test.

- [ ] **Step 5: Record evidence without overstating support**

Update compatibility docs with date, Air OS/client/terminal, Pro OS/Claude/Node, route, format, result, and screenshot path when captured. If Air remains unreachable, write `remote verification pending:` followed by the literal SSH stderr text, and leave acceptance criterion 8 incomplete.

- [ ] **Step 6: Commit compatibility evidence**

```bash
git add docs/compatibility.md docs/probes/2026-10-03-feasibility.md
git commit -m "test: record cross-device preview compatibility"
```

### Task 12: Run complete verification and open-source hygiene checks

**Files:**
- Modify only files needed to fix failures found by the gates below.

**Interfaces:**
- Consumes: every prior task.
- Produces: a clean, reproducible branch ready for independent review; it does not publish or push.

- [ ] **Step 1: Run the full local gate**

```bash
yarn check
git diff --check
git status --short
```

Expected: typecheck, Node tests, server build, and App build PASS; no whitespace errors; only intentional changes remain.

- [ ] **Step 2: Run Claude plugin gates**

```bash
claude plugin validate --strict claude-plugin
claude plugin test claude-plugin
```

Expected: both PASS and footprint matches README/SECURITY exactly.

- [ ] **Step 3: Inspect runtime and dependency surface**

```bash
rg -n 'https?://|fetch\(|child_process|process\.run|exec\(|spawn\(' src ui claude-plugin || true
rg -n 'preinstall|postinstall|"install"\s*:' package.json
find dist -type f -maxdepth 3 -print | sort
```

Expected: no runtime network/process execution and no lifecycle script. URLs may appear only in documentation.

- [ ] **Step 4: Run a read-only device-safety scan**

Scan the exact Git root/commit without running target-provided installers or scripts. Resolve every match in context. Confirm the intentional root-scoped image read is not broad home access and that there is no exfiltration, persistence, obfuscation, or prompt injection.

- [ ] **Step 5: Request independent code review and fix verified findings**

Review path containment/TOCTOU, MCP Apps content separation, app-only visibility and opt-in registration, Mod footprint/transcript leakage, and compatibility claims. Re-run the specific test after each accepted fix, then rerun `yarn check` and both Claude gates.

- [ ] **Step 6: Commit final verification fixes**

```bash
git add -A
git commit -m "fix: close remote preview review findings"
```

If no fixes were needed, do not create an empty commit. Report final commit, test counts, Mod footprint, and whether Air → Pro E2E is verified or pending.
