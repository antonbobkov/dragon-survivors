// Horse, stampede and banner rules the first tests left unpinned (found by mutation in the T-024 review).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { spawnStampede, stepSpawner } from '../src/sim/spawner.js';
import { stageBanner } from '../src/render/hud.js';
import { ANIMS } from '../src/sim/anims.js';
import { SPAWN_RING_RADIUS, STAMPEDE_SPACING, TIMELINE } from '../src/sim/content.js';

const STAMPEDE_ROW = [{ t: 0, rate: 0, weights: { knight: 100 }, stampede: { every: 20, min: 5, max: 5 } }];
const still = (timeline = [{ t: 0, rate: 0, weights: { knight: 100 } }]) => {
  const g = new Game({ seed: 1, timeline });
  g.weapons = [];
  return g;
};
const horses = (g) => g.enemies.filter((e) => e.type === 'horse');
function scripted(values) {
  const calls = [];
  const f = () => { const v = values.length ? values.shift() : 0; calls.push(v); return v; };
  f.calls = calls;
  return f;
}

test('step 4: the stampede spawns after the budget spawns, and spawner.spawned counts the budget spawns only', () => {
  const g = still(STAMPEDE_ROW);
  g.spawner.budget = 1; // exactly one budget spawn is due
  g.rng = scripted([0, 0.25, 0, 0.5]); // budget: type, angle; stampede: count, angle
  stepSpawner(g);
  assert.equal(g.rng.calls.length, 4);
  assert.deepEqual(g.enemies.map((e) => e.type), ['knight', 'horse', 'horse', 'horse', 'horse', 'horse']);
  assert.equal(g.spawner.spawned, 1, 'the five horses are not counted');
  assert.equal(g.spawner.stampedes, 1);
  // the budget spawn used draws 1-2: its angle 0.25 -> straight below the dragon
  const k = g.enemies[0];
  assert.ok(Math.abs(k.x) < 1e-6 && Math.abs(k.y - SPAWN_RING_RADIUS) < 1e-6);
});

test('stampede: every horse flips with the line\'s run direction, not with its own bearing to the tower', () => {
  // A near-vertical run: horses on both sides of the tower, but one shared direction.
  for (const [a, flip] of [[Math.PI / 2 - 0.02, true], [Math.PI / 2 + 0.02, false]]) {
    const g = still();
    spawnStampede(g, 5, 1, a);
    const hs = horses(g);
    assert.equal(hs.length, 5);
    for (const h of hs) assert.equal(h.flip, h.dx < 0, `angle ${a}`);
    assert.ok(hs.every((h) => h.flip === flip), `all ${flip} at angle ${a}`);
  }
});

test('stampede: horse i sits at centre + (-uy, ux) * (i - (n-1)/2) * spacing', () => {
  const g = still();
  const n = 5;
  spawnStampede(g, n, 1, Math.PI / 2); // from straight below the dragon; the run is (0, -1)-ish
  const hs = horses(g);
  const cx = hs.reduce((s, h) => s + h.x, 0) / n, cy = hs.reduce((s, h) => s + h.y, 0) / n;
  hs.forEach((h, i) => {
    const off = (i - (n - 1) / 2) * STAMPEDE_SPACING;
    assert.ok(Math.abs(h.x - (cx - h.dy * off)) < 1e-9 && Math.abs(h.y - (cy + h.dx * off)) < 1e-9, `horse ${i}`);
  });
  assert.ok(hs[0].dy < -0.9 && hs[0].x < hs[n - 1].x, 'running up the screen, the first horse is on the left');
});

test('horses are pushed apart by separation like any enemy', () => {
  const g = still();
  const a = createEnemy(g, 'horse', 300, 0), b = createEnemy(g, 'horse', 300, 5);
  for (const h of [a, b]) { h.dx = -1; h.dy = 0; }
  g.tick({});
  assert.ok(Math.abs(a.y - b.y) > 5 + 1, `still ${Math.abs(a.y - b.y)} apart`);
});

test('banner: only while playing, not in any other phase', () => {
  const g = still(TIMELINE);
  g.t = 0;
  assert.ok(stageBanner(g));
  for (const phase of ['dying', 'over']) {
    g.phase = phase;
    assert.equal(stageBanner(g), null, phase);
  }
});

test('horse: its walk animation advances while it runs', () => {
  const g = still();
  const h = createEnemy(g, 'horse', 300, 0);
  h.dx = -1; h.dy = 0;
  const first = ANIMS['horse.walk'].ticks[0];
  for (let i = 0; i < first - 1; i++) g.tick({});
  assert.equal(h.frame, 0);
  g.tick({});
  assert.equal(h.frame, 1, `frame 1 after ${first} ticks`);
});
