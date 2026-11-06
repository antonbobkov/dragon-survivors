import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/sim/rng.js';

test('rng: same seed gives the same sequence', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) assert.equal(a(), b());
});

test('rng: different seeds give different sequences', () => {
  const a = mulberry32(1), b = mulberry32(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a() === b()) same++;
  assert.ok(same < 5);
});

test('rng: values are in [0, 1) and roughly uniform', () => {
  const r = mulberry32(7);
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    buckets[Math.floor(v * 10)]++;
  }
  for (const b of buckets) assert.ok(b > 1700 && b < 2300, `bucket ${b}`);
});
