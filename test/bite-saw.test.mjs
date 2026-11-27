// Bite (§10.8) and saw blade (§10.9): targets, execute, waiting cooldown, the blade's path out,
// dwell and back, rehit, buffs, resistances, braziers, debug grants, determinism, rendering, art.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { createWeapon } from '../src/sim/weapons.js';
import { biteTargets, biteDamage } from '../src/sim/bite.js';
import { sawDirection, collideBlades } from '../src/sim/saw.js';
import { cardPool, cardInfo } from '../src/sim/levelup.js';
import { createRenderer } from '../src/render/draw.js';
import { drawDebugWorld } from '../src/render/debug.js';
import { WEAPON_ICONS, iconSlots } from '../src/render/hud.js';
import { DEBUG_GRANT_KEYS } from '../src/input.js';
import { DT, WEAPONS, WEAPON_IDS, ATLAS_NAMES, SOUND_NAMES, weaponMaxLevel, BRAZIER_RADIUS } from '../src/sim/content.js';
import { ANIMS } from '../src/sim/anims.js';

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
const atlas = { image: { fake: 'image' }, frames: atlasJson.frames, anims: atlasJson.anims };
const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const sounded = (g, name) => g.events.some((e) => e.type === 'sound' && e.name === name);
// A quiet game with only `id` at `level` and the given buffs.
const armed = (id, level = 1, buffs = [], opts = {}) => {
  const g = new Game({ seed: 1, timeline: QUIET, ...opts });
  g.weapons = [createWeapon(id, level)];
  g.buffs = buffs;
  return g;
};
// A sturdy dummy (HP 1000 unless `hp`; max HP the same), tier 1, standing still (speed 0).
const dummy = (g, type, x, y, hp = 1000) => {
  const e = createEnemy(g, type, x, y);
  e.hp = hp;
  e.maxHp = hp;
  return e;
};
const still = (g) => { // enemies do not walk: their speed is read from the type table
  const step = g.stepEnemies.bind(g);
  g.stepEnemies = () => {
    const pos = g.enemies.map((e) => [e.x, e.y]);
    step();
    g.enemies.forEach((e, i) => { if (pos[i]) { e.x = pos[i][0]; e.y = pos[i][1]; } });
  };
  return g;
};
const tick = (g, intent = {}) => g.tick({ moveX: 0, moveY: 0, ...intent });
const lost = (e, hp = 1000) => hp - e.hp;

// ---- data -------------------------------------------------------------------------

test('bite and saw: data matches the spec; physical; pool order; sounds and anims exist', () => {
  assert.deepEqual(WEAPON_IDS.slice(7), ['bite', 'saw']);
  assert.deepEqual(WEAPONS.bite.levels.map((l) => [l.cooldown, l.damage, l.reach]),
    [[1.5, 8, 56], [1.4, 10, 60], [1.2, 13, 64], [1.1, 15, 68], [0.9, 18, 72]]);
  assert.deepEqual(WEAPONS.saw.levels.map((l) => [l.cooldown, l.damage, l.count, l.r, l.range, l.speed, l.dwell]), [
    [3, 2, 1, 10, 260, 260, 0.6], [2.75, 3, 1, 11, 275, 260, 0.75], [2.5, 3, 1, 12, 290, 260, 0.9],
    [2.25, 4, 2, 13, 305, 260, 1.05], [2, 6, 2, 14, 320, 260, 1.2]]);
  for (const id of ['bite', 'saw']) {
    assert.equal(WEAPONS[id].type, 'physical', id);
    assert.equal(weaponMaxLevel(id), 5);
  }
  assert.deepEqual([WEAPONS.bite.knock, WEAPONS.bite.execute, WEAPONS.bite.executeMult], [30, 0.3, 2]);
  assert.deepEqual([WEAPONS.saw.knock, WEAPONS.saw.rehit, WEAPONS.saw.fanStep], [6, 0.4, 12]);
  assert.ok(SOUND_NAMES.includes(WEAPONS.bite.sound));
  for (const n of ['icon.bite', 'icon.saw', 'bite.jaws', 'saw.spin']) assert.ok(ATLAS_NAMES.includes(n) && atlas.anims[n], n);
  // a fresh game: both are new-weapon cards after the right claw, before the buffs
  const g = new Game({ seed: 1, timeline: QUIET });
  const ids = cardPool(g).map((p) => p.card.id);
  assert.deepEqual(ids.slice(0, 8), ['fireball', 'laser', 'miniTower', 'ring', 'leftClaw', 'rightClaw', 'bite', 'saw']);
});

test('enemies keep the HP they were created with as maxHp (tiers and slime children too)', () => {
  const g = new Game({ seed: 1, timeline: QUIET });
  const k = createEnemy(g, 'knight', 0, 0, 2);
  assert.deepEqual([k.hp, k.maxHp], [8, 8]);
  const s = createEnemy(g, 'slime', 50, 0);
  s.hp = 0;
  tick(g);
  const kids = g.enemies.filter((e) => e.type === 'slime' && e.gen === 1);
  assert.equal(kids.length, 2);
  for (const c of kids) assert.equal(c.maxHp, c.hp);
});

// ---- bite -------------------------------------------------------------------------

test('bite: the nearest enemy whose circle overlaps the reach, ties to the lower id', () => {
  const g = armed('bite');
  const far = dummy(g, 'knight', 61.99, 0); // 50 + 12: just inside
  const a = dummy(g, 'knight', 0, -40), b = dummy(g, 'knight', 40, 0); // a tie: a has the lower id
  const out = dummy(g, 'knight', 0, 62); // exactly reach + r: not overlapping
  g.grid.build(g.enemies);
  assert.deepEqual(biteTargets(g, 0, 0, 50, 4).map((e) => e.id), [a.id, b.id, far.id]);
  assert.deepEqual(biteTargets(g, 0, 0, 50, 1).map((e) => e.id), [a.id]);
  b.hp = 0;
  assert.deepEqual(biteTargets(g, 0, 0, 50, 4).map((e) => e.id), [a.id, far.id], 'dead enemies are not bitten');
  assert.equal(out.hp, 1000);
  // in a tick: only the nearest is bitten
  const h = still(armed('bite'));
  const x = dummy(h, 'knight', 30, 0), y = dummy(h, 'knight', -45, 0);
  tick(h);
  assert.equal(lost(x), 6, '8 × (1 − 0.25)');
  assert.equal(y.hp, 1000);
  assert.ok(sounded(h, WEAPONS.bite.sound));
});

test('bite: no target, no bite: the cooldown waits at 0 and it bites on the first tick one is in reach', () => {
  const g = still(armed('bite'));
  for (let i = 0; i < 200; i++) tick(g);
  assert.ok(g.weapons[0].timer <= 1e-9);
  assert.equal(g.effects.length, 0);
  const e = dummy(g, 'knight', 20, 0);
  tick(g);
  assert.equal(lost(e), 6);
  assert.ok(near(g.weapons[0].timer, 1.5));
  // then every 1.5 s = 90 ticks while a target stays (put back after each knock)
  const at = [];
  for (let i = 0; i < 300; i++) {
    const hp = e.hp;
    e.x = 20; e.y = 0;
    tick(g);
    if (e.hp < hp) at.push(g.tickCount);
  }
  assert.deepEqual(at.slice(0, 3).map((t, i, a) => (i ? t - a[i - 1] : 90)), [90, 90, 90]);
  // a fresh bite with a target bites on its first tick
  const h = still(armed('bite'));
  const f = dummy(h, 'skeleton', 10, 0);
  tick(h);
  assert.equal(lost(f), 12, '8 × 1.5 against a skeleton');
});

test('bite: execute doubles the damage below 30% of max HP, not at exactly 30%', () => {
  const e = { hp: 30, maxHp: 100 };
  assert.equal(biteDamage(e, 8), 8);
  e.hp = 29.99;
  assert.equal(biteDamage(e, 8), 16);
  e.hp = 3; e.maxHp = 10;
  assert.equal(biteDamage(e, 10), 10);
  e.hp = 2;
  assert.equal(biteDamage(e, 10), 20);
  // in a tick, through the knight's 0.25 physical resistance
  const g = still(armed('bite'));
  const k = dummy(g, 'knight', 20, 0, 100);
  k.hp = 29;
  tick(g);
  assert.equal(k.hp, 29 - 12, 'ceil(16 × 0.75)');
  const h = still(armed('bite'));
  const j = dummy(h, 'knight', 20, 0, 100);
  j.hp = 30;
  tick(h);
  assert.equal(j.hp, 30 - 6, 'ceil(8 × 0.75), no execute');
});

test('bite: Amount bites the next-nearest too; Might, Area, Haste apply', () => {
  const g = still(armed('bite', 1, [{ id: 'amount', level: 1 }]));
  const a = dummy(g, 'knight', 20, 0), b = dummy(g, 'knight', -30, 0), c = dummy(g, 'knight', 0, 40);
  tick(g);
  assert.ok(lost(a) > 0 && lost(b) > 0);
  assert.equal(c.hp, 1000);
  assert.equal(g.effects.filter((fx) => fx.anim === 'bite.jaws').length, 2);
  // Might 1: ceil(8 × 1.2) = 10 → ceil(10 × 0.75) = 8; Area 1: reach 64.4 reaches a knight at 71
  const h = still(armed('bite', 1, [{ id: 'might', level: 1 }, { id: 'area', level: 1 }]));
  const k = dummy(h, 'knight', 71, 0);
  tick(h);
  assert.equal(lost(k), 8);
  const n = still(armed('bite'));
  const m = dummy(n, 'knight', 71, 0);
  tick(n);
  assert.equal(m.hp, 1000, 'out of reach without Area');
  // Haste 3: cooldown 1.5 × 0.76
  const q = still(armed('bite', 1, [{ id: 'haste', level: 3 }]));
  dummy(q, 'knight', 20, 0);
  tick(q);
  assert.ok(near(q.weapons[0].timer, 1.5 * 0.76));
});

test('bite: knock straight away from the dragon by mass and Force; the jaws face the target', () => {
  const g = still(armed('bite', 1, [{ id: 'force', level: 1 }]));
  const k = dummy(g, 'knight', -30, -40);
  tick(g);
  // 30 × 1.5 / mass 1 = 45 along (-0.6, -0.8)
  assert.ok(near(k.x, -30 - 27) && near(k.y, -40 - 36), `${k.x},${k.y}`);
  const fx = g.effects.find((f) => f.anim === 'bite.jaws');
  assert.deepEqual([fx.x, fx.y, fx.flip], [-30, -40, true], 'at the target where it was bitten, mirrored on the left');
  const h = still(armed('bite'));
  const s = dummy(h, 'skeleton', 20, 0);
  tick(h);
  assert.ok(near(s.x, 20 + 30 / 0.7));
  assert.equal(h.effects.find((f) => f.anim === 'bite.jaws').flip, false);
  // a killing bite pushes nothing
  const j = still(armed('bite'));
  const dead = dummy(j, 'skeleton', 20, 0, 1);
  tick(j);
  assert.equal(dead.x, 20);
});

test('bite: physical through resistances and the armoury; the golem takes nothing and gains the knock as poise', () => {
  const vals = {};
  for (const type of ['knight', 'skeleton', 'slime', 'mage', 'ghost']) {
    const g = still(armed('bite'));
    const e = dummy(g, type, 20, 0);
    tick(g);
    vals[type] = lost(e);
  }
  assert.deepEqual(vals, { knight: 6, skeleton: 12, slime: 4, mage: 10, ghost: 2 });
  const p = still(armed('bite', 1, [], { meta: { power: { physical: 1.5 } } }));
  const e = dummy(p, 'knight', 20, 0);
  tick(p);
  assert.equal(lost(e), 9, 'ceil(8 × 1.5 × 0.75)');
  const g = still(armed('bite'));
  const golem = createEnemy(g, 'golem', 40, 0);
  tick(g);
  assert.equal(golem.hp, 1e9);
  assert.deepEqual([golem.x, golem.poise], [40, WEAPONS.bite.knock], 'not pushed: poise 30 (§8.10)');
});

test('bite: breaks the braziers its reach overlaps; draws no random numbers', () => {
  const g = still(armed('bite'));
  dummy(g, 'knight', 20, 0);
  g.braziers.push({ id: g.nextId++, x: -56 - BRAZIER_RADIUS + 1, y: 0, anim: 'brazier.burn', frame: 0, frameTicks: 0 });
  g.braziers.push({ id: g.nextId++, x: 0, y: 56 + BRAZIER_RADIUS + 1, anim: 'brazier.burn', frame: 0, frameTicks: 0 });
  tick(g);
  assert.equal(g.braziers.length, 1, 'the one in reach broke, the other stands');
  assert.equal(g.pickups.length, 1);
  const h = still(armed('bite', 3, [{ id: 'amount', level: 2 }]));
  for (let i = 0; i < 5; i++) dummy(h, 'skeleton', 10 + i * 5, i, 20);
  h.rng = () => { throw new Error('no draws'); };
  for (let i = 0; i < 300; i++) { tick(h); h.gems.length = 0; } // no gems: no level-up offers to roll
  assert.ok(h.kills > 0, 'bit and killed without a draw');
});

// ---- saw blade --------------------------------------------------------------------

test('saw: launched from the tower along the line through the dragon; the aim when they coincide', () => {
  const g = armed('saw');
  g.tower.x = -30; g.tower.y = -40; // 50 px from the dragon: at rest, it does not move
  tick(g);
  assert.equal(g.blades.length, 1);
  const b = g.blades[0];
  assert.ok(near(b.dx, 0.6) && near(b.dy, 0.8));
  assert.deepEqual([b.phase, b.speed, b.range, b.r, b.damage, b.knock, b.dwell], ['out', 260, 260, 10, 2, 6, 36]);
  assert.ok(near(b.x, -30 + 0.6 * 260 / 60) && near(b.y, -40 + 0.8 * 260 / 60), 'it moved once in step 7');
  const h = armed('saw');
  h.tower.x = 0; h.tower.y = 0;
  tick(h, { aimX: 0, aimY: -1, hasAim: true });
  assert.deepEqual(sawDirection(h), { x: 0, y: -1 });
  assert.ok(near(h.blades[0].dx, 0) && near(h.blades[0].dy, -1));
  // every 3 s
  const at = [];
  let last = g.blades[0].id;
  for (let i = 0; i < 400; i++) {
    tick(g);
    const nb = g.blades.find((x) => x.id > last);
    if (nb) { at.push(g.tickCount); last = nb.id; }
  }
  assert.deepEqual(at.slice(0, 2), [181, 361], 'ticks 1, 181, 361');
});

test('saw: out exactly range px, dwells, homes back to the moved tower and is removed there', () => {
  const g = armed('saw');
  g.tower.x = 0; g.tower.y = 50;
  tick(g); // launched upward (0, -1), 1 step out
  const b = g.blades[0];
  for (let i = 1; i < 60; i++) tick(g);
  assert.equal(b.phase, 'dwell');
  assert.ok(near(b.travelled, 260) && near(b.y, 50 - 260) && near(b.x, 0), `${b.x},${b.y}`);
  for (let i = 0; i < 35; i++) tick(g);
  assert.equal(b.phase, 'dwell');
  assert.ok(near(b.y, -210));
  tick(g);
  assert.equal(b.phase, 'back', 'after 36 dwell steps');
  // the tower moves (still at rest, 30 px right of the dragon): the blade homes to it
  g.tower.x = 30; g.tower.y = 0;
  let ticks = 0;
  while (g.blades.includes(b) && ticks < 200) {
    const d0 = Math.hypot(g.tower.x - b.x, g.tower.y - b.y);
    tick(g);
    ticks++;
    if (g.blades.includes(b)) assert.ok(near(Math.hypot(g.tower.x - b.x, g.tower.y - b.y), d0 - 260 / 60, 1e-6));
  }
  const dist = Math.hypot(30, 210);
  assert.equal(ticks, Math.ceil(dist / (260 / 60)), 'removed on the step it would reach the tower');
  assert.equal(g.blades.length, 0);
});

test('saw: hits every enemy it overlaps, never stops, each once per rehit per blade', () => {
  const g = still(armed('saw', 1));
  g.tower.x = 0; g.tower.y = 50;
  const a = dummy(g, 'skeleton', 0, -40), b = dummy(g, 'skeleton', 0, -100), c = dummy(g, 'skeleton', 25, -100);
  for (let i = 0; i < 40; i++) tick(g);
  assert.ok(lost(a) > 0 && lost(b) > 0, 'both on the path');
  assert.equal(c.hp, 1000, '25 px off the line: r 10 + 10 does not reach');
  assert.equal(g.blades.length, 1, 'still flying');
  // rehit: a blade parked over a dummy hits it every 24 ticks; a second blade hits it too
  const h = armed('saw');
  const e = dummy(h, 'knight', 100, 100);
  const blade = (id) => ({ id, x: 100, y: 100, dx: 1, dy: 0, phase: 'dwell', speed: 0, range: 0, travelled: 0, dwell: 999, r: 10, damage: 4, knock: 0, rehit: {}, anim: 'saw.spin', frame: 0, frameTicks: 0 });
  h.blades.push(blade(900), blade(901));
  h.grid.build(h.enemies);
  const hits = [];
  for (let t = 0; t < 50; t++) {
    h.tickCount = t;
    const hp = e.hp;
    collideBlades(h);
    if (e.hp < hp) hits.push([t, hp - e.hp]);
  }
  assert.deepEqual(hits, [[0, 6], [24, 6], [48, 6]], 'two blades × ceil(4 × 0.75) per hit, every 0.4 s');
});

test('saw: Amount fans the blades 12° apart; L4 fires two; Duration, Velocity, Area, Might, Force', () => {
  const g = armed('saw', 1, [{ id: 'amount', level: 2 }]);
  g.tower.x = 0; g.tower.y = 50;
  tick(g);
  const ang = g.blades.map((b) => Math.round((Math.atan2(b.dy, b.dx) * 180) / Math.PI * 1e6) / 1e6);
  assert.deepEqual(ang, [-102, -90, -78]);
  const h = armed('saw', 4);
  h.tower.x = 0; h.tower.y = 50;
  tick(h);
  assert.deepEqual(h.blades.map((b) => Math.round((Math.atan2(b.dy, b.dx) * 180) / Math.PI * 1e6) / 1e6), [-96, -84]);
  const k = armed('saw', 1, [{ id: 'duration', level: 1 }, { id: 'velocity', level: 1 }, { id: 'area', level: 2 }, { id: 'might', level: 1 }, { id: 'force', level: 2 }]);
  tick(k);
  const b = k.blades[0];
  assert.ok(near(b.speed, 312) && near(b.range, 312) && near(b.r, 13));
  assert.deepEqual([b.dwell, b.damage, b.knock], [45, 3, 12]);
});

test('saw: physical through resistances; knock away from the blade; braziers broken; no random draws', () => {
  const g = still(armed('saw', 1, [], { meta: { shred: { physical: 0.25 } } }));
  g.tower.x = 0; g.tower.y = 50;
  const k = dummy(g, 'knight', 0, -40), sl = dummy(g, 'slime', 0, -120);
  g.braziers.push({ id: g.nextId++, x: 0, y: -200, anim: 'brazier.burn', frame: 0, frameTicks: 0 });
  g.rng = () => 0.99; // the pickup draw is the only one (a bomb)
  let kx = null;
  for (let i = 0; i < 60; i++) {
    const hp = k.hp;
    tick(g);
    if (k.hp < hp && kx === null) kx = k.y;
  }
  assert.equal(lost(k), 2, 'knight resist 0.25 shredded to 0: 2');
  assert.equal(lost(sl), 2, 'slime resist 0.5 shredded to 0.25: ceil(2 × 0.75)');
  assert.equal(g.braziers.length, 0);
  assert.equal(g.pickups.length, 1);
  assert.ok(kx < -40, 'pushed up, away from the blade coming from below');
  const h = still(armed('saw', 5, [{ id: 'amount', level: 3 }]));
  for (let i = 0; i < 6; i++) dummy(h, 'skeleton', -60 + i * 20, -80, 20);
  h.rng = () => { throw new Error('no draws'); };
  for (let i = 0; i < 400; i++) tick(h);
  assert.ok(h.kills > 0, 'cut and killed without a draw');
});

// ---- debug, cards, HUD, determinism -------------------------------------------------

test('debug: F9 and F10 grant the bite and the saw blade at L5', () => {
  assert.deepEqual([DEBUG_GRANT_KEYS.F9, DEBUG_GRANT_KEYS.F10], ['bite', 'saw']);
  const g = new Game({ seed: 1, debug: true, timeline: QUIET });
  g.tick({ debug: { grant: 'bite' } });
  g.tick({ debug: { grant: 'saw' } });
  assert.deepEqual(g.weapons.map((w) => `${w.id}:${w.level}`), ['fireball:1', 'bite:5', 'saw:5']);
  assert.equal(g.blades.length, 2, 'L5 launches two on the tick it is granted');
});

test('cards: names, icons, new and upgrade texts; HUD icons', () => {
  assert.deepEqual(cardInfo({ kind: 'weapon', id: 'bite', level: 1 }),
    { name: 'Bite', icon: { anim: 'icon.bite', frame: 0, scale: 1 }, tag: 'NEW', text: 'Bites the nearest foe; double on the weak' });
  assert.deepEqual(cardInfo({ kind: 'weapon', id: 'saw', level: 1 }),
    { name: 'Saw Blade', icon: { anim: 'icon.saw', frame: 0, scale: 1 }, tag: 'NEW', text: 'Tower flings a saw blade past you and back' });
  assert.equal(cardInfo({ kind: 'weapon', id: 'bite', level: 2 }).text, 'dmg 8→10, cd 1.5→1.4, reach 56→60');
  assert.equal(cardInfo({ kind: 'weapon', id: 'saw', level: 2 }).text, 'dmg 2→3, cd 3→2.75, size 10→11');
  assert.equal(cardInfo({ kind: 'weapon', id: 'saw', level: 3 }).text, 'cd 2.75→2.5, size 11→12, dwell 0.75→0.9');
  assert.equal(cardInfo({ kind: 'weapon', id: 'saw', level: 4 }).text, 'dmg 3→4, count 1→2, cd 2.5→2.25');
  for (const id of ['bite', 'saw']) assert.equal(WEAPON_ICONS[id].anim, `icon.${id}`);
  assert.deepEqual(iconSlots([{ id: 'bite', level: 2 }, { id: 'saw', level: 5 }], []).map((s) => s.max), [5, 5]);
});

test('bite and saw: determinism and the snapshot', () => {
  const play = () => {
    const g = new Game({ seed: 23 });
    g.weapons.push(createWeapon('bite', 2), createWeapon('saw', 4));
    g.buffs.push({ id: 'amount', level: 1 });
    const digests = [];
    for (let i = 0; i < 60 * 90; i++) {
      g.tick({ moveX: Math.cos(i / 90), moveY: Math.sin(i / 70), aimX: Math.sin(i / 50), aimY: 1, hasAim: true, pick: 0 });
      if (i % 600 === 0) digests.push(g.digest());
    }
    return { g, digests };
  };
  const a = play(), b = play();
  assert.deepEqual(a.digests, b.digests);
  assert.ok(a.g.kills > 0);
  assert.ok('blades' in a.g.snapshot());
  const c = armed('saw');
  tick(c);
  const d = c.digest();
  c.blades[0].dwell = 1;
  assert.notEqual(c.digest(), d, 'blades are in the digest');
});

// ---- render and art ---------------------------------------------------------------

function fakeCtx() {
  const calls = [];
  return new Proxy({}, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      return (...args) => { calls.push([k, ...args]); return {}; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

test('render: blades and jaws drawn at 2× without writing the game; debug draws blades and the reach', () => {
  const g = still(armed('saw'));
  g.weapons.push(createWeapon('bite', 1));
  dummy(g, 'knight', -20, 0);
  tick(g);
  assert.equal(g.blades.length, 1);
  assert.ok(g.effects.some((f) => f.anim === 'bite.jaws'));
  const before = g.digest();
  const ctx = fakeCtx();
  const makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => fakeCtx() });
  createRenderer({ atlas, makeCanvas }).drawWorld(ctx, g);
  drawDebugWorld(ctx, g);
  assert.equal(g.digest(), before, 'render writes no state');
  const frameOf = (n, i) => atlas.frames[atlas.anims[n].frames[i]];
  const saw = frameOf('saw.spin', g.blades[0].frame);
  const sawDraw = ctx.calls.find((c) => c[0] === 'drawImage' && c[2] === saw.x && c[3] === saw.y && c[4] === saw.w);
  assert.deepEqual(sawDraw.slice(8, 10), [24, 24], '12 px at 2×');
  const jaws = frameOf('bite.jaws', 0);
  assert.ok(ctx.calls.some((c) => c[0] === 'drawImage' && c[2] === jaws.x && c[3] === jaws.y && c[8] === 32), 'the jaws at 2×');
  assert.ok(ctx.calls.some((c) => c[0] === 'scale' && c[1] === -1), 'mirrored: the target is on the left');
  const arcs = ctx.calls.filter((c) => c[0] === 'arc').map((c) => c[3]);
  assert.ok(arcs.includes(10), 'blade circle');
  assert.ok(arcs.includes(WEAPONS.bite.levels[0].reach), 'bite reach');
});

test('art: jaws, saw blade and icons have the documented sizes, frames and timing', () => {
  const size = (n) => { const f = atlas.frames[atlas.anims[n].frames[0]]; return [f.w, f.h, atlas.anims[n].frames.length]; };
  assert.deepEqual(size('bite.jaws'), [16, 16, 3]);
  assert.deepEqual(ANIMS['bite.jaws'].ticks, [4, 3, 8]);
  assert.deepEqual(size('saw.spin'), [12, 12, 4]);
  assert.deepEqual(ANIMS['saw.spin'].ticks, [2, 2, 2, 2]);
  for (const n of ['icon.bite', 'icon.saw']) assert.deepEqual(size(n), [9, 9, 1], n);
  // the jaws effect plays once (15 ticks from the bite's tick) and goes
  const g = still(armed('bite'));
  dummy(g, 'knight', 20, 0);
  tick(g);
  const fx = g.effects.find((f) => f.anim === 'bite.jaws');
  for (let i = 0; i < 13; i++) tick(g);
  assert.ok(g.effects.includes(fx));
  tick(g);
  assert.ok(!g.effects.includes(fx));
  // a blade's spin loops
  const h = armed('saw');
  tick(h);
  const frames = new Set();
  for (let i = 0; i < 8; i++) { frames.add(h.blades[0].frame); tick(h); }
  assert.deepEqual([...frames].sort(), [0, 1, 2, 3]);
  void DT;
});

test('measure: the greedy bot takes the bite and the saw blade like any weapon', async () => {
  const { PICKS } = await import('../tools/measure.mjs');
  const g = new Game({ seed: 1, timeline: QUIET });
  g.offers = [{ kind: 'buff', id: 'might', level: 1 }, { kind: 'weapon', id: 'saw', level: 1 }, { kind: 'weapon', id: 'fireball', level: 2 }];
  assert.equal(PICKS.greedy(g), 1, 'a new weapon first');
  g.weapons.push(createWeapon('bite', 3));
  g.offers = [{ kind: 'weapon', id: 'fireball', level: 2 }, { kind: 'weapon', id: 'bite', level: 4 }, { kind: 'buff', id: 'might', level: 1 }];
  assert.equal(PICKS.greedy(g), 1, 'then the highest-level weapon\'s upgrade');
});
