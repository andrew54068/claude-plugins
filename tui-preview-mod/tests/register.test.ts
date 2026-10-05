import { expect, mock, test } from 'claude-code/testing';
import type { On, ProcessSpawnRequest } from 'claude-code';

const PLUGIN = 'tui-preview-mod';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE3cAAAAASUVORK5CYII=';
const START = { cwd: '/work', surface: 'terminal', isInteractive: true } as const;
const command = (args: string) => ({ command: 'preview', args, origin: { kind: 'composer' } as const, presentation: { columns: 80, isFullscreen: false } });
const PANE = { plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'preview', viewport: { columns: 80, rows: 30, isFullscreen: false }, props: { title: '預覽', isFocused: true, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const;
const BAND = { plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', requestId: 'above', viewport: { columns: 80, rows: 30, isFullscreen: false }, props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} } } as const;
const encoded = (...records: object[]) => records.map(record => JSON.stringify(record) + '\n').join('');
const header = (kind: string, name: string, duration = 5) => ({ type: 'header', kind, name, media: kind === 'markdown' ? 'text/markdown' : kind === 'video' ? 'video/mp4' : 'image/png', ...(kind === 'video' ? { width: 1920, height: 1080, duration } : kind === 'image' ? { width: 16, height: 8 } : {}) });
const frame = (time = 0) => ({ type: 'frame', png: PNG, time, width: 16, height: 8 });
const readRow = (id: string) => ({ plugin: PLUGIN, surface: 'terminal', component: 'ToolResult', requestId: id, viewport: { columns: 80, rows: 30, isFullscreen: false }, props: { tool_use_id: id, tool: 'Read', isErrored: false, output: { type: 'image', file: { base64: PNG, type: 'image/png', originalSize: 70 } } } } as const);

function host(on: On) {
  const clock = mock.clock(on);
  const state = { draft: '', root: '/work', id: '60b13e72-306e-406f-86c5-f5541ef749f5', reads: 0, roots: 0, requests: [] as ProcessSpawnRequest[], calls: [] as string[][], commands: [] as unknown[], blits: [] as unknown[], invalidations: 0, stopped: 0, videoDuration: 5, badExit: false, badRecord: false, blitDenied: false, imageDelay: 0, inspectDelay: 0, activeImages: 0, peakImages: 0, activeVideo: 0, initialVideoTime: 0, videoFrameTime: undefined as number | undefined, returnDelay: 0, opened: 0, renderDelay: 0 };
  on('session.start', () => ({ cwd: '/work' }));
  on('session.end', () => ({ sessionId: state.id }));
  on('session.root', () => { state.roots++; return { value: state.root }; });
  on('session.id', () => ({ value: state.id }));
  on('prompt.read', () => { state.reads++; return { value: { text: state.draft, cursor: state.draft.length } }; });
  on('command.register', ($, e) => { state.commands.push(e); return { value: { command: e.name } }; });
  on('ui.open', () => { state.opened++; return { value: { isPlaced: true } }; });
  on('ui.close', () => ({ value: undefined }));
  on('ui.log', () => ({ value: undefined }));
  on('ui.notice', () => ({ value: undefined }));
  on('ui.blit', ($, e) => { state.blits.push(e); return { value: state.blitDenied ? { deny: 'unsupported terminal' } : {} }; });
  on('ui.invalidate', ($, e, next) => { state.invalidations++; return next(e); });
  on('ui.render', async ($, e) => {
    if (e.component === 'ToolResult' && state.renderDelay) await clock.sleep(state.renderDelay);
    return { type: 'Text', props: {}, children: ['原生輸出'] };
  });
  on('process.run', async ($, e) => {
    state.calls.push([...e.argv]);
    const path = e.argv.at(-1) ?? '';
    const kind = path.endsWith('.md') ? 'markdown' : path.endsWith('.mp4') ? 'video' : 'image';
    if (state.inspectDelay) await clock.sleep(state.inspectDelay);
    return { value: { exitCode: 0, stdout: encoded(header(kind, path.split('/').at(-1) ?? path, state.videoDuration), { type: 'end' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } };
  });
  on('process.spawn', async function* ($, e) {
    state.requests.push(e);
    const action = e.argv[2];
    const isImage = action === 'image' || action === 'pasted';
    if (isImage) { state.activeImages++; state.peakImages = Math.max(state.peakImages, state.activeImages); }
    if (action === 'video') state.activeVideo++;
    try {
      if (state.badRecord) { yield { stream: 'stdout', text: '{"type":"frame"}\n' }; return { value: { code: 1, signal: null } }; }
      if (action === 'inspect') {
        if (state.inspectDelay) await clock.sleep(state.inspectDelay);
        const path = e.argv.at(-1) ?? '';
        const kind = path.endsWith('.md') ? 'markdown' : path.endsWith('.mp4') ? 'video' : 'image';
        yield { stream: 'stdout', text: encoded(header(kind, path.split('/').at(-1) ?? path, state.videoDuration), { type: 'end' }) };
      } else if (action === 'markdown') {
        yield { stream: 'stdout', text: encoded(header('markdown', '文章.md'), { type: 'markdown', text: '# 第一頁\n**重要**', page: 1, totalPages: 2 }, { type: 'markdown', text: '# 第二頁', page: 2, totalPages: 2 }, { type: 'end' }) };
      } else if (action === 'video') {
        const start = e.argv.includes('--start') ? Number(e.argv.at(-1)) : 0;
        yield { stream: 'stdout', text: encoded(header('video', 'movie.mp4', state.videoDuration), frame(start === 0 ? state.initialVideoTime : start)) };
        yield { stream: 'stderr', text: 'private decoder details /secret\n' };
        for (let i = 1; i <= 40; i++) {
          await clock.sleep(250);
          yield { stream: 'stdout', text: encoded(frame(state.videoFrameTime ?? start + i / 8)) };
        }
        yield { stream: 'stdout', text: encoded({ type: 'end' }) };
      } else {
        if (state.imageDelay) await clock.sleep(state.imageDelay);
        const name = action === 'pasted' ? `${e.argv.at(-1)}.png` : 'chart.png';
        yield { stream: 'stdout', text: encoded(header('image', name), frame(), { type: 'end' }) };
      }
      return { value: { code: state.badExit ? 2 : 0, signal: null } };
    } finally {
      if (action === 'video' && state.returnDelay) await clock.sleep(state.returnDelay);
      if (isImage) state.activeImages--;
      if (action === 'video') state.activeVideo--;
      state.stopped++;
    }
  });
  return { clock, state };
}

test('registers immediate preview and starts composer polling only in interactive terminal sessions', async ($, on) => {
  const { clock, state } = host(on);
  await $.session.start({ ...START, isInteractive: false });
  await clock.advance(1000);
  expect(state.reads).toBe(0);
  expect(state.commands).toContainEqual(expect.objectContaining({ name: 'preview', immediate: true }));
  await $.session.start(START);
  await clock.advance(500);
  expect(state.reads).toBeGreaterThan(0);
});

test('preview opens native Markdown pages using helper argv with spaces preserved', async ($, on) => {
  const { state } = host(on);
  await $.session.start(START);
  await $.command.run(command('notes with spaces.md'));
  const ui = await $.ui.mount(PANE);
  expect(await ui.find({ type: 'Markdown', text: '# 第一頁' })).toBeDefined();
  await ui.press({ key: 'page-next' });
  expect(await ui.find({ type: 'Markdown', text: '# 第二頁' })).toBeDefined();
  expect(state.requests[0]?.argv).toEqual(['node', expect.stringMatching(/\/scripts\/media\.mjs$/), 'inspect', '--root', '/work', '--path', 'notes with spaces.md']);
  await ui.unmount();
});

test('image pane uses PNG bytes and displayed fit derives from actual frame dimensions', async ($, on) => {
  host(on);
  await $.session.start(START);
  await $.command.run(command('chart.png'));
  const ui = await $.ui.mount(PANE);
  const image = await ui.find({ type: 'Image' });
  expect(image?.props.source).toEqual({ png: PNG });
  expect(image?.props.columns).toBe(60);
  expect(image?.props.rows).toBe(15);
  await ui.unmount();
});

test('video controls stream blits and cancel old helper on pause seek close and session.end', async ($, on) => {
  const { clock, state } = host(on);
  await $.session.start(START);
  await $.command.run(command('movie.mp4'));
  await clock.settle();
  const ui = await $.ui.mount(PANE);
  await clock.advance(250);
  expect(state.blits.length).toBeGreaterThan(0);
  const pausing = ui.press({ key: 'pause' });
  await clock.advance(300);
  await pausing;
  expect(await ui.find({ type: 'Text', text: '暫停' })).toBeDefined();
  const stopped = state.stopped;
  expect(stopped).toBeGreaterThan(0);
  await ui.press({ key: 'play' });
  await clock.settle();
  const seeking = ui.press({ key: 'seek-forward' });
  await clock.advance(300);
  await seeking;
  expect(state.stopped).toBeGreaterThan(stopped);
  const replaying = ui.press({ key: 'replay' });
  await clock.advance(300);
  await replaying;
  await clock.settle();
  const ending = $.session.end({ reason: 'prompt_input_exit', sessionId: state.id, resume: { id: state.id } });
  await clock.advance(300);
  await ending;
  const calls = state.requests.length;
  await clock.advance(1000);
  expect(state.requests.length).toBe(calls);
  expect(await ui.find({ type: 'Image' })).toBeUndefined();
  await ui.unmount();
});

test('500ms poll previews pasted images before any edit and preserves draft with max2 thumbnails and all ID controls', async ($, on) => {
  const { clock, state } = host(on);
  state.draft = '[Image #1] [Image #2] [Image #3] explain';
  await $.session.start(START);
  await clock.advance(500);
  const ui = await $.ui.mount(BAND);
  expect((await ui.findAll({ type: 'Image' })).length).toBe(2);
  expect(state.requests.filter(request => request.argv[2] === 'pasted').length).toBe(2);
  expect(await ui.find({ type: 'Button', key: 'pasted:3' })).toBeDefined();
  await ui.press({ key: 'pasted:3' });
  const pane = await $.ui.mount(PANE);
  expect(await pane.find({ type: 'Image' })).toBeDefined();
  state.draft = '';
  await clock.advance(500);
  expect(await pane.find({ type: 'Image' })).toBeDefined();
  expect(state.requests[0]?.argv).toEqual(['node', expect.stringMatching(/\/scripts\/media\.mjs$/), 'pasted', '--session-id', state.id, '--cwd', '/work', '--image-id', '1']);
  await pane.unmount(); await ui.unmount();
});

test('new root/session or removed pasted IDs discard pending decoding and clear cannot permanently stop polling', async ($, on) => {
  const { clock, state } = host(on);
  state.imageDelay = 1000; state.draft = '[Image #1]';
  await $.session.start(START);
  await clock.advance(500);
  state.root = '/other'; state.id = '70b13e72-306e-406f-86c5-f5541ef749f5'; state.draft = '';
  await clock.advance(1500);
  const ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: 'Image' })).toBeUndefined();
  await $.session.end({ reason: 'clear', sessionId: state.id, resume: { id: state.id } });
  state.imageDelay = 0; state.draft = '[Image #2]';
  await clock.advance(500);
  await ui.find({ type: 'Text' });
  await clock.advance(500);
  expect(await ui.find({ type: 'Image' })).toBeDefined();
  expect(state.requests.at(-1)?.argv).toContain('/other');
  await ui.unmount();
});

test('Read inline image preserves engine result and converts bytes without reading its source path', async ($, on) => {
  const { clock, state } = host(on);
  await $.session.start(START);
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolResult', requestId: 'read1', viewport: { columns: 80, rows: 30, isFullscreen: false }, props: { tool_use_id: 'read1', tool: 'Read', isErrored: false, output: { type: 'image', file: { base64: PNG, type: 'image/png', originalSize: 70 } } } });
  await clock.settle();
  expect(await ui.find({ type: 'Text', text: '原生輸出' })).toBeDefined();
  expect(await ui.find({ type: 'Image' })).toBeDefined();
  expect(state.requests.at(-1)?.argv.slice(2)).toEqual(['image', '--stdin-base64']);
  expect(state.requests.at(-1)?.input).toBe(PNG);
  await ui.unmount();
});

test('malformed stream and nonzero exit show friendly failure and never echo decoder stderr', async ($, on) => {
  const { state } = host(on);
  state.badExit = true;
  await $.session.start(START);
  await $.command.run(command('chart.png'));
  const ui = await $.ui.mount(PANE);
  expect(await ui.find({ type: 'Text', text: '無法預覽' })).toBeDefined();
  expect(await ui.find({ type: 'Image' })).toBeUndefined();
  state.badExit = false; state.badRecord = true;
  await $.command.run(command('chart.png'));
  expect(await ui.find({ type: 'Text', text: '無法預覽' })).toBeDefined();
  await ui.unmount();
});

test('off stops automatic polling and Read inline but explicit preview remains available', async ($, on) => {
  const { clock, state } = host(on);
  await $.session.start(START);
  await $.command.run(command('off'));
  const reads = state.reads;
  await clock.advance(1000);
  expect(state.reads).toBe(reads);
  await $.command.run(command('chart.png'));
  const ui = await $.ui.mount(PANE);
  expect(await ui.find({ type: 'Image' })).toBeDefined();
  await ui.press({ key: 'close' });
  expect(await ui.find({ type: 'Image' })).toBeUndefined();
  await ui.unmount();
});

test('close cancels even the helper still inspecting video metadata before the first frame', async ($, on) => {
  const { clock, state } = host(on);
  state.inspectDelay = 1000;
  await $.session.start(START);
  const opening = $.command.run(command('movie.mp4'));
  await clock.settle();
  const closing = $.command.run(command('close'));
  await clock.advance(1000);
  await closing; await opening;
  expect(state.stopped).toBeGreaterThan(0);
  const ui = await $.ui.mount(PANE);
  expect(await ui.find({ type: 'Image' })).toBeUndefined();
  await ui.unmount();
});

test('natural video end is visible and a long video is explicitly capped to the first ten minutes', async ($, on) => {
  const { clock, state } = host(on);
  await $.session.start(START);
  await $.command.run(command('movie.mp4'));
  const ui = await $.ui.mount(PANE);
  await clock.advance(10_500);
  expect(await ui.find({ type: 'Text', text: '播放結束' })).toBeDefined();
  state.videoDuration = 900;
  await $.command.run(command('long.mp4'));
  await clock.settle();
  expect(await ui.find({ type: 'Text', text: '本次僅預覽前 10 分鐘' })).toBeDefined();
  const closing = $.command.run(command('close'));
  await clock.advance(300); await closing;
  await ui.unmount();
});

test('Read and composer decoders share two automatic slots and queued previews eventually render', async ($, on) => {
  const { clock, state } = host(on);
  state.imageDelay = 1000;
  state.draft = '[Image #1] [Image #2]';
  await $.session.start(START);
  const rows = [];
  for (const id of ['read-a', 'read-b', 'read-c']) rows.push(await $.ui.mount(readRow(id)));
  await clock.advance(500);
  expect(state.peakImages).toBeLessThanOrEqual(2);
  await clock.advance(3500);
  for (const row of rows) expect(await row.find({ type: 'Image' })).toBeDefined();
  const band = await $.ui.mount(BAND);
  expect((await band.findAll({ type: 'Image' })).length).toBe(2);
  expect(state.activeImages).toBe(0);
  expect(state.requests.filter(request => ['image', 'pasted'].includes(request.argv[2]!)).length).toBe(5);
  for (const row of rows) await row.unmount();
  await band.unmount();
});

test('redrawing more historical Read rows than the image cache never restarts evicted automatic attempts', async ($, on) => {
  const { clock, state } = host(on);
  await $.session.start(START);
  const rows = [];
  for (let i = 0; i < 20; i++) {
    rows.push(await $.ui.mount(readRow(`history-${i}`)));
    await clock.settle();
  }
  const starts = state.requests.length;
  for (const row of rows) await row.find({ type: 'Text' });
  await clock.settle();
  for (const row of rows) await row.find({ type: 'Text' });
  await clock.settle();
  expect(state.requests.length).toBe(starts);
  for (const row of rows) await row.unmount();
});

test('an open waiting for an old decoder return cannot resurrect a pane after session.end', async ($, on) => {
  const { clock, state } = host(on);
  state.returnDelay = 1000;
  await $.session.start(START);
  await $.command.run(command('movie.mp4'));
  await clock.settle();
  const opened = state.opened;
  const pending = $.command.run(command('chart.png'));
  await clock.settle();
  const ending = $.session.end({ reason: 'prompt_input_exit', sessionId: state.id, resume: { id: state.id } });
  await clock.advance(2000);
  await ending; await pending;
  expect(state.opened).toBe(opened);
  expect(state.requests.some(request => request.argv.includes('chart.png'))).toBe(false);
  expect(state.activeVideo).toBe(0);
  const ui = await $.ui.mount(PANE);
  expect(await ui.find({ type: 'Image' })).toBeUndefined();
  await ui.unmount();
});

test('seeking near the capped duration ends the player and decoder instead of decoding beyond ten minutes', async ($, on) => {
  const { clock, state } = host(on);
  state.videoDuration = 1200;
  state.initialVideoTime = 594;
  await $.session.start(START);
  await $.command.run(command('long.mp4'));
  await clock.settle();
  const ui = await $.ui.mount(PANE);
  const seeking = ui.press({ key: 'seek-forward' });
  await clock.advance(300); await seeking;
  expect(state.requests.at(-1)?.argv.at(-1)).toBe('599');
  await clock.advance(2500);
  expect(await ui.find({ type: 'Text', text: '播放結束' })).toBeDefined();
  expect(state.activeVideo).toBe(0);
  await ui.unmount();
});

test('Read awaiting the native baseline never schedules automatic decoding after session.end', async ($, on) => {
  const { clock, state } = host(on);
  state.renderDelay = 500;
  await $.session.start(START);
  const mounting = $.ui.mount(readRow('delayed-baseline'));
  await clock.settle();
  await $.session.end({ reason: 'prompt_input_exit', sessionId: state.id, resume: { id: state.id } });
  state.renderDelay = 0;
  await clock.advance(500);
  const ui = await mounting;
  expect(state.requests.length).toBe(0);
  expect(await ui.find({ type: 'Image' })).toBeUndefined();
  await ui.unmount();
});

test('replay after a seek awaiting delayed cleanup keeps the latest offset and one decoder', async ($, on) => {
  const { clock, state } = host(on);
  state.videoDuration = 30; state.initialVideoTime = 10; state.returnDelay = 1000;
  await $.session.start(START);
  await $.command.run(command('movie.mp4')); await clock.settle();
  const ui = await $.ui.mount(PANE);
  state.initialVideoTime = 0;
  const seeking = ui.press({ key: 'seek-forward' }); await clock.settle();
  const replaying = ui.press({ key: 'replay' }); await clock.settle();
  await clock.advance(1500); await seeking; await replaying;
  const offsets = state.requests.filter(request => request.argv[2] === 'video').map(request => request.argv.at(-1));
  try {
    expect(offsets).toEqual(['0', '0']);
    expect(state.activeVideo).toBe(1);
  } finally {
    const ending = $.session.end({ reason: 'prompt_input_exit', sessionId: state.id, resume: { id: state.id } });
    await clock.advance(2000); await ending; await ui.unmount();
  }
  expect(state.activeVideo).toBe(0);
});

test('pause after a seek awaiting delayed cleanup cancels that pending play intent', async ($, on) => {
  const { clock, state } = host(on);
  state.videoDuration = 30; state.initialVideoTime = 10; state.returnDelay = 1000;
  await $.session.start(START);
  await $.command.run(command('movie.mp4')); await clock.settle();
  const ui = await $.ui.mount(PANE);
  const seeking = ui.press({ key: 'seek-forward' }); await clock.settle();
  const pausing = ui.press({ key: 'pause' }); await clock.settle();
  await clock.advance(1500); await seeking; await pausing;
  try {
    expect(state.requests.filter(request => request.argv[2] === 'video').map(request => request.argv.at(-1))).toEqual(['0']);
    expect(state.activeVideo).toBe(0);
    expect(await ui.find({ type: 'Text', text: '暫停' })).toBeDefined();
    expect(await ui.find({ type: 'Button', key: 'play' })).toBeDefined();
  } finally {
    const ending = $.session.end({ reason: 'prompt_input_exit', sessionId: state.id, resume: { id: state.id } });
    await clock.advance(2000); await ending; await ui.unmount();
  }
});

test('successful video blits redraw the clock once per displayed second with automatic previews off', { timeoutMs: 10_000 }, async ($, on) => {
  const { clock, state } = host(on);
  state.videoDuration = 30;
  await $.session.start(START);
  await $.command.run(command('off'));
  await $.command.run(command('movie.mp4')); await clock.settle();
  const ui = await $.ui.mount(PANE);
  const before = state.invalidations;
  try {
    state.videoFrameTime = 5; await clock.advance(250);
    expect(state.blits.length).toBe(1);
    expect(state.invalidations - before).toBe(1);
    expect(await ui.find({ type: 'Text', text: '0:05 / 0:30' })).toBeDefined();
    state.videoFrameTime = 5.125; await clock.advance(250);
    expect(state.invalidations - before).toBe(1);
    state.videoFrameTime = 6; await clock.advance(250);
    expect(state.invalidations - before).toBe(2);
    expect(await ui.find({ type: 'Text', text: '0:06 / 0:30' })).toBeDefined();
  } finally {
    const ending = $.session.end({ reason: 'prompt_input_exit', sessionId: state.id, resume: { id: state.id } });
    await clock.advance(300); await ending; await ui.unmount();
  }
  expect(state.activeVideo).toBe(0);
});

const reply = (text: string, isFirstOfReply = true, surface: 'terminal' | 'desktop' = 'terminal') => ({ plugin: PLUGIN, surface, component: 'AssistantMessage', requestId: 'reply1', viewport: { columns: 80, rows: 30, isFullscreen: true }, props: { text, isFirstOfReply } } as const);
const HREF = 'file:///work/content/a.png';
const helperCalls = (state: { requests: ProcessSpawnRequest[] }) => state.requests.map(request => request.argv.slice(2));

test('a reply without a media path keeps the engine drawing', async ($, on) => {
  host(on);
  await $.session.start(START);
  for (const text of ['All done, see README.md and src/main.ts', 'see /etc/a.png', `${'x'.repeat(10_001)} a/b.png`]) {
    const ui = await $.ui.mount(reply(text));
    expect(await ui.find({ type: 'Text', text: '原生輸出' })).toBeDefined();
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined();
    await ui.unmount();
  }
});

test('a reply naming an image path draws the path as a link the Mod answers, in the core row layout', async ($, on) => {
  host(on);
  await $.session.start(START);
  const ui = await $.ui.mount(reply('Saved `content/a.png`.'));
  const markdown = await ui.find({ type: 'Markdown', key: 'reply-paths' });
  expect(markdown?.props.text).toBe(`Saved [\`content/a.png\`](${HREF}).`);
  expect(markdown?.props.pressableLinks).toEqual([HREF]);
  expect(await ui.find({ type: 'Text', text: '⏺' })).toBeDefined();
  expect((await ui.find({ type: 'Box' }))?.props).toEqual(expect.objectContaining({ flexDirection: 'row', marginTop: 1 }));
  await ui.unmount();
  const continued = await $.ui.mount(reply('Saved `content/a.png`.', false));
  expect(await continued.find({ type: 'Text', text: '⏺' })).toBeUndefined();
  await continued.unmount();
});

test('pressing the path opens the preview pane through the root-checked helper', async ($, on) => {
  const { clock, state } = host(on);
  await $.session.start(START);
  const ui = await $.ui.mount(reply('Saved `content/a.png`.'));
  await ui.press({ key: 'reply-paths', link: { href: HREF } });
  await clock.settle();
  expect(state.opened).toBe(1);
  expect(helperCalls(state)).toEqual([['inspect', '--root', '/work', '--path', '/work/content/a.png'], ['image', '--root', '/work', '--path', '/work/content/a.png']]);
  const pane = await $.ui.mount(PANE);
  expect(await pane.find({ type: 'Image' })).toBeDefined();
  await pane.unmount(); await ui.unmount();
});

test('a press whose href was rewritten to a path it never drew spawns nothing', async ($, on) => {
  const { clock, state } = host(on);
  on('ui.press', ($, e, next) => next({ ...e, link: { href: 'file:///etc/a.png' } }));
  await $.session.start(START);
  const ui = await $.ui.mount(reply('Saved `content/a.png`.'));
  await ui.press({ key: 'reply-paths', link: { href: HREF } });
  await clock.settle();
  expect(state.requests.length).toBe(0);
  expect(state.opened).toBe(0);
  await ui.unmount();
});

test('replies stay core-drawn on the main screen, where no click reaches a link', async ($, on) => {
  host(on);
  await $.session.start(START);
  const main = { ...reply('Saved `content/a.png`.'), viewport: { columns: 80, rows: 30, isFullscreen: false } };
  const ui = await $.ui.mount(main);
  expect(await ui.find({ type: 'Text', text: '原生輸出' })).toBeDefined();
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined();
  await ui.unmount();
});

test('replies stay core-drawn off the terminal and in non-interactive sessions', async ($, on) => {
  host(on);
  await $.session.start({ ...START, isInteractive: false });
  const quiet = await $.ui.mount(reply('Saved `content/a.png`.'));
  expect(await quiet.find({ type: 'Markdown' })).toBeUndefined();
  await quiet.unmount();
  await $.session.start(START);
  const desktop = await $.ui.mount(reply('Saved `content/a.png`.', true, 'desktop'));
  expect(await desktop.find({ type: 'Markdown' })).toBeUndefined();
  await desktop.unmount();
});

test('clickablePaths off keeps every reply core-drawn', { options: { clickablePaths: false } }, async ($, on) => {
  host(on);
  await $.session.start(START);
  const ui = await $.ui.mount(reply('Saved `content/a.png`.'));
  expect(await ui.find({ type: 'Text', text: '原生輸出' })).toBeDefined();
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined();
  await ui.unmount();
});

test('an idle composer poll redraws nothing, so reply rows are not re-run every half second', async ($, on) => {
  const { clock, state } = host(on);
  await $.session.start(START);
  await clock.advance(600);
  const before = state.invalidations;
  await clock.advance(5_000);
  expect(state.reads).toBeGreaterThan(5);
  expect(state.invalidations).toBe(before);
});

test('a reply naming no media file is answered before any engine call', { options: { autoPreview: false } }, async ($, on) => {
  const { state } = host(on);
  await $.session.start(START);
  const ui = await $.ui.mount(reply('All done; notes in docs/readme.md, cover.pngx and a/b.png_old'));
  expect(await ui.find({ type: 'Text', text: '原生輸出' })).toBeDefined();
  expect(state.roots).toBe(0);
  await ui.unmount();
});

test('a second path press replaces the pane and stops the first helper', { timeoutMs: 10_000 }, async ($, on) => {
  const { clock, state } = host(on);
  await $.session.start(START);
  const ui = await $.ui.mount(reply('Clip `clip/a.mp4` and still `img/b.png`.'));
  try {
    await ui.press({ key: 'reply-paths', link: { href: 'file:///work/clip/a.mp4' } });
    await clock.advance(300);
    expect(state.activeVideo).toBe(1);
    const replacing = ui.press({ key: 'reply-paths', link: { href: 'file:///work/img/b.png' } });
    await clock.advance(300); await replacing; await clock.settle();
    expect(state.activeVideo).toBe(0);
    expect(helperCalls(state).at(-1)).toEqual(['image', '--root', '/work', '--path', '/work/img/b.png']);
    const pane = await $.ui.mount(PANE);
    expect(await pane.find({ type: 'Image' })).toBeDefined();
    await pane.unmount();
  } finally {
    const ending = $.session.end({ reason: 'prompt_input_exit', sessionId: state.id, resume: { id: state.id } });
    await clock.advance(300); await ending; await ui.unmount();
  }
});
