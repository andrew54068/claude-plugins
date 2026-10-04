export type MediaKind = 'markdown' | 'image' | 'video';
export interface HeaderRecord {
  type: 'header'; kind: MediaKind; name: string; media: string;
  width?: number; height?: number; duration?: number;
}
export interface FrameRecord { type: 'frame'; png: string; time: number; width: number; height: number }
export interface MarkdownRecord { type: 'markdown'; text: string; page: number; totalPages: number }
export interface ErrorRecord { type: 'error'; code: string; message: string }
export type MediaRecord = HeaderRecord | FrameRecord | MarkdownRecord | ErrorRecord | { type: 'end' };
export const MAX_RECORD_CHARS = 3 * 1024 * 1024;
const controls = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const dimension = (value: unknown, max: number): boolean => finite(value) && Number.isInteger(value) && value > 0 && value <= max;
const text = (value: unknown, max: number): boolean => typeof value === 'string' && value.length <= max && !controls.test(value);

export function parseRecord(line: string): MediaRecord {
  const record: unknown = JSON.parse(line);
  if (!record || typeof record !== 'object') throw new Error('Invalid media record');
  const r = record as Record<string, unknown>;
  let valid = false;
  switch (r.type) {
    case 'header':
      valid = typeof r.kind === 'string' && ['markdown', 'image', 'video'].includes(r.kind) && text(r.name, 240) && text(r.media, 100)
        && (r.width === undefined || dimension(r.width, 100_000)) && (r.height === undefined || dimension(r.height, 100_000))
        && (r.duration === undefined || finite(r.duration));
      break;
    case 'frame':
      valid = typeof r.png === 'string' && r.png.startsWith('iVBORw0KGgo') && r.png.length <= 2_796_204
        && r.png.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(r.png)
        && r.png.length / 4 * 3 - (r.png.endsWith('==') ? 2 : r.png.endsWith('=') ? 1 : 0) <= 2_097_152
        && finite(r.time) && dimension(r.width, 640) && dimension(r.height, 360);
      break;
    case 'markdown':
      valid = text(r.text, 9000) && dimension(r.totalPages, 2_097_152) && dimension(r.page, Number(r.totalPages));
      break;
    case 'error': valid = text(r.code, 80) && text(r.message, 500); break;
    case 'end': valid = true; break;
  }
  if (!valid) throw new Error('Invalid media record');
  return record as MediaRecord;
}

/** UTF-8 spawn chunks contain base64, never binary image bytes. */
export class NdjsonParser {
  private pending = '';
  constructor(private readonly limit = MAX_RECORD_CHARS) {
    if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_RECORD_CHARS) throw new Error('Invalid record limit');
  }
  push(chunk: string): MediaRecord[] {
    const records: MediaRecord[] = [];
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf('\n', offset);
      const end = newline < 0 ? chunk.length : newline;
      if (this.pending.length + end - offset > this.limit) { this.pending = ''; throw new Error('Media record exceeds limit'); }
      this.pending += chunk.slice(offset, end);
      if (newline < 0) break;
      const line = this.pending; this.pending = '';
      if (line) records.push(parseRecord(line));
      offset = newline + 1;
    }
    return records;
  }
  finish(): void { if (this.pending.length) { this.pending = ''; throw new Error('Truncated media record'); } }
}
