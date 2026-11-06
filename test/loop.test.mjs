// Fixed-step accumulator (§4) driven by fake timestamps, and the audio throttle (§18) with a fake clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Accumulator, STEP_MS, MAX_TICKS_PER_FRAME } from '../src/loop.js';
import { Throttle, MAX_VOICES, MIN_INTERVAL } from '../src/audio.js';

test('60 Hz frames run one tick each; the first frame runs none', () => {
  const a = new Accumulator();
  assert.equal(a.advance(1000), 0);
  let total = 0;
  for (let i = 1; i <= 600; i++) total += a.advance(1000 + i * STEP_MS);
  assert.equal(total, 600);
});

test('144 Hz frames still average 60 ticks per second', () => {
  const a = new Accumulator();
  a.advance(0);
  let total = 0;
  for (let i = 1; i <= 144 * 10; i++) total += a.advance((i * 1000) / 144);
  assert.equal(total, 600);
});

test('30 Hz frames run two ticks each', () => {
  const a = new Accumulator();
  a.advance(0);
  for (let i = 1; i <= 30; i++) assert.equal(a.advance(i * 2 * STEP_MS), 2);
});

test('at most 4 ticks per frame; owed ticks beyond that are dropped, not banked', () => {
  assert.equal(MAX_TICKS_PER_FRAME, 4);
  const a = new Accumulator();
  a.advance(0);
  assert.equal(a.advance(10 * STEP_MS), 4); // hidden tab or a long stall
  assert.equal(a.advance(11 * STEP_MS), 1); // no fast-forward afterwards
  assert.equal(a.advance(60_000), 4);
  assert.equal(a.advance(60_000 + STEP_MS), 1);
});

test('no time is banked while not running, so resuming releases no burst', () => {
  const a = new Accumulator();
  a.advance(0);
  assert.equal(a.advance(STEP_MS), 1);
  for (let t = 2; t < 300; t++) assert.equal(a.advance(t * STEP_MS, false), 0);
  assert.equal(a.advance(300 * STEP_MS), 1);
});

test('non-increasing timestamps run nothing', () => {
  const a = new Accumulator();
  a.advance(100);
  assert.equal(a.advance(100), 0);
  assert.equal(a.advance(50), 0);
});

test('audio throttle: one start per sound per 50 ms', () => {
  assert.equal(MIN_INTERVAL, 0.05);
  const t = new Throttle();
  assert.equal(t.tryStart('shoot01', 1.0, 0.01), true);
  assert.equal(t.tryStart('shoot01', 1.0, 0.01), false); // 40 hits in one tick play one sound
  assert.equal(t.tryStart('shoot01', 1.049, 0.01), false);
  assert.equal(t.tryStart('death01', 1.01, 0.01), true); // other sounds are independent
  assert.equal(t.tryStart('shoot01', 1.05, 0.01), true);
});

test('audio throttle: at most 16 voices at once; finished voices free their slot', () => {
  assert.equal(MAX_VOICES, 16);
  const t = new Throttle();
  for (let i = 0; i < 16; i++) assert.equal(t.tryStart(`s${i}`, 0, 1), true);
  assert.equal(t.tryStart('s16', 0.5, 1), false);
  assert.equal(t.tryStart('s16', 1.0, 1), true); // the first 16 ended at t = 1
});
