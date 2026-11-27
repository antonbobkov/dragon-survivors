// Horses and their stampedes (§8.8), the mounted knight (§8, §5, §8.6), the stages and their
// banner (§9, §9.1, §17), and the new art.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { createSpawner, stepStampede, spawnStampede, stagesOf, stageAt, rateAt, rowIndexAt } from '../src/sim/spawner.js';
import { dealDamage } from '../src/sim/damage.js';
import {
  ENEMIES, ENEMY_TYPES, TIMELINE, DT, TIERS, MAX_ENEMIES, DESPAWN_DIST, SPAWN_RING_RADIUS, TOWER_RADIUS,
  STAMPEDE_SPACING, BANNER_TIME, BANNER_FADE, ATLAS_NAMES, TIERED_ANIMS, screenScale, tierHp,
} from '../src/sim/content.js';
import { tierSprite, SPRITE_SCALE } from '../src/render/draw.js';
import { stageBanner, drawHud, HUD } from '../src/render/hud.js';
import { bestiaryLayout, bestiaryRows, spriteFit, BESTIARY } from '../src/render/bestiary.js';

const ROOT = new URL('..', import.meta.url);
const atlas = JSON.parse(readFileSync(new URL('assets/atlas.json', ROOT), 'utf8'));

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = (timeline = QUIET, opts = {}) => { const g = new Game({ seed: 1, timeline, ...opts }); g.weapons = []; return g; };
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(intent); };
const horses = (g) => g.enemies.filter((e) => e.type === 'horse');
// An rng that returns the given values in turn (then 0), recording every call.
function scripted(values) {
  const calls = [];
  const f = () => { const v = values.length ? values.shift() : 0; calls.push(v); return v; };
  f.calls = calls;
  return f;
}

// ---- the types ---------------------------------------------------------------------

test('horse and mounted knight: stats, resistances and mass as §8; ENEMY_TYPES ends with them before the golem', () => {
  assert.deepEqual(ENEMY_TYPES.slice(-3), ['horse', 'mountedKnight', 'golem']);
  const h = ENEMIES.horse, m = ENEMIES.mountedKnight;
  assert.deepEqual([h.hp, h.speed, h.r, h.dps, h.xp, h.mass], [2, 120, 10, 4, 1, 0.5]);
  assert.deepEqual(h.resist, { fire: 0, arcane: 0, physical: 0 });
  assert.ok(h.stampede && !m.stampede);
  assert.deepEqual([m.hp, m.speed, m.r, m.dps, m.xp, m.mass], [30, 60, 16, 15, 8, 2]);
  assert.deepEqual(m.resist, { fire: 0.25, arcane: -0.25, physical: 0.5 });
  assert.ok(h.speed > 87, 'a horse outruns the dragon (DRAGON_SPEED 87)');
});

test('screen scale: the mounted knight 3× at tiers 1–2 and 4× at 3–4; every other type 2× and 3×; whole numbers', () => {
  for (const a of ['mounted.walk', 'mounted.die']) assert.deepEqual([1, 2, 3, 4].map((t) => screenScale(a, t)), [3, 3, 4, 4], a);
  for (const a of ['knight.walk', 'horse.walk', 'horse.die', 'ghost.burn']) assert.deepEqual([1, 2, 3, 4].map((t) => screenScale(a, t)), [2, 2, 3, 3], a);
  assert.equal(screenScale('explosion.big', undefined), 2, 'not an enemy: the standard');
  assert.deepEqual(tierSprite(atlas, { anim: 'mounted.walk', tier: 1 }), { anim: 'mounted.walk', scale: 3 / SPRITE_SCALE });
  assert.deepEqual(tierSprite(atlas, { anim: 'mounted.die', tier: 4 }), { anim: 'mounted.die@t4', scale: 4 / SPRITE_SCALE });
  assert.deepEqual(tierSprite(atlas, { anim: 'horse.walk', tier: 3 }), { anim: 'horse.walk@t3', scale: 3 / SPRITE_SCALE });
});

test('mounted knight: walks at the tower like a knight, its tier scales it, dies into mounted.die with its tier', () => {
  const g = still();
  const m = createEnemy(g, 'mountedKnight', 300, 50, 2);
  assert.equal(m.hp, tierHp(30, 2));
  assert.equal(m.r, 16);
  run(g, 60);
  assert.ok(Math.abs(m.x - (300 - 60)) < 1e-6 && Math.abs(m.y - 50) < 1e-6, 'one second at 60 px/s straight at the tower');
  assert.equal(m.flip, true);
  m.hp = 0;
  g.tick({});
  assert.deepEqual(g.effects.map((f) => [f.anim, f.tier]), [['mounted.die', 2]]);
  assert.equal(g.gems[0].value, ENEMIES.mountedKnight.xp * TIERS[2].xp);
});

// ---- horses --------------------------------------------------------------------------

test('horse: runs a straight line at 120 px/s whatever the tower does (no homing), through the tower and past it', () => {
  const g = still();
  const h = createEnemy(g, 'horse', -400, 50);
  assert.deepEqual([h.dx, h.dy, h.flip], [1, 0, false], 'toward the tower as it is when created');
  const x0 = h.x;
  for (let i = 1; i <= 600; i++) {
    g.tick({ moveX: 0, moveY: i < 300 ? 1 : -1 }); // the dragon drags the tower down, then up
    assert.ok(Math.abs(h.x - (x0 + 120 * DT * i)) < 1e-6 && h.y === 50, `tick ${i}: straight on`);
  }
  assert.ok(h.x > g.tower.x + 500, 'well past the tower');
  assert.deepEqual([h.dx, h.dy], [1, 0]);
});

test('horse: a hit knocks it aside but never turns it; a tier slows it as any enemy', () => {
  const g = still();
  const h = createEnemy(g, 'horse', -400, 50, 3);
  assert.equal(h.hp, tierHp(2, 3));
  dealDamage(g, h, 1, 'fire', { x: h.x, y: h.y - 10 }, 4);
  assert.ok(Math.abs(h.y - (50 + 4 / 0.5)) < 1e-9, 'pushed knock / mass = 8 px');
  const y = h.y, x = h.x;
  g.tick({});
  assert.deepEqual([h.dx, h.dy], [1, 0]);
  assert.ok(Math.abs(h.x - (x + 120 * TIERS[3].speed * DT)) < 1e-9 && Math.abs(h.y - y) < 1e-9);
});

test('horse: deals its contact DPS only while it overlaps the tower as it crosses', () => {
  const g = still();
  const t = g.tower;
  const h = createEnemy(g, 'horse', t.x - 200, t.y);
  let hits = 0;
  for (let i = 0; i < 300; i++) {
    const before = t.hp;
    const overlapping = Math.abs(h.x + 120 * DT - t.x) < h.r + TOWER_RADIUS; // its position in the collisions step
    g.tick({});
    if (t.hp < before) { hits++; assert.ok(overlapping, `tick ${i}`); assert.ok(Math.abs(before - t.hp - 4 * DT) < 1e-9); }
  }
  // It crosses the 2 × (10 + 26) px band at 2 px per tick.
  assert.ok(hits >= 35 && hits <= 36, `${hits} ticks of contact`);
  assert.ok(h.x > t.x + 300);
});

test('horse: despawned past DESPAWN_DIST without refunding the budget; other types still refund', () => {
  const g = still();
  const t = g.tower;
  const h = createEnemy(g, 'horse', t.x + DESPAWN_DIST - 1, t.y);
  h.dx = 1; h.dy = 0;
  const k = createEnemy(g, 'knight', t.x - DESPAWN_DIST - 5, t.y);
  g.tick({});
  assert.ok(!g.enemies.includes(h) && !g.enemies.includes(k));
  assert.equal(g.spawner.budget, 1, 'the knight refunds 1, the horse nothing');
  assert.equal(g.kills, 0);
  assert.equal(g.gems.length, 0);
});

// ---- stampedes -----------------------------------------------------------------------

const STAMPEDE_TL = [{ t: 0, rate: 0, weights: { knight: 100 }, stampede: { every: 20, min: 5, max: 8 } }];

test('stampede: a line of n horses 24 px apart across a run from the ring through the tower', () => {
  const g = still(STAMPEDE_TL);
  g.rng = scripted([0.99, 0.25]); // n = 5 + floor(0.99 × 4) = 8; angle π/2: below the dragon
  g.tick({});
  const hs = horses(g);
  assert.equal(hs.length, 8);
  assert.equal(g.rng.calls.length, 2, 'count and angle; no tier draw without tier weights');
  assert.equal(g.spawner.stampedes, 1);
  const cx = hs.reduce((s, h) => s + h.x, 0) / 8, cy = hs.reduce((s, h) => s + h.y, 0) / 8;
  // Spawned at dragon (0, 0) + 560 (0, 1) and then ran one tick.
  const u = { x: 0 - 0, y: 50 - 560 }; const L = Math.hypot(u.x, u.y); u.x /= L; u.y /= L;
  assert.ok(Math.abs(cx - u.x * 2) < 1e-6 && Math.abs(cy - (SPAWN_RING_RADIUS + u.y * 2)) < 1e-6, 'centred on the ring');
  for (const h of hs) {
    assert.ok(Math.abs(h.dx - u.x) < 1e-12 && Math.abs(h.dy - u.y) < 1e-12, 'one shared run direction, at the tower');
    assert.equal(h.tier, 1);
  }
  for (let i = 1; i < 8; i++) {
    const a = hs[i - 1], b = hs[i];
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - STAMPEDE_SPACING) < 1e-9, 'spacing');
    assert.ok(Math.abs((b.x - a.x) * u.x + (b.y - a.y) * u.y) < 1e-9, 'across the run');
  }
  assert.deepEqual(hs.map((h) => h.id), hs.map((h, i) => hs[0].id + i), 'created in line order');
});

test('stampede: count, then tier (only with tier weights, shared by the line), then angle', () => {
  const tl = [{ ...STAMPEDE_TL[0], tiers: { 1: 0, 2: 0, 3: 1, 4: 0 } }];
  const g = still(tl);
  g.rng = scripted([0, 0.5, 0]); // n = 5, tier 3, angle 0
  g.tick({});
  assert.equal(g.rng.calls.length, 3);
  assert.deepEqual(horses(g).map((h) => h.tier), [3, 3, 3, 3, 3]);
  assert.deepEqual(g.seenTiers.horse, [3]);
  assert.ok(horses(g).every((h) => h.x > 400), 'angle 0: right of the dragon');
});

test('stampede: horses join only under the cap', () => {
  const g = still(STAMPEDE_TL);
  for (let i = 0; i < MAX_ENEMIES - 3; i++) createEnemy(g, 'knight', 5000 + i, 0).hp = 1;
  g.rng = scripted([0, 0.5]);
  g.spawner.nextStampede = 0;
  stepStampede(g, STAMPEDE_TL[0]);
  assert.equal(horses(g).length, 3);
  assert.equal(g.enemies.length, MAX_ENEMIES);
});

test('stampede schedule on the default table: 1:00, 1:20, 1:40, 2:00, 2:30, 3:00, 3:30, 4:00, then every 15 s', () => {
  const g = { t: 0, rng: () => 0, spawner: createSpawner(), enemies: [], nextId: 1, seen: [], seenTiers: {}, dragon: { x: 0, y: 0 }, tower: { x: 0, y: 50 } };
  const at = [];
  for (let tick = 0; tick <= 330 * 60; tick++) {
    g.t = tick * DT;
    const before = g.spawner.stampedes;
    stepStampede(g, TIMELINE[rowIndexAt(TIMELINE, g.t)]);
    if (g.spawner.stampedes > before) at.push(Math.round(g.t * 100) / 100);
    g.enemies.length = 0;
  }
  assert.deepEqual(at, [60, 80, 100, 120, 150, 180, 210, 240, 255, 270, 285, 300, 315, 330]);
});

test('stampede: sizes per row stay within min–max; none before 1:00', () => {
  for (const r of TIMELINE) {
    if (r.t < 60) { assert.equal(r.stampede, undefined); continue; }
    assert.ok(r.stampede && r.stampede.min >= 5 && r.stampede.max >= r.stampede.min && r.stampede.every > 0, `${r.t}`);
  }
  const g = still(STAMPEDE_TL);
  const sizes = new Set();
  for (const v of [0, 0.249, 0.25, 0.5, 0.75, 0.999]) {
    g.enemies.length = 0;
    g.rng = scripted([v, 0]);
    g.spawner.nextStampede = 0;
    stepStampede(g, STAMPEDE_TL[0]);
    sizes.add(horses(g).length);
  }
  assert.deepEqual([...sizes].sort(), [5, 6, 7, 8]);
});

test('stampede: a debug jump skips the stampedes in between; the next one is on the grid after t', () => {
  const g = new Game({ seed: 3, debug: true });
  g.tick({ debug: { jumpTo: 290 } });
  assert.equal(g.spawner.stampedes, 1, 'one stampede on the jump tick, not twelve');
  assert.equal(g.spawner.nextStampede, 300);
  run(g, 5);
  assert.equal(g.spawner.stampedes, 1);
});

test('stampede: a timeline without stampedes draws nothing extra (the same digest as before stampedes existed)', () => {
  const strip = (tl) => tl.map(({ stampede, ...r }) => r);
  const play = (timeline) => {
    const g = new Game({ seed: 11, timeline });
    for (let i = 0; i < 59 * 60; i++) g.tick({ moveX: Math.cos(i / 90), moveY: Math.sin(i / 90) });
    return g.digest();
  };
  assert.equal(play(TIMELINE), play(strip(TIMELINE)), 'no stampede rows before 1:00');
  const g = new Game({ seed: 11, timeline: strip(TIMELINE), debug: true });
  g.tick({ debug: { jumpTo: 200 } });
  assert.equal(g.spawner.stampedes, 0);
});

test('determinism: the same seed and intents through stampedes give the same digest; the snapshot holds the run', () => {
  const play = () => {
    const g = new Game({ seed: 5, debug: true });
    g.tick({ debug: { jumpTo: 58 } });
    for (let i = 0; i < 12 * 60; i++) g.tick({ moveX: Math.cos(i / 60), moveY: Math.sin(i / 60), aimX: 1, aimY: 0, hasAim: true, pick: 0 });
    return g;
  };
  const a = play(), b = play();
  assert.equal(a.digest(), b.digest());
  assert.ok(a.spawner.stampedes >= 1);
  const snap = a.snapshot();
  assert.equal(snap.spawner.nextStampede, 80);
  const h = snap.enemies.find((e) => e.type === 'horse');
  assert.ok(h && Number.isFinite(h.dx) && Number.isFinite(h.dy), 'a horse carries its run in the snapshot');
  const d = a.digest();
  h.dx = -h.dx;
  assert.notEqual(a.digest(), d, 'the run direction is part of the digest');
});

// ---- stages --------------------------------------------------------------------------

test('timeline: the rate curve is unchanged; mounted knights from 2:30; each stage led by its threat', () => {
  assert.deepEqual(TIMELINE.map((r) => [r.t, r.rate]), [[0, 0.3], [30, 0.5], [60, 0.6], [120, 2.5], [150, 6.25], [180, 10], [210, 13], [240, 16], [300, 18]]);
  for (let t = 0; t <= 300; t += 15) {
    const w = TIMELINE[rowIndexAt(TIMELINE, t)].weights;
    assert.equal(w.mountedKnight > 0, t >= 150, `mounted knights at ${t}`);
    assert.equal('horse' in w, false, 'horses come only in stampedes');
  }
  // Each stage's lead peaks in that stage: its weight there is above its weight in every other stage.
  const stageRows = (from, to) => TIMELINE.filter((r) => r.t >= from && r.t < to);
  const peak = (type, from, to) => {
    const inside = Math.max(...stageRows(from, to).map((r) => r.weights[type]));
    const outside = Math.max(...TIMELINE.filter((r) => r.t < from || (r.t >= to && r.t < 300)).map((r) => r.weights[type]));
    assert.ok(inside > outside, `${type} peaks in ${from}–${to}: ${inside} vs ${outside}`);
  };
  peak('knight', 0, 60);
  peak('slime', 60, 120);
  peak('mage', 120, 180);
  peak('ghostKnight', 180, 240);
  peak('mountedKnight', 240, 300);
  const ooze = TIMELINE.find((r) => r.t === 60).weights, haunt = TIMELINE.find((r) => r.t === 180).weights;
  assert.equal(Math.max(...Object.values(ooze)), ooze.slime, 'slimes the largest share in Ooze');
  assert.equal(Math.max(...Object.values(haunt)), haunt.ghostKnight, 'ghost knights the largest share in Haunt');
  for (const r of TIMELINE) assert.ok(r.weights.mountedKnight <= 5, 'mounted knights stay an elite');
  const siege = TIMELINE.find((r) => r.t === 240);
  assert.ok(siege.tiers[3] > 0 && siege.stampede.max > TIMELINE.find((r) => r.t === 60).stampede.max, 'Siege: silver, bigger stampedes');
  assert.ok(TIMELINE.find((r) => r.t === 180).tiers[2] > TIMELINE.find((r) => r.t === 150).tiers[2], 'Haunt: more bronze');
  assert.ok(Math.abs(rateAt(TIMELINE, 135) - (2.5 + 6.25) / 2) < 1e-12);
});

test('stages: five named stages at 0:00, 1:00, 2:00, 3:00, 4:00; stageAt picks the running one', () => {
  assert.deepEqual(stagesOf(TIMELINE).map((s) => [s.n, s.name, s.t]),
    [[1, 'Muster', 0], [2, 'Ooze', 60], [3, 'Arcana', 120], [4, 'Haunt', 180], [5, 'Siege', 240]]);
  assert.equal(stageAt(TIMELINE, 59.99).name, 'Muster');
  assert.equal(stageAt(TIMELINE, 60).name, 'Ooze');
  assert.equal(stageAt(TIMELINE, 400).name, 'Siege');
  assert.equal(stageAt(QUIET, 10), null);
});

test('banner: "Stage n: Name" for 2 s from each stage start, fading over the last 0.5 s; only in play', () => {
  const g = still(TIMELINE);
  const at = (t) => { g.t = t; return stageBanner(g); };
  assert.deepEqual(at(0), { text: 'Stage 1: Muster', alpha: 1 });
  assert.deepEqual(at(BANNER_TIME - BANNER_FADE), { text: 'Stage 1: Muster', alpha: 1 });
  assert.ok(Math.abs(at(1.75).alpha - 0.5) < 1e-9);
  assert.equal(at(BANNER_TIME), null);
  assert.equal(at(30), null, 'no stage starts at 0:30');
  assert.deepEqual(at(61), { text: 'Stage 2: Ooze', alpha: 1 });
  assert.equal(at(241.9).text, 'Stage 5: Siege');
  assert.equal(at(300), null, 'the golem is not a stage');
  g.t = 0;
  g.phase = 'dying';
  assert.equal(stageBanner(g), null);
  assert.equal(stageBanner(still()), null, 'a timeline without stages');
});

test('banner: the HUD draws it centred at its y in gold, without writing the game', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { calls.push([k, ...a]); return {}; }; },
    set(t, k, v) { calls.push(['set', k, v]); t[k] = v; return true; },
  });
  const g = still(TIMELINE);
  g.tickCount = 3600; g.t = 60.5;
  const before = g.digest();
  drawHud(ctx, g, atlas);
  assert.equal(g.digest(), before);
  const text = calls.filter((c) => c[0] === 'fillText' && c[1] === 'Stage 2: Ooze');
  assert.equal(text.length, 2, 'shadow and text');
  assert.deepEqual(text[1].slice(2), [480, HUD.banner.y]);
});

// ---- art and bestiary ------------------------------------------------------------------

test('art: horse 20×14 (2-frame gallop, 5-frame death), mounted knight 22×22 (2 + 6); tiers of every new anim', () => {
  const size = (anim) => { const f = atlas.frames[atlas.anims[anim].frames[0]]; return [f.w, f.h, atlas.anims[anim].frames.length]; };
  assert.deepEqual(size('horse.walk'), [20, 14, 2]);
  assert.deepEqual(size('horse.die'), [20, 14, 5]);
  assert.deepEqual(size('mounted.walk'), [22, 22, 2]);
  assert.deepEqual(size('mounted.die'), [22, 22, 6]);
  for (const a of ['horse.walk', 'horse.die', 'mounted.walk', 'mounted.die']) {
    assert.ok(TIERED_ANIMS.includes(a) && ATLAS_NAMES.includes(a), a);
    for (const t of [2, 3, 4]) {
      const f = atlas.frames[atlas.anims[`${a}@t${t}`].frames[0]];
      const p = atlas.frames[atlas.anims[a].frames[0]];
      assert.deepEqual([f.w, f.h], [p.w + 2, p.h + 2], `${a}@t${t}`);
    }
  }
});

test('bestiary: 9 types fit (87 px cards), the new types in table order, their sprites at 2× in the box', () => {
  const rects = bestiaryLayout(ENEMY_TYPES.length);
  assert.equal(ENEMY_TYPES.length, 9);
  assert.equal(rects[0].h, 87);
  assert.ok(rects.every((r) => r.y + r.h <= BESTIARY.bottom));
  const g = still();
  createEnemy(g, 'horse', 0, 0);
  createEnemy(g, 'mountedKnight', 0, 0, 3);
  const rows = bestiaryRows(g);
  const m = rows.find((r) => r.type === 'mountedKnight');
  assert.deepEqual([m.name, m.stats], ['Mounted knight', ['HP 30  XP 8', 'SPD 60  DPS 15', 'MASS 2']]);
  assert.deepEqual(m.tiers, [3]);
  assert.deepEqual(m.resists.map((r) => r.label), ['resist 25%', 'weak 25%', 'resist 50%']);
  assert.deepEqual(rows.find((r) => r.type === 'horse').resists.map((r) => r.label), ['0%', '0%', '0%']);
  for (const a of ['horse.walk', 'mounted.walk']) {
    const f = atlas.frames[atlas.anims[a].frames[0]];
    assert.equal(spriteFit(f.w, f.h, BESTIARY.spriteBox), 1, `${a} at 2×`);
    // Centred in the 87 px card, the sprite ends above the tier pips.
    assert.ok((87 + f.h * SPRITE_SCALE) / 2 <= 87 - BESTIARY.pipBottom - BESTIARY.pip, `${a} clears the pips`);
  }
});

test('spawnStampede: a degenerate line centre on the tower runs straight down', () => {
  const g = still();
  g.dragon.x = -SPAWN_RING_RADIUS; g.dragon.y = 0;
  g.tower.x = 0; g.tower.y = 0;
  spawnStampede(g, 1, 1, 0); // centre = dragon + 560 (1, 0) = the tower
  assert.deepEqual([horses(g)[0].dx, horses(g)[0].dy], [0, 1]);
});
