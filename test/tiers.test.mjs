// Enemy tiers (§8.6): multipliers, inheritance, the spawner's tier draw, the generated tier
// sprites, the renderer and the bestiary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { pickTier, rateAt } from '../src/sim/spawner.js';
import { createWeapon } from '../src/sim/weapons.js';
import { animLength } from '../src/sim/effects.js';
import { ANIMS } from '../src/sim/anims.js';
import {
  ENEMIES, ENEMY_TYPES, TIERS, TIER_IDS, TIERED_ANIMS, TIMELINE, ATLAS_NAMES, DT, tierAnim, tierHp, tierOf,
  SLIME_CHILD_HP, SLIME_CHILD_R, MAGE_CAST_INTERVAL, MAGE_CAST_TIME, GHOST_BURN_TIME, GOLEM_HP,
} from '../src/sim/content.js';
import { expandTiers, tierAnimName, resolveEntries, parseOps } from '../tools/build-atlas.mjs';
import { createRenderer, tierSprite, SPRITE_SCALE } from '../src/render/draw.js';
import { BESTIARY, TIER_COLORS, TIER_UNMET, bestiaryRows, tierLegend, drawBestiary } from '../src/render/bestiary.js';

const ROOT = new URL('..', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('tools/manifest.json', ROOT), 'utf8'));
const atlas = JSON.parse(readFileSync(new URL('assets/atlas.json', ROOT), 'utf8'));

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = (seed = 1) => { const g = new Game({ seed, timeline: QUIET }); g.weapons = []; return g; };
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(intent); };
const kill = (g, e) => { e.hp = 0; g.stepDeaths(); };
const ofType = (g, type) => g.enemies.filter((e) => e.type === type);

// ---- the table ---------------------------------------------------------------------

test('table: four tiers, tier 1 neutral, integer screen scales, multipliers grow with the tier', () => {
  assert.deepEqual(TIER_IDS, [1, 2, 3, 4]);
  assert.deepEqual(Object.keys(TIERS).map(Number), TIER_IDS);
  const t1 = TIERS[1];
  for (const k of ['hp', 'dps', 'xp', 'speed', 'r']) assert.equal(t1[k], 1, `tier 1 ${k}`);
  assert.equal(t1.scale, SPRITE_SCALE);
  assert.deepEqual(TIER_IDS.map((t) => TIERS[t].scale), [2, 2, 3, 3]);
  assert.deepEqual(TIER_IDS.map((t) => TIERS[t].r), [1, 1, 1.5, 1.5]);
  for (let t = 2; t <= 4; t++) {
    for (const k of ['hp', 'dps', 'xp']) assert.ok(TIERS[t][k] > TIERS[t - 1][k], `${k} grows at tier ${t}`);
    assert.ok(TIERS[t].speed <= TIERS[t - 1].speed, `speed never grows at tier ${t}`);
    assert.ok(Number.isInteger(TIERS[t].xp), 'gems stay whole');
  }
  assert.equal(tierOf({}), TIERS[1], 'no tier reads as tier 1');
  assert.equal(tierOf({ tier: 3 }), TIERS[3]);
  assert.equal(tierAnim('knight.walk', 1), 'knight.walk');
  assert.equal(tierAnim('knight.walk', 3), 'knight.walk@t3');
  assert.equal(tierAnim('knight.walk', 3), tierAnimName('knight.walk', 3), 'the sim and the atlas build agree on names');
});

test('tierHp: the exact product rounded up', () => {
  assert.deepEqual([1, 2, 3, 4, 10].map((h) => tierHp(h, 2)), [3, 5, 8, 10, 25]);
  assert.deepEqual([1, 3].map((h) => tierHp(h, 3)), [6, 18]);
  assert.deepEqual([1, 3].map((h) => tierHp(h, 4)), [15, 45]);
  assert.equal(tierHp(3, 1), 3);
});

// ---- enemies -------------------------------------------------------------------------

test('createEnemy: HP and radius scale with the tier, resistances do not; tier 1 by default', () => {
  const g = still();
  for (const type of ENEMY_TYPES.filter((t) => !ENEMIES[t].unkillable)) {
    const def = ENEMIES[type];
    assert.equal(createEnemy(g, type, 0, 0).tier, 1, `${type} default tier`);
    for (const t of TIER_IDS) {
      const e = createEnemy(g, type, 0, 0, t);
      assert.equal(e.tier, t);
      assert.equal(e.hp, Math.ceil(def.hp * TIERS[t].hp - 1e-9), `${type} t${t} hp`);
      assert.equal(e.r, def.r * TIERS[t].r, `${type} t${t} r`);
      assert.equal(e.anim, def.walk, 'the sim keeps the plain anim name');
    }
  }
  assert.throws(() => createEnemy(g, 'knight', 0, 0, 5), /tier/);
  assert.throws(() => createEnemy(g, 'knight', 0, 0, 0), /tier/);
});

test('the golem is always tier 1', () => {
  const g = still();
  const golem = createEnemy(g, 'golem', 0, 0, 4);
  assert.equal(golem.tier, 1);
  assert.equal(golem.hp, GOLEM_HP);
  assert.equal(golem.r, ENEMIES.golem.r);
  assert.deepEqual(g.seenTiers, { golem: [1] });
});

test('speed: a tiered enemy walks at the type speed times the tier speed', () => {
  for (const t of TIER_IDS) {
    const g = still();
    const e = createEnemy(g, 'skeleton', 0, 600, t);
    run(g, 60);
    assert.ok(Math.abs((600 - e.y) - ENEMIES.skeleton.speed * TIERS[t].speed) < 1e-9, `t${t}: ${600 - e.y}`);
  }
});

test('contact damage: the type DPS times the tier DPS', () => {
  for (const t of TIER_IDS) {
    const g = still();
    g.tower.hp = 1000;
    createEnemy(g, 'knight', g.tower.x, g.tower.y + 20, t);
    g.grid.build(g.enemies);
    const before = g.tower.hp;
    g.stepCollisions();
    assert.ok(Math.abs(before - g.tower.hp - ENEMIES.knight.dps * TIERS[t].dps * DT) < 1e-9, `t${t}`);
  }
});

test('gems: worth the type XP times the tier XP', () => {
  for (const t of TIER_IDS) {
    const g = still();
    const m = createEnemy(g, 'mage', 300, 0, t);
    kill(g, m);
    assert.deepEqual(g.gems.map((x) => x.value), [ENEMIES.mage.xp * TIERS[t].xp], `t${t}`);
  }
});

test('deaths: the die effect carries the tier; other effects are tier 1', () => {
  const g = still();
  kill(g, createEnemy(g, 'knight', 300, 0, 3));
  assert.deepEqual(g.effects.map((f) => [f.anim, f.tier]), [['knight.die', 3]]);
  assert.equal(g.effects[0].scale, 1, 'the scale comes from the tier when drawn, not from the effect');
  g.tower.hp = 0;
  g.tick({});
  assert.deepEqual(g.effects.map((f) => [f.anim, f.tier]), [['knight.die', 3], ['castle.destroy', 1]]);
});

// ---- inheritance ---------------------------------------------------------------------

test('inheritance: slime children take the parent tier, with the child HP and radius scaled', () => {
  for (const t of TIER_IDS) {
    const g = still();
    kill(g, createEnemy(g, 'slime', 0, 300, t));
    assert.deepEqual(g.effects.map((f) => [f.anim, f.tier]), [['slime.split', t]]);
    const kids = ofType(g, 'slime');
    assert.equal(kids.length, 2);
    for (const k of kids) {
      assert.deepEqual([k.gen, k.tier, k.hp, k.r], [1, t, tierHp(SLIME_CHILD_HP, t), SLIME_CHILD_R * TIERS[t].r], `t${t}`);
    }
  }
});

test('inheritance: a ghost rises with its ghost knight tier, after a burn drawn at that tier', () => {
  const g = still();
  kill(g, createEnemy(g, 'ghostKnight', 300, 0, 4));
  assert.deepEqual(g.effects.map((f) => [f.anim, f.tier]), [['ghost.burn', 4]]);
  run(g, Math.round(GHOST_BURN_TIME / DT) + 1);
  const [ghost] = ofType(g, 'ghost');
  assert.ok(ghost, 'a ghost rose');
  assert.equal(ghost.tier, 4);
  assert.equal(ghost.hp, tierHp(ENEMIES.ghost.hp, 4));
  assert.deepEqual(g.seenTiers, { ghostKnight: [4], ghost: [4] });
});

test('inheritance: a mage summons skeletons of its own tier', () => {
  const g = still();
  const m = createEnemy(g, 'mage', 0, -400, 3);
  run(g, Math.round((MAGE_CAST_INTERVAL + MAGE_CAST_TIME) / DT) + 2);
  const sk = ofType(g, 'skeleton');
  assert.equal(sk.length, 4, `${m.anim}`);
  for (const s of sk) assert.deepEqual([s.tier, s.hp, s.r], [3, tierHp(ENEMIES.skeleton.hp, 3), ENEMIES.skeleton.r * 1.5]);
});

test('seenTiers: per type, ascending, each tier once, in the snapshot', () => {
  const g = still();
  createEnemy(g, 'knight', 0, 0, 3);
  createEnemy(g, 'knight', 0, 0, 1);
  createEnemy(g, 'knight', 0, 0, 3);
  createEnemy(g, 'skeleton', 0, 0, 2);
  assert.deepEqual(g.seenTiers, { knight: [1, 3], skeleton: [2] });
  assert.deepEqual(g.snapshot().seenTiers, { knight: [1, 3], skeleton: [2] });
  const h = still();
  h.seenTiers.knight = [1];
  assert.notEqual(g.digest(), h.digest());
});

// ---- spawner -------------------------------------------------------------------------

test('pickTier: weights 1 to 4 in order; tier 1 when all are 0', () => {
  const w = { 1: 50, 2: 30, 3: 15, 4: 5 };
  assert.equal(pickTier(w, 0), 1);
  assert.equal(pickTier(w, 0.49), 1);
  assert.equal(pickTier(w, 0.51), 2);
  assert.equal(pickTier(w, 0.81), 3);
  assert.equal(pickTier(w, 0.96), 4);
  assert.equal(pickTier(w, 0.999999), 4);
  assert.equal(pickTier({ 1: 0, 2: 0, 3: 0, 4: 0 }, 0.5), 1);
  assert.equal(pickTier({ 1: 0, 2: 0, 3: 100, 4: 0 }, 0.2), 3);
  assert.equal(typeof pickTier({ 2: 1 }, 0), 'number');
});

test('default timeline: the 2:30 and 3:30 rows keep the interpolated rate curve; 3:30 only changes tiers', () => {
  const first = TIMELINE.findIndex((r) => r.tiers);
  assert.equal(TIMELINE[first].t, 150, 'bronze from 2:30');
  assert.ok(TIMELINE.slice(first).every((r) => r.tiers), 'every row from the first tier row has tier weights');
  const from = (tier) => TIMELINE.find((r) => r.tiers && r.tiers[tier] > 0).t;
  assert.deepEqual([from(2), from(3), from(4)], [150, 210, 300], 'bronze 2:30, silver 3:30, gold 5:00');
  for (const r of TIMELINE.filter((x) => x.tiers)) assert.deepEqual(Object.keys(r.tiers).map(Number), TIER_IDS, `${r.t}`);
  // The rows at 2:30 and 3:30 sit on the line between their neighbours; 3:30 copies the type
  // weights before it (2:30 also brings mounted knights, §9).
  for (const t of [150, 210]) {
    const i = TIMELINE.findIndex((r) => r.t === t);
    const a = TIMELINE[i - 1], b = TIMELINE[i + 1];
    assert.equal(TIMELINE[i].rate, a.rate + (b.rate - a.rate) * (t - a.t) / (b.t - a.t), `rate at ${t}`);
    if (t === 210) assert.deepEqual(TIMELINE[i].weights, a.weights, `weights at ${t}`);
    const without = TIMELINE.filter((r) => r.t !== t);
    for (let s = a.t; s <= b.t; s += 7.5) assert.ok(Math.abs(rateAt(TIMELINE, s) - rateAt(without, s)) < 1e-9, `rate at ${s}`);
  }
});

const stripTiers = (tl) => tl.map(({ tiers, ...r }) => r);

test('no tier weights, no extra draw: the default timeline and its tierless copy give the same digest before 2:30', () => {
  const play = (timeline) => {
    const g = new Game({ seed: 7, timeline });
    g.tower.hp = 1e9;
    let draws = 0;
    const rng = g.rng;
    g.rng = () => { draws++; return rng(); };
    for (let i = 0; i < 149 * 60; i++) {
      g.tick({ moveX: Math.cos(i / 90), moveY: Math.sin(i / 90), pick: 0 });
    }
    return { digest: g.digest(), draws, spawned: g.spawner.spawned };
  };
  const a = play(TIMELINE), b = play(stripTiers(TIMELINE));
  assert.ok(a.spawned > 50, `spawned ${a.spawned}`);
  assert.deepEqual(a, b);
});

test('draw order with tier weights: type, then tier, then angle', () => {
  const tl = [{ t: 0, rate: 60, weights: { knight: 50, skeleton: 50 }, tiers: { 1: 25, 2: 25, 3: 25, 4: 25 } }];
  const g = new Game({ seed: 1, timeline: tl });
  g.weapons = [];
  const rolls = [0.75, 0.6, 0.25]; // skeleton, tier 3, angle a quarter turn
  g.rng = () => rolls.shift() ?? 0.5;
  g.tick({});
  assert.equal(g.enemies.length, 1);
  const [e] = g.enemies;
  assert.deepEqual([e.type, e.tier], ['skeleton', 3]);
  assert.ok(Math.abs(e.x - g.dragon.x) < 1e-6 && e.y > g.dragon.y + 559, `angle π/2: ${e.x}, ${e.y}`);
  // Without tier weights the same rolls give the type, then the angle.
  const h = new Game({ seed: 1, timeline: stripTiers(tl) });
  h.weapons = [];
  const rolls2 = [0.75, 0.25];
  h.rng = () => rolls2.shift() ?? 0.5;
  h.tick({});
  assert.deepEqual([h.enemies[0].type, h.enemies[0].tier], ['skeleton', 1]);
  assert.ok(Math.abs(h.enemies[0].x - h.dragon.x) < 1e-6 && h.enemies[0].y > h.dragon.y + 559);
});

test('draws per spawn: two without tier weights (type, angle), three with them', () => {
  for (const [timeline, perSpawn] of [[[{ t: 0, rate: 60, weights: { knight: 1 } }], 2], [[{ t: 0, rate: 60, weights: { knight: 1 }, tiers: { 1: 1, 2: 1, 3: 0, 4: 0 } }], 3]]) {
    const g = new Game({ seed: 2, timeline });
    g.weapons = [];
    let draws = 0;
    const rng = g.rng;
    g.rng = () => { draws++; return rng(); };
    for (let i = 0; i < 30; i++) g.tick({});
    assert.equal(g.spawner.spawned, 30);
    assert.equal(draws, 30 * perSpawn, `${perSpawn} draws per spawn`);
  }
});

test('a run with tiers: tiered enemies appear in their time windows and the run stays deterministic', () => {
  const play = () => {
    const g = new Game({ seed: 3, debug: true });
    g.tower.hp = 1e9;
    const seen = {};
    g.tick({ debug: { jumpTo: 205 } });
    for (let i = 0; i < 40 * 60; i++) {
      g.tick({ moveX: Math.cos(i / 120), moveY: Math.sin(i / 120), pick: 0 });
      for (const e of g.enemies) seen[e.tier] = Math.min(seen[e.tier] ?? Infinity, g.t);
    }
    return { seen, digest: g.digest() };
  };
  const a = play();
  assert.ok(a.seen[2] < 210 && a.seen[3] >= 210 && !a.seen[4], JSON.stringify(a.seen));
  assert.equal(play().digest, a.digest);
});

// ---- atlas ---------------------------------------------------------------------------

test('manifest: the tiers block lists every tiered anim, tiers 2 to 4, with tint strengths in 0.5–0.7', () => {
  assert.deepEqual([...manifest.tiers.anims].sort(), [...TIERED_ANIMS].sort());
  assert.deepEqual(manifest.tiers.variants.map((v) => v.tier), [2, 3, 4]);
  for (const v of manifest.tiers.variants) {
    assert.ok(v.tintStrength >= 0.5 && v.tintStrength <= 0.7, `tier ${v.tier} strength ${v.tintStrength}`);
    assert.ok(v.tint && v.outline, `tier ${v.tier} tints and outlines`);
    assert.equal(TIER_COLORS[v.tier], v.outline, `bestiary pip colour of tier ${v.tier} is its outline`);
  }
});

test('expandTiers: one from-entry per anim and tier, after the written entries; bad blocks fail', () => {
  const m = {
    entries: [{ name: 'a.walk', file: 'a.bmp' }, { name: 'b.walk', file: 'b.bmp' }],
    tiers: { anims: ['a.walk', 'b.walk'], variants: [{ tier: 2, tint: '#ff0000', tintStrength: 0.5 }, { tier: 3, outline: '#00ff00' }] },
  };
  assert.deepEqual(expandTiers(m), [
    ...m.entries,
    { name: 'a.walk@t2', from: 'a.walk', tint: '#ff0000', tintStrength: 0.5 },
    { name: 'a.walk@t3', from: 'a.walk', outline: '#00ff00' },
    { name: 'b.walk@t2', from: 'b.walk', tint: '#ff0000', tintStrength: 0.5 },
    { name: 'b.walk@t3', from: 'b.walk', outline: '#00ff00' },
  ]);
  assert.equal(expandTiers({ entries: m.entries }), m.entries);
  const bad = (tiers) => () => expandTiers({ entries: m.entries, tiers });
  assert.throws(bad({ anims: ['a.walk'] }), /arrays/);
  assert.throws(bad({ anims: ['c.walk'], variants: [{ tier: 2 }] }), /c\.walk/);
  assert.throws(bad({ anims: ['a.walk'], variants: [{ tier: 1 }] }), /above 1/);
  assert.throws(bad({ anims: ['a.walk'], variants: [{ tier: 2.5 }] }), /above 1/);
  assert.throws(bad({ anims: ['a.walk'], variants: [{ tier: 2 }, { tier: 2 }] }), /twice/);
  assert.throws(bad({ anims: ['a.walk'], variants: [{ tier: 2, scale: 3 }] }), /unknown field "scale"/);
  assert.throws(bad({ anims: [], variants: [], extra: 1 }), /unknown field "extra"/);
  // Expanded entries go through the usual checks: frames keyed by the tier's ops.
  const resolved = resolveEntries({ entries: [{ name: 'a.walk', files: ['x.bmp', 'y.bmp'] }], tiers: { anims: ['a.walk'], variants: [{ tier: 4, tint: '#ffd000', tintStrength: 0.7, outline: '#f8c000' }] } }, '.');
  assert.deepEqual(resolved.get('a.walk@t4').map((f) => f.key), ['x.bmp#tint=ffd000@0.7#outline=f8c000', 'y.bmp#tint=ffd000@0.7#outline=f8c000']);
});

test('atlas: every tiered anim exists at every tier: the plain frames with the tier ops, 2 px larger, the same ticks', () => {
  const variants = Object.fromEntries(manifest.tiers.variants.map(({ tier, ...ops }) => [tier, parseOps({ name: 'tier', ...ops })]));
  for (const anim of TIERED_ANIMS) {
    const base = atlas.anims[anim];
    for (const t of TIER_IDS.filter((x) => x > 1)) {
      const name = tierAnim(anim, t);
      const a = atlas.anims[name];
      assert.ok(a, `${name} missing from atlas.json`);
      assert.ok(ATLAS_NAMES.includes(name), `${name} in ATLAS_NAMES`);
      assert.deepEqual(a.ticks, base.ticks, `${name} ticks`);
      assert.deepEqual(ANIMS[name].ticks, ANIMS[anim].ticks, `${name} anims.js`);
      const suffix = variants[t].map((o) => o.suffix).join('');
      assert.deepEqual(a.frames, base.frames.map((f) => f + suffix), `${name} frame keys`);
      a.frames.forEach((f, i) => {
        const r = atlas.frames[f], b = atlas.frames[base.frames[i]];
        assert.deepEqual([r.w, r.h], [b.w + 2, b.h + 2], `${name} frame ${i} size`);
      });
    }
  }
  for (const name of Object.keys(atlas.anims).filter((n) => n.includes('@t'))) {
    assert.ok(TIERED_ANIMS.includes(name.replace(/@t\d$/, '')), `${name} is a tier of a tiered anim`);
  }
  assert.ok(!atlas.anims['golem.walk@t2'], 'the golem has no tiers');
});

// ---- render --------------------------------------------------------------------------

function fakeCtx() {
  const calls = [];
  return new Proxy({}, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'createPattern') return () => ({});
      return (...args) => { calls.push([k, ...args]); return {}; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const fakeAtlas = () => ({ image: { atlas: true }, frames: atlas.frames, anims: atlas.anims });

test('tierSprite: the tier anim at the tier scale; plain anims and a missing variant fall back', () => {
  const A = fakeAtlas();
  assert.deepEqual(tierSprite(A, { anim: 'knight.walk', tier: 1 }), { anim: 'knight.walk', scale: 1 });
  assert.deepEqual(tierSprite(A, { anim: 'knight.walk', tier: 2 }), { anim: 'knight.walk@t2', scale: 1 });
  assert.deepEqual(tierSprite(A, { anim: 'knight.walk', tier: 3 }), { anim: 'knight.walk@t3', scale: 1.5 });
  assert.deepEqual(tierSprite(A, { anim: 'ghost.burn', tier: 4 }), { anim: 'ghost.burn@t4', scale: 1.5 });
  assert.deepEqual(tierSprite(A, { anim: 'explosion.big' }), { anim: 'explosion.big', scale: 1 });
  assert.deepEqual(tierSprite(A, { anim: 'golem.walk', tier: 3 }), { anim: 'golem.walk', scale: 1.5 }, 'no variant: the plain anim');
});

test('drawWorld: enemies and death effects draw their tier sprite at the tier screen scale (integer pixels)', () => {
  const A = fakeAtlas();
  const makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => fakeCtx() });
  const r = createRenderer({ atlas: A, makeCanvas });
  const g = still();
  g.weapons = [];
  const e3 = createEnemy(g, 'knight', 100, 0, 3);
  const e2 = createEnemy(g, 'skeleton', 120, 0, 2);
  const e1 = createEnemy(g, 'slime', 140, 0, 1);
  kill(g, createEnemy(g, 'mage', 160, 0, 4));
  const before = g.digest();
  const ctx = fakeCtx();
  r.drawWorld(ctx, g);
  assert.equal(g.digest(), before, 'drawing never writes the game');
  const blits = ctx.calls.filter((c) => c[0] === 'drawImage' && c[1] === A.image);
  const find = (anim) => {
    const fr = atlas.frames[atlas.anims[anim].frames[0]];
    return blits.find((c) => c[2] === fr.x && c[3] === fr.y);
  };
  for (const [ent, anim, px] of [[e3, 'knight.walk@t3', 3], [e2, 'skelly.walk@t2', 2], [e1, 'slime.walk', 2], [g.effects[0], 'mage.die@t4', 3]]) {
    const c = find(anim);
    assert.ok(c, `${anim} drawn for ${ent.type || ent.anim}`);
    const fr = atlas.frames[atlas.anims[anim].frames[0]];
    assert.deepEqual([c[8], c[9]], [fr.w * px, fr.h * px], `${anim} at ${px}×`);
  }
});

// ---- bestiary ------------------------------------------------------------------------

test('bestiary rows: the tiers met per type; unmet types and the golem show none', () => {
  const g = still();
  createEnemy(g, 'knight', 0, 0, 4);
  createEnemy(g, 'knight', 0, 0, 2);
  createEnemy(g, 'golem', 0, 0);
  const rows = bestiaryRows(g);
  assert.deepEqual(rows.find((r) => r.type === 'knight').tiers, [2, 4]);
  assert.deepEqual(rows.find((r) => r.type === 'golem').tiers, []);
  assert.deepEqual(rows.find((r) => r.type === 'mage').tiers, []);
  rows.find((r) => r.type === 'knight').tiers.push(1);
  assert.deepEqual(g.seenTiers.knight, [2, 4], 'rows are copies');
});

test('bestiary legend: the multipliers of tiers 1–4 in one line, from the table', () => {
  assert.equal(tierLegend(), 'HP ×1/2.5/6/15  DPS ×1/1.25/1.5/2  XP ×1/2/4/8  SPD ×1/1/0.9/0.8');
  assert.ok(('Tiers'.length + tierLegend().length) * 8.4 + 16 + 4 * BESTIARY.pip + 3 * BESTIARY.pipGap <= 960, 'fits the screen at 14 px');
  assert.ok(BESTIARY.legendY >= BESTIARY.bottom && BESTIARY.legendY + 16 <= BESTIARY.hintY);
  assert.equal(new Set(Object.values(TIER_COLORS)).size, 4);
  assert.ok(!Object.values(TIER_COLORS).includes(TIER_UNMET));
});

test('bestiary draw: pips in the tier colours for met tiers, dark for the rest, plus the legend', () => {
  const g = still();
  createEnemy(g, 'knight', 0, 0, 1);
  createEnemy(g, 'knight', 0, 0, 3);
  const ctx = fakeCtx();
  const fills = [];
  const proxy = new Proxy(ctx, {
    get(t, k) {
      if (k === 'fillRect') return (x, y, w, h) => fills.push([t.fillStyle, x, y, w, h]);
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const before = g.digest();
  drawBestiary(proxy, g, fakeAtlas(), 0, { makeCanvas: (w, h) => ({ w, h, getContext: () => fakeCtx() }) });
  assert.equal(g.digest(), before);
  const pips = fills.filter((f) => f[3] === BESTIARY.pip && f[4] === BESTIARY.pip);
  // One knight card (2 of 4 met) and the legend (all 4).
  assert.equal(pips.length, 8);
  const card = pips.filter((f) => f[2] < BESTIARY.legendY);
  assert.deepEqual(card.map((f) => f[0]), [TIER_COLORS[1], TIER_UNMET, TIER_COLORS[3], TIER_UNMET]);
  const legend = pips.filter((f) => f[2] >= BESTIARY.legendY);
  assert.deepEqual(legend.map((f) => f[0]), [TIER_COLORS[1], TIER_COLORS[2], TIER_COLORS[3], TIER_COLORS[4]]);
});

test('anim lengths are the same at every tier, so the burn and summon timings hold', () => {
  for (const anim of TIERED_ANIMS) for (const t of [2, 3, 4]) assert.equal(animLength(tierAnim(anim, t)), animLength(anim));
});
