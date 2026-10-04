import { constants } from 'node:fs';
import { open, realpath, lstat, access } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MiB = 1024 * 1024;
const LIMITS = { markdown: 2 * MiB, image: 32 * MiB, video: 2 * 1024 * MiB, frame: 2 * MiB };
const formats = {
  '.md': ['markdown', 'text/markdown'], '.markdown': ['markdown', 'text/markdown'],
  '.png': ['image', 'image/png'], '.jpg': ['image', 'image/jpeg'], '.jpeg': ['image', 'image/jpeg'],
  '.webp': ['image', 'image/webp'], '.gif': ['image', 'image/gif'],
  '.mp4': ['video', 'video/mp4'], '.mov': ['video', 'video/quicktime'],
  '.webm': ['video', 'video/webm'], '.mkv': ['video', 'video/x-matroska'],
};
const clean = value => String(value).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '');
class MediaError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new MediaError(code, message); };

/** Check containment and inode identity; decoding inherits this handle instead of reopening a path. */
export async function openSource(root, input, expectedCanonicalRoot) {
  if (!root || !input || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(input) || input.startsWith('//')
    || /[\u0000-\u001f\u007f]/.test(input)) fail('PATH', 'Only a local regular file is allowed');
  const canonicalRoot = await realpath(root);
  if (expectedCanonicalRoot !== undefined && canonicalRoot !== expectedCanonicalRoot) fail('ROOT', 'Allowed root changed while opening');
  const requested = resolve(canonicalRoot, input);
  const initial = await lstat(requested);
  if (!initial.isFile() || initial.isSymbolicLink()) fail('PATH', 'Source must be a regular file without a symlink');
  const canonical = await realpath(requested);
  const inside = relative(canonicalRoot, canonical);
  if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) fail('ROOT', 'Source is outside the allowed root');
  const format = formats[extname(canonical).toLowerCase()];
  if (!format) fail('FORMAT', 'Unsupported file extension');
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.dev !== initial.dev || actual.ino !== initial.ino) fail('PATH', 'Source changed while opening');
    if (actual.size > LIMITS[format[0]]) fail('LIMIT', 'Source exceeds the input size limit');
    return { handle, kind: format[0], media: format[1], name: clean(basename(canonical)).slice(0, 240), size: actual.size };
  } catch (error) { await handle.close(); throw error; }
}

async function readBounded(source, limit) {
  const chunks = []; let total = 0;
  while (true) {
    const buffer = Buffer.alloc(Math.min(64 * 1024, limit + 1 - total));
    const { bytesRead } = await source.handle.read(buffer, 0, buffer.length, null);
    if (!bytesRead) break;
    total += bytesRead;
    if (total > limit) fail('LIMIT', 'Source exceeds the input size limit');
    chunks.push(buffer.subarray(0, bytesRead));
  }
  return Buffer.concat(chunks, total);
}

export class PngFrames {
  pending = Buffer.alloc(0);
  push(chunk) {
    const frames = [];
    if (chunk.length > LIMITS.frame + 64 * 1024) fail('LIMIT', 'Decoder chunk exceeds limit');
    // Read at most one frame plus one pipe chunk. Each PNG chunk is checked before copying further.
    this.pending = Buffer.concat([this.pending, chunk]);
    while (this.pending.length) {
      if (this.pending.length < 8) break;
      if (this.pending.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('DECODE', 'Decoder returned invalid PNG');
      let offset = 8; let complete = false;
      while (offset + 8 <= this.pending.length) {
        const length = this.pending.readUInt32BE(offset);
        const next = offset + 12 + length;
        if (next > LIMITS.frame) fail('LIMIT', 'Decoded frame exceeds 2 MiB');
        if (next > this.pending.length) break;
        const type = this.pending.toString('ascii', offset + 4, offset + 8);
        offset = next;
        if (type === 'IEND') { complete = true; break; }
      }
      if (!complete) { if (this.pending.length > LIMITS.frame) fail('LIMIT', 'Decoded frame exceeds 2 MiB'); break; }
      const png = this.pending.subarray(0, offset);
      if (png.length < 33 || png.toString('ascii', 12, 16) !== 'IHDR') fail('DECODE', 'Decoder returned invalid PNG header');
      const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
      if (!width || !height || width > 640 || height > 360) fail('LIMIT', 'Decoded dimensions exceed 640 by 360');
      frames.push({ png: png.toString('base64'), width, height });
      this.pending = this.pending.subarray(offset);
    }
    return frames;
  }
  finish() { if (this.pending.length) fail('DECODE', 'Decoder returned a truncated PNG'); }
}

async function executable(name) {
  for (const base of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) {
    const candidate = `${base}/${name}`;
    try { await access(candidate, constants.X_OK); return candidate; } catch {}
  }
  fail('DEPENDENCY', `Install ${name} before previewing media`);
}

function argumentsOf(argv) {
  const command = argv[0];
  if (!['inspect', 'image', 'markdown', 'video', 'pasted'].includes(command)) fail('ARGS', 'Use inspect, image, markdown, video or pasted');
  const options = { command, start: 0, stdin: false };
  const seen = new Set();
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag)) fail('ARGS', 'Duplicate argument'); seen.add(flag);
    if (flag === '--stdin-base64') { options.stdin = true; continue; }
    if (!['--root', '--path', '--start', '--session-id', '--cwd', '--image-id'].includes(flag) || argv[i + 1] === undefined) fail('ARGS', 'Invalid arguments');
    const value = argv[++i];
    options[flag.slice(2)] = flag === '--start' ? Number(value) : value;
  }
  if (!Number.isFinite(options.start) || options.start < 0 || (seen.has('--start') && command !== 'video')) fail('ARGS', 'Invalid video start');
  if (command === 'pasted') {
    if (options.stdin || options.root || options.path || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(options['session-id'] ?? '')
      || !isAbsolute(options.cwd ?? '') || /[\u0000-\u001f\u007f]/.test(options.cwd)
      || !/^[1-9][0-9]{0,8}$/.test(options['image-id'] ?? '')) fail('ARGS', 'Supply current cwd, session UUID and a positive image ID');
    return options;
  }
  if (options.cwd || options['session-id'] || options['image-id']) fail('ARGS', 'Session arguments require pasted');
  if (options.stdin ? command !== 'image' || options.root || options.path : !options.root || !options.path) fail('ARGS', 'Supply root and path, or image --stdin-base64');
  return options;
}

async function pastedSource(options) {
  if (typeof process.getuid !== 'function') fail('DEPENDENCY', 'Native pasted cache currently requires macOS or Linux');
  const base = await realpath(resolve(process.env.CLAUDE_CODE_TMPDIR || '/tmp', `claude-${process.getuid()}`));
  let key = options.cwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (key.length > 200) {
    let hash = 0;
    for (let i = 0; i < options.cwd.length; i++) hash = (Math.imul(31, hash) + options.cwd.charCodeAt(i)) | 0;
    key = key.slice(0, 200) + '-' + Math.abs(hash).toString(36);
  }
  let directory = base;
  // Never list directories, follow session symlinks, or look in another session/history.
  for (const segment of [key, options['session-id'], 'images']) {
    directory = resolve(directory, segment);
    const entry = await lstat(directory);
    if (!entry.isDirectory() || entry.isSymbolicLink()) fail('PATH', 'Pasted cache directory must not be a symlink');
  }
  const canonical = await realpath(directory);
  if (canonical !== directory) fail('PATH', 'Pasted cache directory changed while opening');
  for (const extension of ['png', 'jpg', 'gif', 'webp']) {
    try { return await openSource(directory, `${options['image-id']}.${extension}`, canonical); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  fail('PATH', 'Pasted image was not found in the current session');
}

function imageFormat(input) {
  if (input.length >= 24 && input.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return ['png_pipe', 'image/png'];
  if (input.length >= 3 && input.subarray(0, 3).toString('hex') === 'ffd8ff') return ['jpeg_pipe', 'image/jpeg'];
  if (input.length >= 12 && input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP') return ['webp_pipe', 'image/webp'];
  if (['GIF87a', 'GIF89a'].includes(input.toString('ascii', 0, 6))) return ['gif', 'image/gif'];
  fail('FORMAT', 'Image bytes must be PNG, JPEG, WebP or GIF');
}

export async function main(argv) {
  let source; let cancelled = false;
  const children = new Set();
  const stop = () => {
    cancelled = true;
    process.stdin.destroy();
    for (const child of children) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => { if (children.has(child)) child.kill('SIGKILL'); }, 500); timer.unref();
    }
  };
  const emit = record => new Promise((resolveWrite, rejectWrite) => {
    if (cancelled) { rejectWrite(new MediaError('CANCELLED', 'Preview stopped')); return; }
    process.stdout.write(JSON.stringify(record) + '\n', error => error ? rejectWrite(error) : resolveWrite());
  });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  process.stdout.on('error', stop); process.stdout.on('close', stop);

  async function childProcess(name, args, input, fd, timeout) {
    const command = await executable(name);
    if (cancelled) fail('CANCELLED', 'Preview stopped');
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe', ...(fd === undefined ? [] : [fd])] });
    children.add(child);
    let stderr = ''; let timedOut = false;
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-4096); });
    child.stdin.on('error', () => {}); child.stdin.end(input);
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout); timer.unref();
    const done = new Promise((resolveChild, rejectChild) => {
      child.once('error', () => rejectChild(new MediaError('DEPENDENCY', `Could not start ${name}`)));
      child.once('close', (code, signal) => {
        clearTimeout(timer); children.delete(child);
        if (code === 0) resolveChild();
        else rejectChild(new MediaError('DECODE', timedOut ? 'Decoder timed out' : `${name} could not decode this media${signal ? ' (stopped)' : ''}`));
      });
    });
    done.catch(() => {});
    return { child, done };
  }
  try {
    const options = argumentsOf(argv);
    if (options.stdin) {
      const chunks = []; let total = 0;
      for await (const chunk of process.stdin) {
        total += chunk.length;
        if (total > Math.ceil(LIMITS.image / 3) * 4) fail('LIMIT', 'Pasted image exceeds 32 MiB');
        chunks.push(chunk);
      }
      const encoded = Buffer.concat(chunks).toString('ascii');
      if (!encoded.length || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail('ARGS', 'Invalid pasted image base64');
      const input = Buffer.from(encoded, 'base64');
      if (input.length > LIMITS.image) fail('LIMIT', 'Pasted image exceeds 32 MiB');
      source = { kind: 'image', media: 'image/png', name: 'Pasted image', input };
    } else source = options.command === 'pasted' ? await pastedSource(options) : await openSource(options.root, options.path);
    if (!['inspect', 'pasted'].includes(options.command) && options.command !== source.kind) fail('FORMAT', 'Command does not match media kind');
    const header = { type: 'header', kind: source.kind, name: source.name, media: source.media };
    const videoFormat = ['video/mp4', 'video/quicktime'].includes(source.media) ? 'mov' : 'matroska';
    // MOV external track/alias access stays off even if a future installed decoder changes defaults.
    const videoInput = ['-f', videoFormat, ...(videoFormat === 'mov' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : [])];
    if (source.kind === 'video') {
      const { child, done } = await childProcess('ffprobe', ['-v', 'error', '-max_alloc', String(64 * MiB), '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska', ...videoInput, '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', '/dev/fd/3'], undefined, source.handle.fd, 15_000);
      let output = '';
      for await (const chunk of child.stdout) {
        output += chunk.toString('utf8'); if (output.length > 64 * 1024) fail('LIMIT', 'Metadata exceeds limit');
      }
      await done;
      const metadata = JSON.parse(output);
      const stream = metadata.streams?.[0]; const duration = Number(metadata.format?.duration);
      if (!stream || !Number.isFinite(duration) || duration <= 0 || !Number.isInteger(stream.width) || !Number.isInteger(stream.height)
        || stream.width <= 0 || stream.height <= 0 || stream.width > 100_000 || stream.height > 100_000) fail('DECODE', 'Unsupported video metadata');
      Object.assign(header, { width: stream.width, height: stream.height, duration });
      if (options.start >= duration) fail('ARGS', 'Video start must precede the end');
    }
    if (options.command === 'inspect') { await emit(header); await emit({ type: 'end' }); return; }
    if (source.kind === 'markdown') {
      const text = clean(new TextDecoder('utf-8', { fatal: true }).decode(await readBounded(source, LIMITS.markdown)));
      const pages = [];
      for (let offset = 0; offset < text.length;) {
        let end = Math.min(offset + 9000, text.length);
        if (end < text.length && /[\ud800-\udbff]/.test(text[end - 1])) end--;
        pages.push(text.slice(offset, end)); offset = end;
      }
      if (!pages.length) pages.push('');
      await emit(header);
      for (let index = 0; index < pages.length; index++) await emit({ type: 'markdown', text: pages[index], page: index + 1, totalPages: pages.length });
    } else {
      const video = source.kind === 'video';
      const input = video ? undefined : source.input ?? await readBounded(source, LIMITS.image);
      const image = video ? undefined : imageFormat(input);
      if (image) header.media = image[1];
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-max_alloc', String(64 * MiB), '-threads', '1', '-filter_threads', '1', '-protocol_whitelist', 'file,pipe', '-format_whitelist', video ? 'mov,matroska' : image[0],
        ...(video ? [...videoInput, '-re', '-ss', String(options.start), '-i', '/dev/fd/3', '-t', '600'] : ['-i', 'pipe:0', '-frames:v', '1']),
        '-map', '0:v:0', '-an', '-sn', '-dn', '-vf', `${video ? 'fps=8,' : ''}scale=640:360:force_original_aspect_ratio=decrease`,
        '-threads', '1', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'];
      const { child, done } = await childProcess('ffmpeg', args, input, video ? source.handle.fd : undefined, video ? 615_000 : 20_000);
      const parser = new PngFrames(); let count = 0;
      if (video) await emit(header);
      for await (const chunk of child.stdout) {
        for (const frame of parser.push(chunk)) {
          if (count >= (video ? 4800 : 1)) fail('LIMIT', 'Decoder exceeds frame limit');
          if (!video) await emit({ ...header, width: frame.width, height: frame.height });
          await emit({ type: 'frame', ...frame, time: video ? options.start + count / 8 : 0 }); count++;
        }
      }
      await done; parser.finish();
      if (!count) fail('DECODE', 'Decoder returned no frames');
    }
    await emit({ type: 'end' });
  } catch (error) {
    if (!cancelled) {
      try { await emit({ type: 'error', code: error instanceof MediaError ? error.code : 'IO', message: clean(error instanceof MediaError ? error.message : 'Unable to read or decode media').slice(0, 500) }); } catch {}
    }
    process.exitCode = cancelled ? 143 : 1;
  } finally {
    stop();
    await Promise.all([...children].map(child => new Promise(resolveClose => child.once('close', resolveClose))));
    await source?.handle?.close();
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    process.stdout.removeListener('error', stop); process.stdout.removeListener('close', stop);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
