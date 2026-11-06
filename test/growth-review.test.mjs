// Growth review (§4.1, §10–§12, §14, §14.1): rules the review of the growth loop found
// untested. Each test names the mutation it exists to catch. Numbers that are tuning (radii,
// cooldowns, spins) are read from content.js; `bigFrom` 4 is a spec rule and is written out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { App } from '../src/app.js';
import { STEP_MS } from '../src/loop.js';
import { createEnemy } from '../src/sim/enemies.js';
import { dropGem } from '../src/sim/gems.js';
import { applyCard } from '../src/sim/levelup.js';
import { createWeapon, collideRing } from '../src/sim/weapons.js';
import { spawnProjectile, resolveHit } from '../src/sim/projectiles.js';
import { DT, MAX_GEMS, WEAPONS, EXPLODE_RADIUS, GOLEM_HP, REPAIR_HP, TOWER_HP } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
// No spawns, no weapons: only what a test places acts.
const still = (seed = 1) => {
  const g = new Game({ seed, timeline: QUIET });
  g.weapons = [];
  return g;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dummy = (g, x, y, type = 'knight') => { const e = createEnemy(g, type, x, y); if (!e.unkillable) e.hp = 1000; return e; };
const shot = (g, o = {}) => spawnProjectile(g, { kind: 'fireball', x: 0, y: 0, dx: 1, dy: 0, speed: 420, range: 420, r: 6, damage: 2, anim: 'fireball.anim', ...o });
const laser = (g, o = {}) => spawnProjectile(g, { kind: 'laser', x: 0, y: 0, dx: 1, dy: 0, speed: 700, range: 600, r: 6, damage: 1, anim: 'laser.dir', maxHits: 3, ...o });

// ---- laser maxHits (§12) ------------------------------------------------------------

test('laser: hits on the golem count toward maxHits even though no proc rolls', () => {
  const g = still();
  const golem = createEnemy(g, 'golem', 50, 0);
  g.grid.build(g.enemies);
  const l = laser(g, { maxHits: 2 });
  assert.equal(resolveHit(g, l, golem), true, 'first of two hits: survives');
  assert.equal(l.hitCount, 1);
  assert.equal(resolveHit(g, l, golem), false, 'second hit uses it up');
  assert.equal(l.hitCount, 2);
  assert.equal(golem.hp, GOLEM_HP);
});

test('laser: through the collision step, a golem in the row uses up one of maxHits', () => {
  const g = still();
  const golem = createEnemy(g, 'golem', 40, 0);
  const a = dummy(g, 400, 0); // well apart: the laser reaches them one after another
  const b = dummy(g, 440, 0);
  const l = laser(g, { maxHits: 2 });
  for (let i = 0; i < 40 && g.projectiles.includes(l); i++) { g.stepProjectiles(); g.stepCollisions(); }
  assert.ok(golem.hp === GOLEM_HP && a.hp < 1000, 'golem then the first knight');
  assert.equal(b.hp, 1000, 'gone before the second knight');
  assert.equal(g.projectiles.includes(l), false);
});

// ---- snapshot covers all run state (§2.1, determinism) -----------------------------

// Fields of Game that are not run state: the rng closure (its state is the seed + draws, which
// replays), the grid (rebuilt every tick), the per-tick event list, the constant timeline,
// `t`, which is tickCount × DT, and `debug`, a constant construction flag like the timeline
// (whether intent.debug is honoured, §19; it never changes during a run).
const NOT_STATE = new Set(['rng', 'grid', 'events', 'timeline', 't', 'debug']);

test('snapshot(): every own field of Game except the documented exclusions is in it', () => {
  const g = new Game({ seed: 7 });
  g.weapons = ['fireball', 'laser', 'miniTower', 'ring'].map((id) => createWeapon(id, 2));
  g.buffs = [{ id: 'damage', level: 1 }, { id: 'explode', level: 1 }];
  for (let i = 0; i < 400; i++) g.tick({ moveX: 0.3, aimX: 1, aimY: 0.2, hasAim: true });
  assert.ok(g.miniTowers.length > 0 && g.enemies.length > 0, 'a run with something in every list');
  const snap = g.snapshot();
  const fields = new Set([...Object.keys(new Game({ seed: 7 })), ...Object.keys(g)]);
  const missing = [...fields].filter((k) => !NOT_STATE.has(k) && !(k in snap));
  assert.deepEqual(missing, [], 'state left out of snapshot() is invisible to the determinism tests');
  for (const k of fields) {
    if (!NOT_STATE.has(k)) assert.deepEqual(snap[k], g[k], `snapshot.${k} is the live value`);
  }
});

test('digest(): changes when mini towers or buffs change', () => {
  const g = still();
  const d0 = g.digest();
  g.buffs.push({ id: 'area', level: 1 });
  const d1 = g.digest();
  g.miniTowers.push({ id: 99, x: 1, y: 2, fromX: 0, fromY: 0, lobTicks: 3, life: 10, timer: 0 });
  assert.notEqual(d1, d0);
  assert.notEqual(g.digest(), d1);
});

// ---- explosion (§12) -----------------------------------------------------------------

test('explode: centred on the projectile, not the enemy; damage is the projectile damage (buff applied once)', () => {
  const g = still();
  g.buffs = [{ id: 'explode', level: 1 }, { id: 'damage', level: 1 }];
  g.rng = () => 0;
  const R = EXPLODE_RADIUS;
  const hit = dummy(g, 10, 0); // the fireball at the origin overlaps it
  // 71 px from the projectile (inside R + 12) but 81 px from the enemy
  const behind = dummy(g, -(R + 12 - 1), 0);
  // 81 px from the projectile (outside) but 71 px from the enemy (inside)
  const ahead = dummy(g, 10 + R + 12 - 1, 0);
  g.grid.build(g.enemies);
  const p = shot(g, { damage: 3 }); // the damage buff is already inside this 3
  resolveHit(g, p, hit);
  assert.equal(hit.hp, 997, 'the enemy hit takes the direct hit only');
  assert.equal(behind.hp, 997, 'caught by an explosion at the projectile: exactly p.damage, no second buff');
  assert.equal(ahead.hp, 1000, 'not caught: the explosion is not at the enemy');
  const fx = g.effects.find((f) => f.anim === 'explosion.big');
  assert.deepEqual([fx.x, fx.y], [0, 0]);
});

test('split: children start at the projectile position, not at the enemy', () => {
  const g = still();
  g.buffs = [{ id: 'split', level: 1 }];
  g.rng = () => 0;
  const e = dummy(g, 10, 0);
  g.grid.build(g.enemies);
  const p = shot(g, { x: 0, y: 0 });
  resolveHit(g, p, e);
  const kids = g.projectiles.filter((x) => x !== p);
  assert.equal(kids.length, 2);
  for (const k of kids) assert.deepEqual([k.x, k.y], [0, 0]);
});

// ---- ring (§10.4) -------------------------------------------------------------------

test('ring: the golem is knocked back away from the ball, not from the dragon', () => {
  const g = still();
  g.weapons = [createWeapon('ring', 1)];
  // dragon (0, 0), ball (150, 0), golem (150, 40): not collinear. Straight away from the ball is +y.
  const m = createEnemy(g, 'golem', 150, 40);
  g.weapons[0].balls = [{ x: 150, y: 0 }];
  g.grid.build(g.enemies);
  collideRing(g);
  assert.ok(near(m.x, 150) && near(m.y, 46), `${m.x}, ${m.y}`);
});

test('ring: spin ignores the cooldown buff', () => {
  const g = still();
  g.weapons = [createWeapon('ring', 1)];
  g.buffs = [{ id: 'cooldown', level: 3 }];
  g.stepWeapons();
  assert.ok(near(g.weapons[0].angle, WEAPONS.ring.levels[0].spin * Math.PI / 180 * DT));
});

test('ring: the angle wraps at 2π', () => {
  const g = still();
  g.weapons = [createWeapon('ring', 1)];
  const w = g.weapons[0];
  const inc = WEAPONS.ring.levels[0].spin * Math.PI / 180 * DT;
  w.angle = 2 * Math.PI - inc / 2;
  g.stepWeapons();
  assert.ok(near(w.angle, inc / 2), `angle ${w.angle}`);
  assert.ok(w.angle < 2 * Math.PI);
});

test('ring: the ball radius ignores the area buff', () => {
  const R = WEAPONS.ring.r;
  const r = 12; // knight
  // just outside the unscaled contact distance, inside the one scaled by area L3 (× 1.6)
  const out = createGameWithBall();
  out.e.x = R + r + 1;
  out.g.grid.build(out.g.enemies);
  collideRing(out.g);
  assert.equal(out.e.hp, 1000, 'no hit beyond r + enemy r');
  const inn = createGameWithBall();
  inn.e.x = R + r - 1;
  inn.g.grid.build(inn.g.enemies);
  collideRing(inn.g);
  assert.ok(inn.e.hp < 1000, 'a hit just inside');

  function createGameWithBall() {
    const g = still();
    g.weapons = [createWeapon('ring', 1)];
    g.buffs = [{ id: 'area', level: 3 }];
    g.weapons[0].balls = [{ x: 0, y: 0 }];
    return { g, e: dummy(g, 0, 0) };
  }
});

test('ring: every hit spawns explosion.small at the ball', () => {
  const g = still();
  g.weapons = [createWeapon('ring', 1)];
  g.weapons[0].balls = [{ x: 100, y: 100 }];
  dummy(g, 105, 100);
  dummy(g, 100, 95);
  g.grid.build(g.enemies);
  collideRing(g);
  const fx = g.effects.filter((f) => f.anim === 'explosion.small');
  assert.equal(fx.length, 2, 'one per enemy hit');
  for (const f of fx) assert.deepEqual([f.x, f.y], [100, 100]);
});

// ---- mini tower (§10.3) --------------------------------------------------------------

test('mini tower: lobbed toward the nearest enemy, not the first in the list', () => {
  const g = still();
  g.weapons = [createWeapon('miniTower', 1)];
  dummy(g, 0 + 400, g.tower.y); // first, far, to the right
  dummy(g, 0, g.tower.y - 100); // second, nearer, above
  g.stepWeapons();
  const m = g.miniTowers[0];
  assert.ok(near(m.x, g.tower.x) && near(m.y, g.tower.y - WEAPONS.miniTower.lobDist), `${m.x}, ${m.y}`);
});

test('mini tower: equally near enemies tie to the lower id regardless of list order', () => {
  const g = still();
  g.weapons = [createWeapon('miniTower', 1)];
  const low = dummy(g, g.tower.x - 100, g.tower.y); // lower id, to the left
  const high = dummy(g, g.tower.x + 100, g.tower.y);
  assert.ok(low.id < high.id);
  g.enemies.reverse(); // the higher id comes first in the list
  g.stepWeapons();
  const m = g.miniTowers[0];
  assert.ok(near(m.x, g.tower.x - WEAPONS.miniTower.lobDist) && near(m.y, g.tower.y), `${m.x}, ${m.y}`);
});

// ---- gems (§14) ----------------------------------------------------------------------

test('gems: the gem just dropped is a merge candidate for the oldest', () => {
  const g = still();
  for (let i = 0; i < MAX_GEMS; i++) dropGem(g, { type: 'knight', x: 1000 + i * 100, y: 0 });
  const oldest = g.gems[0];
  const next = g.gems[1]; // 100 px from the oldest
  dropGem(g, { type: 'mage', x: 1030, y: 0 }); // 30 px from the oldest: the nearest of all
  const fresh = g.gems[g.gems.length - 1];
  assert.equal(g.gems.length, MAX_GEMS);
  assert.ok(!g.gems.includes(oldest));
  assert.equal(fresh.value, 5 + 1, 'the oldest merged into the new gem');
  assert.equal(next.value, 1);
});

// ---- sprite and radius switch (§10.1, §10.2) -----------------------------------------

test('fireball and laser switch to the big sprite and radius at level 4', () => {
  for (const id of ['fireball', 'laser']) {
    const def = WEAPONS[id];
    for (const level of [1, 2, 3, 4, 5]) {
      const g = still();
      g.weapons = [createWeapon(id, level)];
      g.stepWeapons();
      const p = g.projectiles[0];
      const big = level >= 4; // spec rule, not a tuning number
      assert.deepEqual([p.anim, p.r], big ? [def.bigAnim, def.bigR] : [def.anim, def.r], `${id} L${level}`);
    }
  }
});

// ---- buffs order (§11) ----------------------------------------------------------------

test('buffs: kept in the order gained; an upgrade keeps its place', () => {
  const g = still();
  for (const id of ['speed', 'damage', 'pierce']) applyCard(g, { kind: 'buff', id, level: 1 });
  assert.deepEqual(g.buffs.map((b) => b.id), ['speed', 'damage', 'pierce']);
  applyCard(g, { kind: 'buff', id: 'speed', level: 2 });
  applyCard(g, { kind: 'buff', id: 'area', level: 1 });
  assert.deepEqual(g.buffs.map((b) => `${b.id}${b.level}`), ['speed2', 'damage1', 'pierce1', 'area1']);
});

// ---- d-pad highlight (§14.1) ---------------------------------------------------------

test('App: with a single offer the d-pad highlight stays on it and A picks it', () => {
  const idle = { intent: {}, pause: false, confirm: false, pick: -1, nav: 0, click: null };
  const press = (o) => ({ ...idle, ...o });
  const app = new App({
    makeGame: (seed) => {
      const g = new Game({ seed, timeline: QUIET });
      g.gems.push({ id: g.nextId++, x: 0, y: 0, value: 8, homing: false });
      return g;
    },
    randomSeed: () => 5,
    audio: { play() {}, resume: () => Promise.resolve() },
  });
  app.frame(0, press({ confirm: true }));
  let f = 1;
  while (!app.levelUpOpen() && f < 10) app.frame(f++ * STEP_MS, idle);
  assert.ok(app.levelUpOpen());
  const step = (input = idle) => app.frame(f++ * STEP_MS, input);
  const g = app.game;
  g.tower.hp = TOWER_HP - 2 * REPAIR_HP;
  g.offers = [{ kind: 'repair', id: 'repair', level: 1 }]; // test only: what a full build is offered
  for (let i = 0; i < 3; i++) step(press({ nav: 1 }));
  assert.equal(app.cardSel, 0, 'clamped to offers.length - 1');
  step(press({ confirm: true }));
  step();
  assert.equal(g.pendingLevelUps, 0, 'the single card was picked');
  assert.equal(g.tower.hp, TOWER_HP - REPAIR_HP);
});
