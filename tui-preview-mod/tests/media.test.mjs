import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtemp, writeFile, rm, symlink, truncate, readFile, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { openSource, PngFrames } from '../scripts/media.mjs';

const helper = new URL('../scripts/media.mjs', import.meta.url).pathname;
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
let root;
let outside;
before(async () => {
  execFileSync(ffmpeg, ['-version']);
  root = await mkdtemp(join(tmpdir(), 'preview media '));
  outside = await mkdtemp(join(tmpdir(), 'preview-outside-'));
  await writeFile(join(root, 'notes.md'), '# Heading\n\n' + 'content\n'.repeat(2000));
  await writeFile(join(outside, 'secret.md'), 'secret');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=8', '-t', '2', '-c:v', 'mpeg4', join(root, 'clip with spaces.mp4')]);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=800x600', '-frames:v', '1', '-threads', '1', join(root, 'red.png')]);
});
after(async () => { await rm(root, { recursive: true }); await rm(outside, { recursive: true }); });

async function run(command, path, extra = [], input) {
  const child = spawn(process.execPath, [helper, command, '--root', root, '--path', path, ...extra], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', value => { stdout += value; });
  child.stderr.on('data', value => { stderr += value; });
  child.stdin.end(input);
  const [code] = await once(child, 'close');
  return { code, stderr, records: stdout.trim().split('\n').filter(Boolean).map(JSON.parse) };
}

test('inspect accepts spaces, reports video dimensions and duration without frames', async () => {
  const result = await run('inspect', 'clip with spaces.mp4');
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.records.map(r => r.type), ['header', 'end']);
  assert.equal(result.records[0].kind, 'video');
  assert.equal(result.records[0].width, 96);
  assert.equal(result.records[0].height, 64);
  assert.equal(result.records[0].duration, 2);
});
test('markdown is paginated beneath native string ceiling without dropping text', async () => {
  const result = await run('markdown', 'notes.md');
  assert.equal(result.code, 0, result.stderr);
  const pages = result.records.filter(r => r.type === 'markdown');
  assert.ok(pages.length > 1);
  assert.ok(pages.every(p => p.text.length <= 9000 && p.totalPages === pages.length));
  assert.equal(pages.map(p => p.text).join(''), '# Heading\n\n' + 'content\n'.repeat(2000));
});
test('image becomes bounded PNG and preserves its aspect ratio', async () => {
  const result = await run('image', 'red.png');
  assert.equal(result.code, 0, result.stderr);
  const frame = result.records.find(r => r.type === 'frame');
  assert.ok(frame, 'decoded image frame exists');
  assert.ok(frame.width <= 640 && frame.height <= 360);
  assert.equal(frame.width / frame.height, 4 / 3);
  const png = Buffer.from(frame.png, 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.length <= 2 * 1024 * 1024);
});
test('video decodes multiple distinct frames from a nonzero offset', async () => {
  const result = await run('video', 'clip with spaces.mp4', ['--start', '0.5']);
  assert.equal(result.code, 0, result.stderr);
  const frames = result.records.filter(r => r.type === 'frame');
  assert.ok(frames.length >= 2);
  assert.ok(new Set(frames.map(f => f.png)).size >= 2);
  assert.equal(frames[0].time, 0.5);
  assert.ok(frames.every(f => f.width <= 640 && f.height <= 360));
  assert.equal(result.records.at(-1).type, 'end');
});
test('URL, outside root, symlink, directory and FIFO are rejected without a blocking open', async () => {
  await symlink(join(outside, 'secret.md'), join(root, 'escape.md'));
  await symlink(join(root, 'notes.md'), join(root, 'linked.md'));
  execFileSync('/usr/bin/mkfifo', [join(root, 'pipe.md')]);
  for (const path of ['https://example.com/a.png', join(outside, 'secret.md'), 'escape.md', 'linked.md', '.', 'pipe.md']) {
    const result = await run('inspect', path);
    assert.equal(result.code, 1, path);
    assert.equal(result.records.at(-1)?.type, 'error', path);
  }
});
test('bounded input and malformed media fail with typed error and nonzero exit', async () => {
  await writeFile(join(root, 'large.md'), '');
  await truncate(join(root, 'large.md'), 2 * 1024 * 1024 + 1);
  await writeFile(join(root, 'broken.mp4'), 'not a movie');
  for (const [command, path] of [['markdown', 'large.md'], ['video', 'broken.mp4']]) {
    const result = await run(command, path);
    assert.equal(result.code, 1);
    assert.equal(result.records.at(-1)?.type, 'error');
  }
  for (const offset of ['-1', 'NaN', 'Infinity', '3']) {
    assert.equal((await run('video', 'clip with spaces.mp4', ['--start', offset])).code, 1);
  }
});
test('closing stdout stops helper and ffmpeg promptly', { timeout: 8000 }, async () => {
  const child = spawn(process.execPath, [helper, 'video', '--root', root, '--path', 'clip with spaces.mp4'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.resume();
  await once(child.stdout, 'data');
  let decoderPids = [];
  for (let i = 0; i < 20 && !decoderPids.length; i++) {
    try { decoderPids = execFileSync('/usr/bin/pgrep', ['-P', String(child.pid)], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number); } catch {}
    if (!decoderPids.length) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(decoderPids.length, 'decoder child exists');
  child.stdout.destroy();
  await once(child, 'close');
  for (const pid of decoderPids) assert.throws(() => process.kill(pid, 0), /ESRCH/);
});

test('verified handle stays on the original file after path replacement', async () => {
  await writeFile(join(root, 'mutable.md'), 'original');
  const source = await openSource(root, 'mutable.md');
  try {
    await rename(join(root, 'mutable.md'), join(root, 'moved.md'));
    await symlink(join(outside, 'secret.md'), join(root, 'mutable.md'));
    assert.equal(await source.handle.readFile({ encoding: 'utf8' }), 'original');
  } finally { await source.handle.close(); }
});
test('a pinned canonical cache root refuses a changed root alias', async () => {
  const alias = join(root, 'cache-root-alias');
  await symlink(outside, alias);
  await assert.rejects(openSource(alias, 'secret.md', alias), /root|changed/i);
});
test('PNG parser splits fragmented frames and refuses oversized and truncated frames', async () => {
  const result = await run('image', 'red.png');
  const png = Buffer.from(result.records.find(r => r.type === 'frame').png, 'base64');
  const frames = [], parser = new PngFrames();
  const input = Buffer.concat([png, png]);
  for (let i = 0; i < input.length; i += 13) frames.push(...parser.push(input.subarray(i, i + 13)));
  parser.finish(); assert.equal(frames.length, 2);
  assert.equal(frames[0].png, frames[1].png);
  const bad = Buffer.alloc(16); png.copy(bad, 0, 0, 8); bad.writeUInt32BE(3 * 1024 * 1024, 8);
  assert.throws(() => new PngFrames().push(bad), /limit|exceeds/i);
  const incomplete = new PngFrames(); incomplete.push(png.subarray(0, 20));
  assert.throws(() => incomplete.finish(), /truncated/i);
  assert.throws(() => new PngFrames().push(Buffer.alloc(4 * 1024 * 1024)), /limit|exceeds/i);
});
async function runDirect(args, input, env = process.env) {
  const child = spawn(process.execPath, [helper, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', data => { stdout += data; }); child.stderr.resume();
  child.stdin.end(input); const [code] = await once(child, 'close');
  return { code, records: stdout.trim().split('\n').filter(Boolean).map(JSON.parse) };
}
test('pasted base64 on stdin decodes and malformed input fails', async () => {
  const encoded = (await readFile(join(root, 'red.png'))).toString('base64');
  const result = await runDirect(['image', '--stdin-base64'], encoded);
  assert.equal(result.code, 0); assert.ok(result.records.some(r => r.type === 'frame'));
  assert.equal((await runDirect(['image', '--stdin-base64'], 'not base64')).code, 1);
});
test('pasted operation reads only an exact current-session image and validates IDs', async () => {
  const session = '12345678-1234-1234-1234-123456789abc';
  const cwd = root;
  const key = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  const images = join(root, `claude-${process.getuid()}`, key, session, 'images');
  await mkdir(images, { recursive: true });
  await writeFile(join(images, '1.png'), await readFile(join(root, 'red.png')));
  const args = ['pasted', '--session-id', session, '--cwd', cwd, '--image-id', '1'];
  const env = { ...process.env, CLAUDE_CODE_TMPDIR: root };
  const result = await runDirect(args, undefined, env);
  assert.equal(result.code, 0); assert.ok(result.records.some(r => r.type === 'frame'));
  for (const id of ['../1', '0', '-1', '1.png', 'Infinity']) {
    assert.equal((await runDirect([...args.slice(0, -1), id], undefined, env)).code, 1);
  }
  assert.equal((await runDirect(args.map(arg => arg === session ? '../escape' : arg), undefined, env)).code, 1);
  const escapedSession = '22345678-1234-1234-1234-123456789abc';
  await symlink(join(root, `claude-${process.getuid()}`, key, session), join(root, `claude-${process.getuid()}`, key, escapedSession));
  assert.equal((await runDirect(args.map(arg => arg === session ? escapedSession : arg), undefined, env)).code, 1);
  await symlink(join(outside, 'secret.md'), join(images, '2.png'));
  assert.equal((await runDirect([...args.slice(0, -1), '2'], undefined, env)).code, 1);
});
for (const [extension, media] of [['jpg', 'image/jpeg'], ['gif', 'image/gif'], ['webp', 'image/webp']]) {
  test(`pasted ${extension} is decoded from the same session and image ID`, async () => {
    const session = '32345678-1234-1234-1234-123456789abc';
    const key = root.replace(/[^a-zA-Z0-9]/g, '-');
    const images = join(root, `claude-${process.getuid()}`, key, session, 'images');
    await mkdir(images, { recursive: true });
    const id = { jpg: '11', gif: '12', webp: '13' }[extension];
    const destination = join(images, `${id}.${extension}`);
    if (extension === 'webp') await writeFile(destination, Buffer.from('UklGRhwAAABXRUJQVlA4TA8AAAAvAUAAAAcQ5Y/+ByKi/wEA', 'base64'));
    else execFileSync(ffmpeg, ['-v', 'error', '-i', join(root, 'red.png'), '-frames:v', '1', '-threads', '1', destination]);
    const result = await runDirect(['pasted', '--session-id', session, '--cwd', root, '--image-id', id], undefined, { ...process.env, CLAUDE_CODE_TMPDIR: root });
    assert.equal(result.code, 0, JSON.stringify(result.records));
    assert.equal(result.records[0].media, media);
    assert.equal(result.records.filter(record => record.type === 'frame').length, 1);
  });
}
test('pasted alternate filenames retain symlink and media-magic rejection without other-session fallback', async () => {
  const session = '42345678-1234-1234-1234-123456789abc';
  const other = '52345678-1234-1234-1234-123456789abc';
  const key = root.replace(/[^a-zA-Z0-9]/g, '-');
  const images = join(root, `claude-${process.getuid()}`, key, session, 'images');
  const otherImages = join(root, `claude-${process.getuid()}`, key, other, 'images');
  await mkdir(images, { recursive: true }); await mkdir(otherImages, { recursive: true });
  await symlink(join(root, 'red.png'), join(images, '21.jpg'));
  await writeFile(join(images, '22.webp'), await readFile(join(root, 'clip with spaces.mp4')));
  await writeFile(join(otherImages, '23.gif'), await readFile(join(root, 'red.png')));
  const args = ['pasted', '--session-id', session, '--cwd', root, '--image-id'];
  const env = { ...process.env, CLAUDE_CODE_TMPDIR: root };
  for (const id of ['21', '22', '23']) {
    const result = await runDirect([...args, id], undefined, env);
    assert.equal(result.code, 1, id);
    assert.ok(!result.records.some(record => record.type === 'frame'), id);
    assert.equal(result.records.at(-1)?.type, 'error', id);
  }
  assert.equal((await runDirect([...args, '22'], undefined, env)).records.at(-1)?.code, 'FORMAT');
});
test('all image/video container families use the same bounded frame output', async () => {
  for (const extension of ['jpg', 'webp', 'gif']) {
    // Fixed 2x2 lossless WebP fixture: this ffmpeg build decodes WebP but has no WebP encoder.
    if (extension === 'webp') await writeFile(join(root, 'converted.webp'), Buffer.from('UklGRhwAAABXRUJQVlA4TA8AAAAvAUAAAAcQ5Y/+ByKi/wEA', 'base64'));
    else execFileSync(ffmpeg, ['-v', 'error', '-i', join(root, 'red.png'), '-frames:v', '1', '-threads', '1', join(root, `converted.${extension}`)]);
    const result = await run('image', `converted.${extension}`);
    assert.equal(result.code, 0, extension);
    assert.ok(result.records.some(record => record.type === 'frame'), extension);
  }
  for (const extension of ['mov', 'mkv', 'webm']) {
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=8', '-t', '0.25', '-c:v', extension === 'webm' ? 'libvpx' : 'mpeg4', '-threads', '1', join(root, `converted.${extension}`)]);
    const result = await run('video', `converted.${extension}`);
    assert.equal(result.code, 0, extension);
    assert.equal(result.records.filter(record => record.type === 'frame').length, 2, extension);
  }
});
test('static and video sparse files above input ceilings fail before decoding', async () => {
  for (const [name, size] of [['too-big.png', 32 * 1024 * 1024 + 1], ['too-big.mp4', 2 * 1024 * 1024 * 1024 + 1]]) {
    await writeFile(join(root, name), ''); await truncate(join(root, name), size);
    const result = await run('inspect', name);
    assert.equal(result.code, 1);
    assert.equal(result.records.at(-1)?.code, 'LIMIT');
  }
});
test('image decoder rejects media containers disguised with an image extension', async () => {
  await writeFile(join(root, 'disguised.png'), await readFile(join(root, 'clip with spaces.mp4')));
  const result = await run('image', 'disguised.png');
  assert.equal(result.code, 1);
  assert.equal(result.records.at(-1)?.type, 'error');
});
test('markdown drops terminal escape/control bytes and invalid UTF-8 fails', async () => {
  await writeFile(join(root, 'controls.md'), 'hello\x1b[31m\x00 world');
  const result = await run('markdown', 'controls.md');
  assert.equal(result.code, 0);
  assert.equal(result.records.find(r => r.type === 'markdown').text, 'hello[31m world');
  await writeFile(join(root, 'invalid.md'), Buffer.from([0xff]));
  assert.equal((await run('markdown', 'invalid.md')).code, 1);
});
test('SIGTERM stops helper and decoder; pending pasted stdin is also cancellable', { timeout: 8000 }, async () => {
  const child = spawn(process.execPath, [helper, 'video', '--root', root, '--path', 'clip with spaces.mp4'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.resume(); await once(child.stdout, 'data');
  const pids = execFileSync('/usr/bin/pgrep', ['-P', String(child.pid)], { encoding: 'utf8' }).trim().split('\n').map(Number);
  child.kill('SIGTERM'); await once(child, 'close');
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), /ESRCH/);
  const pasted = spawn(process.execPath, [helper, 'image', '--stdin-base64'], { stdio: ['pipe', 'pipe', 'pipe'] });
  pasted.stdout.resume(); pasted.stderr.resume();
  await new Promise(resolve => setTimeout(resolve, 80));
  pasted.kill('SIGTERM'); await once(pasted, 'close');
  pasted.stdin.destroy();
});
