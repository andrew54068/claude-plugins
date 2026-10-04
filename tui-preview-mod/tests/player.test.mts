import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NdjsonParser } from '../hooks/protocol.js';
import { Player } from '../hooks/player.js';

const frame = { type: 'frame', png: 'iVBORw0KGgo=', time: 1, width: 1, height: 1 } as const;
test('fragmented NDJSON yields records only when complete', () => {
  const parser = new NdjsonParser();
  const input = JSON.stringify(frame) + '\n' + JSON.stringify({ type: 'end' }) + '\n';
  const actual = [];
  for (const chunk of input.match(/.{1,7}|\n/g)!) actual.push(...parser.push(chunk));
  parser.finish();
  assert.deepEqual(actual, [frame, { type: 'end' }]);
});
test('parser rejects oversized incomplete chunks, schema errors and truncated records', () => {
  assert.throws(() => new NdjsonParser(32).push('x'.repeat(33)), /limit/i);
  assert.throws(() => new NdjsonParser().push('{"type":"frame","png":"oops","time":-1}\n'), /record/i);
  const parser = new NdjsonParser(); parser.push('{');
  assert.throws(() => parser.finish(), /truncated/i);
  assert.throws(() => new NdjsonParser().push('{invalid}\n'), /JSON/i);
});
test('record parser rejects terminal controls and a base64 payload beyond decoded limit', () => {
  const controls = { type: 'error', code: 'DECODE', message: '\x1b[31m' };
  assert.throws(() => new NdjsonParser().push(JSON.stringify(controls) + '\n'), /record/i);
  const png = 'iVBORw0KGgo' + 'A'.repeat(2_796_204 - 11);
  assert.throws(() => new NdjsonParser().push(JSON.stringify({ ...frame, png }) + '\n'), /record|limit/i);
});
test('header kind must be a supported string rather than a coercible array', () => {
  const header = { type: 'header', kind: 'video', name: 'clip.mp4', media: 'video/mp4' };
  assert.deepEqual(new NdjsonParser().push(JSON.stringify(header) + '\n'), [header]);
  for (const kind of [['video'], ['image'], ['markdown'], null, 1, {}]) {
    assert.throws(() => new NdjsonParser().push(JSON.stringify({ ...header, kind }) + '\n'), /record/i);
  }
});
test('player pauses, seeks, ends and rejects stale decoder generations', () => {
  const player = new Player(5);
  const first = player.play();
  assert.equal(player.acceptFrame(first, frame), true);
  assert.equal(player.position, 1);
  player.pause();
  assert.equal(player.status, 'paused');
  assert.equal(player.acceptFrame(first, { ...frame, time: 2 }), false);
  const second = player.seek(4);
  assert.equal(player.position, 4);
  assert.equal(player.acceptFrame(first, frame), false);
  assert.equal(player.acceptFrame(second, { ...frame, time: 4.125 }), true);
  assert.equal(player.end(first), false);
  assert.equal(player.end(second), true);
  assert.equal(player.status, 'ended');
  const replay = player.play();
  assert.equal(player.position, 0);
  assert.equal(player.acceptFrame(replay, { ...frame, time: 0 }), true);
  player.close();
  assert.equal(player.status, 'closed');
  assert.equal(player.acceptFrame(replay, frame), false);
  assert.throws(() => player.play(), /closed/i);
});
test('player clamps seeking and refuses regressing timestamps or invalid durations', () => {
  assert.throws(() => new Player(Infinity), /duration/i);
  const player = new Player(5);
  assert.equal(player.seek(-10), 1);
  assert.equal(player.position, 0);
  const generation = player.play();
  assert.equal(player.acceptFrame(generation, frame), true);
  assert.equal(player.acceptFrame(generation, { ...frame, time: 0.5 }), false);
  player.seek(10); assert.equal(player.position, 5);
  assert.throws(() => player.seek(NaN), /seek/i);
});
