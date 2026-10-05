import type { CoreEngineInterface, HookStream, ProcessSpawnChunk, ProcessSpawnResult, Register, RenderInput, RenderElement, Timer, PluginOptions } from 'claude-code';
import { NdjsonParser } from './protocol.ts';
import type { HeaderRecord, FrameRecord, MarkdownRecord } from './protocol.ts';
import { Player } from './player.ts';
import { hyperlinkTerminal, linkifyMediaPaths, mentionsMedia, pathFromHref } from './links.ts';

type Api = CoreEngineInterface;
type Job = { stream: HookStream<ProcessSpawnChunk, ProcessSpawnResult>; stopped: boolean; stopping?: Promise<void> };
type View = {
  header?: HeaderRecord; frame?: FrameRecord; pages: MarkdownRecord[]; page: number;
  loading: boolean; error: string; source?: string[]; player?: Player; job?: Job;
  mount?: { requestId: string; columns: number; rows: number }; generation: number; automaticPending?: boolean; displayedSecond?: number;
};
type Attachment = { id: number; key: string; root: string; sessionId: string; view: View };
type AutomaticTask = { target: View; args: string[]; current: () => boolean; input?: string };
const view = (): View => ({ pages: [], page: 0, loading: true, error: '', generation: 0 });
const message = (code: string) => ({ DEPENDENCY: '需要 ffmpeg 與 ffprobe，請先安裝後再預覽。', ROOT: '檔案不在允許的預覽目錄內。', LIMIT: '檔案或影格超過預覽上限。', FORMAT: '不支援這個檔案格式。', PATH: '請選擇允許目錄內的本機一般檔案。', IO: '找不到檔案，或目前無法讀取。', ARGS: '請提供有效的檔案路徑。', DECODE: '無法解碼這個媒體檔案。' }[code] ?? '預覽程序失敗，請重新開啟。');
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  let options: PluginOptions = {};
  let automatic = true;
  let clickable = true;
  let hyperlinks = false;
  let interactive = false;
  let polling: Timer | undefined;
  let pollBusy = false;
  let resetting = false;
  let epoch = 0;
  let paneOperation = 0;
  let sessionKey = '';
  let pane: View | undefined;
  let attachments = new Map<number, Attachment>();
  let snapshot: Attachment[] = [];
  let shownBand = '';
  const inline = new Map<string, { data: string; view: View }>();
  const jobs = new Set<Job>();
  const automaticQueue: AutomaticTask[] = [];
  const automaticRunning = new Set<AutomaticTask>();
  // Tombstones outlive the 16 decoded-image entries; redraw never retries an eviction.
  const attemptedReads = new Set<string>();

  const redraw = ($: Api) => $.ui.invalidate('ui.render');
  const argv = ($: Api, args: string[]) => ['node', `${$.plugin.root}/scripts/media.mjs`, ...args];
  function stopJob(job: Job) {
    job.stopped = true;
    job.stopping ??= job.stream.return({ code: null, signal: 'SIGTERM' }).then(() => undefined).catch(() => undefined);
    return job.stopping;
  }
  async function stop(target?: View) {
    for (let i = automaticQueue.length - 1; i >= 0; i--) {
      if (automaticQueue[i]?.target === target) automaticQueue.splice(i, 1);
    }
    if (target) target.automaticPending = false;
    if (!target?.job) return;
    const job = target.job;
    // Retain the job until return finishes so later operations share its cleanup.
    await stopJob(job);
    if (target.job === job) target.job = undefined;
    jobs.delete(job);
  }
  async function reset() {
    resetting = true;
    epoch++;
    paneOperation++;
    polling?.cancel(); polling = undefined;
    pane?.player?.close(); pane = undefined;
    attachments.clear(); snapshot = []; sessionKey = ''; shownBand = ''; inline.clear();
    automaticQueue.length = 0; attemptedReads.clear();
    const closing = [...jobs];
    await Promise.all(closing.map(stopJob));
    jobs.clear();
    resetting = false;
  }
  function enqueueAutomatic($: Api, target: View, args: string[], current: () => boolean, input?: string) {
    if (target.automaticPending || target.job || !current()) return;
    target.automaticPending = true;
    automaticQueue.push({ target, args, current, ...(input === undefined ? {} : { input }) });
    pumpAutomatic($);
  }
  function pumpAutomatic($: Api) {
    if (!automatic || resetting) return;
    while (automaticRunning.size < 2 && automaticQueue.length) {
      const task = automaticQueue.shift()!;
      if (!task.current()) { task.target.automaticPending = false; continue; }
      automaticRunning.add(task);
      void consume($, task.args, task.target, task.current, task.input).catch(() => {
        if (task.current()) {
          task.target.error = `無法預覽：${message('DECODE')}`;
          task.target.loading = false; redraw($);
        }
      }).finally(() => {
        automaticRunning.delete(task); task.target.automaticPending = false;
        pumpAutomatic($);
      });
    }
  }
  async function consume($: Api, args: string[], target: View, current: () => boolean, input?: string, playerGeneration?: number) {
    const job: Job = { stream: $.process.spawn({ argv: args, ...(input === undefined ? {} : { input }) }), stopped: false };
    job.stream.result.catch(() => undefined);
    target.job = job; jobs.add(job);
    const parser = new NdjsonParser();
    let ended = false;
    let capped = false;
    let headerSeen = false;
    try {
      let step = await job.stream.next();
      media: while (!step.done) {
        if (job.stopped || !current()) return 'CANCELLED';
        if (step.value.stream === 'stdout') {
          for (const record of parser.push(step.value.text)) {
            if (job.stopped || !current()) return 'CANCELLED';
            if (ended) throw new Error('PROTOCOL');
            if (record.type === 'error') throw new Error(record.code);
            if (record.type === 'header') {
              if (headerSeen || (target.header && record.kind !== target.header.kind)) throw new Error('PROTOCOL');
              headerSeen = true; target.header = record;
            } else if (record.type === 'end') {
              if (!headerSeen) throw new Error('PROTOCOL');
              ended = true;
            } else {
              if (!headerSeen) throw new Error('PROTOCOL');
              if (record.type === 'markdown') {
                if (target.header?.kind !== 'markdown' || record.page !== target.pages.length + 1) throw new Error('PROTOCOL');
                target.pages.push(record); target.loading = false; redraw($);
              } else {
                if (target.header?.kind === 'markdown') throw new Error('PROTOCOL');
                if (target.player && playerGeneration !== undefined && target.player.generation === playerGeneration && record.time >= target.player.duration) {
                  target.player.acceptFrame(playerGeneration, { ...record, time: target.player.duration });
                  if (record.time === target.player.duration) target.frame = record;
                  target.player.end(playerGeneration); target.loading = false;
                  capped = true; redraw($);
                  // Exit this consumer, then return the host stream in finally; never await stop() on our own job.
                  break media;
                }
                if (target.player && (playerGeneration === undefined || !target.player.acceptFrame(playerGeneration, record))) continue;
                target.frame = record; target.loading = false;
                const second = target.player ? Math.floor(target.player.position) : undefined;
                const clockChanged = second !== undefined && second !== target.displayedSecond;
                target.displayedSecond = second;
                if (target.mount) {
                  const result = await $.ui.blit({ requestId: target.mount.requestId, key: 'media', source: { png: record.png }, columns: target.mount.columns, rows: target.mount.rows });
                  if (result.deny || clockChanged) redraw($);
                } else redraw($);
              }
            }
          }
        }
        step = await job.stream.next();
      }
      if (capped) return;
      if (job.stopped || !current()) return 'CANCELLED';
      if (!step.done) throw new Error('PROTOCOL');
      parser.finish();
      if (step.value.code !== 0 || step.value.signal || !ended) throw new Error('DECODE');
      target.loading = false;
      if (target.player && playerGeneration !== undefined) target.player.end(playerGeneration);
      redraw($);
    } catch (error) {
      if (!job.stopped && current()) {
        target.error = `無法預覽：${message(error instanceof Error ? error.message : 'DECODE')}`;
        target.frame = undefined; target.pages = []; target.loading = false;
        if (target.player?.status === 'playing') target.player.pause();
        redraw($);
      }
      return error instanceof Error ? error.message : 'DECODE';
    } finally {
      // Leaving the host stream is what kills the helper and its decoder.
      await stopJob(job);
      if (target.job === job) target.job = undefined;
      jobs.delete(job);
    }
  }
  async function openPane($: Api, target: View) {
    const operation = ++paneOperation;
    if (pane !== target) {
      const previous = pane;
      previous?.player?.close(); await stop(previous);
      if (operation !== paneOperation || resetting) return false;
      pane = target;
    }
    if (operation !== paneOperation || resetting) return false;
    await $.ui.open({ id: 'preview', title: target.header?.name ?? '預覽', focus: true, closeOnEscape: true, rows: 24 });
    if (operation !== paneOperation || pane !== target) return false;
    redraw($);
    return true;
  }
  async function closePane($: Api, closeSurface = true) {
    const operation = ++paneOperation;
    const previous = pane; pane = undefined;
    previous?.player?.close(); await stop(previous);
    if (operation !== paneOperation) return;
    redraw($);
    if (closeSurface && !pane) await $.ui.close({ id: 'preview' });
  }
  async function openInline($: Api, data: string) {
    const target = view();
    if (!await openPane($, target)) return;
    await consume($, argv($, ['image', '--stdin-base64']), target, () => pane === target, data);
  }
  async function play($: Api, target: View, seek?: number) {
    if (pane !== target || !target.player || !target.source || resetting) return;
    // New intent invalidates old frames and pending play handlers before any await.
    const own = ++target.generation;
    const player = target.player;
    const generation = seek === undefined ? player.play() : player.seek(seek);
    target.error = ''; target.loading = !target.frame; redraw($);
    await stop(target);
    if (pane !== target || resetting || target.generation !== own || target.player !== player || player.generation !== generation || player.status !== 'playing') return;
    void consume($, argv($, ['video', ...target.source, '--start', String(player.position)]), target,
      () => pane === target && target.generation === own && target.player?.generation === generation, undefined, generation);
  }
  const extraRoots = () => Array.isArray(options.roots) ? options.roots.filter((value): value is string => typeof value === 'string' && value.startsWith('/')).slice(0, 32) : [];
  async function inspect($: Api, path: string, target: View, current: () => boolean) {
    const root = await $.session.root();
    const extra = extraRoots();
    let reason = 'ROOT';
    for (const allowed of [root, ...extra]) {
      const source = ['--root', allowed, '--path', path];
      if (!current()) throw new Error('CANCELLED');
      target.header = undefined; target.error = '';
      const failure = await consume($, argv($, ['inspect', ...source]), target, current);
      if (!current()) throw new Error('CANCELLED');
      if (!failure && target.header) return { header: target.header as HeaderRecord, source };
      reason = failure ?? 'DECODE';
      if (!['ROOT', 'IO'].includes(reason)) break;
    }
    throw new Error(reason);
  }
  // `/preview <path>` and a pressed reply path share one opening: same cancel and decoder semantics.
  async function previewPath($: Api, path: string) {
    const target = view();
    if (!await openPane($, target)) return '預覽已取消。';
    const own = ++target.generation;
    try {
      const result = await inspect($, path, target, () => pane === target && target.generation === own);
      if (pane !== target || target.generation !== own) return '預覽已取消。';
      target.header = result.header; target.source = result.source;
      target.loading = true;
      if (result.header.kind === 'video') {
        target.player = new Player(Math.min(600, result.header.duration ?? 0));
        await play($, target);
      } else await consume($, argv($, [result.header.kind, ...result.source]), target, () => pane === target && target.generation === own);
      redraw($);
    } catch (error) {
      if (pane === target) { target.error = `無法預覽：${message(error instanceof Error ? error.message : 'DECODE')}`; target.loading = false; redraw($); }
    }
    return target.error || `已開啟預覽：${target.header?.name ?? '檔案'}。`;
  }
  async function poll($: Api) {
    if (!interactive || !automatic || pollBusy || resetting) return;
    pollBusy = true;
    const own = epoch;
    try {
      const [draft, root, id] = await Promise.all([$.prompt.read(), $.session.root(), $.session.id()]);
      if (own !== epoch || !automatic || !interactive) return;
      const key = `${id}\n${root}`;
      if (key !== sessionKey) {
        for (const item of attachments.values()) void stop(item.view);
        attachments.clear(); snapshot = []; sessionKey = key;
      }
      const ids = [...new Set([...draft.text.matchAll(/\[Image #([1-9][0-9]{0,8})\]/g)].map(match => Number(match[1])))].slice(0, 200);
      for (const [number, item] of attachments) {
        if (!ids.includes(number)) { attachments.delete(number); void stop(item.view); }
      }
      for (const number of ids) {
        if (attachments.has(number)) continue;
        const item: Attachment = { id: number, key, root, sessionId: id, view: view() };
        attachments.set(number, item);
      }
      // Decode only visible thumbnails. Other attachments load on an explicit press.
      for (const number of ids.slice(0, 2)) {
        const item = attachments.get(number)!;
        if (item.view.frame || item.view.job || item.view.automaticPending || item.view.error) continue;
        enqueueAutomatic($, item.view, argv($, ['pasted', '--session-id', id, '--cwd', root, '--image-id', String(number)]),
          () => own === epoch && automatic && sessionKey === key && attachments.get(number) === item);
      }
      if (ids.length) snapshot = ids.map(number => attachments.get(number)!);
      // Redraw only when the pasted-image band would change: a redraw re-runs every reply row too.
      const band = [...attachments.values()].map(item => `${item.id}${item.view.frame ? 'f' : ''}${item.view.job ? 'j' : ''}${item.view.error ? 'e' : ''}`).join(' ');
      if (band !== shownBand) { shownBand = band; redraw($); }
    } catch { /* No clipboard/history fallback; retry the current snapshot next tick. */ }
    finally { pollBusy = false; }
  }
  // Each name is a literal so `claude plugin validate` lists what is read.
  async function terminalEnv($: Api) {
    const [FORCE_HYPERLINK, CI, WT_SESSION, TERM_PROGRAM, TERM_PROGRAM_VERSION, VTE_VERSION, TERM, TERMINAL_EMULATOR, TMUX, LC_TERMINAL] = await Promise.all([
      $.env.get('FORCE_HYPERLINK'), $.env.get('CI'), $.env.get('WT_SESSION'), $.env.get('TERM_PROGRAM'), $.env.get('TERM_PROGRAM_VERSION'),
      $.env.get('VTE_VERSION'), $.env.get('TERM'), $.env.get('TERMINAL_EMULATOR'), $.env.get('TMUX'), $.env.get('LC_TERMINAL'),
    ]);
    return { FORCE_HYPERLINK, CI, WT_SESSION, TERM_PROGRAM, TERM_PROGRAM_VERSION, VTE_VERSION, TERM, TERMINAL_EMULATOR, TMUX, LC_TERMINAL };
  }
  function ensurePolling($: Api) {
    if (interactive && automatic && !polling && !resetting) {
      polling = $.clock.every(500, () => { void poll($); });
    }
  }
  function image($: Api, e: RenderInput<'Pane' | 'AbovePrompt' | 'ToolResult', 'terminal'>, target: View, maxColumns: number, maxRows: number, key = 'media') {
    if (!target.frame) return undefined;
    // Terminal cells are about twice as tall as wide; derive fit from decoded pixels.
    let columns = Math.max(1, Math.min(255, maxColumns));
    let rows = Math.max(1, Math.round(columns * target.frame.height / target.frame.width / 2));
    if (rows > maxRows) { rows = Math.max(1, Math.min(255, maxRows)); columns = Math.max(1, Math.min(columns, Math.round(rows * target.frame.width / target.frame.height * 2))); }
    if (key === 'media') target.mount = { requestId: e.requestId, columns, rows };
    return $.ui.resolve(e).Image({ key, source: { png: target.frame.png }, columns, rows, alt: target.header?.name ?? '圖片預覽' });
  }
export const register: Register = (on, configuration) => {
  options = configuration;
  automatic = options.autoPreview !== false;
  clickable = options.clickablePaths !== false;
  on('session.start', async ($, e, next) => {
    await reset();
    interactive = e.isInteractive && e.surface === 'terminal';
    // Where Claude Code draws a link as `text (url)` no press reaches it, so replies keep core's drawing there.
    hyperlinks = interactive && hyperlinkTerminal(await terminalEnv($));
    if (hyperlinks) redraw($);
    await $.command.register({ name: 'preview', description: '預覽 Markdown、圖片、影片與貼圖', argumentHint: '<路徑>|pasted|close|on|off', immediate: true });
    ensurePolling($);
    return next(e);
  });
  on('session.end', async ($, e, next) => {
    interactive = interactive && ['clear', 'resume'].includes(e.reason);
    await reset(); redraw($);
    return next(e);
  });
  on('command.run', { command: 'preview' }, async ($, e) => {
    ensurePolling($);
    const text = e.args.trim();
    if (!text) return { text: '用法：/preview <路徑>、pasted、close、on、off。影片無聲音；按 Esc 關閉預覽。' };
    if (text === 'close') { await closePane($); return { text: '已關閉預覽。' }; }
    if (text === 'on' || text === 'off') {
      automatic = text === 'on';
      if (!automatic) {
        polling?.cancel(); polling = undefined;
        for (const item of attachments.values()) void stop(item.view);
        for (const item of inline.values()) void stop(item.view);
        attachments.clear(); inline.clear(); snapshot = []; epoch++;
        automaticQueue.length = 0; attemptedReads.clear();
      } else ensurePolling($);
      redraw($);
      return { text: automatic ? '已開啟自動圖片預覽。' : '已關閉自動圖片預覽；仍可使用 /preview <路徑>。' };
    }
    if (text === 'pasted') {
      const sessionEpoch = epoch;
      const [root, id] = await Promise.all([$.session.root(), $.session.id()]);
      if (sessionEpoch !== epoch) return { text: '預覽已取消。' };
      const items = snapshot.filter(item => item.key === `${id}\n${root}` && item.view.frame);
      if (!items.length) return { text: '目前沒有可預覽的工作階段貼圖。請貼上圖片並等待半秒。SSH 需先將 client 圖片傳到遠端輸入框。' };
      if (!await openPane($, { ...items[0]!.view, job: undefined, mount: undefined })) return { text: '預覽已取消。' };
      return { text: '已開啟貼圖預覽；原輸入內容不會改寫。' };
    }
    const path = ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) ? text.slice(1, -1) : text;
    return { text: await previewPath($, path) };
  });
  on('ui.close', { id: 'preview' }, async ($, e, next) => { await closePane($, false); return next(e); });
  on('ui.render', { component: 'Pane', requestId: 'preview' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e);
    const { Box, Text, Markdown, Button } = $.ui.resolve(e);
    const target = pane;
    if (!target) return Text({ children: ['目前沒有預覽。'] });
    const children: RenderElement[] = [];
    if (target.error) children.push(Text({ color: 'red', children: [target.error] }));
    else if (target.loading && !target.frame && !target.pages.length) children.push(Text({ children: ['正在準備預覽…'] }));
    const picture = image($, e, target, e.props.bodyColumns, Math.max(1, (e.viewport?.rows ?? 30) - 8));
    if (picture) children.push(picture);
    if (target.pages.length) {
      const page = target.pages[target.page]!;
      children.push(Markdown({ text: page.text }), Text({ children: [`第 ${target.page + 1} / ${target.pages.length} 頁`] }), Box({ flexDirection: 'row', children: [
        Button({ key: 'page-previous', label: '上一頁', hotkey: 'h', onPress: () => { target.page = Math.max(0, target.page - 1); redraw($); } }),
        Button({ key: 'page-next', label: '下一頁', hotkey: 'l', onPress: () => { target.page = Math.min(target.pages.length - 1, target.page + 1); redraw($); } }),
      ] }));
    }
    if (target.player) {
      const player = target.player;
      children.push(Text({ children: [`${({ playing: '播放中', paused: '暫停', ended: '播放結束', closed: '已關閉' })[player.status]}　${time(player.position)} / ${time(player.duration)}　無聲音${(target.header?.duration ?? 0) > 600 ? '（本次僅預覽前 10 分鐘）' : ''}`] }), Box({ flexDirection: 'row', children: [
        player.status === 'playing' ? Button({ key: 'pause', label: '暫停', hotkey: 'p', onPress: async () => { if (pane !== target || player.status === 'closed') return; ++target.generation; player.pause(); await stop(target); redraw($); } }) : Button({ key: 'play', label: '播放', hotkey: 'p', onPress: async () => play($, target) }),
        Button({ key: 'seek-backward', label: '-5 秒', hotkey: 'h', onPress: async () => play($, target, player.position - 5) }),
        Button({ key: 'seek-forward', label: '+5 秒', hotkey: 'l', onPress: async () => play($, target, player.position + 5) }),
        Button({ key: 'replay', label: '重播', hotkey: 'r', onPress: async () => play($, target, 0) }),
      ] }));
    }
    children.push(Button({ key: 'close', label: '關閉（Esc）', hotkey: 'x', role: 'dismiss', onPress: async () => closePane($) }));
    return Box({ flexDirection: 'column', children });
  });
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    ensurePolling($);
    if (e.surface !== 'terminal' || !automatic || e.props.hasSurvey || !attachments.size) return next(e);
    const { Box, Text, Button } = $.ui.resolve(e);
    const items = [...attachments.values()];
    const pictures = items.slice(0, 2).map(item => image($, e, item.view, Math.max(1, Math.floor(e.props.bodyColumns / 2) - 1), Math.max(1, Math.min(8, e.props.maxRows - 3)), `pasted-image:${item.id}`)).filter((item): item is RenderElement => !!item);
    return Box({ flexDirection: 'column', children: [Text({ children: [`送出前貼圖預覽（${items.length} 張）`] }), Box({ flexDirection: 'row', children: pictures }), Box({ flexDirection: 'row', children: items.map(item => Button({ key: `pasted:${item.id}`, label: `圖片 ${item.id}${item.view.error ? '：無法預覽' : item.view.job ? '：準備中' : ''}`, onPress: async () => {
      const sessionEpoch = epoch;
      const [root, id] = await Promise.all([$.session.root(), $.session.id()]);
      if (sessionEpoch !== epoch || `${id}\n${root}` !== item.key) return;
      const target = { ...item.view, job: undefined, mount: undefined, error: '' };
      if (!await openPane($, target)) return;
      if (!target.frame) await consume($, argv($, ['pasted', '--session-id', id, '--cwd', root, '--image-id', String(item.id)]), target, () => pane === target);
    } })) })] });
  });
  on('ui.render', { component: 'ToolResult', props: { tool: 'Read' } }, async ($, e, next) => {
    const renderingEpoch = epoch;
    const base = await next(e);
    if (renderingEpoch !== epoch || resetting || !interactive || e.surface !== 'terminal' || !automatic || e.props.isErrored) return base;
    if (e.props.onScreen === null) {
      const hidden = inline.get(e.requestId);
      if (hidden) { void stop(hidden.view); inline.delete(e.requestId); }
      return base;
    }
    const output = e.props.output as { type?: unknown; file?: { base64?: unknown; type?: unknown } } | null;
    const data = output?.file?.base64;
    if (output?.type !== 'image' || typeof data !== 'string' || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(String(output.file?.type)) || data.length > 44_739_244) return base;
    let cached = inline.get(e.requestId);
    if ((!cached || cached.data !== data) && !attemptedReads.has(e.requestId) && attemptedReads.size < 128) {
      if (cached) void stop(cached.view);
      cached = { data, view: view() }; inline.set(e.requestId, cached);
      while (inline.size > 16) { const first = inline.keys().next().value!; void stop(inline.get(first)?.view); inline.delete(first); }
      attemptedReads.add(e.requestId);
      const own = cached; const generation = epoch;
      enqueueAutomatic($, own.view, argv($, ['image', '--stdin-base64']), () => automatic && generation === epoch && inline.get(e.requestId) === own, data);
    }
    const { Box, Text, Button } = $.ui.resolve(e);
    if (!cached || cached.data !== data) return Box({ flexDirection: 'column', children: [base, Button({ key: 'read-preview', label: '顯示圖片', onPress: async () => openInline($, data) })] });
    const picture = image($, e, cached.view, Math.min(80, e.viewport?.columns ?? 80), 16);
    return Box({ flexDirection: 'column', children: [base, ...(picture ? [picture] : [Text({ dimColor: true, children: [cached.view.error || '正在準備圖片預覽…'] })])] });
  });
  // A reply naming media paths is redrawn with those paths as links this Mod answers on a plain
  // click; the stored message and the model's input stay as they were, and nothing is read until then.
  // Only the fullscreen layout of a terminal with clickable links reports a press; elsewhere, and for
  // a reply naming no media file, core's drawing is returned before any engine call.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.viewport?.isFullscreen !== true || !interactive || !clickable || !hyperlinks || resetting || !mentionsMedia(e.props.text)) return next(e);
    const renderingEpoch = epoch;
    const root = await $.session.root();
    const reply = renderingEpoch === epoch ? linkifyMediaPaths(e.props.text, root, extraRoots()) : undefined;
    if (!reply) return next(e);
    const { Box, Text, Markdown } = $.ui.resolve(e);
    // Core's reply row: a margin, the bullet gutter on a reply's first block, then the prose.
    return Box({ flexDirection: 'row', alignItems: 'flex-start', width: '100%', marginTop: 1, children: [
      ...(e.props.isFirstOfReply ? [Box({ minWidth: 2, children: [Text({ children: ['⏺'] })] })] : []),
      Box({ flexDirection: 'column', children: [Markdown({ key: 'reply-paths', text: reply.text, pressableLinks: [...reply.links.keys()], onLinkPress: link => {
        // A hook beneath may rewrite the href: only a path this drawing linked opens.
        const path = pathFromHref(link.href);
        if (path && [...reply.links.values()].includes(path) && interactive && !resetting) void previewPath($, path);
      } })] }),
    ] });
  });
};
