// Generic buffs (§11: Might, Haste, Area, Velocity, Duration, Force, Amount) and knockback by
// weapon knock and enemy mass (§8.7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { createWeapon, collideRing } from '../src/sim/weapons.js';
import { spawnProjectile, resolveHit } from '../src/sim/projectiles.js';
import { dealDamage, knockDistance } from '../src/sim/damage.js';
import {
  DT, WEAPONS, ENEMIES, EXPLODE_RADIUS, EXPLODE_KNOCK, GOLEM_KNOCKBACK, GOLEM_HP, BUFF_IDS,
} from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = (seed = 1) => {
  const g = new Game({ seed, timeline: QUIET });
  g.weapons = [];
  return g;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const countingRng = (g, seq = [0]) => { const c = { n: 0 }; g.rng = () => seq[c.n++ % seq.length]; return c; };
const dummy = (g, x, y, type = 'knight') => { const e = createEnemy(g, type, x, y); if (!e.unkillable) e.hp = 1000; return e; };
const shot = (g, o = {}) => spawnProjectile(g, { kind: 'fireball', x: 0, y: 0, dx: 1, dy: 0, speed: 420, range: 420, r: 6, damage: 2, anim: 'fireball.anim', ...o });
const deg = (p) => Math.round(Math.atan2(p.dy, p.dx) * 1800 / Math.PI) / 10 + 0; // 0.1° steps
const fire = (id, level, buffs = []) => {
  const g = still();
  g.buffs = buffs;
  g.weapons = [createWeapon(id, level)];
  g.stepWeapons();
  return g;
};

// ---- knockback (§8.7) ------------------------------------------------------------------

test('knockback: knock / mass px straight away from the source, by enemy mass', () => {
  const masses = {};
  for (const type of ['knight', 'skeleton', 'slime', 'mage', 'ghostKnight', 'ghost']) {
    const g = still();
    const e = dummy(g, 30, 40, type); // 50 px from the origin: direction (0.6, 0.8)
    dealDamage(g, e, 1, 'fire', { x: 0, y: 0 }, 6);
    const moved = Math.hypot(e.x - 30, e.y - 40);
    assert.ok(near(moved, 6 / ENEMIES[type].mass), `${type} moved ${moved}`);
    assert.ok(near((e.x - 30) / moved, 0.6) && near((e.y - 40) / moved, 0.8), `${type} straight away from the source`);
    masses[type] = ENEMIES[type].mass;
  }
  assert.deepEqual(masses, { knight: 1, skeleton: 0.7, slime: 0.8, mage: 1, ghostKnight: 1, ghost: 0.6 });
  assert.equal(knockDistance('ghost', 0), 0, 'no knock, no push');
  assert.equal(knockDistance('golem', 10), 0, 'the golem has no mass');
});

test('knockback: a source at the enemy centre pushes along (0, 1); a killing hit pushes nothing', () => {
  const g = still();
  const e = dummy(g, 10, 10);
  dealDamage(g, e, 1, 'fire', { x: 10, y: 10 }, 4);
  assert.deepEqual([e.x, e.y], [10, 14]);
  const k = createEnemy(g, 'knight', 50, 0); // 3 HP
  dealDamage(g, k, 3, 'fire', { x: 0, y: 0 }, 4);
  assert.ok(k.hp <= 0);
  assert.deepEqual([k.x, k.y], [50, 0], 'dies where it was hit');
});

test('knockback: every weapon has its knock, projectiles carry knock × Force from firing', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(WEAPONS).map(([id, w]) => [id, w.knock])), { fireball: 4, laser: 2, miniTower: 4, ring: 8 });
  assert.equal(EXPLODE_KNOCK, 10);
  for (const [force, mul] of [[0, 1], [1, 1.5], [2, 2], [3, 2.5]]) {
    const buffs = force ? [{ id: 'force', level: force }] : [];
    assert.ok(near(fire('fireball', 1, buffs).projectiles[0].knock, 4 * mul), `fireball Force L${force}`);
    assert.ok(near(fire('laser', 1, buffs).projectiles[0].knock, 2 * mul), `laser Force L${force}`);
  }
  // gaining Force later does not change a projectile in flight
  const g = fire('fireball', 1);
  g.buffs = [{ id: 'force', level: 3 }];
  const e = dummy(g, 20, 0);
  resolveHit(g, g.projectiles[0], e);
  assert.ok(near(e.x, 24), 'knock 4 read at firing');
});

test('knockback: a fireball hit pushes by mass and Force; the hit point is the projectile', () => {
  const g = still();
  g.buffs = [{ id: 'force', level: 2 }]; // × 2
  g.weapons = [createWeapon('fireball', 1)];
  g.stepWeapons();
  const p = g.projectiles[0];
  const ghost = dummy(g, 8, 6, 'ghost'); // from the projectile at the origin: (0.8, 0.6)
  resolveHit(g, p, ghost);
  const d = (4 * 2) / 0.6;
  assert.ok(near(ghost.x, 8 + 0.8 * d) && near(ghost.y, 6 + 0.6 * d), `${ghost.x}, ${ghost.y}`);
});

test('knockback: the ring pushes away from the ball by 8 × Force / mass, once per rehit', () => {
  const g = still();
  g.buffs = [{ id: 'force', level: 1 }];
  g.weapons = [createWeapon('ring', 1)];
  const e = dummy(g, 110, 0, 'slime');
  g.weapons[0].balls = [{ x: 100, y: 0 }];
  g.grid.build(g.enemies);
  collideRing(g);
  assert.ok(near(e.x, 110 + (8 * 1.5) / 0.8) && near(e.y, 0));
  const x1 = e.x;
  g.grid.build(g.enemies);
  collideRing(g);
  assert.equal(e.x, x1, 'still on its rehit timer: not pushed again');
});

test('knockback: an explosion pushes every enemy it damages away from its centre by 10 × Force / mass', () => {
  const g = still();
  g.buffs = [{ id: 'explode', level: 1 }, { id: 'force', level: 3 }];
  g.rng = () => 0;
  const hit = dummy(g, 5, 0);
  const other = dummy(g, 0, 40, 'skeleton');
  g.grid.build(g.enemies);
  const p = shot(g, { knock: 4 });
  resolveHit(g, p, hit);
  assert.ok(near(hit.x, 5 + 4), 'the enemy hit takes the projectile\'s knock only');
  assert.ok(near(other.x, 0) && near(other.y, 40 + (EXPLODE_KNOCK * 2.5) / 0.7), `${other.y}`);
  assert.ok(other.hp < 1000);
});

test('knockback: split children inherit the parent\'s knock', () => {
  const g = still();
  g.buffs = [{ id: 'split', level: 1 }];
  g.rng = () => 0;
  const e = dummy(g, 0, 0);
  g.grid.build(g.enemies);
  const p = shot(g, { knock: 6 });
  resolveHit(g, p, e);
  const kids = g.projectiles.filter((x) => x !== p);
  assert.equal(kids.length, 2);
  for (const k of kids) assert.equal(k.knock, 6);
});

test('knockback: the golem keeps GOLEM_KNOCKBACK whatever the knock and Force', () => {
  const g = still();
  g.buffs = [{ id: 'force', level: 3 }];
  g.weapons = [createWeapon('ring', 5)];
  const m = createEnemy(g, 'golem', 200, 0);
  g.weapons[0].balls = [{ x: 150, y: 0 }];
  g.grid.build(g.enemies);
  collideRing(g);
  assert.ok(near(m.x, 200 + GOLEM_KNOCKBACK) && near(m.y, 0));
  dealDamage(g, m, 5, 'arcane', { x: 0, y: 0 }, 1000);
  assert.ok(near(m.x, 200 + 2 * GOLEM_KNOCKBACK));
  assert.equal(m.hp, GOLEM_HP);
});

test('knockback and buffs draw no random numbers', () => {
  const g = still();
  g.buffs = ['might', 'haste', 'force', 'amount'].map((id) => ({ id, level: 3 }));
  g.weapons = ['fireball', 'laser', 'ring'].map((id) => createWeapon(id, 5));
  const c = countingRng(g);
  for (let i = 0; i < 12; i++) dummy(g, 40 + i * 20, (i % 3) * 10 - 10, i % 2 ? 'ghost' : 'knight');
  for (let i = 0; i < 120; i++) g.tick({ aimX: 1, aimY: 0, hasAim: true });
  assert.ok(g.enemies.some((e) => e.hp < 1000), 'enemies were hit');
  assert.equal(c.n, 0);
});

// ---- generic buffs (§11) ---------------------------------------------------------------

test('Might: damage = ceil(base × (1 + 0.2 × level)) on every weapon', () => {
  for (const [lvl, fb, lz] of [[1, 3, 2], [2, 3, 2], [3, 4, 2]]) {
    const buffs = [{ id: 'might', level: lvl }];
    assert.equal(fire('fireball', 1, buffs).projectiles[0].damage, fb, `fireball 2 at Might L${lvl}`);
    assert.equal(fire('laser', 1, buffs).projectiles[0].damage, lz, `laser 1 at Might L${lvl}`);
  }
  assert.equal(fire('fireball', 5, [{ id: 'might', level: 3 }]).projectiles[0].damage, 7, 'ceil(4 × 1.6)');
});

test('Haste, Area and Velocity scale cooldowns, radius and orbit, speed and range', () => {
  const g = fire('fireball', 1, [{ id: 'haste', level: 2 }, { id: 'area', level: 3 }, { id: 'velocity', level: 1 }]);
  const p = g.projectiles[0];
  assert.ok(near(g.weapons[0].timer, 0.9 * 0.8 - DT));
  assert.ok(near(p.r, 6 * 1.6) && near(p.speed, 420 * 1.2) && near(p.range, 420 * 1.2));
});

test('Amount: the fireball fan widens by one step per extra shot (spreadStep at one-shot levels)', () => {
  const angles = (level, amount) => fire('fireball', level, amount ? [{ id: 'amount', level: amount }] : []).projectiles.map(deg);
  assert.deepEqual(angles(1, 0), [0]);
  assert.deepEqual(angles(1, 1), [-5, 5]);
  assert.deepEqual(angles(1, 2), [-10, 0, 10]);
  assert.deepEqual(angles(3, 0), [-7.5, 7.5], 'level 3: 2 shots at ±7.5° (15° fan), unchanged');
  assert.deepEqual(angles(3, 1), [-15, 0, 15]);
  assert.deepEqual(angles(5, 0), [-10, 0, 10]);
  assert.deepEqual(angles(5, 3), [-25, -15, -5, 5, 15, 25]);
  const g = fire('fireball', 1, [{ id: 'amount', level: 2 }]);
  assert.equal(g.events.filter((e) => e.name === 'shoot01').length, 1, 'one sound per volley');
});

test('Amount: extra lasers fly parallel, 12 px apart, centred on the dragon', () => {
  const offsets = (level, amount) => {
    const g = still();
    g.buffs = amount ? [{ id: 'amount', level: amount }] : [];
    g.weapons = [createWeapon('laser', level)];
    g.tick({ aimX: 0, aimY: -1, hasAim: true }); // aim up: perpendicular (1, 0)
    for (const p of g.projectiles) assert.ok(near(p.dx, 0) && near(p.dy, -1), 'parallel to the aim');
    return g.projectiles.map((p) => Math.round(p.x));
  };
  assert.deepEqual(offsets(1, 0), [0]);
  assert.deepEqual(offsets(1, 1), [6, -6]);
  assert.deepEqual(offsets(1, 2), [12, 0, -12]);
  assert.deepEqual(offsets(5, 0), [6, -6], 'level 5 pair unchanged');
  assert.deepEqual(offsets(5, 3), [24, 12, 0, -12, -24]);
});

test('Amount: more ring fireballs, evenly spaced; more mini towers standing at once', () => {
  const g = fire('ring', 1, [{ id: 'amount', level: 1 }]);
  const balls = g.weapons[0].balls;
  assert.equal(balls.length, 3);
  const a = balls.map((b) => Math.atan2(b.y, b.x));
  const gap = (x, y) => ((y - x) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  assert.ok(near(gap(a[0], a[1]), 2 * Math.PI / 3) && near(gap(a[1], a[2]), 2 * Math.PI / 3));

  const h = still();
  h.buffs = [{ id: 'amount', level: 2 }];
  h.weapons = [createWeapon('miniTower', 1)]; // maxActive 1 + 2
  for (let i = 0; i < 4; i++) { h.weapons[0].timer = 0; h.stepWeapons(); }
  assert.equal(h.miniTowers.length, 3);
});

test('Duration: mini-tower life × (1 + 0.25 × level); Amount does not add mini-tower shots', () => {
  for (const [lvl, mul] of [[0, 1], [1, 1.25], [2, 1.5], [3, 1.75]]) {
    const g = fire('miniTower', 1, lvl ? [{ id: 'duration', level: lvl }] : []);
    assert.equal(g.miniTowers[0].life, Math.round((8 * mul) / DT), `Duration L${lvl}`);
  }
  const g = still();
  g.buffs = [{ id: 'amount', level: 3 }, { id: 'force', level: 1 }];
  g.weapons = [createWeapon('miniTower', 1)];
  dummy(g, 0, 200);
  for (let i = 0; i < 40 && g.projectiles.length === 0; i++) g.stepWeapons();
  assert.equal(g.projectiles.length, 1, 'a mini-tower shot is single');
  assert.ok(near(g.projectiles[0].knock, 4 * 1.5), 'the mini tower\'s knock × Force');
});

test('determinism: a run with every buff gives the same digest twice', () => {
  const play = () => {
    const g = new Game({ seed: 99 });
    g.tower.hp = g.tower.maxHp = 1e6; // test only
    g.weapons = ['fireball', 'laser', 'miniTower', 'ring'].map((id) => createWeapon(id, 3));
    g.buffs = ['force', 'amount', 'explode', 'pierce'].map((id) => ({ id, level: 3 }));
    for (let i = 0; i < 150 * 60; i++) g.tick({ moveX: Math.cos(i / 200), moveY: Math.sin(i / 200), aimX: 1, aimY: 0.3, hasAim: true, pick: 0 });
    return g;
  };
  const a = play(), b = play();
  assert.equal(a.digest(), b.digest());
  assert.ok(a.kills > 50, `kills ${a.kills}`);
  assert.equal(BUFF_IDS.length, 10);
});
