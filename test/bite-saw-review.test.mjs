// Bite and saw rules the first tests left unpinned (found by mutation in the T-023 review): the
// blade's knock source, the bite's braziers, step 8 hit order, rehit pruning, the golem's maxHp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { buffMods, createWeapon } from '../src/sim/weapons.js';
import { clawVolley } from '../src/sim/claws.js';
import { sawVolley, collideBlades, stepBlades } from '../src/sim/saw.js';
import { BRAZIER_RADIUS, ENEMIES, WEAPONS } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const armed = (ids, buffs = []) => {
  const g = new Game({ seed: 1, timeline: QUIET });
  g.weapons = ids.map(([id, level = 1]) => createWeapon(id, level));
  g.buffs = buffs;
  return g;
};
const dummy = (g, type, x, y, hp = 1000) => {
  const e = createEnemy(g, type, x, y);
  e.hp = hp;
  e.maxHp = hp;
  return e;
};
const brazier = (g, x, y) => { const b = { id: g.nextId++, x, y, anim: 'brazier.burn', frame: 0, frameTicks: 0 }; g.braziers.push(b); return b; };
const tick = (g, intent = {}) => g.tick({ moveX: 0, moveY: 0, ...intent });
const level = (id, n = 1) => WEAPONS[id].levels[n - 1];
// One saw blade launched by hand and put at (x, y), phase 'dwell' so it stays put.
const blade = (g, x, y) => {
  sawVolley(g, level('saw'), buffMods(g), level('saw').damage);
  const b = g.blades[g.blades.length - 1];
  Object.assign(b, { x, y, phase: 'dwell', dwell: 1000 });
  return b;
};

test('saw: a hit knocks the enemy away from the blade, not along the tower-dragon line', () => {
  const g = armed([['saw']]);
  // tower (0, 50), dragon (0, 0): the blade sits far off that axis; the enemy is straight below it
  const b = blade(g, 200, 0);
  const e = dummy(g, 'knight', 200, 18);
  g.grid.build(g.enemies);
  collideBlades(g);
  assert.ok(e.hp < 1000, 'hit');
  const push = b.knock / ENEMIES.knight.mass;
  assert.ok(Math.abs(e.x - 200) < 1e-9, `pushed straight away from the blade (x ${e.x})`);
  assert.ok(Math.abs(e.y - (18 + push)) < 1e-9, `by the knock (y ${e.y})`);
});

test('bite: it breaks braziers only when it bites (an enemy in reach), and the cooldown keeps waiting', () => {
  const g = armed([['bite']]);
  const b = brazier(g, 30, 0); // inside the reach
  g.rng = () => 0;
  for (let i = 0; i < 5; i++) tick(g);
  assert.equal(g.braziers.length, 1, 'no enemy in reach: no bite, the brazier stays');
  assert.equal(g.weapons[0].timer, 0);
  dummy(g, 'knight', -30, 0);
  tick(g);
  assert.ok(!g.braziers.includes(b), 'bites, and the brazier breaks');
});

test('bite: the brazier reach is scaled by Area', () => {
  const reach = level('bite').reach;
  const d = reach * 1.5 + BRAZIER_RADIUS; // beyond the unscaled reach + 12, inside it at Area L3 (+60%)
  assert.ok(d > reach + BRAZIER_RADIUS);
  const run = (areaLevel) => {
    const g = armed([['bite']], areaLevel ? [{ id: 'area', level: areaLevel }] : []);
    brazier(g, d, 0);
    dummy(g, 'knight', -30, 0); // a target, so it bites
    g.rng = () => 0;
    tick(g);
    return g.braziers.length;
  };
  assert.equal(run(0), 1, 'unscaled reach does not touch it');
  assert.equal(run(3), 0, 'Area L3 reaches it');
});

test('step 8 order: claw slashes hit first, then the bite, then the blades', () => {
  // claws before bite: the claw kills the nearest enemy A (on the facing side); the bite then takes B
  const g = armed([['leftClaw'], ['bite']]);
  const a = dummy(g, 'knight', 30, 0, 1), b = dummy(g, 'knight', -40, 0);
  const w = g.weapons[0];
  clawVolley(g, w, level('leftClaw'), buffMods(g), level('leftClaw').damage);
  g.stepCollisions();
  assert.ok(a.hp <= 0, 'the claw killed A');
  assert.ok(b.hp < 1000, 'so the bite had A dead and bit B');

  // bite before blades: the bite kills the nearest enemy A; the blade over A then finds it dead and
  // B (out of the blade's reach) is not bitten by anything
  const h = armed([['bite'], ['saw']]);
  const a2 = dummy(h, 'knight', 30, 0, 1), b2 = dummy(h, 'knight', -40, 0);
  blade(h, 30, 0);
  h.stepCollisions();
  assert.ok(a2.hp <= 0);
  assert.equal(b2.hp, 1000, 'the bite took A before the blade could');
});

test('saw: expired rehit entries are dropped, live ones kept', () => {
  const g = armed([['saw']]);
  const b = blade(g, 200, 0);
  g.tickCount = 100;
  b.rehit = { 1: 99, 2: 100, 3: 101, 4: 160 };
  stepBlades(g);
  assert.deepEqual(Object.keys(b.rehit).sort(), ['3', '4']);
});

test('golem: maxHp equals its stored (finite) HP', () => {
  const g = armed([]);
  const e = createEnemy(g, 'golem', 100, 0);
  assert.ok(Number.isFinite(e.hp) && Number.isFinite(e.maxHp));
  assert.equal(e.maxHp, e.hp);
});
