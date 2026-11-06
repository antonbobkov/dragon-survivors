// Growth (§10–§12, §14): gems, XP, level-up offers and picks, laser, mini tower, ring,
// buffs and procs, determinism with picks in the intent stream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { dropGem } from '../src/sim/gems.js';
import { cardPool, rollOffers, applyCard, cardInfo } from '../src/sim/levelup.js';
import { createWeapon, buffMods, buffDamage, collideRing } from '../src/sim/weapons.js';
import { spawnProjectile, resolveHit } from '../src/sim/projectiles.js';
import {
  DT, MAX_GEMS, GEM_COLLECT_RADIUS, DRAGON_PICKUP_RADIUS, WEAPONS, BUFFS, BUFF_IDS, WEAPON_IDS,
  EXPLODE_RADIUS, GOLEM_HP, REPAIR_HP, xpToNext,
} from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
// No spawns, no weapons: only what a test places acts.
const still = (seed = 1) => {
  const g = new Game({ seed, timeline: QUIET });
  g.weapons = [];
  return g;
};
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(typeof intent === 'function' ? intent(i) : intent); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const sounded = (g, name) => g.events.some((ev) => ev.type === 'sound' && ev.name === name);
const gemAt = (g, x, y, value = 1) => { const gem = { id: g.nextId++, x, y, value, homing: false }; g.gems.push(gem); return gem; };
// Counts game.rng draws; returns the values in `seq` (cycling), or 0.
const countingRng = (g, seq = [0]) => { const c = { n: 0 }; g.rng = () => seq[c.n++ % seq.length]; return c; };
// A tough enemy that a test hits by hand.
const dummy = (g, x, y, type = 'knight') => { const e = createEnemy(g, type, x, y); if (!e.unkillable) e.hp = 1000; return e; };
const shot = (g, o = {}) => spawnProjectile(g, { kind: 'fireball', x: 0, y: 0, dx: 1, dy: 0, speed: 420, range: 420, r: 6, damage: 2, anim: 'fireball.anim', ...o });
// Bring a game to its first level-up: XP one short, a gem on the dragon.
const levelUp = (g) => { g.xp = xpToNext(g.level) - 1; gemAt(g, g.dragon.x, g.dragon.y); g.tick({}); };

// ---- gems ------------------------------------------------------------------------

test('gems: a kill drops a gem worth the enemy XP at its position; the golem drops none', () => {
  const g = still();
  const m = createEnemy(g, 'mage', 100, 50);
  m.hp = 0;
  g.stepDeaths();
  assert.equal(g.gems.length, 1);
  const [gem] = g.gems;
  assert.deepEqual([gem.x, gem.y, gem.value, gem.homing], [100, 50, 5, false]);
  assert.ok(gem.id < g.effects[0].id, 'dropped before the death effect');
  const golem = createEnemy(g, 'golem', 0, 0);
  dropGem(g, golem);
  assert.equal(g.gems.length, 1);
});

test('gems: homing starts inside the pickup radius and continues after the dragon leaves', () => {
  const g = still();
  const a = gemAt(g, DRAGON_PICKUP_RADIUS - 1, 0);
  const b = gemAt(g, DRAGON_PICKUP_RADIUS + 20, 0);
  g.stepGems();
  assert.equal(a.homing, true);
  assert.ok(near(a.x, DRAGON_PICKUP_RADIUS - 1 - 500 * DT), `x ${a.x}`);
  assert.deepEqual([b.homing, b.x], [false, DRAGON_PICKUP_RADIUS + 20]);
  g.dragon.x = -400;
  const x0 = a.x;
  g.stepGems();
  assert.ok(near(a.x, x0 - 500 * DT), 'still homing at 500 px/s');
  assert.equal(b.homing, false);
});

test('gems: collected within GEM_COLLECT_RADIUS: XP, pickup sound, gone', () => {
  const g = still();
  gemAt(g, GEM_COLLECT_RADIUS + 500 * DT - 0.01, 0, 2); // ends the step just inside the radius
  g.tick({});
  assert.equal(g.gems.length, 0);
  assert.equal(g.xp, 2);
  assert.ok(sounded(g, 'pickup'));
  const h = still();
  gemAt(h, GEM_COLLECT_RADIUS + 500 * DT + 0.5, 0);
  h.tick({});
  assert.equal(h.gems.length, 1, 'just outside after the step: not yet');
});

test('gems: XP overflow carries over and several level-ups queue in one tick', () => {
  const g = still();
  g.xp = 7;
  gemAt(g, 0, 0, 5);
  gemAt(g, 0, 0, 30);
  g.tick({});
  // 42 XP: 8 (L1) + 11 (L2) + 14 (L3) leaves 9 of the 17 for L4
  assert.deepEqual([g.level, g.pendingLevelUps, g.xp], [4, 3, 9]);
  assert.equal(g.offers.length, 3);
});

test('gems: past MAX_GEMS the oldest merges into the gem nearest to it (ties: lower id)', () => {
  const g = still();
  for (let i = 0; i < MAX_GEMS; i++) dropGem(g, { type: 'knight', x: 1000 + i * 100, y: 0 });
  const oldest = g.gems[0];
  // two gems 10 px from the oldest, the second with a lower id than the first
  g.gems[1].x = oldest.x + 10; g.gems[1].y = 0;
  g.gems[2].x = oldest.x - 10; g.gems[2].y = 0;
  const lower = g.gems[1];
  dropGem(g, { type: 'mage', x: -5000, y: 0 });
  assert.equal(g.gems.length, MAX_GEMS);
  assert.ok(!g.gems.includes(oldest));
  assert.equal(lower.value, 2);
  assert.equal(g.gems.reduce((s, x) => s + x.value, 0), MAX_GEMS + 5, 'no XP lost');
});

// ---- level-up ------------------------------------------------------------------------

test('level-up: the pool respects slots and level caps; a full build offers only Repair', () => {
  const g = still();
  g.weapons = WEAPON_IDS.map((id) => createWeapon(id, id === 'ring' ? 5 : 2));
  g.buffs = ['damage', 'cooldown', 'area', 'speed'].map((id) => ({ id, level: id === 'area' ? 3 : 1 }));
  const pool = cardPool(g);
  assert.deepEqual(pool.map((p) => [p.card.kind, p.card.id, p.card.level, p.weight]), [
    ['weapon', 'fireball', 3, 4], ['weapon', 'laser', 3, 4], ['weapon', 'miniTower', 3, 4],
    ['buff', 'damage', 2, 3], ['buff', 'cooldown', 2, 3], ['buff', 'speed', 2, 3],
    ['repair', 'repair', 1, 1],
  ]);
  g.weapons.forEach((w) => { w.level = 5; });
  g.buffs.forEach((b) => { b.level = 3; });
  assert.deepEqual(rollOffers(g), [{ kind: 'repair', id: 'repair', level: 1 }]);
});

test('level-up: offers are 3 distinct cards drawn by weight, one rng draw each, in pool order', () => {
  const g = still();
  g.weapons = [createWeapon('fireball', 1)];
  const c = countingRng(g, [0]);
  // pool: fireball L2 (4), laser, miniTower, ring (3 each), 7 new buffs (3 each), repair (1)
  assert.deepEqual(rollOffers(g).map((x) => `${x.id}${x.level}`), ['fireball2', 'laser1', 'miniTower1']);
  assert.equal(c.n, 3);
  g.rng = () => 0.9999;
  assert.deepEqual(rollOffers(g).map((x) => x.id), ['repair', 'pierce', 'split']);
  // 0.1 × 35 = 3.5 < 4: fireball; 0.1 × 31 = 3.1 passes laser (3): miniTower; 0.1 × 28 = 2.8 < 3: laser
  g.rng = () => 0.1;
  assert.deepEqual(rollOffers(g).map((x) => x.id), ['fireball', 'miniTower', 'laser']);
});

test('level-up: the world is frozen while offers are open; a valid pick applies the card', () => {
  const g = new Game({ seed: 4 }); // default timeline: spawns would show if the world ran
  run(g, 120);
  levelUp(g);
  assert.ok(g.offers.length === 3 && g.pendingLevelUps === 1);
  const d = g.digest(), tc = g.tickCount;
  run(g, 90, { moveX: 1, aimX: 0, aimY: 1, hasAim: true, pick: -1 });
  g.tick({ pick: 7 }); // out of range: ignored by the intent normaliser
  assert.equal(g.digest(), d, 'digest unchanged by ticks without a pick');
  assert.equal(g.tickCount, tc);
  assert.equal(g.events.length, 0, 'events still cleared');
  const card = g.offers[1];
  g.tick({ pick: 1, moveX: 1 });
  assert.equal(g.tickCount, tc, 'the pick tick does not advance the world');
  assert.ok(sounded(g, 'powerup'));
  assert.deepEqual([g.pendingLevelUps, g.offers], [0, []]);
  const owned = card.kind === 'weapon' ? g.weapons : g.buffs;
  assert.ok(card.kind === 'repair' || owned.some((x) => x.id === card.id && x.level === card.level), JSON.stringify(card));
  g.tick({});
  assert.equal(g.tickCount, tc + 1, 'the world runs again');
});

test('level-up: with several pending, each pick rolls the next offers from the new build', () => {
  const g = still();
  g.weapons = [createWeapon('fireball', 1)];
  g.xp = 7;
  gemAt(g, 0, 0, 30); // 37 XP: L1->2 (8), L2->3 (11), L3->4 (14), 4 left
  g.rng = () => 0; // always the first pool card: the fireball upgrade
  g.tick({});
  assert.equal(g.pendingLevelUps, 3);
  g.tick({ pick: 0 });
  g.tick({ pick: 0 });
  assert.equal(g.pendingLevelUps, 1);
  assert.equal(g.weapons[0].level, 3);
  assert.deepEqual(g.offers[0], { kind: 'weapon', id: 'fireball', level: 4 });
});

test('level-up: applying cards (new weapon fires next step, upgrades, buffs, Repair capped)', () => {
  const g = still();
  applyCard(g, { kind: 'weapon', id: 'laser', level: 1 });
  assert.deepEqual(g.weapons, [{ id: 'laser', level: 1, timer: 0 }]);
  g.weapons[0].timer = 0.5;
  applyCard(g, { kind: 'weapon', id: 'laser', level: 2 });
  assert.deepEqual(g.weapons, [{ id: 'laser', level: 2, timer: 0.5 }], 'an upgrade keeps the timer');
  applyCard(g, { kind: 'buff', id: 'split', level: 1 });
  applyCard(g, { kind: 'buff', id: 'split', level: 2 });
  assert.deepEqual(g.buffs, [{ id: 'split', level: 2 }]);
  g.tower.hp = 90;
  applyCard(g, { kind: 'repair', id: 'repair', level: 1 });
  assert.equal(g.tower.hp, g.tower.maxHp);
  g.tower.hp = 10;
  applyCard(g, { kind: 'repair', id: 'repair', level: 1 });
  assert.equal(g.tower.hp, 10 + REPAIR_HP);
});

test('level-up: a level-up queued on the tick the tower falls is dropped', () => {
  const g = still();
  g.xp = 7;
  gemAt(g, 0, 0);
  g.tower.hp = 0;
  g.tick({});
  assert.equal(g.phase, 'dying');
  assert.deepEqual([g.offers, g.pendingLevelUps, g.level], [[], 0, 2]);
});

test('level-up: card text for every card is one short line with a known icon', () => {
  const cards = [{ kind: 'repair', id: 'repair', level: 1 }];
  for (const id of WEAPON_IDS) for (let l = 1; l <= 5; l++) cards.push({ kind: 'weapon', id, level: l });
  for (const id of BUFF_IDS) for (let l = 1; l <= 3; l++) cards.push({ kind: 'buff', id, level: l });
  for (const c of cards) {
    const info = cardInfo(c);
    assert.ok(info.name && info.text && info.text.length <= 44, JSON.stringify(info));
    assert.equal(info.tag, c.kind === 'repair' ? '' : c.level === 1 ? 'NEW' : `L${c.level}`);
    assert.ok(info.icon.anim && info.icon.scale > 0);
  }
  assert.equal(cardInfo({ kind: 'weapon', id: 'miniTower', level: 1 }).name, 'Mini Tower');
  assert.equal(cardInfo({ kind: 'buff', id: 'damage', level: 2 }).text, '+50% damage');
  assert.equal(cardInfo({ kind: 'weapon', id: 'laser', level: 3 }).text, 'dmg 1→2, cd 1.3→1.2, speed 700→750');
  assert.equal(cardInfo({ kind: 'weapon', id: 'laser', level: 1 }).text, 'Fast long-range aimed laser');
  assert.equal(cardInfo({ kind: 'weapon', id: 'miniTower', level: 1 }).text, 'Lobs turrets that shoot your fireball');
  assert.equal(cardInfo({ kind: 'weapon', id: 'miniTower', level: 3 }).text, 'rate 0.7→0.6, cd 6→5');
  assert.equal(cardInfo({ kind: 'buff', id: 'pierce', level: 2 }).text, '35% chance to pierce');
  assert.equal(cardInfo({ kind: 'buff', id: 'explode', level: 1 }).icon.anim, BUFFS.explode.icon);
});

// ---- laser ---------------------------------------------------------------------------

test('laser: level 1 and level 5 stats, parallel pair at ±6 px, sprite and sound', () => {
  const g = still();
  g.weapons = [createWeapon('laser', 1)];
  const fired = [];
  for (let i = 0; i < 200; i++) { g.tick({ aimX: 1, aimY: 0, hasAim: true }); if (sounded(g, 'laser01')) fired.push(i); }
  assert.deepEqual(fired.slice(0, 3), [0, 84, 168], '1.4 s cooldown');
  const h = still();
  h.weapons = [createWeapon('laser', 1)];
  h.tick({ aimX: 1, aimY: 0, hasAim: true });
  const [p] = h.projectiles;
  assert.deepEqual([p.kind, p.anim, p.dirFrame, p.damage, p.speed, p.range, p.r], ['laser', 'laser.dir', 12, 1, 700, 600, 6]);
  assert.ok(!('maxHits' in p) && !('hitCount' in p), 'no hit budget: a laser stops at its first hit');
  const k = still();
  k.weapons = [createWeapon('laser', 5)];
  k.tick({ aimX: 0, aimY: -1, hasAim: true }); // aim up: perpendicular (1, 0)
  assert.equal(k.projectiles.length, 2);
  const [a, b] = k.projectiles;
  assert.ok(near(a.x, 6) && near(b.x, -6), `${a.x} ${b.x}`);
  assert.ok(near(a.dx, b.dx) && near(a.dy, b.dy) && near(a.dy, -1), 'parallel');
  assert.deepEqual([a.anim, a.damage, a.speed, a.range, a.r], ['laser.bigdir', 3, 800, 700, 8]);
});

// Fire one projectile through a row of tough enemies on the x-axis, enemies held still.
function throughRow(g, n, mk) {
  const row = Array.from({ length: n }, (_, i) => dummy(g, 100 + i * 40, 0));
  mk();
  for (let i = 0; i < 120; i++) { g.stepProjectiles(); g.stepCollisions(); }
  return row.filter((e) => e.hp < 1000).length;
}

test('laser: stops at its first hit without Pierce, draws nothing and spawns no effect', () => {
  const g = still();
  g.weapons = [createWeapon('laser', 5)];
  g.buffs = [{ id: 'damage', level: 3 }, { id: 'area', level: 3 }, { id: 'speed', level: 3 }, { id: 'cooldown', level: 3 }];
  const c = countingRng(g);
  // level 5 fires two parallel lasers 6 px either side of the row: both hit its first enemy
  assert.equal(throughRow(g, 10, () => g.stepWeapons()), 1);
  assert.equal(c.n, 0, 'no chance buff: no roll');
  assert.deepEqual(g.effects, [], 'no hit effect');
  assert.equal(g.projectiles.length, 0);
});

test('laser: the Pierce buff gives a pierce chance (20/35/50%) rolled on every hit', () => {
  // rng 0.3: below 35% and 50%, not below 20%
  for (const [pierce, hits] of [[1, 1], [2, 10], [3, 10]]) {
    const g = still();
    g.buffs = [{ id: 'pierce', level: pierce }];
    g.weapons = [createWeapon('laser', 1)];
    const c = countingRng(g, [0.3]);
    assert.equal(throughRow(g, 10, () => g.stepWeapons()), hits, `pierce L${pierce}`);
    assert.equal(c.n, hits, 'one pierce roll per hit');
  }
  // L1: survives two wins, stopped by the first loss
  const g = still();
  g.buffs = [{ id: 'pierce', level: 1 }];
  g.weapons = [createWeapon('laser', 1)];
  const c = countingRng(g, [0.1, 0.19, 0.2, 0]);
  assert.equal(throughRow(g, 10, () => g.stepWeapons()), 3);
  assert.equal(c.n, 3);
});

test('laser: never explodes or splits, even with Explode L3 and Split L3', () => {
  const g = still();
  g.buffs = [{ id: 'explode', level: 3 }, { id: 'split', level: 3 }];
  g.weapons = [createWeapon('laser', 1)];
  const c = countingRng(g, [0]);
  const beside = dummy(g, 100, 30); // inside any explosion at the first enemy of the row
  assert.equal(throughRow(g, 10, () => g.stepWeapons()), 1);
  assert.equal(c.n, 0, 'no explode or split roll for a laser');
  assert.equal(beside.hp, 1000);
  assert.deepEqual(g.effects, []);
  assert.equal(g.projectiles.length, 0, 'no split children; used up');
});

// ---- mini tower ----------------------------------------------------------------------

test('mini tower: lobbed 80 px toward the nearest enemy, silent in flight, then shoots', () => {
  const g = still();
  g.weapons = [createWeapon('miniTower', 1)];
  const e = dummy(g, 300, 60); // walks left along y = 60 toward the tower at (0, 60)
  g.tick({});
  assert.equal(g.miniTowers.length, 1);
  const m = g.miniTowers[0];
  assert.deepEqual([m.x, m.y, m.fromX, m.fromY, m.lobTicks], [80, 60, 0, 60, 29]);
  run(g, 29);
  assert.equal(m.lobTicks, 0);
  assert.equal(g.projectiles.length, 0, 'no shot during the 0.5 s lob');
  g.tick({});
  assert.equal(g.projectiles.length, 1, 'fires on the first tick after landing');
  const [p] = g.projectiles;
  // a level 1 fireball (no fireball owned in this test game: level 1 is read)
  assert.deepEqual([p.kind, p.anim, p.speed, p.range, p.r, p.damage, p.gen], ['fireball', 'fireball.anim', 420, 420, 6, 2, 0]);
  assert.ok(near(p.x, 80 + p.speed * DT) && near(p.y, 60), 'started at the mini tower, moved one step');
  assert.ok(near(p.dx, 1) && near(p.dy, 0));
  const fired = [];
  const seen = new Set([p.id]);
  for (let i = 0; i < 200; i++) {
    g.tick({});
    if (g.projectiles.some((x) => !seen.has(x.id))) fired.push(i);
    for (const x of g.projectiles) seen.add(x.id);
  }
  assert.deepEqual(fired.slice(0, 2), [47, 95], 'every 0.8 s');
  assert.ok(e.hp < 1000);
});

test('mini tower: random direction with no enemies; no target beyond 300 px; life and maxActive', () => {
  const g = still();
  g.weapons = [createWeapon('miniTower', 1)];
  g.rng = () => 0.25; // angle π/2: straight down
  g.tick({});
  const m = g.miniTowers[0];
  assert.ok(near(m.x, 0) && near(m.y, 140), `${m.x}, ${m.y}`);
  g.weapons[0].timer = 1e9; // no further lobs
  let life = 0;
  while (g.miniTowers.length && life < 2000) { g.tick({}); life++; }
  assert.equal(life, 29 + 8 * 60, '0.5 s lob, then 8 s from landing');

  const k = still();
  k.weapons = [createWeapon('miniTower', 1)];
  k.rng = () => 0.25;
  run(k, 30); // landed at (0, 140)
  dummy(k, 0, 140 + 302); // walks up 55/60 px this tick: still beyond 300
  k.tick({});
  assert.equal(k.projectiles.length, 0, 'no target beyond 300 px');
  dummy(k, 0, 140 + 290);
  k.tick({});
  assert.equal(k.projectiles.length, 1, 'the nearest one inside 300 px');
  assert.ok(near(k.projectiles[0].dy, 1));

  const h = still();
  h.weapons = [createWeapon('miniTower', 5)];
  for (let i = 0; i < 6; i++) { h.weapons[0].timer = 0; h.tick({}); }
  assert.equal(h.miniTowers.length, 4, 'maxActive at level 5');
  const ids = h.miniTowers.map((x) => x.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'the oldest went first');
  assert.equal(h.miniTowers[0].life, 14 * 60);
});

// The first mini-tower shot of a game owning the fireball at `level` and a mini tower; the
// fireball itself is held so every projectile is a mini-tower shot.
function firstMiniShot(level, buffs) {
  const g = still();
  g.buffs = buffs.map((b) => ({ ...b }));
  g.weapons = [createWeapon('fireball', level), createWeapon('miniTower', 1)];
  g.weapons[0].timer = 1e9;
  dummy(g, 100, 200);
  for (let i = 0; i < 40 && g.projectiles.length === 0; i++) g.stepWeapons();
  assert.equal(g.projectiles.length, 1, 'one projectile per shot: no fan');
  return { g, p: g.projectiles[0] };
}
// What the dragon fires at that fireball level with those buffs.
function dragonFireball(level, buffs) {
  const g = still();
  g.buffs = buffs.map((b) => ({ ...b }));
  g.weapons = [createWeapon('fireball', level)];
  g.stepWeapons();
  return g.projectiles[0];
}
const statsOf = (p) => [p.kind, p.anim, p.damage, p.speed, p.range, p.r, p.gen];

test('mini tower: each shot is a copy of the dragon fireball at its level and buffs (L1, L5)', () => {
  const buffs = [{ id: 'damage', level: 1 }, { id: 'area', level: 2 }, { id: 'speed', level: 1 }];
  const l1 = firstMiniShot(1, buffs).p;
  assert.deepEqual(statsOf(l1), statsOf(dragonFireball(1, buffs)));
  assert.deepEqual(statsOf(l1).slice(0, 5), ['fireball', 'fireball.anim', 3, 420 * 1.2, 420 * 1.2]);
  assert.ok(near(l1.r, 6 * 1.4));
  const { g, p: l5 } = firstMiniShot(5, buffs);
  assert.deepEqual(statsOf(l5), statsOf(dragonFireball(5, buffs)));
  assert.deepEqual(statsOf(l5).slice(0, 5), ['fireball', 'fireball.big', 5, 460 * 1.2, 520 * 1.2], 'big sprite from level 4');
  assert.ok(near(l5.r, 8 * 1.4));
  assert.equal(sounded(g, 'shoot01'), false, 'a mini-tower shot plays no sound');
  // upgrading the fireball changes the next shot of a standing mini tower
  const m = firstMiniShot(1, []);
  m.g.weapons[0].level = 4;
  m.g.miniTowers[0].timer = 0;
  m.g.stepWeapons();
  assert.deepEqual([m.g.projectiles[1].anim, m.g.projectiles[1].damage], ['fireball.big', 3]);
});

test('mini tower: shots have the fireball procs (explode, split, pierce), and none without buffs', () => {
  const none = firstMiniShot(1, []);
  const c = countingRng(none.g);
  const plain = dummy(none.g, 0, 0);
  none.g.grid.build(none.g.enemies);
  assert.equal(resolveHit(none.g, none.p, plain), false, 'used up by its hit');
  assert.equal(c.n, 0, 'no chance buffs: no roll');
  assert.deepEqual(none.g.effects, [], 'no hit effect');

  const all = [{ id: 'explode', level: 1 }, { id: 'split', level: 1 }, { id: 'pierce', level: 1 }];
  const { g, p } = firstMiniShot(4, all);
  const d = countingRng(g, [0]);
  const e = dummy(g, p.x, p.y);
  const near1 = dummy(g, p.x + 40, p.y);
  g.grid.build(g.enemies);
  assert.equal(resolveHit(g, p, e), true, 'pierces');
  assert.equal(d.n, 3, 'explode, split and pierce rolled');
  assert.ok(near1.hp < 1000 && g.effects.some((f) => f.anim === 'explosion.big'), 'exploded');
  const kids = g.projectiles.filter((x) => x !== p);
  assert.equal(kids.length, 2);
  for (const k of kids) assert.deepEqual([k.kind, k.anim, k.gen], ['fireball', 'fireball.big', 1], 'split children keep the big sprite');
});

// ---- ring ----------------------------------------------------------------------------

test('ring: balls orbit the dragon evenly at level 1 and level 5; area widens the orbit', () => {
  const g = still();
  g.weapons = [createWeapon('ring', 1)];
  g.tick({});
  const w = g.weapons[0];
  const a = 180 * DT * Math.PI / 180;
  assert.equal(w.balls.length, 2);
  assert.ok(near(w.balls[0].x, 60 * Math.cos(a)) && near(w.balls[0].y, 60 * Math.sin(a)));
  assert.ok(near(w.balls[1].x, -60 * Math.cos(a)) && near(w.balls[1].y, -60 * Math.sin(a)));
  const h = still();
  h.weapons = [createWeapon('ring', 5)];
  h.buffs = [{ id: 'area', level: 1 }];
  h.dragon.x = 0;
  h.tick({ moveX: 1 });
  const b = h.weapons[0].balls;
  assert.equal(b.length, 5);
  for (const ball of b) assert.ok(near(Math.hypot(ball.x - h.dragon.x, ball.y - h.dragon.y), 80 * 1.2), 'orbit 80 × area');
  assert.ok(near(h.weapons[0].angle, 260 * DT * Math.PI / 180));
});

test('ring: an enemy is hit at most once per rehit; expired entries are pruned; no procs', () => {
  const g = still();
  g.weapons = [createWeapon('ring', 1)];
  g.buffs = [{ id: 'explode', level: 3 }, { id: 'split', level: 3 }, { id: 'pierce', level: 3 }, { id: 'damage', level: 1 }];
  const c = countingRng(g);
  const e = dummy(g, 50, 50);
  const w = g.weapons[0];
  w.balls = [{ x: 50, y: 50 }, { x: 52, y: 50 }];
  const hitTicks = [];
  for (let t = 0; t < 70; t++) {
    g.tickCount = t;
    g.grid.build(g.enemies);
    const hp = e.hp;
    collideRing(g);
    if (e.hp < hp) { hitTicks.push(t); assert.equal(hp - e.hp, 3, 'ceil(2 × 1.25)'); }
  }
  assert.deepEqual(hitTicks, [0, 30, 60], 'rehit 0.5 s');
  assert.equal(c.n, 0, 'ring hits roll no procs');
  assert.equal(g.effects.filter((f) => f.anim === 'explosion.big').length, 0);
  e.hp = 0;
  g.stepDeaths();
  assert.deepEqual(Object.keys(w.rehit), [String(e.id)]);
  g.tickCount = 90;
  g.stepWeapons();
  assert.deepEqual(w.rehit, {}, 'pruned once expired');
});

test('ring: the golem is knocked back from the ring fireball', () => {
  const g = still();
  g.weapons = [createWeapon('ring', 1)];
  const m = createEnemy(g, 'golem', 200, 0);
  g.weapons[0].balls = [{ x: 150, y: 0 }];
  g.grid.build(g.enemies);
  collideRing(g);
  assert.ok(near(m.x, 206) && near(m.y, 0));
  assert.equal(m.hp, GOLEM_HP);
  assert.ok(sounded(g, 'hit_golem'));
});

// ---- buffs ---------------------------------------------------------------------------

test('buffs: buffMods for every buff level, damage rounds up', () => {
  const g = still();
  assert.deepEqual(buffMods(g), { damage: 1, cooldown: 1, area: 1, speed: 1, explode: 0, split: 0, pierce: 0 });
  for (let l = 1; l <= 3; l++) {
    g.buffs = BUFF_IDS.map((id) => ({ id, level: l }));
    const m = buffMods(g);
    assert.ok(near(m.damage, [1.25, 1.5, 1.8][l - 1]));
    assert.ok(near(m.cooldown, [0.9, 0.8, 0.7][l - 1]));
    assert.ok(near(m.area, [1.2, 1.4, 1.6][l - 1]) && near(m.speed, m.area));
    for (const k of ['explode', 'split', 'pierce']) assert.equal(m[k], [0.2, 0.35, 0.5][l - 1]);
  }
  const d = (base, lvl) => buffDamage(base, { damage: lvl ? 1 + BUFFS.damage.levels[lvl - 1] : 1 });
  assert.deepEqual([d(2, 0), d(2, 1), d(2, 2), d(2, 3), d(3, 3), d(4, 1), d(1, 3)], [2, 3, 3, 4, 6, 5, 2]);
});

test('buffs: stat buffs reach every weapon (fireball, laser, mini tower shot, ring)', () => {
  const g = still();
  g.buffs = [{ id: 'damage', level: 1 }, { id: 'cooldown', level: 3 }, { id: 'area', level: 2 }, { id: 'speed', level: 1 }];
  g.weapons = [createWeapon('fireball', 1), createWeapon('laser', 1), createWeapon('miniTower', 1), createWeapon('ring', 1)];
  g.stepWeapons();
  const [fb, lz] = g.projectiles;
  assert.deepEqual([fb.damage, fb.speed, fb.range], [3, 420 * 1.2, 420 * 1.2]);
  assert.ok(near(fb.r, 6 * 1.4));
  assert.deepEqual([lz.damage, lz.speed, lz.range], [2, 700 * 1.2, 600 * 1.2]);
  assert.ok(near(lz.r, 6 * 1.4));
  assert.ok(near(g.weapons[0].timer, 0.9 * 0.7 - DT) && near(g.weapons[1].timer, 1.4 * 0.7 - DT) && near(g.weapons[2].timer, 6 * 0.7 - DT));
  assert.ok(near(Math.hypot(g.weapons[3].balls[0].x, g.weapons[3].balls[0].y), 60 * 1.4));
  // the mini tower's shot after landing (a level 1 fireball)
  g.weapons = [g.weapons[2]];
  dummy(g, 100, 200);
  const before = g.projectiles.length;
  for (let i = 0; i < 40 && g.projectiles.length === before; i++) g.stepWeapons();
  const ms = g.projectiles[before];
  assert.deepEqual([ms.damage, ms.speed, ms.range], [3, 420 * 1.2, 420 * 1.2]);
  assert.ok(near(ms.r, 6 * 1.4));
  assert.ok(near(g.miniTowers[0].timer, 0.8 * 0.7 - DT), 'fireRate × cooldown');
});

// ---- procs ---------------------------------------------------------------------------

test('procs (§20): with rng 0, a fireball with explode L1 spawns an explosion that damages a second enemy', () => {
  const g = still();
  g.weapons = [createWeapon('fireball', 1)];
  g.buffs = [{ id: 'explode', level: 1 }];
  g.rng = () => 0;
  const a = createEnemy(g, 'knight', 100, 0);
  const b = createEnemy(g, 'knight', 130, 30);
  const hpA = a.hp, hpB = b.hp;
  for (let i = 0; i < 30 && a.hp === hpA; i++) g.tick({ aimX: 1, aimY: 0, hasAim: true });
  assert.equal(a.hp, hpA - 2);
  assert.equal(b.hp, hpB - 2, 'the second knight took the explosion');
  const fx = g.effects.find((f) => f.anim === 'explosion.big');
  assert.ok(fx);
  assert.ok(near(fx.scale, (2 * EXPLODE_RADIUS) / (57 * 2)), `scale ${fx.scale}`);
  assert.ok(sounded(g, 'explosion01'));
});

test('procs: explosion radius 60 × area, every enemy once except the one hit; golem untouched', () => {
  const g = still();
  g.buffs = [{ id: 'explode', level: 1 }, { id: 'area', level: 1 }];
  g.rng = () => 0;
  const R = EXPLODE_RADIUS * 1.2;
  const hit = dummy(g, 0, 0);
  const inside = dummy(g, R + 12 - 0.5, 0);
  const outside = dummy(g, 0, R + 12 + 0.5);
  const golem = createEnemy(g, 'golem', -R, 0);
  g.grid.build(g.enemies);
  const p = shot(g, { damage: 3 });
  resolveHit(g, p, hit);
  assert.deepEqual([hit.hp, inside.hp, outside.hp], [997, 997, 1000]);
  assert.deepEqual([golem.x, golem.y, golem.hp], [-R, 0, GOLEM_HP]);
  assert.equal(sounded(g, 'hit_golem'), false);
  const fx = g.effects.filter((f) => f.anim === 'explosion.big');
  assert.ok(fx.length === 1 && near(fx[0].scale, (2 * R) / (57 * 2)));
  // a laser never explodes: no damage around it, no effect
  const l = spawnProjectile(g, { kind: 'laser', x: 0, y: 0, dx: 1, dy: 0, speed: 700, range: 600, r: 6, damage: 1, anim: 'laser.dir' });
  resolveHit(g, l, hit);
  assert.deepEqual([hit.hp, inside.hp], [996, 997]);
  assert.equal(g.effects.length, 1, 'only the fireball explosion');
});

test('procs: the golem takes the hit and the knockback but no proc rolls at all', () => {
  const g = still();
  g.buffs = [{ id: 'explode', level: 3 }, { id: 'split', level: 3 }, { id: 'pierce', level: 3 }];
  const c = countingRng(g);
  const m = createEnemy(g, 'golem', 50, 0);
  g.grid.build(g.enemies);
  const p = shot(g);
  assert.equal(resolveHit(g, p, m), false, 'no pierce through the golem');
  assert.equal(c.n, 0);
  assert.ok(near(m.x, 56));
  assert.equal(g.projectiles.length, 1, 'no split');
});

test('procs: split spawns two fireballs at ±45° with the remaining range; gen 2 cannot split', () => {
  const g = still();
  g.buffs = [{ id: 'split', level: 1 }];
  g.rng = () => 0;
  const e = dummy(g, 100, 0);
  const other = dummy(g, 100, 0); // overlaps the hit point: children must not hit it this tick
  g.grid.build(g.enemies);
  const p = shot(g, { x: 100, damage: 3, r: 8, speed: 460, anim: 'fireball.big' });
  p.travelled = 120;
  g.stepCollisions();
  const kids = g.projectiles.filter((x) => x !== p);
  assert.equal(kids.length, 2);
  assert.equal(e.hp + other.hp, 2000 - 3, 'one hit only this tick');
  const angles = kids.map((k) => Math.round(Math.atan2(k.dy, k.dx) * 180 / Math.PI));
  assert.deepEqual(angles, [-45, 45]);
  for (const k of kids) {
    assert.deepEqual([k.kind, k.x, k.y, k.damage, k.r, k.speed, k.range, k.gen, k.anim], ['fireball', 100, 0, 3, 8, 460, 300, 1, 'fireball.big']);
    assert.equal(k.hits.length, 1);
  }
  assert.deepEqual(kids.map((k) => k.hits[0]).sort(), [p.hits[0], p.hits[0]]);
  // gen 2: no split, no draw
  const c = countingRng(g);
  const n = g.projectiles.length;
  resolveHit(g, shot(g, { gen: 2 }), dummy(g, 0, 0));
  assert.equal(g.projectiles.length, n + 1);
  assert.equal(c.n, 0);
});

test('procs: pierce lets a fireball survive the hit; rolls run in the order explode, split, pierce', () => {
  const g = still();
  g.buffs = [{ id: 'pierce', level: 1 }];
  g.rng = () => 0;
  assert.equal(resolveHit(g, shot(g), dummy(g, 0, 0)), true);
  g.rng = () => 0.99;
  assert.equal(resolveHit(g, shot(g), dummy(g, 0, 0)), false);

  const h = still();
  h.buffs = [{ id: 'explode', level: 1 }, { id: 'split', level: 1 }, { id: 'pierce', level: 1 }];
  const c = countingRng(h, [0.1, 0.5, 0.1]); // explode yes, split no, pierce yes
  h.grid.build(h.enemies);
  const n = h.projectiles.length;
  assert.equal(resolveHit(h, shot(h), dummy(h, 0, 0)), true);
  assert.equal(c.n, 3);
  assert.ok(h.effects.some((f) => f.anim === 'explosion.big'));
  assert.equal(h.projectiles.length, n + 1, 'no split children');
});

test('procs: no rng draws without chance buffs, and none for procs a kind cannot have', () => {
  const g = still();
  g.buffs = [{ id: 'damage', level: 3 }, { id: 'area', level: 3 }, { id: 'speed', level: 3 }, { id: 'cooldown', level: 3 }];
  const c = countingRng(g);
  resolveHit(g, shot(g), dummy(g, 0, 0));
  const l0 = spawnProjectile(g, { kind: 'laser', x: 0, y: 0, dx: 1, dy: 0, speed: 700, range: 600, r: 6, damage: 1, anim: 'laser.dir' });
  assert.equal(resolveHit(g, l0, dummy(g, 0, 0)), false, 'a laser without Pierce stops');
  assert.equal(c.n, 0);
  assert.deepEqual(g.effects, [], 'no hit effects');
  const h = still();
  h.buffs = [{ id: 'explode', level: 3 }, { id: 'split', level: 3 }];
  const d = countingRng(h);
  const l = spawnProjectile(h, { kind: 'laser', x: 0, y: 0, dx: 1, dy: 0, speed: 700, range: 600, r: 6, damage: 1, anim: 'laser.dir' });
  assert.equal(resolveHit(h, l, dummy(h, 0, 0)), false);
  assert.equal(d.n, 0, 'lasers cannot explode or split');
  h.buffs.push({ id: 'pierce', level: 1 });
  assert.equal(resolveHit(h, l, dummy(h, 0, 0)), true, 'rng 0: pierces');
  assert.equal(d.n, 1, 'lasers roll pierce only');
});

// ---- determinism --------------------------------------------------------------------

// A bot that flies to the nearest gem (else back to the tower), aims at the nearest enemy
// and picks a card by a fixed rule, so level-ups happen and picks are in the intent stream.
function bot(g, i, pickRule) {
  const d = g.dragon;
  let gem = null, gd = Infinity, en = null, ed = Infinity;
  for (const x of g.gems) { const q = Math.hypot(x.x - d.x, x.y - d.y); if (q < gd) { gd = q; gem = x; } }
  for (const x of g.enemies) { const q = Math.hypot(x.x - d.x, x.y - d.y); if (q < ed) { ed = q; en = x; } }
  const to = gem && gd < 400 ? gem : g.tower;
  return { moveX: to.x - d.x, moveY: to.y - d.y, aimX: en ? en.x - d.x : 1, aimY: en ? en.y - d.y : 0, hasAim: true, pick: pickRule(i) };
}

test('determinism: the same seed and intents with level-up picks give the same digest', () => {
  const play = (rule) => {
    const g = new Game({ seed: 2024 });
    g.tower.hp = g.tower.maxHp = 1e6; // test only: survive to see the build grow
    for (let i = 0; i < 75 * 60; i++) g.tick(bot(g, i, rule));
    return g;
  };
  const rule = (i) => i % 3;
  const a = play(rule), b = play(rule);
  assert.equal(a.digest(), b.digest());
  assert.ok(a.level >= 4, `level ${a.level}`);
  const build = (g) => JSON.stringify([g.weapons.map((w) => [w.id, w.level]), g.buffs]);
  assert.notEqual(build(a), build(new Game({ seed: 1 })), 'cards were applied');
  const c = play((i) => (i + 1) % 3);
  assert.notEqual(c.digest(), a.digest(), 'other picks, other run');
});
