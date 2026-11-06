// Pins for faults found by the T-002 review (reports/reviews/2026-11-06-T-002-review.md),
// and for rules the review found unheld (T-008): each test names the mutation it catches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { spawnProjectile, collideProjectiles } from '../src/sim/projectiles.js';
import { stepSpawner, pickType } from '../src/sim/spawner.js';
import { mulberry32 } from '../src/sim/rng.js';
import { DT, SPAWN_RING_RADIUS, TOWER_RADIUS } from '../src/sim/content.js';

test('aim taken from a partial move vector is a unit vector', () => {
  const g = new Game({ seed: 1 });
  g.tick({ moveX: 0.3, moveY: 0 });
  assert.ok(Math.abs(Math.hypot(g.dragon.aimX, g.dragon.aimY) - 1) < 1e-9);
  assert.equal(g.dragon.aimX, 1);
});

// ---- T-008 ----------------------------------------------------------------------

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
// No spawns, no weapons: only what a test places moves or fires.
const still = (timeline = QUIET) => {
  const g = new Game({ seed: 1, timeline });
  g.weapons = [];
  return g;
};
// A fireball-kind projectile of damage 1 (knights have 3 HP, so nothing dies) at (x, y).
const bolt = (g, x = 0, y = 0) =>
  spawnProjectile(g, { kind: 'fireball', x, y, dx: 1, dy: 0, speed: 0, range: 1000, r: 6, damage: 1, anim: 'fireball.anim' });
const collide = (g) => { g.grid.build(g.enemies); collideProjectiles(g); };

test('projectile: remembers the ids it hit and never re-hits them (§12)', () => {
  // No proc exists yet that lets a projectile survive its hit, so the test puts it back in
  // the list by hand, as a surviving (piercing) projectile would be, and collides again.
  const g = still();
  const e = createEnemy(g, 'knight', 10, 0);
  const p = bolt(g);
  collide(g);
  assert.equal(e.hp, 2);
  assert.deepEqual(p.hits, [e.id]);
  assert.equal(g.projectiles.length, 0, 'it did not survive');
  g.projectiles.push(p);
  collide(g);
  collide(g);
  assert.equal(e.hp, 2, 'a remembered enemy is not hit again');
  assert.deepEqual(p.hits, [e.id]);
  assert.equal(g.projectiles.length, 1, 'nothing to hit: it flies on');
});

test('projectile: hits the nearest overlapping enemy, whatever the list order (§4.1)', () => {
  for (const order of [[0, 1], [1, 0]]) {
    const g = still();
    const far = createEnemy(g, 'knight', 12, 0), near = createEnemy(g, 'knight', 5, 0);
    g.enemies = order.map((i) => [far, near][i]);
    bolt(g);
    collide(g);
    assert.deepEqual([near.hp, far.hp], [2, 3], `order ${order}`);
  }
});

test('projectile: equal distances go to the lower id, whatever the list order (§4.1)', () => {
  for (const reversed of [false, true]) {
    const g = still();
    const low = createEnemy(g, 'knight', 10, 0), high = createEnemy(g, 'knight', -10, 0);
    assert.ok(low.id < high.id);
    g.enemies = reversed ? [high, low] : [low, high];
    bolt(g);
    collide(g);
    assert.deepEqual([low.hp, high.hp], [2, 3], reversed ? 'high id listed first' : 'low id listed first');
  }
});

test('projectile: a dead enemy (hp <= 0, not yet removed) is skipped, not hit and not remembered (§2.1, §4.1)', () => {
  const g = still();
  const dead = createEnemy(g, 'knight', 3, 0), live = createEnemy(g, 'knight', 10, 0);
  dead.hp = 0;
  const p = bolt(g);
  collide(g);
  assert.equal(dead.hp, 0, 'the dead enemy took no further hit');
  assert.equal(live.hp, 2, 'the live one behind it did');
  assert.deepEqual(p.hits, [live.id]);
});

test('tower: a dead enemy (hp <= 0) overlapping the tower deals no damage (§7.2)', () => {
  const g = still();
  const e = createEnemy(g, 'knight', g.tower.x, g.tower.y);
  e.hp = 0;
  g.stepCollisions();
  assert.equal(g.tower.hp, 100);
  e.hp = 1;
  g.stepCollisions();
  assert.ok(g.tower.hp < 100, 'a live one at the same spot does');
});

test('tower: overlap is strict, distance == r + TOWER_RADIUS is not contact (§7.2)', () => {
  const g = still();
  const e = createEnemy(g, 'knight', g.tower.x + 12 + TOWER_RADIUS, g.tower.y);
  g.stepCollisions();
  assert.equal(g.tower.hp, 100, 'touching exactly: no damage');
  e.x -= 1e-6;
  g.stepCollisions();
  assert.ok(g.tower.hp < 100, 'just inside: damage');
});

test('tower: HP stops at 0, never below (§7.2)', () => {
  const g = still();
  createEnemy(g, 'golem', g.tower.x, g.tower.y); // 40 DPS: 0.67 HP a tick
  g.tower.hp = 0.5;
  g.stepCollisions();
  assert.equal(g.tower.hp, 0);
  g.stepCollisions();
  assert.equal(g.tower.hp, 0);
});

test('projectile: the hit effect spawns at the projectile, not at the enemy (§4.1)', () => {
  const g = still();
  const e = createEnemy(g, 'knight', 10, 4);
  const p = bolt(g, 1, 2);
  collide(g);
  const fx = g.effects.filter((f) => f.anim === 'explosion.small');
  assert.equal(fx.length, 1);
  assert.deepEqual([fx[0].x, fx[0].y], [p.x, p.y]);
  assert.notDeepEqual([fx[0].x, fx[0].y], [e.x, e.y]);
});

test('enemy: flip goes back to false when it walks right (§5)', () => {
  const g = still();
  const e = createEnemy(g, 'knight', -300, g.tower.y); // left of the tower: walks right
  e.flip = true;
  const w = createEnemy(g, 'knight', 300, g.tower.y); // right of it: walks left
  g.tick({});
  assert.ok(e.x > -300 && w.x < 300);
  assert.equal(e.flip, false);
  assert.equal(w.flip, true);
});

test('spawner: each spawn draws its type, then its angle, and nothing else (§9)', () => {
  const tl = [{ t: 0, rate: 600, weights: { knight: 1, skeleton: 1, slime: 1 } }]; // 10 spawns a step
  const g = still(tl);
  const rng = mulberry32(g.seed);
  stepSpawner(g);
  assert.equal(g.enemies.length, 10);
  const types = new Set();
  for (const e of g.enemies) {
    const type = pickType(tl[0].weights, rng());
    const a = rng() * 2 * Math.PI;
    assert.equal(e.type, type);
    assert.ok(Math.abs(e.x - SPAWN_RING_RADIUS * Math.cos(a)) < 1e-9);
    assert.ok(Math.abs(e.y - SPAWN_RING_RADIUS * Math.sin(a)) < 1e-9);
    types.add(type);
  }
  assert.ok(types.size > 1, 'the draws vary the type, so a shifted stream shows');
  assert.equal(g.rng(), rng(), 'the stream is at the same place afterwards');
});

test('spawner: weights come from t at the start of the tick, not t + DT (§9)', () => {
  const tl = [
    { t: 0, rate: 600, weights: { knight: 1, skeleton: 0 } },
    { t: 10, rate: 600, weights: { knight: 0, skeleton: 1 } },
  ];
  const before = still(tl);
  before.t = 10 - DT / 2; // the tick would end past the boundary, but starts before it
  stepSpawner(before);
  assert.ok(before.enemies.length > 0);
  assert.ok(before.enemies.every((e) => e.type === 'knight'), 'old row still in force');
  const at = still(tl);
  at.t = 10;
  stepSpawner(at);
  assert.ok(at.enemies.length > 0 && at.enemies.every((e) => e.type === 'skeleton'), 'new row from t == 10');
});
