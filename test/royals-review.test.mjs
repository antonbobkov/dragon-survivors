// T-040: gaps found reviewing the princess (§14.4) and the prince (§14.5): each test below
// fails under a specific mutation of the rule it names. Numbers come from content.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy, enemySpecial } from '../src/sim/enemies.js';
import { createPrincess, collidePrincesses } from '../src/sim/princess.js';
import { princeSpecial, spawnPrinceIfDue } from '../src/sim/prince.js';
import {
  DT, ENEMIES, MAX_ENEMIES, TOWER_RADIUS, PRINCE_STEAL_RANGE, PRINCE_GRAB_RADIUS,
  MAGE_NO_CAST_DIST, MAGE_SUMMON_COUNT, MAGE_SUMMON_RING, MAGE_CAST_INTERVAL, MAGE_CAST_TIME, PRINCESS_LURE,
} from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = () => {
  const g = new Game({ seed: 1, timeline: QUIET });
  g.weapons = [];
  g.merchantTimer = Infinity;
  g.princessTimer = Infinity;
  g.princeNext = Infinity;
  return g;
};
const gem = (g, x, y, value = 1, homing = false) => { const o = { id: g.nextId++, x, y, value, homing }; g.gems.push(o); return o; };
// A prince whose next tick is a theft tick.
const armed = (g, x, y) => { const p = createEnemy(g, 'prince', x, y); p.stealTimer = 1; return p; };

test('theft: a homing gem is safe even when it is the nearest in reach', () => {
  const g = still();
  const p = armed(g, 30, 0);
  const safe = gem(g, 40, 0, 4, true);
  const free = gem(g, 60, 0, 2);
  princeSpecial(g, p);
  assert.ok(g.gems.includes(safe), 'the homing gem stays');
  assert.ok(!g.gems.includes(free));
  assert.equal(p.stolen, 2);
  // with only a homing gem about nothing is taken
  const h = still();
  const q = armed(h, 30, 0);
  gem(h, 40, 0, 4, true);
  princeSpecial(h, q);
  assert.equal(q.stolen, 0);
  assert.equal(h.gems.length, 1);
});

test('theft: the grab radius is measured from the prince, not the dragon', () => {
  const g = still();
  const s = PRINCE_STEAL_RANGE - 1; // in range, away from the dragon at the origin
  const p = armed(g, s, 0);
  const G = PRINCE_GRAB_RADIUS;
  const nearHim = gem(g, s + G - 1, 0, 3); // in reach of him, beyond the dragon's G
  const nearDragon = gem(g, -(G - 1), 0, 5); // in reach of the dragon only
  assert.ok(Math.hypot(nearHim.x - g.dragon.x, nearHim.y - g.dragon.y) > G);
  assert.ok(Math.hypot(nearDragon.x - p.x, nearDragon.y - p.y) > G);
  princeSpecial(g, p);
  assert.equal(p.stolen, 3, 'took the gem near him');
  assert.ok(!g.gems.includes(nearHim) && g.gems.includes(nearDragon));
  p.stealTimer = 1;
  princeSpecial(g, p);
  assert.equal(p.stolen, 3, 'the gem near only the dragon is out of his reach');
});

test('contact: an enemy hurts the princess at her own radius, not the tower\'s', () => {
  const g = still();
  const p = createPrincess(g, 400, 0);
  const e = createEnemy(g, 'knight', 400, 0);
  const rr = e.r + p.r;
  assert.ok(rr + 1 < e.r + TOWER_RADIUS, 'the gap exists');
  e.x = p.x + rr + 1; // just outside her contact range
  g.grid.build(g.enemies);
  collidePrincesses(g);
  assert.equal(p.hp, p.maxHp, 'in the gap: no damage');
  e.x = p.x + rr - 1;
  g.grid.build(g.enemies);
  collidePrincesses(g);
  assert.ok(p.hp < p.maxHp, 'just inside her radius: hurt');
});

test('contact: only live enemies hurt her (one killed earlier in step 8 is skipped)', () => {
  const g = still();
  const p = createPrincess(g, 400, 0);
  const e = createEnemy(g, 'knight', 400, 5);
  g.grid.build(g.enemies);
  e.hp = 0; // killed by a hit this tick, still in the grid
  collidePrincesses(g);
  assert.equal(p.hp, p.maxHp);
  e.hp = 1;
  collidePrincesses(g);
  assert.ok(p.hp < p.maxHp, 'alive: hurts');
});

test('prince: never busy; he walks on the tick he steals', () => {
  const g = still();
  const p = armed(g, 50, 0);
  gem(g, 60, 0, 3);
  const x0 = p.x;
  g.tick({});
  assert.equal(p.stolen, 3, 'the theft happened this tick');
  assert.ok(Math.abs(p.x - (x0 - ENEMIES.prince.speed * DT)) < 1e-9, 'and he walked');
  const h = still();
  const q = armed(h, 30, 0);
  gem(h, 40, 0, 1);
  assert.equal(princeSpecial(h, q), false, 'not busy after a theft');
  assert.equal(enemySpecial(h, createEnemy(h, 'prince', 500, 0)), false);
});

test('prince: his walk anim loops through its frames', () => {
  const g = still();
  const p = createEnemy(g, 'prince', 900, 0);
  const frames = new Set();
  let wraps = 0, prev = p.frame;
  for (let i = 0; i < 300; i++) {
    g.tick({});
    frames.add(p.frame);
    if (p.frame < prev) wraps++;
    prev = p.frame;
  }
  assert.ok(frames.size >= 2, 'the frame advances');
  assert.ok(wraps >= 1, 'and wraps back to the first');
  assert.equal(p.anim, ENEMIES.prince.walk);
});

test('prince: always added, even at MAX_ENEMIES', () => {
  const g = still();
  for (let i = 0; i < MAX_ENEMIES; i++) createEnemy(g, 'knight', 3000 + i, 3000);
  assert.equal(g.enemies.length, MAX_ENEMIES);
  g.princeNext = 0;
  g.t = 1;
  const p = spawnPrinceIfDue(g);
  assert.ok(p, 'he appears');
  assert.equal(g.enemies.length, MAX_ENEMIES + 1);
  assert.ok(g.enemies.includes(p));
});

test('mage lured: the no-cast distance stays tower-based', () => {
  const interval = Math.round(MAGE_CAST_INTERVAL / DT);
  const casts = (mx, px) => {
    const g = still();
    const y = g.tower.y;
    const m = createEnemy(g, 'mage', mx, y);
    createPrincess(g, px, y);
    m.castTimer = interval - 1;
    enemySpecial(g, m);
    return m.anim === ENEMIES.mage.spell;
  };
  const far = MAGE_NO_CAST_DIST + 300; // far from the tower, the princess right beside the mage
  assert.equal(casts(far, far + MAGE_NO_CAST_DIST / 2), true);
  const near = MAGE_NO_CAST_DIST / 2; // near the tower, the princess beyond the no-cast distance
  assert.ok(MAGE_NO_CAST_DIST + 10 < PRINCESS_LURE);
  assert.equal(casts(near, near + MAGE_NO_CAST_DIST + 10), false);
});

test('mage lured: the summon ring is laid out from the tower direction, not the princess', () => {
  const g = still();
  const ty = g.tower.y;
  const m = createEnemy(g, 'mage', 400, ty);
  createPrincess(g, 400, ty - 100); // lures it north; the tower is due west
  m.anim = ENEMIES.mage.spell;
  m.castTimer = Math.round(MAGE_CAST_TIME / DT) - 2; // the next special tick summons
  const n0 = g.enemies.length;
  enemySpecial(g, m);
  const sk = g.enemies.slice(n0);
  assert.equal(sk.length, MAGE_SUMMON_COUNT);
  sk.forEach((s, i) => {
    const a = Math.PI + ((i + 0.5) / MAGE_SUMMON_COUNT) * 2 * Math.PI;
    assert.ok(Math.abs(s.x - (400 + Math.cos(a) * MAGE_SUMMON_RING)) < 1e-6, `x ${i}`);
    assert.ok(Math.abs(s.y - (ty + Math.sin(a) * MAGE_SUMMON_RING)) < 1e-6, `y ${i}`);
  });
});
