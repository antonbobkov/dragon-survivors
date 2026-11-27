// Damage types, resistances, the damage function and the armoury hook (§12.1, §4.1),
// and `game.seen` (§4.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { createWeapon, collideRing } from '../src/sim/weapons.js';
import { spawnProjectile, resolveHit, explode, split } from '../src/sim/projectiles.js';
import { dealDamage, damageTaken, effectiveResist, normalizeMeta } from '../src/sim/damage.js';
import { ENEMIES, ENEMY_TYPES, WEAPONS, WEAPON_IDS, PROJECTILE_KINDS, DAMAGE_TYPES, RESIST_MIN, GOLEM_HP, GOLEM_KNOCKBACK } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = (opts = {}) => {
  const g = new Game({ seed: 1, timeline: QUIET, ...opts });
  g.weapons = [];
  return g;
};
const tough = (g, type, x = 0, y = 0) => { const e = createEnemy(g, type, x, y); e.hp = 1000; return e; };
const taken = (e) => 1000 - e.hp;
const shot = (g, o = {}) => spawnProjectile(g, { kind: 'fireball', x: 0, y: 0, dx: 1, dy: 0, speed: 420, range: 420, r: 6, damage: 2, anim: 'fireball.anim', ...o });
const NEUTRAL = { power: { fire: 1, arcane: 1, physical: 1 }, shred: { fire: 0, arcane: 0, physical: 0 } };

// ---- data ------------------------------------------------------------------------

test('types: every weapon and projectile kind has a damage type; fire for fireball, mini tower and ring, arcane for laser', () => {
  assert.deepEqual(DAMAGE_TYPES, ['fire', 'arcane', 'physical']);
  assert.deepEqual(Object.fromEntries(WEAPON_IDS.map((id) => [id, WEAPONS[id].type])),
    { fireball: 'fire', laser: 'arcane', miniTower: 'fire', ring: 'fire', leftClaw: 'physical', rightClaw: 'physical', dualClaw: 'physical', bite: 'physical', saw: 'physical' });
  assert.equal(PROJECTILE_KINDS.fireball.type, WEAPONS.fireball.type);
  assert.equal(PROJECTILE_KINDS.laser.type, WEAPONS.laser.type);
  for (const t of ENEMY_TYPES) for (const d of DAMAGE_TYPES) {
    const r = ENEMIES[t].resist[d];
    assert.ok(r >= RESIST_MIN && r <= 1, `${t} ${d}`);
  }
  assert.deepEqual(ENEMIES.golem.resist, { fire: 0, arcane: 0, physical: 0 }, 'the golem has none');
});

// ---- maths -----------------------------------------------------------------------

test('damageTaken: ceil(amount × power × (1 − r)), at least 1, 0 when immune', () => {
  const cases = [
    [2, 0, 1, 2], [2, -0.5, 1, 3], [3, -0.5, 1, 5], [2, 0.25, 1, 2], [4, 0.25, 1, 3],
    [1, 0.5, 1, 1], [3, 0.5, 1, 2], [4, 0.75, 1, 1], [10, 0.99, 1, 1], [10, 0.7, 1, 3],
    [5, 1, 1, 0], [5, 1.5, 1, 0], [2, 0, 1.16, 3], [5, 0, 1.08, 6], [10, 0.5, 1.2, 6],
    [0, 0, 1, 0],
  ];
  for (const [amount, r, power, want] of cases) assert.equal(damageTaken(amount, r, power), want, `${amount} at r ${r} × ${power}`);
});

test('meta: normalised to neutral where missing or bad; shred lowers resistance, floored at −0.5', () => {
  assert.deepEqual(normalizeMeta(undefined), NEUTRAL);
  assert.deepEqual(normalizeMeta({}), NEUTRAL);
  assert.deepEqual(normalizeMeta({ power: { fire: 1.24, arcane: NaN, physical: -1 }, shred: { arcane: 0.3, fire: 'x' } }),
    { power: { fire: 1.24, arcane: 1, physical: 1 }, shred: { fire: 0, arcane: 0.3, physical: 0 } });
  assert.deepEqual(new Game({ seed: 1 }).meta, NEUTRAL);
  const meta = normalizeMeta({ shred: { arcane: 0.2, physical: 0.5, fire: 0.1 } });
  assert.equal(effectiveResist('mage', 'arcane', meta), 0.3);
  assert.equal(effectiveResist('skeleton', 'physical', meta), -0.5, 'floor −0.5 (−0.5 − 0.5)');
  assert.equal(effectiveResist('slime', 'fire', meta), -0.5, 'already at the floor');
  assert.equal(effectiveResist('ghost', 'physical', NEUTRAL), 0.75);
  assert.equal(effectiveResist('nosuch', 'fire', NEUTRAL), 0);
});

test('dealDamage: applies resistance and the armoury, takes it off HP, returns it', () => {
  const g = still();
  const mage = tough(g, 'mage');
  assert.equal(dealDamage(g, mage, 3, 'arcane', mage), 2);
  assert.equal(taken(mage), 2);
  assert.equal(dealDamage(g, mage, 2, 'physical', mage), 3, 'weak −0.25: ceil(2.5)');
  const m = still({ meta: { power: { arcane: 2 }, shred: { arcane: 0.5 } } });
  const mage2 = tough(m, 'mage');
  assert.equal(dealDamage(m, mage2, 3, 'arcane', mage2), 6, 'resist 0.5 shredded to 0, × 2');
  const g2 = still();
  const s = createEnemy(g2, 'slime', 0, 0);
  assert.equal(dealDamage(g2, s, 2, 'fire', s), 3);
  assert.equal(s.hp, -1, 'not capped at the HP left');
  g2.stepDeaths();
  assert.equal(g2.kills, 1, 'the deaths step kills it as before');
});

test('dealDamage: the golem takes nothing from any type, even with meta, and is still knocked back', () => {
  const g = still({ meta: { power: { fire: 100, arcane: 100, physical: 100 }, shred: { fire: 1, arcane: 1, physical: 1 } } });
  const golem = createEnemy(g, 'golem', 100, 0);
  for (const t of DAMAGE_TYPES) {
    g.events.length = 0;
    const x0 = golem.x;
    assert.equal(dealDamage(g, golem, 50, t, { x: 0, y: 0 }), 0);
    assert.equal(golem.hp, GOLEM_HP);
    assert.equal(golem.x - x0, GOLEM_KNOCKBACK);
    assert.ok(g.events.some((ev) => ev.name === 'hit_golem'));
  }
});

// ---- every hit path carries its type -----------------------------------------------

test('hits: the dragon\'s fireball deals fire and the laser arcane (a ghost: fire 0.25, arcane −0.5)', () => {
  const g = still();
  g.weapons = [createWeapon('fireball', 5)]; // damage 4
  const ghost = tough(g, 'ghost', 40, 0);
  g.dragon.aimX = 1; g.dragon.aimY = 0;
  for (let i = 0; i < 30 && taken(ghost) === 0; i++) g.tick({ aimX: 1, aimY: 0, hasAim: true });
  assert.ok(g.projectiles.every((p) => p.type === 'fire'));
  assert.equal(taken(ghost) % 3, 0, 'each fireball hit: ceil(4 × 0.75) = 3');
  assert.ok(taken(ghost) > 0);

  const h = still();
  h.weapons = [createWeapon('laser', 1)]; // damage 1
  const ghost2 = tough(h, 'ghost', 40, 0);
  for (let i = 0; i < 30 && taken(ghost2) === 0; i++) h.tick({ aimX: 1, aimY: 0, hasAim: true });
  assert.equal(taken(ghost2), 2, 'one laser hit: ceil(1 × 1.5) = 2');
});

test('hits: mini-tower shots are fire (a copy of the fireball)', () => {
  const g = still();
  g.weapons = [createWeapon('miniTower', 1)];
  const slime = tough(g, 'slime', 0, 330);
  let fired = null;
  for (let i = 0; i < 400 && taken(slime) === 0; i++) {
    g.tick({});
    fired = fired || g.projectiles[0] || null;
  }
  assert.equal(fired.type, 'fire');
  assert.equal(taken(slime), 3, 'one shot of 2 on a slime: ceil(2 × 1.5)');
});

test('hits: the ring deals fire', () => {
  const g = still();
  g.weapons = [createWeapon('ring', 1)]; // damage 2
  g.stepWeapons();
  const b = g.weapons[0].balls[0];
  const slime = tough(g, 'slime', b.x, b.y);
  const knight = tough(g, 'knight', g.weapons[0].balls[1].x, g.weapons[0].balls[1].y);
  g.grid.build(g.enemies);
  collideRing(g);
  assert.equal(taken(slime), 3);
  assert.equal(taken(knight), 2);
});

test('hits: explosions and split children carry the projectile\'s type', () => {
  const g = still();
  const hit = tough(g, 'knight', 0, 0);
  const ghost = tough(g, 'ghost', 30, 0);
  g.grid.build(g.enemies);
  const laser = spawnProjectile(g, { kind: 'laser', x: 0, y: 0, dx: 1, dy: 0, speed: 700, range: 600, r: 6, damage: 1, anim: 'laser.dir' });
  assert.equal(laser.type, 'arcane');
  explode(g, laser, hit, { area: 1 });
  assert.equal(taken(ghost), 2, 'a laser explosion is arcane: ceil(1 × 1.5)');
  const fb = shot(g, { damage: 4 });
  explode(g, fb, hit, { area: 1 });
  assert.equal(taken(ghost), 2 + 3, 'a fireball explosion is fire: ceil(4 × 0.75)');
  const before = g.projectiles.length;
  split(g, shot(g, { type: 'arcane' }), hit);
  assert.deepEqual(g.projectiles.slice(before + 1).map((p) => p.type), ['arcane', 'arcane']);
  assert.equal(shot(g).type, 'fire', 'default: the kind\'s type');
});

test('hits: resolveHit goes through the damage function and draws no random numbers', () => {
  const g = still();
  const mage = tough(g, 'mage'); // a mage draws its orb timer when created
  let draws = 0;
  g.rng = () => { draws++; return 0; };
  resolveHit(g, spawnProjectile(g, { kind: 'laser', x: 0, y: 0, dx: 1, dy: 0, speed: 700, range: 600, r: 6, damage: 3, anim: 'laser.dir' }), mage);
  assert.equal(taken(mage), 2);
  assert.equal(draws, 0);
});

// ---- determinism and the snapshot --------------------------------------------------

function play(opts) {
  const g = new Game({ seed: 9, ...opts });
  g.weapons = ['fireball', 'laser', 'ring'].map((id) => createWeapon(id, 3));
  for (let i = 0; i < 60 * 60; i++) g.tick({ moveX: Math.sin(i / 90), aimX: 1, aimY: Math.cos(i / 70), hasAim: true, pick: 0 });
  return g;
}

test('determinism: no meta and empty meta are the same run; meta is in the snapshot and changes the run', () => {
  const a = play({}), b = play({ meta: {} }), c = play({ meta: { power: { fire: 1.4 } } });
  assert.equal(a.digest(), b.digest());
  assert.equal(play({}).digest(), a.digest());
  assert.notEqual(c.digest(), a.digest());
  assert.deepEqual(a.snapshot().meta, NEUTRAL);
});

// ---- seen ------------------------------------------------------------------------

test('seen: enemy types in the order first created, once each, from every source', () => {
  const g = new Game({ seed: 2, timeline: QUIET });
  assert.deepEqual(g.seen, []);
  createEnemy(g, 'mage', 300, 0);
  createEnemy(g, 'mage', 300, 50);
  const s = createEnemy(g, 'slime', 0, 300);
  assert.deepEqual(g.seen, ['mage', 'slime']);
  s.hp = 0;
  g.stepDeaths(); // the split adds slimes: no new type
  assert.deepEqual(g.seen, ['mage', 'slime']);
  for (let i = 0; i < 9 * 60; i++) g.tick({}); // a mage cast summons skeletons
  assert.deepEqual(g.seen, ['mage', 'slime', 'skeleton']);
  assert.deepEqual(g.snapshot().seen, g.seen);
  const run = new Game({ seed: 3 });
  for (let i = 0; i < 120; i++) run.tick({});
  assert.deepEqual(run.seen, run.enemies.length ? ['knight'] : []);
});
