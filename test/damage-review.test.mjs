// Pins for the T-018 review (reports/reviews/2026-11-26-T-018-review.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { dealDamage, normalizeMeta } from '../src/sim/damage.js';
import { bestiaryRows, drawBestiary } from '../src/render/bestiary.js';
import { ENEMIES } from '../src/sim/content.js';

test('meta: a zero power reads neutral, so a non-immune hit still does at least 1', () => {
  assert.equal(normalizeMeta({ power: { fire: 0 } }).power.fire, 1);
  const g = new Game({ seed: 1, meta: { power: { fire: 0 } } });
  const k = createEnemy(g, 'knight', 300, 0);
  const hp = k.hp;
  assert.equal(dealDamage(g, k, 2, 'fire', { x: 290, y: 0 }), 2);
  assert.equal(k.hp, hp - 2);
});

test('bestiary: resistances are shown after the armoury shred', () => {
  const g = new Game({ seed: 1, meta: { shred: { physical: 0.25 } } });
  createEnemy(g, 'knight', 0, 0);
  const knight = bestiaryRows(g).find((r) => r.type === 'knight');
  const phys = knight.resists.find((r) => r.name === 'Physical');
  assert.equal(ENEMIES.knight.resist.physical, 0.25);
  assert.equal(phys.r, 0, 'knight physical 0.25 − 0.25 shred');
});

test('bestiary: a seen sprite is drawn with its type alpha (the ghost at 0.6)', () => {
  const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
  const atlas = { image: { fake: 'image' }, frames: atlasJson.frames, anims: atlasJson.anims };
  const g = new Game({ seed: 1 });
  createEnemy(g, 'ghost', 0, 0);
  const state = {};
  const alphas = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'drawImage') return (img) => { if (img === atlas.image) alphas.push(t.globalAlpha ?? 1); };
      return () => ({});
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  drawBestiary(ctx, g, atlas, 0, { makeCanvas: () => ({ getContext: () => ctx }) });
  assert.ok(alphas.includes(ENEMIES.ghost.alpha), `alphas drawn: ${alphas.join(',')}`);
  assert.equal(ENEMIES.ghost.alpha, 0.6);
});
