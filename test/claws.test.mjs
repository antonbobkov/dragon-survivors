// Claws (§10.5–10.7): the left claw's rectangles, the right claw's cone, the dual claw and the
// evolution table, their damage, knockback and buffs, braziers, debug grants, determinism, and
// the slash effects' rendering and art.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { createWeapon } from '../src/sim/weapons.js';
import { circleInCone, circleInRect, slashRect, slashTargets } from '../src/sim/claws.js';
import { cardPool, rollOffers, applyCard, cardInfo, evolutionReady } from '../src/sim/levelup.js';
import { createRenderer, coneSprite, slashScale, drawSlash, CONE_APEX } from '../src/render/draw.js';
import { drawDebugWorld } from '../src/render/debug.js';
import { iconSlots, WEAPON_ICONS } from '../src/render/hud.js';
import { DEBUG_GRANT_KEYS } from '../src/input.js';
import {
  DT, WEAPONS, WEAPON_IDS, EVOLUTIONS, CARD_WEIGHTS, CLAW_SOUND, CLAW_RECT_ANIM, CLAW_CONE_ANIMS,
  ATLAS_NAMES, SOUND_NAMES, weaponMaxLevel, ENEMIES,
} from '../src/sim/content.js';
import { ANIMS } from '../src/sim/anims.js';

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
const atlas = { image: { fake: 'image' }, frames: atlasJson.frames, anims: atlasJson.anims };
const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const sounded = (g, name) => g.events.some((e) => e.type === 'sound' && e.name === name);
// A quiet game with only `id` at `level` and the given buffs.
const armed = (id, level = 1, buffs = [], seed = 1) => {
  const g = new Game({ seed, timeline: QUIET });
  g.weapons = [createWeapon(id, level)];
  g.buffs = buffs;
  return g;
};
// A sturdy dummy (HP 1000 unless `hp`), tier 1.
const dummy = (g, type, x, y, hp = 1000) => { const e = createEnemy(g, type, x, y); e.hp = hp; return e; };
// One world tick with the dragon standing still, facing and aiming as given.
const tick = (g, intent = {}) => g.tick({ moveX: 0, moveY: 0, ...intent });
const lost = (e, hp = 1000) => hp - e.hp;
// Records every enemy's position as the collisions step starts (after it walked this tick).
const beforeHits = (g) => {
  const pre = new Map();
  const step = g.stepCollisions.bind(g);
  g.stepCollisions = () => { for (const e of g.enemies) pre.set(e.id, { x: e.x, y: e.y }); step(); };
  return pre;
};

// ---- data -------------------------------------------------------------------------

test('claws: data matches the work-file numbers; physical; evolution table', () => {
  assert.deepEqual(WEAPON_IDS.slice(4, 7), ['leftClaw', 'rightClaw', 'dualClaw']);
  assert.deepEqual(WEAPONS.leftClaw.levels.map((l) => [l.cooldown, l.damage, l.width, l.height, l.sides]),
    [[1.3, 2, 110, 36, 1], [1.2, 3, 115, 38, 1], [1.1, 3, 125, 40, 2], [1.0, 4, 130, 42, 2], [0.9, 5, 140, 44, 2]]);
  assert.deepEqual(WEAPONS.rightClaw.levels.map((l) => [l.cooldown, l.damage, l.angle, l.reach, l.maxTargets]),
    [[1.1, 4, 60, 80, 1], [1.0, 5, 60, 85, 1], [0.9, 6, 65, 90, 2], [0.8, 8, 70, 95, 2], [0.7, 9, 75, 100, 3]]);
  assert.deepEqual(WEAPONS.dualClaw.levels, [{ cooldown: 0.7, damage: 9, width: 140, height: 44, sides: 2, angle: 75, reach: 100, maxTargets: 3 }]);
  for (const id of ['leftClaw', 'rightClaw', 'dualClaw']) assert.equal(WEAPONS[id].type, 'physical', id);
  assert.deepEqual([WEAPONS.leftClaw.knock, WEAPONS.rightClaw.knock, WEAPONS.dualClaw.knock], [14, 22, 22]);
  assert.deepEqual(EVOLUTIONS, [{ result: 'dualClaw', requires: ['leftClaw', 'rightClaw'] }]);
  assert.deepEqual([weaponMaxLevel('leftClaw'), weaponMaxLevel('rightClaw'), weaponMaxLevel('dualClaw')], [5, 5, 1]);
  assert.equal(CARD_WEIGHTS.evolve, 10);
  assert.ok(SOUND_NAMES.includes(CLAW_SOUND));
});

// ---- left claw: rectangles --------------------------------------------------------

test('left claw: a rectangle on the facing side from the dragon centre; hits everything in it once', () => {
  const g = armed('leftClaw');
  const right = [dummy(g, 'knight', 40, 0), dummy(g, 'knight', 100, 10), dummy(g, 'knight', 121, 0)];
  const out = [dummy(g, 'knight', -40, 0), dummy(g, 'knight', 60, 31), dummy(g, 'knight', 123, 0)];
  tick(g);
  // 110 × 36: x 0..110, y -18..18; knights r 12 overlap while within 12 px of it
  for (const e of right) assert.equal(lost(e) > 0, true, `hit at ${e.x},${e.y}`);
  for (const e of out) assert.equal(e.hp, 1000, `missed at ${e.x},${e.y}`);
  const s = g.slashes[0];
  assert.deepEqual([s.shape, s.side, s.w, s.h, s.struck, s.x, s.y], ['rect', 1, 110, 36, true, 0, 0]);
  assert.deepEqual(s.hits.sort(), right.map((e) => e.id).sort());
  assert.ok(sounded(g, CLAW_SOUND));
  // facing left (moving left) slashes the left side
  const h = armed('leftClaw');
  const l = dummy(h, 'knight', -60, 0), r = dummy(h, 'knight', 60, 0);
  h.tick({ moveX: -1 });
  assert.equal(h.dragon.flip, true);
  assert.ok(lost(l) > 0);
  assert.equal(r.hp, 1000);
  assert.equal(h.slashes[0].side, -1);
});

test('left claw: from L3 the other side is slashed 0.15 s (9 ticks) later, its side fixed at the volley', () => {
  const g = armed('leftClaw', 3);
  const r = dummy(g, 'skeleton', 60, 0), l = dummy(g, 'skeleton', -60, 0);
  tick(g);
  assert.equal(g.slashes.length, 2);
  assert.ok(lost(r) > 0);
  assert.equal(l.hp, 1000);
  assert.equal(g.slashes[1].delay, 9, 'queued after this tick\'s count-down');
  for (let i = 0; i < 8; i++) tick(g, { moveX: 1, aimX: 1, aimY: 0, hasAim: true }); // turning right changes nothing
  assert.equal(l.hp, 1000, 'not yet 8 ticks after the volley');
  tick(g);
  assert.ok(lost(l) > 0, 'struck 9 ticks after the volley');
  assert.equal(g.slashes.filter((s) => s.side === -1).length, 1);
  // L2 slashes one side only
  const h = armed('leftClaw', 2);
  tick(h);
  assert.equal(h.slashes.length, 1);
});

test('left claw: cooldown, Might, Haste, Area and Amount', () => {
  const g = armed('leftClaw');
  const strikes = [];
  let last = 0;
  for (let i = 0; i < 200; i++) {
    tick(g);
    const s = g.slashes.find((x) => x.id > last);
    if (s) { strikes.push(g.tickCount); last = s.id; }
  }
  assert.deepEqual(strikes.slice(0, 3), [1, 79, 157], 'every 1.3 s = 78 ticks');
  const buffed = armed('leftClaw', 1, [{ id: 'might', level: 1 }, { id: 'haste', level: 3 }, { id: 'area', level: 2 }, { id: 'amount', level: 2 }]);
  const e = dummy(buffed, 'knight', 150, 0); // inside 110 × 1.4 = 154
  tick(buffed);
  const s = buffed.slashes;
  assert.equal(s.length, 3, 'one rectangle + 2 Amount repeats');
  assert.deepEqual(s.map((x) => x.delay), [0, 6, 12], 'Amount repeats 6 and 12 ticks after');
  assert.ok(near(s[0].w, 154) && near(s[0].h, 36 * 1.4));
  assert.equal(s[0].damage, 3, 'ceil(2 × 1.2)');
  assert.equal(lost(e), 3, 'ceil(3 × 0.75): the knight resists physical 0.25');
  assert.ok(near(buffed.weapons[0].timer, 1.3 * 0.7 - DT), 'Haste −30%');
});

// ---- right claw: cone -------------------------------------------------------------

test('cone membership: inside the angle within reach + r, across an edge, at the apex', () => {
  const C = (x, y, r) => circleInCone(x, y, r, 0, 0, 1, 0, 60, 80);
  assert.ok(C(50, 0, 1));
  assert.ok(C(85, 0, 6), 'beyond reach but within reach + r');
  assert.ok(!C(87, 0, 6));
  assert.ok(C(50, 50 * Math.tan(Math.PI / 6) - 0.5, 0.1), 'just inside the 30° edge');
  assert.ok(!C(50, 50 * Math.tan(Math.PI / 6) + 3, 2), 'outside the edge by more than r');
  assert.ok(C(50, 50 * Math.tan(Math.PI / 6) + 3, 4), 'crossing the edge');
  assert.ok(!C(-20, 0, 10));
  assert.ok(C(-5, 0, 10), 'apex inside the circle');
  assert.ok(circleInRect(115, 0, 6, { x0: 0, x1: 110, y0: -18, y1: 18 }));
  assert.ok(!circleInRect(116, 0, 6, { x0: 0, x1: 110, y0: -18, y1: 18 }));
  assert.deepEqual(slashRect({ side: -1, w: 110, h: 36 }, 10, 5), { x0: -100, x1: 10, y0: -13, y1: 23 });
});

test('right claw: the maxTargets nearest in the aimed cone, ties to the lower id', () => {
  const g = armed('rightClaw', 3); // 65°, 90 px, 2 targets
  const aim = { aimX: 0, aimY: 1, hasAim: true }; // down
  const far = dummy(g, 'knight', 0, 70), tieA = dummy(g, 'knight', 30, 40), tieB = dummy(g, 'knight', -30, 40);
  const behind = dummy(g, 'knight', 0, -30);
  tick(g, aim);
  assert.ok(lost(tieA) > 0 && lost(tieB) > 0, 'the two nearest (both 50 px)');
  assert.equal(far.hp, 1000);
  assert.equal(behind.hp, 1000);
  // a tie for the last place goes to the lower id
  const h = armed('rightClaw', 1); // one target
  const a = dummy(h, 'knight', 30, 40), b = dummy(h, 'knight', -30, 40);
  tick(h, aim);
  assert.ok(a.id < b.id && lost(a) > 0 && b.hp === 1000);
  assert.deepEqual(h.slashes[0].hits, [a.id]);
  // Amount adds targets; Area the reach (not the angle)
  const k = armed('rightClaw', 1, [{ id: 'amount', level: 2 }, { id: 'area', level: 1 }]);
  tick(k, aim);
  assert.deepEqual([k.slashes[0].maxTargets, k.slashes[0].reach, k.slashes[0].angle], [3, 96, 60]);
  // no enemy: the slash still strikes and the cooldown runs
  const e = armed('rightClaw');
  tick(e, aim);
  assert.ok(e.slashes[0].struck && sounded(e, CLAW_SOUND));
  assert.ok(e.weapons[0].timer > 1);
});

// ---- damage, knockback ------------------------------------------------------------

test('claws: physical damage through resistances; knockback straight away from the dragon by mass and Force', () => {
  const g = armed('rightClaw', 1); // damage 4, knock 22
  const sk = dummy(g, 'skeleton', 30, 40);
  tick(g, { aimX: 0.6, aimY: 0.8, hasAim: true });
  assert.equal(lost(sk), 6, 'skeleton weak −0.5: 4 × 1.5');
  const moved = Math.hypot(sk.x - 30, sk.y - 40);
  assert.ok(near(moved, 22 / ENEMIES.skeleton.mass, 1e-6), `pushed ${moved}`);
  assert.ok(near((sk.x - 30) / moved, 0.6, 1e-6) && near((sk.y - 40) / moved, 0.8, 1e-6), 'away from the dragon');
  const h = armed('rightClaw', 1, [{ id: 'force', level: 2 }]);
  const pre = beforeHits(h);
  const sl = dummy(h, 'slime', 50, 0);
  tick(h);
  assert.equal(lost(sl), 2, 'slime resists 0.5: 4 × 0.5');
  const p = pre.get(sl.id), push = Math.hypot(sl.x - p.x, sl.y - p.y);
  assert.ok(near(push, (22 * 2) / ENEMIES.slime.mass, 1e-6), `Force L2 doubles the knock: ${push}`);
  // the armoury's physical power and shred apply
  const m = new Game({ seed: 1, timeline: QUIET, meta: { power: { physical: 1.5 }, shred: { physical: 0.5 } } });
  m.weapons = [createWeapon('rightClaw', 1)];
  const kn = dummy(m, 'knight', 50, 0);
  tick(m);
  assert.equal(lost(kn), Math.ceil(4 * 1.5 * (1 - (0.25 - 0.5))));
  // the golem takes nothing and moves its fixed knockback; no procs or rng draws
  const z = armed('leftClaw', 1, [{ id: 'explode', level: 3 }, { id: 'split', level: 3 }, { id: 'pierce', level: 3 }]);
  let draws = 0;
  z.rng = () => { draws++; return 0; };
  const golem = createEnemy(z, 'golem', 60, 0);
  const kz = dummy(z, 'knight', 30, 0);
  tick(z);
  assert.equal(draws, 0, 'no procs, no random numbers');
  assert.ok(near(golem.x, 61, 1e-9) && sounded(z, 'hit_golem'));
  assert.ok(lost(kz) > 0);
  assert.equal(z.effects.length, 0, 'no explosion');
});

test('claws: a killing hit pushes nothing and the kill counts', () => {
  const g = armed('leftClaw');
  const pre = beforeHits(g);
  const sk = createEnemy(g, 'skeleton', 40, 0); // 1 HP
  tick(g);
  assert.deepEqual([sk.x, sk.y], [pre.get(sk.id).x, pre.get(sk.id).y]);
  assert.equal(g.kills, 1);
});

test('claws: a slash breaks the braziers it overlaps, and only those', () => {
  const g = armed('leftClaw');
  const brazier = (x, y) => { const b = { id: g.nextId++, x, y, anim: 'brazier.burn', frame: 0, frameTicks: 0 }; g.braziers.push(b); return b; };
  const hitB = brazier(100, 25), missB = brazier(-100, 0), farB = brazier(100, 32);
  g.rng = () => 0;
  tick(g);
  assert.deepEqual(g.braziers.map((b) => b.id), [missB.id, farB.id], 'the rect y -18..18 + radius 12 reaches y 30');
  assert.equal(g.pickups.length, 1);
  const h = armed('rightClaw');
  h.braziers.push({ id: h.nextId++, x: 0, y: 60, anim: 'brazier.burn', frame: 0, frameTicks: 0 });
  h.rng = () => 0;
  tick(h, { aimX: 0, aimY: 1, hasAim: true });
  assert.equal(h.braziers.length, 0, 'the cone breaks it with no enemy around');
});

// ---- dual claw, evolution ---------------------------------------------------------

test('dual claw: both rectangles at once plus the cone, right-claw damage', () => {
  const g = armed('dualClaw');
  const l = dummy(g, 'knight', -100, 0), r = dummy(g, 'knight', 100, 0), d = dummy(g, 'knight', 0, 60);
  tick(g, { aimX: 0, aimY: 1, hasAim: true });
  assert.deepEqual(g.slashes.map((s) => [s.shape, s.side, s.delay]), [['rect', 1, 0], ['rect', -1, 0], ['cone', 0, 0]]);
  for (const e of [l, r, d]) assert.equal(lost(e), Math.ceil(9 * 0.75), 'damage 9 vs knight armour');
  assert.ok(g.slashes.every((s) => s.damage === 9 && s.knock === 22));
});

test('evolution: offered (weight 10) only with both claws at L5, never as a weapon card; it replaces both', () => {
  const g = armed('leftClaw', 5);
  g.weapons = [createWeapon('fireball', 2), createWeapon('leftClaw', 5), createWeapon('laser', 1), createWeapon('rightClaw', 4)];
  const evo = EVOLUTIONS[0];
  assert.equal(evolutionReady(g, evo), false);
  assert.ok(!cardPool(g).some((p) => p.card.kind === 'evolve' || p.card.id === 'dualClaw'));
  g.weapons[3].level = 5;
  const pool = cardPool(g);
  const i = pool.findIndex((p) => p.card.kind === 'evolve');
  assert.deepEqual(pool[i], { card: { kind: 'evolve', id: 'dualClaw', level: 1 }, weight: 10 });
  assert.equal(pool[i - 1].card.id, 'laser', 'after the weapons');
  assert.equal(pool[i + 1].card.kind, 'buff', 'before the buffs');
  assert.ok(!pool.some((p) => p.card.kind === 'weapon' && p.card.id === 'dualClaw'));
  // weight 10: a draw that lands in it
  g.rng = () => 0;
  applyCard(g, pool[i].card);
  assert.deepEqual(g.weapons.map((w) => `${w.id}:${w.level}`), ['fireball:2', 'dualClaw:1', 'laser:1'], 'the first claw\'s slot; a slot frees');
  assert.equal(g.weapons[1].timer, 0, 'fires on the next weapons step');
  assert.ok(!cardPool(g).some((p) => p.card.kind === 'evolve'), 'no second offer');
  assert.deepEqual(cardPool(g).filter((p) => p.card.kind === 'weapon' && p.card.level === 1).map((p) => p.card.id),
    ['miniTower', 'ring', 'bite', 'saw'], 'a slot is free again, but not for the claws the dual claw was made from');
  // picking it through the level-up flow
  const h = new Game({ seed: 3, timeline: QUIET });
  h.weapons = [createWeapon('leftClaw', 5), createWeapon('rightClaw', 5)];
  // pool: fireball, laser, miniTower, ring, bite, saw new (18), the evolution (10), 10 buffs (30), repair (1)
  h.rng = () => 21 / 59;
  h.gems.push({ id: h.nextId++, x: 0, y: 0, value: 6, homing: false });
  tick(h);
  assert.deepEqual(h.offers[0], { kind: 'evolve', id: 'dualClaw', level: 1 });
  h.tick({ pick: 0 });
  assert.deepEqual(h.weapons.map((w) => `${w.id}:${w.level}`), ['dualClaw:1']);
  const info = cardInfo({ kind: 'evolve', id: 'dualClaw', level: 1 });
  assert.deepEqual([info.name, info.tag, info.text, info.icon.anim], ['Dual Claw', 'EVOLVE', 'Evolve: Left + Right Claw → Dual Claw', 'icon.dualclaw']);
  assert.equal(cardInfo({ kind: 'weapon', id: 'leftClaw', level: 3 }).text, 'sides 1→2, cd 1.2→1.1, width 115→125');
  assert.equal(cardInfo({ kind: 'weapon', id: 'rightClaw', level: 3 }).text, 'dmg 5→6, targets 1→2, cd 1→0.9');
  assert.equal(cardInfo({ kind: 'weapon', id: 'rightClaw', level: 1 }).text, 'Aimed claw strikes the nearest foes');
});

test('evolution: slashes queued before it still strike', () => {
  const g = armed('leftClaw', 5);
  g.weapons.push(createWeapon('rightClaw', 5));
  const l = dummy(g, 'knight', -60, 0);
  tick(g);
  assert.equal(l.hp, 1000);
  applyCard(g, { kind: 'evolve', id: 'dualClaw', level: 1 });
  for (let i = 0; i < 9; i++) tick(g);
  assert.ok(g.slashes.some((s) => s.weapon === 'leftClaw' && s.side === -1 && s.struck));
});

// ---- debug, HUD, determinism ------------------------------------------------------

test('debug: F6–F8 grant the claws; granting the dual claw evolves owned claws', () => {
  assert.deepEqual([DEBUG_GRANT_KEYS.F6, DEBUG_GRANT_KEYS.F7, DEBUG_GRANT_KEYS.F8], ['leftClaw', 'rightClaw', 'dualClaw']);
  const g = new Game({ seed: 1, debug: true, timeline: QUIET });
  g.tick({ debug: { grant: 'leftClaw' } });
  g.tick({ debug: { grant: 'rightClaw' } });
  assert.deepEqual(g.weapons.map((w) => `${w.id}:${w.level}`), ['fireball:1', 'leftClaw:5', 'rightClaw:5']);
  g.tick({ debug: { grant: 'dualClaw' } });
  assert.deepEqual(g.weapons.map((w) => `${w.id}:${w.level}`), ['fireball:1', 'dualClaw:1']);
  g.tick({ debug: { grant: 'dualClaw' } });
  assert.deepEqual(g.weapons.map((w) => `${w.id}:${w.level}`), ['fireball:1', 'dualClaw:1']);
  const h = new Game({ seed: 1, debug: true, timeline: QUIET });
  h.tick({ debug: { grant: 'dualClaw' } });
  assert.deepEqual(h.weapons.map((w) => w.id), ['fireball', 'dualClaw'], 'without claws it takes a free slot');
});

test('HUD: claw icons and one pip for the dual claw', () => {
  for (const id of ['leftClaw', 'rightClaw', 'dualClaw']) assert.ok(atlas.anims[WEAPON_ICONS[id].anim], id);
  const slots = iconSlots([{ id: 'dualClaw', level: 1 }, { id: 'leftClaw', level: 2 }], []);
  assert.deepEqual(slots.map((s) => s.max), [1, 5]);
});

test('claws: determinism and the snapshot', () => {
  const play = () => {
    const g = new Game({ seed: 11 });
    g.weapons.push(createWeapon('leftClaw', 3), createWeapon('rightClaw', 2));
    const digests = [];
    for (let i = 0; i < 60 * 70; i++) {
      g.tick({ moveX: Math.cos(i / 90), moveY: Math.sin(i / 70), aimX: Math.sin(i / 50), aimY: 1, hasAim: true, pick: 0 });
      if (i % 600 === 0) digests.push(g.digest());
    }
    return { g, digests };
  };
  const a = play(), b = play();
  assert.deepEqual(a.digests, b.digests);
  assert.ok(a.g.kills > 0);
  assert.ok('slashes' in a.g.snapshot());
  const c = new Game({ seed: 11 });
  c.weapons.push(createWeapon('leftClaw', 1));
  c.tick({});
  const d = c.digest();
  c.slashes[0].delay = 3;
  assert.notEqual(c.digest(), d, 'slashes are in the digest');
});

// ---- render ----------------------------------------------------------------------

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

test('render: slash scale, the 16 cone directions, apexes', () => {
  assert.deepEqual([slashScale(110, 56), slashScale(140, 56), slashScale(168, 56), slashScale(224, 56), slashScale(20, 56)], [2, 2, 3, 4, 1]);
  assert.deepEqual([slashScale(80, 40), slashScale(100, 40), slashScale(160, 40)], [2, 2, 4]);
  const dir = (deg) => coneSprite(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));
  assert.deepEqual(dir(0), { anim: 'claw.cone', quarter: 0, transpose: false });
  assert.deepEqual(dir(22.5), { anim: 'claw.cone22', quarter: 0, transpose: false });
  assert.deepEqual(dir(45), { anim: 'claw.cone45', quarter: 0, transpose: false });
  assert.deepEqual(dir(67.5), { anim: 'claw.cone22', quarter: 0, transpose: true });
  assert.deepEqual(dir(90), { anim: 'claw.cone', quarter: 1, transpose: false });
  assert.deepEqual(dir(-90), { anim: 'claw.cone', quarter: 3, transpose: false });
  assert.deepEqual(dir(200), { anim: 'claw.cone22', quarter: 2, transpose: false });
  assert.deepEqual(Object.keys(CONE_APEX), CLAW_CONE_ANIMS);
});

test('render: struck slashes are drawn at whole scales without writing the game; debug draws hitboxes', () => {
  const g = armed('dualClaw');
  dummy(g, 'knight', 60, 0);
  g.weapons.push(createWeapon('leftClaw', 5));
  g.tick({ aimX: 0, aimY: 1, hasAim: true });
  const before = g.digest();
  const ctx = fakeCtx();
  const makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => fakeCtx() });
  createRenderer({ atlas, makeCanvas }).drawWorld(ctx, g);
  drawDebugWorld(ctx, g);
  assert.equal(g.digest(), before, 'render writes no state');
  const swipe = atlas.frames[atlas.anims[CLAW_RECT_ANIM].frames[0]];
  const isSwipe = (c) => c[0] === 'drawImage' && c[2] === swipe.x && c[3] === swipe.y && c[4] === swipe.w;
  const draws = ctx.calls.filter(isSwipe);
  assert.equal(draws.length, 3, 'the dual claw\'s two rectangles and the left claw\'s first');
  for (const c of draws) assert.ok(Number.isInteger(c[8] / swipe.w) && c[8] / swipe.w >= 2, 'whole scale');
  assert.ok(ctx.calls.some((c) => c[0] === 'transform'), 'the cone is turned');
  assert.ok(ctx.calls.some((c) => c[0] === 'rect') && ctx.calls.some((c) => c[0] === 'arc'), 'hitboxes');
  // a cone pointing down: a quarter turn clockwise, drawn from its apex
  const c2 = fakeCtx();
  const s = { shape: 'cone', dx: 0, dy: 1, reach: 80, anim: 'claw.cone', frame: 1 };
  drawSlash(c2, atlas, s, 100, 50);
  assert.deepEqual(c2.calls.find((c) => c[0] === 'transform').slice(1), [0, 1, -1, 0, 0, 0]);
  const di = c2.calls.find((c) => c[0] === 'drawImage');
  assert.deepEqual(di.slice(6), [-0, -40, 80, 80]);
  // a queued (not struck) slash is not drawn
  const q = armed('leftClaw', 3);
  q.tick({});
  assert.equal(q.slashes.length, 2);
  const c3 = fakeCtx();
  createRenderer({ atlas, makeCanvas }).drawWorld(c3, q);
  assert.equal(c3.calls.filter(isSwipe).length, 1);
});

test('art: claw sprites and icons are in the atlas with the documented sizes and frames', () => {
  for (const n of ['icon.leftclaw', 'icon.rightclaw', 'icon.dualclaw', CLAW_RECT_ANIM, ...CLAW_CONE_ANIMS]) assert.ok(ATLAS_NAMES.includes(n), n);
  const size = (n) => { const f = atlas.frames[atlas.anims[n].frames[0]]; return [f.w, f.h, atlas.anims[n].frames.length]; };
  assert.deepEqual(size(CLAW_RECT_ANIM), [56, 18, 3]);
  for (const n of CLAW_CONE_ANIMS) assert.deepEqual(size(n), [40, 40, 3], n);
  for (const n of ['icon.leftclaw', 'icon.rightclaw', 'icon.dualclaw']) assert.deepEqual(size(n), [9, 9, 1], n);
  for (const n of [CLAW_RECT_ANIM, ...CLAW_CONE_ANIMS]) assert.deepEqual(ANIMS[n].ticks, [3, 4, 5], `${n}: the cones share timing`);
  // an effect advances from its strike tick and goes on the 12th
  const g = armed('rightClaw');
  tick(g);
  for (let i = 0; i < 10; i++) tick(g);
  assert.equal(g.slashes.length, 1, 'still there after 11 ticks');
  tick(g);
  assert.equal(g.slashes.length, 0);
});
