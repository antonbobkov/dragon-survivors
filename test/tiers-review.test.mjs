// Pins for the T-021 review (reports/reviews/2026-11-26-T-021-review.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { tierHp } from '../src/sim/content.js';
import { createRenderer } from '../src/render/draw.js';

const atlas = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));

test('tier HP rounds up, not to nearest', () => {
  assert.equal(tierHp(3, 2), 8, '3 × 2.5 = 7.5 → 8');
  assert.equal(tierHp(1.1, 1), 2, '1.1 → 2');
  assert.equal(tierHp(7, 2), 18, '7 × 2.5 = 17.5 → 18');
  assert.equal(tierHp(5, 3), 30, 'exact products stay exact');
  assert.equal(tierHp(1.2, 2), 3, '1.2 × 2.5 = 3.0000000000000004 → 3');
  assert.equal(tierHp(1.3, 2), 4, '1.3 × 2.5 = 3.25 → 4 (round would give 3)');
});

test('drawWorld: an effect keeps its own scale (a large explosion) on top of the tier scale', () => {
  const A = { image: { fake: true }, frames: atlas.frames, anims: atlas.anims };
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return () => ({ width: 0 }); return (...a) => { calls.push([k, ...a]); return {}; }; },
    set(t, k, v) { t[k] = v; return true; },
  });
  const makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => ctx });
  const r = createRenderer({ atlas: A, makeCanvas });
  const g = new Game({ seed: 1, timeline: [{ t: 0, rate: 0, weights: { knight: 100 } }] });
  g.weapons = [];
  g.effects.push({ id: g.nextId++, x: 50, y: 0, anim: 'explosion.big', frame: 0, frameTicks: 0, scale: 1.5, alpha: 1, flip: false, hold: false, done: false });
  r.drawWorld(ctx, g);
  const fr = atlas.frames[atlas.anims['explosion.big'].frames[0]];
  const blit = calls.find((c) => c[0] === 'drawImage' && c[1] === A.image && c[2] === fr.x && c[3] === fr.y);
  assert.ok(blit, 'explosion drawn');
  assert.equal(Math.round(blit[8]), Math.round(fr.w * 2 * 1.5), 'width = frame × 2 (screen) × 1.5 (effect scale)');
});
