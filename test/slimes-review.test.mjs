// Slime fusion rules the first tests left unpinned (found by mutation in the T-025 review, §2.1, §8.9):
// the megaslime faces the tower, ties for the densest core go to the lower id, fusion follows despawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy, fuseSlimes, stepEnemies } from '../src/sim/enemies.js';
import { DESPAWN_DIST, SLIME_FUSE_COUNT, SLIME_FUSE_SIZE, SLIME_FUSE_RADIUS } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = () => {
  const g = new Game({ seed: 1, timeline: QUIET });
  g.weapons = [];
  return g;
};
const slimes = (g) => g.enemies.filter((e) => e.type === 'slime');
const megas = (g) => g.enemies.filter((e) => e.type === 'megaslime');
// `n` slimes in a tight block at (x, y): every one has the other n - 1 within the fuse radius.
const cluster = (g, x, y, n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(createEnemy(g, 'slime', x + (i % 4) * 5, y + Math.floor(i / 4) * 5));
  return out;
};
// `n` slimes on a grid with a spacing past the fuse radius (no neighbours), from (x, y) in rows of 10.
const lone = (g, n, x, y) => {
  const step = SLIME_FUSE_RADIUS + 20;
  for (let i = 0; i < n; i++) createEnemy(g, 'slime', x + (i % 10) * step, y + Math.floor(i / 10) * step);
};

test('fusion: the megaslime faces the tower (flip when the tower is to its left)', () => {
  for (const [x, flip] of [[300, true], [-300, false]]) {
    const g = still(); // tower at x 0
    cluster(g, x, 0, SLIME_FUSE_SIZE);
    lone(g, SLIME_FUSE_COUNT, 3000, 3000);
    const m = fuseSlimes(g);
    assert.ok(m, 'fused');
    assert.equal(Math.sign(m.x - g.tower.x), Math.sign(x), 'on the side of its cluster');
    assert.equal(m.flip, flip, `cluster at ${x}`);
  }
});

test('fusion: equally dense clusters tie to the lower id (the first one made fuses)', () => {
  const g = still();
  const a = cluster(g, 0, 400, SLIME_FUSE_SIZE + 1); // lower ids
  const b = cluster(g, 1000, 400, SLIME_FUSE_SIZE + 1); // the same density, higher ids
  lone(g, SLIME_FUSE_COUNT, 3000, 3000);
  const m = fuseSlimes(g);
  assert.ok(m);
  assert.ok(m.x < 500, `fused at the first cluster (x ${m.x})`);
  assert.equal(a.filter((e) => g.enemies.includes(e)).length, 1, 'one of the first cluster is left');
  assert.ok(b.every((e) => g.enemies.includes(e)), 'the second cluster is untouched');
});

test('fusion runs after the despawn pass: slimes past DESPAWN_DIST are despawned, never fused', () => {
  const g = still();
  const far = cluster(g, DESPAWN_DIST + 500, 0, SLIME_FUSE_SIZE + 1); // the densest cluster, out of range
  lone(g, SLIME_FUSE_COUNT + 1, -400, 200); // 101 near slimes with no neighbours
  assert.equal(slimes(g).length, far.length + SLIME_FUSE_COUNT + 1);
  const budget = g.spawner.budget;
  stepEnemies(g);
  assert.ok(far.every((e) => !g.enemies.includes(e)), 'the far cluster is gone');
  assert.equal(g.spawner.budget, budget + far.length, 'refunded as despawned');
  assert.equal(megas(g).length, 1, 'the near slimes (still over the count) fused');
  const m = megas(g)[0];
  assert.ok(Math.hypot(m.x - g.tower.x, m.y - g.tower.y) < DESPAWN_DIST, 'near the tower');
  assert.equal(slimes(g).length, SLIME_FUSE_COUNT + 1 - SLIME_FUSE_SIZE);
});
