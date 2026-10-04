import type { FrameRecord } from './protocol.js';
export type PlayerStatus = 'paused' | 'playing' | 'ended' | 'closed';

/** Owns playback state only. The caller aborts its decoder whenever generation changes. */
export class Player {
  status: PlayerStatus = 'paused';
  position = 0;
  generation = 0;
  constructor(readonly duration: number) {
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid video duration');
  }
  play(): number {
    this.assertOpen();
    if (this.status === 'ended' || this.position >= this.duration) this.position = 0;
    this.status = 'playing';
    return ++this.generation;
  }
  pause(): void { this.assertOpen(); this.status = 'paused'; ++this.generation; }
  seek(position: number): number {
    this.assertOpen();
    if (!Number.isFinite(position)) throw new Error('Invalid seek position');
    this.position = Math.max(0, Math.min(this.duration, position));
    this.status = this.position >= this.duration ? 'ended' : 'playing';
    return ++this.generation;
  }
  acceptFrame(generation: number, frame: FrameRecord): boolean {
    if (this.status !== 'playing' || generation !== this.generation || !Number.isFinite(frame.time)
      || frame.time < this.position || frame.time > this.duration) return false;
    this.position = frame.time;
    return true;
  }
  end(generation: number): boolean {
    if (this.status !== 'playing' || generation !== this.generation) return false;
    this.status = 'ended'; ++this.generation;
    return true;
  }
  close(): void { this.status = 'closed'; ++this.generation; }
  private assertOpen(): void { if (this.status === 'closed') throw new Error('Player is closed'); }
}
