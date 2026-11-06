import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, normalizeIntent } from '../src/sim/game.js';
import { createEnemy, separate } from '../src/sim/enemies.js';
import { createWeapon } from '../src/sim/weapons.js';
import { rateAt, rowIndexAt, pickType } from '../src/sim/spawner.js';
import { advanceAnim, setAnim, spawnEffect, animLength } from '../src/sim/effects.js';
import { dirFrame, bobAt } from '../src/sim/dragon.js';
import {
  DT, TIMELINE, TETHER_LENGTH, TOWER_RADIUS, MAX_ENEMIES, DESPAWN_DIST, SPAWN_RING_RADIUS, ENEMIES,
} from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const quietGame = (seed = 1) => new Game({ seed, timeline: QUIET });
const run = (g, n, intent) => { for (let i = 0; i < n; i++) g.tick(typeof intent === 'function' ? intent(i) : intent); };

// A scripted run: circle with the stick, aim sweeps, aim released half the time.
const scripted = (i) => {
  const a = i * 0.01;
  return { moveX: Math.cos(a), moveY: Math.sin(a), aimX: -Math.sin(a * 3), aimY: Math.cos(a * 3), hasAim: i % 300 < 150 };
};

// ---- determinism -------------------------------------------------------------

test('determinism: same seed + same intents give identical digests over 300 s', () => {
  const a = new Game({ seed: 12345 }), b = new Game({ seed: 12345 });
  for (let i = 0; i < 300 * 60; i++) {
    a.tick(scripted(i));
    b.tick(scripted(i));
    if (i % 600 === 0) assert.equal(a.digest(), b.digest(), `tick ${i}`);
    if (a.phase === 'over' && b.phase === 'over') break;
  }
  assert.equal(a.digest(), b.digest());
  assert.ok(a.kills > 0 && a.spawner.spawned > 0);
  const c = new Game({ seed: 54321 });
  run(c, a.tickCount + 120, scripted);
  assert.notEqual(c.digest(), a.digest());
});

test('digest: changes with state, ignores events', () => {
  const g = quietGame();
  const d0 = g.digest();
  g.sound('shoot01');
  assert.equal(g.digest(), d0);
  g.dragon.x += 1e-3;
  assert.notEqual(g.digest(), d0);
  assert.match(d0, /^[0-9a-f]{8}$/);
});

// ---- intent and dragon ---------------------------------------------------------

test('intent: missing or partial intent is all zeros; move clamped, aim normalised', () => {
  const zero = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, hasAim: false, confirm: false, pick: -1 };
  assert.deepEqual(normalizeIntent(undefined), zero);
  assert.deepEqual(normalizeIntent({ moveX: NaN, pick: 7 }), zero);
  assert.deepEqual(normalizeIntent({ moveX: 1 }), { ...zero, moveX: 1 });
  const n = normalizeIntent({ moveX: 3, moveY: 4, aimX: 0, aimY: -5, hasAim: true, pick: 2 });
  assert.ok(Math.abs(n.moveX - 0.6) < 1e-12 && Math.abs(n.moveY - 0.8) < 1e-12);
  assert.deepEqual([n.aimX, n.aimY, n.hasAim, n.pick], [0, -1, true, 2]);
  assert.equal(normalizeIntent({ hasAim: true }).hasAim, false);
  const g = quietGame();
  g.tick();
  g.tick({});
  assert.equal(g.tickCount, 2);
});

test('dragon: moves at DRAGON_SPEED, starts at the origin with the tower below it', () => {
  const g = quietGame();
  assert.deepEqual([g.dragon.x, g.dragon.y, g.tower.x, g.tower.y], [0, 0, 0, 60]);
  run(g, 60, { moveX: 0, moveY: -1 });
  assert.ok(Math.abs(g.dragon.y + 260) < 1e-9);
});

test('dragon: aim fallback order is aim, last aim, movement, default', () => {
  const g = quietGame();
  g.weapons = [];
  g.tick({});
  assert.deepEqual([g.dragon.aimX, g.dragon.aimY], [1, 0], 'default faces right');
  g.tick({ moveX: 0, moveY: -1 });
  assert.deepEqual([g.dragon.aimX, g.dragon.aimY], [0, -1], 'never aimed: movement');
  g.tick({});
  assert.deepEqual([g.dragon.aimX, g.dragon.aimY], [0, -1], 'still: keeps the last movement direction');
  g.tick({ moveX: 0, moveY: 1, aimX: -1, aimY: 0, hasAim: true });
  assert.deepEqual([g.dragon.aimX, g.dragon.aimY], [-1, 0], 'aim wins over movement');
  g.tick({ moveX: 0, moveY: 1 });
  assert.deepEqual([g.dragon.aimX, g.dragon.aimY], [-1, 0], 'after aiming once: last aim, not movement');
  assert.equal(g.dragon.dirFrame, 4);
});

test('dragon: fireball fires along the current aim', () => {
  const g = quietGame();
  g.tick({ aimX: 0, aimY: 1, hasAim: true });
  assert.equal(g.projectiles.length, 1);
  const p = g.projectiles[0];
  assert.ok(Math.abs(p.dx) < 1e-12 && Math.abs(p.dy - 1) < 1e-12);
  assert.equal(p.dirFrame, 8);
  assert.ok(g.events.some((e) => e.type === 'sound' && e.name === 'shoot01'));
});

test('dragon: 16-direction frame formula and bob', () => {
  assert.equal(dirFrame(0, -1), 0);
  assert.equal(dirFrame(-1, 0), 4);
  assert.equal(dirFrame(0, 1), 8);
  assert.equal(dirFrame(1, 0), 12);
  assert.equal(dirFrame(-1, -1), 2);
  const bobs = Array.from({ length: 40 }, (_, i) => bobAt(i));
  assert.deepEqual(bobs.slice(0, 20), [...Array(10).fill(-1), ...Array(10).fill(1)]);
  assert.deepEqual(bobs.slice(20), bobs.slice(0, 20));
});

// ---- tower --------------------------------------------------------------------

test('tether: inside the tether the tower does not move', () => {
  const g = quietGame();
  run(g, 20, { moveX: 1, moveY: 0 }); // 86.7 px right: still within 150 of (0, 60)
  assert.deepEqual([g.tower.x, g.tower.y], [0, 60]);
});

test('tether: moving the dragon 500 px right leaves the tower exactly TETHER_LENGTH behind', () => {
  const g = quietGame();
  g.weapons = [];
  const full = Math.floor(500 / (260 * DT));
  run(g, full, { moveX: 1, moveY: 0 });
  g.tick({ moveX: (500 - g.dragon.x) / (260 * DT), moveY: 0 });
  assert.ok(Math.abs(g.dragon.x - 500) < 1e-9);
  const d = () => Math.hypot(g.dragon.x - g.tower.x, g.dragon.y - g.tower.y);
  assert.ok(d() > TETHER_LENGTH, 'the tower lags while the dragon flies');
  run(g, 180, {});
  assert.ok(Math.abs(d() - TETHER_LENGTH) < 1e-9, `distance ${d()}`);
  assert.ok(g.tower.x < g.dragon.x, 'tower trails behind');
  const before = [g.tower.x, g.tower.y];
  run(g, 30, { moveX: -1, moveY: 0 }); // back toward the tower: no movement
  assert.deepEqual([g.tower.x, g.tower.y], before);
});

test('contact: one knight overlapping the tower for 1 s removes 10 HP (±1 tick)', () => {
  const g = quietGame();
  g.weapons = [];
  createEnemy(g, 'knight', g.tower.x, g.tower.y + TOWER_RADIUS + 12 - 4);
  run(g, 60, {});
  assert.ok(Math.abs(g.tower.hp - 90) <= 10 * DT + 1e-9, `hp ${g.tower.hp}`);
});

test('contact: an enemy walks to the tower and stops just inside contact range', () => {
  const g = quietGame();
  g.weapons = [];
  const k = createEnemy(g, 'knight', 200, 60);
  run(g, 60 * 5, {});
  const dist = Math.hypot(k.x - g.tower.x, k.y - g.tower.y);
  assert.ok(Math.abs(dist - (12 + TOWER_RADIUS - 1)) < 1e-9, `dist ${dist}`);
  assert.equal(k.flip, true, 'walked left');
  assert.ok(g.tower.hp < 100);
});

// ---- enemies ------------------------------------------------------------------

test('separation: overlapping enemies push apart; the golem is immovable', () => {
  const g = quietGame();
  const a = createEnemy(g, 'knight', 0, 300);
  const b = createEnemy(g, 'knight', 10, 300);
  g.grid.build(g.enemies);
  separate(g);
  assert.ok(b.x - a.x > 10 && b.x - a.x <= 24 + 1e-9, `gap ${b.x - a.x}`);

  const h = quietGame();
  const golem = createEnemy(h, 'golem', 0, 300);
  const k = createEnemy(h, 'knight', 50, 300);
  h.grid.build(h.enemies);
  separate(h);
  assert.deepEqual([golem.x, golem.y], [0, 300]);
  assert.ok(Math.abs(k.x - 68) < 1e-9, `knight moved the whole overlap: ${k.x}`);

  const s = quietGame();
  const p = createEnemy(s, 'knight', 5, 300), q = createEnemy(s, 'knight', 5, 300);
  s.grid.build(s.enemies);
  separate(s);
  assert.ok(p.x < q.x, 'coincident enemies separate along x by id');
});

test('separation: at most 6 neighbours push an enemy per tick', () => {
  const g = quietGame();
  const e = createEnemy(g, 'knight', 0, 0);
  for (let i = 0; i < 10; i++) createEnemy(g, 'knight', 1 + i * 0.1, 0); // all to the right
  g.grid.build(g.enemies);
  const x0 = e.x;
  separate(g);
  // each neighbour pushes at most half of 24 px; 6 of them -> at most 72 px
  assert.ok(x0 - e.x <= 6 * 12 + 1e-9 && x0 - e.x > 0);
});

test('despawn: an enemy past DESPAWN_DIST from the tower is removed and its budget refunded', () => {
  const g = quietGame();
  createEnemy(g, 'knight', g.tower.x + DESPAWN_DIST + 50, g.tower.y);
  createEnemy(g, 'knight', g.tower.x + DESPAWN_DIST - 50, g.tower.y);
  g.spawner.budget = 0;
  g.stepEnemies();
  assert.equal(g.enemies.length, 1);
  assert.equal(g.spawner.budget, 1);
  assert.equal(g.kills, 0);
  g.tick({});
  assert.equal(g.spawner.spawned, 1, 'the refund respawns it on the ring');
  const fresh = g.enemies[g.enemies.length - 1];
  // spawned on the ring, then walked one tick (< 1 px) toward the tower
  assert.ok(Math.abs(Math.hypot(fresh.x - g.dragon.x, fresh.y - g.dragon.y) - SPAWN_RING_RADIUS) < 1);
});

// ---- spawner and timeline -------------------------------------------------------

test('timeline: rate interpolates between rows, weights switch at the boundary, rate stays after 5:00', () => {
  assert.equal(rateAt(TIMELINE, 0), 1.5);
  assert.equal(rateAt(TIMELINE, 15), 2);
  assert.equal(rateAt(TIMELINE, 90), 4.25);
  assert.equal(rateAt(TIMELINE, 300), 12);
  assert.equal(rateAt(TIMELINE, 1000), 12);
  assert.equal(rowIndexAt(TIMELINE, 29.999), 0);
  assert.equal(rowIndexAt(TIMELINE, 30), 1);
  assert.equal(rowIndexAt(TIMELINE, 1000), 6);
  assert.equal(pickType({ knight: 100, skeleton: 0 }, 0.999), 'knight');
  assert.equal(pickType({ knight: 70, skeleton: 30 }, 0.69), 'knight');
  assert.equal(pickType({ knight: 70, skeleton: 30 }, 0.71), 'skeleton');
  assert.equal(pickType({ knight: 0 }, 0.5), null);
});

test('timeline: first 30 s spawns only knights, on the ring, at the integrated rate', () => {
  const g = new Game({ seed: 9 });
  g.tower.hp = 1e9;
  const seen = new Set();
  const types = new Set();
  let expected = 0;
  for (let i = 0; i < 30 * 60; i++) {
    expected += rateAt(TIMELINE, g.t) * DT;
    g.tick(scripted(i));
    for (const e of g.enemies) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      types.add(e.type);
    }
  }
  assert.deepEqual([...types], ['knight']);
  assert.ok(Math.abs(expected - 60) < 0.1, `integral ${expected}`);
  assert.ok(Math.abs(g.spawner.spawned - expected) <= 1, `spawned ${g.spawner.spawned} vs ${expected}`);
  // the next row brings skeletons
  run(g, 30 * 60, scripted);
  assert.ok(g.enemies.some((e) => e.type === 'skeleton'));
});

test('cap: MAX_ENEMIES is never exceeded under a forced high rate, and the budget does not bank', () => {
  const g = new Game({ seed: 2, timeline: [{ t: 0, rate: 1e5, weights: { knight: 100 } }] });
  g.tower.hp = 1e9;
  for (let i = 0; i < 120; i++) {
    g.tick(scripted(i));
    assert.ok(g.enemies.length <= MAX_ENEMIES, `tick ${i}: ${g.enemies.length}`);
    assert.ok(g.spawner.budget <= 1);
  }
  assert.equal(g.enemies.length, MAX_ENEMIES);
});

// ---- fireball, deaths, effects ----------------------------------------------------

test('fireball: kills a knight in 2 hits at level 1; death effect, kill and sound', () => {
  const g = quietGame();
  const k = createEnemy(g, 'knight', 0, 300); // below the tower, walking up the fireball line
  const aimDown = { aimX: 0, aimY: 1, hasAim: true };
  const hpSeen = [];
  let deathTick = -1;
  for (let i = 0; i < 180 && deathTick < 0; i++) {
    g.tick(aimDown);
    if (hpSeen[hpSeen.length - 1] !== k.hp) hpSeen.push(k.hp);
    if (g.kills === 1) deathTick = i;
  }
  assert.deepEqual(hpSeen, [3, 1, -1]);
  assert.ok(deathTick > 0);
  assert.equal(g.enemies.length, 0);
  assert.ok(g.events.some((e) => e.name === 'death01'));
  const die = g.effects.find((f) => f.anim === 'knight.die');
  assert.ok(die && die.x === k.x && die.y === k.y && die.flip === k.flip);
  assert.ok(g.effects.some((f) => f.anim === 'explosion.small'));
  assert.equal(g.score(), Math.floor(g.t) + 1);
});

test('fireball: level stats, fan spread and big sprite', () => {
  const g = quietGame();
  g.weapons = [createWeapon('fireball', 5)];
  g.tick({ aimX: 1, aimY: 0, hasAim: true });
  const angles = g.projectiles.map((p) => Math.round(Math.atan2(p.dy, p.dx) * 180 / Math.PI));
  assert.deepEqual(angles, [-10, 0, 10]);
  for (const p of g.projectiles) {
    assert.deepEqual([p.damage, p.speed, p.range, p.r, p.anim, p.gen], [4, 460, 520, 8, 'fireball.big', 0]);
  }
  const h = quietGame();
  h.weapons = [createWeapon('fireball', 3)];
  h.tick({});
  assert.equal(h.projectiles.length, 2);
  assert.equal(h.projectiles[0].anim, 'fireball.anim');
});

test('fireball: fires on the first tick, then every cooldown', () => {
  const g = quietGame();
  const fired = [];
  for (let i = 0; i < 200; i++) {
    g.tick({});
    if (g.events.some((e) => e.name === 'shoot01')) fired.push(i);
  }
  assert.deepEqual(fired.slice(0, 4), [0, 54, 108, 162]);
});

test('projectiles: expire after travelling their range', () => {
  const g = quietGame();
  g.tick({});
  const p = g.projectiles[0];
  let ticks = 1;
  while (g.projectiles.includes(p)) { g.tick({}); ticks++; }
  assert.equal(ticks, 60); // 420 px at 7 px/tick: removed on its 60th move
  assert.ok(Math.abs(p.travelled - 420) < 1e-9);
});

test('projectiles: a projectile hits only one enemy (no procs yet) and remembers it', () => {
  const g = quietGame();
  g.weapons = [];
  const a = createEnemy(g, 'knight', 100, 0);
  const b = createEnemy(g, 'knight', 104, 0);
  g.weapons = [createWeapon('fireball', 1)];
  g.tower.x = 100; g.tower.y = 0; // enemies already at the tower: they stand still
  for (let i = 0; i < 30; i++) g.tick({});
  assert.equal(a.hp + b.hp, 3 + 3 - 2, 'exactly one hit landed');
});

test('effects: anim helper advances by ANIMS ticks and reports the end once', () => {
  const e = {};
  setAnim(e, 'knight.die'); // 9 frames x 6 ticks
  const len = animLength('knight.die');
  assert.equal(len, 54);
  let done = -1;
  for (let i = 1; i <= len; i++) if (advanceAnim(e, false)) { done = i; break; }
  assert.equal(done, 54);
  assert.equal(e.frame, 8);
  const w = {};
  setAnim(w, 'knight.walk'); // 2 x 6, looping
  for (let i = 0; i < 12; i++) assert.equal(advanceAnim(w, true), false);
  assert.deepEqual([w.frame, w.frameTicks], [0, 0]);
  assert.throws(() => advanceAnim({ anim: 'no.such', frame: 0, frameTicks: 0 }, true));
});

test('effects: finished effects are removed, held ones stay on their last frame', () => {
  const g = quietGame();
  const a = spawnEffect(g, 'explosion.small', 0, 0);
  const b = spawnEffect(g, 'explosion.small', 0, 0, { hold: true });
  for (let i = 0; i < animLength('explosion.small') - 1; i++) g.stepEffects();
  assert.equal(g.effects.length, 2);
  g.stepEffects();
  assert.deepEqual(g.effects, [b]);
  assert.ok(a.done && b.done);
  assert.equal(b.frame, 5);
});

test('events: cleared every tick, one per sound name per tick', () => {
  const g = quietGame();
  g.sound('death01');
  g.sound('death01');
  assert.equal(g.events.length, 1);
  g.tick({});
  assert.ok(!g.events.some((e) => e.name === 'death01'));
});

// ---- game over -----------------------------------------------------------------

test('game over: tower HP 0 -> dying with castle.destroy, then over after 2 s; over is inert', () => {
  const g = new Game({ seed: 5 });
  run(g, 30, scripted);
  g.tower.hp = 0;
  g.tick(scripted(30));
  assert.equal(g.phase, 'dying');
  const t = g.t;
  const fx = g.effects.find((f) => f.anim === 'castle.destroy');
  assert.ok(fx && fx.x === g.tower.x && fx.y === g.tower.y);
  assert.ok(g.events.some((e) => e.name === 'destroy_castle_sound'));
  const enemies = JSON.stringify(g.enemies), dragon = JSON.stringify(g.dragon);
  for (let i = 0; i < 119; i++) g.tick({ moveX: 1, moveY: 0 });
  assert.equal(g.phase, 'dying');
  assert.equal(JSON.stringify(g.enemies), enemies, 'enemies frozen while dying');
  assert.equal(JSON.stringify(g.dragon), dragon, 'dragon frozen while dying');
  assert.equal(g.t, t, 'clock stopped');
  g.tick({});
  assert.equal(g.phase, 'over');
  assert.ok(g.effects.includes(fx), 'the destroyed castle holds its last frame');
  const d = g.digest();
  run(g, 60, scripted);
  assert.equal(g.digest(), d);
  assert.equal(g.events.length, 0);
  assert.equal(g.score(), Math.floor(t) + g.kills);
});

test('run counters start as decided', () => {
  const g = new Game({ seed: 1 });
  assert.deepEqual(
    [g.kills, g.level, g.xp, g.pendingLevelUps, g.buffs, g.weapons, g.phase, g.t, g.tickCount],
    [0, 1, 0, 0, [], [{ id: 'fireball', level: 1, timer: 0 }], 'play', 0, 0],
  );
  assert.equal(g.tower.hp, g.tower.maxHp);
  // every enemy type can be created with its table values
  for (const type of Object.keys(ENEMIES)) {
    const e = createEnemy(g, type, 0, 0);
    assert.deepEqual([e.type, e.hp, e.r, e.alpha, e.anim], [type, ENEMIES[type].hp, ENEMIES[type].r, ENEMIES[type].alpha, ENEMIES[type].walk]);
  }
  // the rng is read through game.rng on every draw, so a stub takes effect
  const h = new Game({ seed: 1, timeline: [{ t: 0, rate: 90, weights: { knight: 100 } }] });
  h.rng = () => 0;
  h.tick({});
  assert.equal(h.enemies.length, 1);
  assert.ok(Math.abs(h.enemies[0].x - (h.dragon.x + SPAWN_RING_RADIUS)) < 2, 'angle 0 is to the right');
});
