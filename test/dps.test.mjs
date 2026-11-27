// The damage calculator (tools/dps.mjs): its maths, the hit allocation and pressure on fixture
// timelines, the searches, one minute of the report, a few models against the real sim, and
// the CLI's check mode on a cheap case. The full `node tools/dps.mjs --check` is a manual command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODELS, poissonMinMean, lensArea, shotsIn, sawPath, hitsToKill, minuteAt, minuteRow, naiveBuild, nextBuilds,
  maxMoves, picksOf, bestMaxedBuild, checkCases, runCheck, CHECK_TOLERANCE, miniTowerShotRate, modsOf, rectArea, coneArea,
  xpBoundLevel, matchupTable, effectivePerHit, buildDps, weaponStreams, projectileHits, ceilingBuild, START_BUILD,
  LEVEL_CURVE, levelAt, fireballFan, laserOffsets, main,
} from '../tools/dps.mjs';
import {
  WEAPONS, WEAPON_IDS, WEAPON_SLOTS, BUFF_SLOTS, DT, ENEMIES, SLIME_GENS, TIERS, MAGE_SUMMON_COUNT, tierHp, xpToNext,
} from '../src/sim/content.js';
import { buffDamage, createWeapon } from '../src/sim/weapons.js';
import { rollOffers, applyCard } from '../src/sim/levelup.js';
import { mulberry32 } from '../src/sim/rng.js';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);
const DEG = Math.PI / 180;

// One timeline row with every family (slime generations, the ghost knight's ghost, the mage's
// summons), two tiers (3:1) and a stampede (3–5 horses every 10 s).
const FAMILY_ROW = [{ t: 0, rate: 2, stage: 'Test', weights: { knight: 1, slime: 1, mage: 1, ghostKnight: 1 }, tiers: { 1: 3, 2: 1 }, stampede: { every: 10, min: 3, max: 5 } }];

test('dps: every weapon has a model and check cases at L1 and its top level', () => {
  for (const id of WEAPON_IDS) {
    assert.ok(MODELS[id], `${id} has a model`);
    assert.ok(checkCases().some((c) => c.weapon === id), `${id} is checked`);
  }
});

test('dps: maths helpers', () => {
  assert.ok(Math.abs(poissonMinMean(2, 1) - (1 - Math.exp(-2))) < 1e-12);
  assert.ok(Math.abs(poissonMinMean(2, 50) - 2) < 1e-9);
  assert.equal(poissonMinMean(0, 3), 0);
  assert.ok(Math.abs(lensArea(10, 0, Infinity) - Math.PI * 100) < 1e-9);
  assert.ok(Math.abs(lensArea(10, 0, 100) - Math.PI * 100) < 1e-9, 'inside the field');
  assert.equal(lensArea(10, 200, 100), 0, 'outside the field');
  assert.ok(Math.abs(lensArea(10, 100, 100) - 153.745) < 0.01, 'a little under half on the edge');
  assert.equal(rectArea(10, 4, 0), 40);
  assert.ok(Math.abs(coneArea(180, 10, 0) - Math.PI * 50) < 1e-9);
  assert.equal(shotsIn(60, 0.5), 2, 'a 0.5 s timer fires twice in 60 ticks');
  assert.equal(shotsIn(61, 0.5), 3);
  // a saw blade: 260 px out at 260 px/s (60 steps), dwell 36 ticks, back
  const path = sawPath(260, 260, 36);
  assert.equal(path.indexOf(260), 59);
  assert.equal(path.filter((x) => x === 260).length, 37);
  assert.ok(path.length > 150 && path.length < 160);
});

test('dps: hits to kill follow the damage function and the bite execute', () => {
  assert.equal(hitsToKill(3, 2, 0), 2);
  assert.equal(hitsToKill(3, 2, -0.5), 1, 'a weakness: 2 → 3');
  assert.equal(hitsToKill(2, 2, 0.75), 2, 'ceil(0.5) = 1');
  assert.equal(hitsToKill(2, 2, 1), Infinity, 'immune');
  // bite L1 (8) on a mounted knight (30 HP, physical 0.5): 4 a hit, 8 once below 9 HP
  assert.equal(hitsToKill(30, 8, 0.5, true), 7);
  assert.equal(hitsToKill(30, 8, 0.5, false), 8);
  assert.match(matchupTable(), /\| bite \| 1 \| 8 physical \|/);
});

test('dps: hits spread over bodies by arrival rate × hits to kill, overkill lost', () => {
  // Two knights (3 HP) arrive for every skeleton (1 HP); a 2-fire hit kills a knight in 2 and a
  // skeleton in 1. Killing all of them takes 2·2 + 1 = 5 hits for 2·3 + 1 = 7 HP: 1.4 HP a hit
  // (spread by HP it would be 6/7 · 1.5 + 1/7 · 1 = 1.43; with overkill 2).
  const F = { mix: [{ type: 'knight', hp: 3, w: 2 / 3 }, { type: 'skeleton', hp: 1, w: 1 / 3 }] };
  assert.equal(ENEMIES.knight.resist.fire, 0);
  assert.equal(ENEMIES.skeleton.resist.fire, 0);
  near(effectivePerHit(F, 2, 'fire'), 7 / 5, 1e-12);
  // a 5-damage hit kills either in one: the mean HP per body, 7/3
  near(effectivePerHit(F, 5, 'fire'), 7 / 3, 1e-12);
  // the bite's execute: a mounted knight (30 HP) in 7 bites of 8 rather than 8
  const M = { mix: [{ type: 'mountedKnight', hp: 30, w: 1 }] };
  near(effectivePerHit(M, 8, 'physical', true), 30 / 7, 1e-12);
  near(effectivePerHit(M, 8, 'physical', false), 30 / 8, 1e-12);
  const Fb = { ...minuteAt(90).F, mix: M.mix };
  const bite = { weapons: [{ id: 'bite', level: 1 }], buffs: [] };
  const rate = weaponStreams('bite', 1, modsOf(bite), Fb).reduce((a, s) => a + s.rate, 0);
  near(buildDps(bite, Fb).dps, rate * 30 / 7, 1e-9, 'buildDps applies the execute');
  // dummies that never die take the raw damage
  near(effectivePerHit({ mix: [{ type: 'knight', hp: Infinity, w: 1 }] }, 2, 'physical'), 2, 1e-12);
});

test('dps: a minute\'s DPS is the share of its bodies the hits can kill × its pressure', () => {
  // The steady state: weapon stream s kills rate_s / Σ_b arrivals_b × hits to kill_b of the
  // incoming bodies, so the build removes Σ_s that share × the pressure.
  const load = (build, m) => {
    const mods = modsOf(build);
    const fb = (build.weapons.find((w) => w.id === 'fireball') || { level: 1 }).level;
    let share = 0;
    for (const w of build.weapons) {
      for (const s of weaponStreams(w.id, w.level, mods, m.F, { fireballLevel: fb })) {
        if (!(s.rate > 0)) continue;
        const dmg = buffDamage(s.base, mods);
        const need = m.bodies.reduce((a, b) => a + b.rate * hitsToKill(b.hp, dmg, ENEMIES[b.type].resist[s.type] || 0, s.execute && !s.explosion), 0);
        share += s.rate / need;
      }
    }
    return share * m.pressure;
  };
  for (const t of [60, 180, 300]) {
    const m = minuteAt(t);
    for (const b of [START_BUILD, naiveBuild(12, 2), { weapons: [{ id: 'bite', level: 5 }, { id: 'saw', level: 3 }], buffs: [{ id: 'might', level: 2 }] }]) {
      const d = buildDps(b, m.F).dps;
      near(d, load(b, m), 1e-9 * d, `${t} s`);
    }
  }
  // The review's 1:30 case (fireball 1, mini tower 1, Might 1, Amount 1): every body dies in
  // one 3-damage hit, so the build kills hits/s ÷ arrivals/s of the crowd (spread by HP it
  // would read higher). With the rebalanced fireball and Ooze it covers the pressure (1.14).
  const m = minuteAt(90);
  const b = { weapons: [{ id: 'fireball', level: 1 }, { id: 'miniTower', level: 1 }], buffs: [{ id: 'might', level: 1 }, { id: 'amount', level: 1 }] };
  const mods = modsOf(b);
  for (const x of m.bodies) assert.equal(hitsToKill(x.hp, buffDamage(2, mods), ENEMIES[x.type].resist.fire), 1, x.type);
  const hits = b.weapons.flatMap((w) => weaponStreams(w.id, w.level, mods, m.F, { fireballLevel: 1 })).reduce((a, s) => a + s.rate, 0);
  const arrivals = m.bodies.reduce((a, x) => a + x.rate, 0);
  const ratio = buildDps(b, m.F).dps / m.pressure;
  near(ratio, hits / arrivals, 1e-9);
  assert.ok(ratio > 1, `${ratio}`);
});

test('dps: pressure and the field count every body, tier and stampede', () => {
  const hpAt = (hp) => 0.75 * tierHp(hp, 1) + 0.25 * tierHp(hp, 2);
  const spawn = 2 / 4; // per type
  const family = hpAt(ENEMIES.knight.hp)
    + SLIME_GENS.reduce((a, g, i) => a + 2 ** i * hpAt(g.hp), 0)
    + hpAt(ENEMIES.mage.hp) + MAGE_SUMMON_COUNT * hpAt(ENEMIES.skeleton.hp)
    + hpAt(ENEMIES.ghostKnight.hp) + hpAt(ENEMIES.ghost.hp);
  const horses = (3 + 5) / 2 / 10;
  const m = minuteAt(5, {}, FAMILY_ROW);
  near(m.pressure, spawn * family + horses * hpAt(ENEMIES.horse.hp), 1e-9);
  const arrivals = m.bodies.reduce((a, b) => a + b.rate, 0);
  near(arrivals, spawn * (1 + (2 ** SLIME_GENS.length - 1) + 1 + MAGE_SUMMON_COUNT + 2) + horses, 1e-9);
  m.F.mix.forEach((x, i) => near(x.w, m.bodies[i].rate / arrivals, 1e-12));
  // the crowd's radius by presence (rate × HP); 2/s × 6 s = 12 enemies near the dragon
  near(m.F.r, m.bodies.reduce((a, b) => a + b.rate * b.hp * b.r, 0) / m.pressure, 1e-9);
  assert.equal(m.F.near, 12);
  near(m.F.rho, 12 / (Math.PI * 350 * 350), 1e-15);
  // 0:30 on the real timeline: 0.5 spawns/s of 70% knights (3 HP) and 30% skeletons (1 HP)
  near(minuteAt(30).pressure, 0.5 * (0.7 * 3 + 0.3 * 1), 1e-9);
  assert.equal(minuteAt(30).stage, 'Muster');
  // the XP bound: 1 bronze knight a second, 10 s → 10 × xp × the tier's XP
  let xp = 10 * ENEMIES.knight.xp * TIERS[2].xp, level = 1;
  while (xp >= xpToNext(level)) { xp -= xpToNext(level); level++; }
  assert.equal(xpBoundLevel(10, {}, [{ t: 0, rate: 1, weights: { knight: 1 }, tiers: { 2: 1 } }]), level);
  assert.ok(level > 2);
});

test('dps: projectile procs (pierce, split, explosions) in a fixture field', () => {
  const F = { rho: 1e-3, r: 10, R: Infinity };
  const seg = { d: 0, psi: 0, rem: 1000, gen: 0, aim: 50, empty: 0, hole: 50 };
  const none = { r: 6, exR: 60, explode: 0, split: 0, pierce: 0 };
  assert.deepEqual(projectileHits(none, F, seg), { direct: 1, explode: 0 }, 'the target, nothing after it');
  // Explode: the circle (60 + r) minus the empty disk around the dragon (radius: the target's distance)
  const ex = projectileHits({ ...none, explode: 0.5 }, F, seg);
  near(ex.explode, 0.5 * F.rho * (Math.PI * 70 ** 2 - lensArea(50, 50, 70)), 1e-9);
  // Pierce p: the chain goes on with p after each hit, through 2(r_p + r) wide random hits
  const p = 0.5, lam = F.rho * 2 * 16, k = lam * (1 - p), L = 1000 - 50;
  near(projectileHits({ ...none, pierce: p }, F, seg).direct, 1 + p * (lam / k) * (1 - Math.exp(-k * L)), 1e-9);
  // Split q in a field so dense every child hits: 1 + 2q children + 4q² grandchildren (gen 2 stops)
  const q = 0.5;
  near(projectileHits({ ...none, split: q }, { ...F, rho: 0.05 }, seg).direct, 1 + 2 * q + 4 * q * q, 1e-6);
});

test('dps: fans, claw rectangles, the cone and bite caps follow their geometry', () => {
  const none = modsOf({ buffs: [] });
  const amount = (n) => ({ ...none, amount: n });
  // fireball L1 with Amount 2: three shots spreadStep apart; parallel lasers `offset` apart
  const fan = fireballFan(WEAPONS.fireball.levels[0], amount(2));
  [-1, 0, 1].forEach((s, i) => near(fan[i], s * WEAPONS.fireball.spreadStep * DEG, 1e-12));
  const o = WEAPONS.laser.offset;
  assert.deepEqual(laserOffsets({ count: 1 }, amount(1)), [o, o]);
  assert.deepEqual(laserOffsets({ count: 1 }, amount(2)), [2 * o, 0, 2 * o]);
  const F = { rho: 1e-3, r: 10, R: 350, mix: [] };
  const rate = (id, level, mods, field = F) => MODELS[id].crowd(level, mods, field, {}).reduce((a, s) => a + s.rate, 0);
  // the left claw from L3: both sides, (1 + Amount) rectangles a side
  const top = WEAPONS.leftClaw.levels.length;
  const L = WEAPONS.leftClaw.levels[top - 1];
  assert.equal(L.sides, 2);
  near(rate('leftClaw', top, amount(1)), 2 * 2 * F.rho * rectArea(L.width, L.height, F.r) / L.cooldown, 1e-9);
  // in a crowd so dense every reach is full: the bite takes 1 + Amount, the cone maxTargets + Amount
  const dense = { ...F, rho: 0.05 };
  const B = WEAPONS.bite.levels[top - 1];
  near(rate('bite', top, amount(1), dense), 2 / B.cooldown, 1e-9);
  const C = WEAPONS.rightClaw.levels[top - 1];
  near(rate('rightClaw', top, amount(1), dense), (C.maxTargets + 1) / C.cooldown, 1e-6);
  // the mini tower L1: a lob every 6 s, 8 s of life capped by 1 × 6 s − 0.5 s lob: 5.5 s at 0.75 s → 8 shots
  assert.ok(Math.abs(miniTowerShotRate(1, none) - 8 / 6) < 1e-9);
});

test('dps: a check case longer than 2:15 runs without a prince joining the dummies', () => {
  const r = runCheck({ weapon: 'ring', level: 1, set: 'none', density: 'sparse', dummy: 'horse' }, { seconds: 2, warm: 140 });
  assert.ok(Number.isFinite(r.measured));
});

test('dps: the ring, saw and fireball models match the real sim', () => {
  for (const c of [
    { weapon: 'ring', level: 5, set: 'none', seconds: 40 },
    { weapon: 'saw', level: 5, set: 'none', seconds: 40 },
    { weapon: 'fireball', level: 1, set: 'stat', seconds: 30 },
  ]) {
    const r = runCheck({ ...c, density: 'crowd', dummy: 'horse' }, { seconds: c.seconds, warm: 1 });
    assert.ok(r.measured > 0);
    assert.ok(Math.abs(r.err) <= Math.max(CHECK_TOLERANCE, 0.2), `${c.weapon}: model ${r.model}, measured ${r.measured}`);
  }
  assert.ok(DT > 0);
});

test('dps: levels, naive builds and the floor', () => {
  // the measured curve (naive bots on the T-029 rebalance); a new measurement replaces it
  assert.deepEqual(LEVEL_CURVE, { 30: 1, 60: 2, 90: 6, 120: 11, 150: 17, 180: 26, 210: 38, 240: 51, 270: 65, 300: 80 });
  assert.equal(levelAt(90), 6);
  assert.equal(levelAt(45, { 30: 1, 60: 5 }), 3);
  // a naive build takes card 0 of every offer
  let differs = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const pick = (i) => {
      const g = { weapons: [createWeapon('fireball', 1)], buffs: [], tower: { hp: 100, maxHp: 100 }, rng: mulberry32(seed) };
      const offers = rollOffers(g);
      applyCard(g, offers[i < 0 ? offers.length - 1 : i]);
      return { weapons: g.weapons.map((w) => ({ id: w.id, level: w.level })), buffs: g.buffs.map((b) => ({ id: b.id, level: b.level })) };
    };
    assert.deepEqual(naiveBuild(1, seed), pick(0));
    if (JSON.stringify(pick(-1)) !== JSON.stringify(pick(0))) differs++;
  }
  assert.ok(differs > 0);
  const a = naiveBuild(10, 3);
  assert.deepEqual(naiveBuild(10, 3), a, 'deterministic');
  assert.ok(a.weapons.length <= WEAPON_SLOTS && a.buffs.length <= BUFF_SLOTS);
  assert.ok(picksOf(a) <= 10);
  // the floor is the median DPS of the naive builds (four: the mean of the middle two)
  const r = minuteRow(120, { seeds: 4, beam: 2 });
  const dps = [1, 2, 3, 4].map((s) => buildDps(naiveBuild(r.picks, s), r.F).dps).sort((x, y) => x - y);
  near(r.floor.dps, (dps[1] + dps[2]) / 2, 1e-9);
  assert.ok(dps[0] < dps[1] && dps[2] < dps[3], 'the builds differ');
});

test('dps: builds and searches respect slots and pick counts', () => {
  const start = { weapons: [{ id: 'fireball', level: 1 }], buffs: [] };
  for (const n of nextBuilds(start)) assert.equal(picksOf(n), 1);
  for (const m of maxMoves(start)) assert.equal(picksOf(m.b), m.cost);
  assert.equal(picksOf({ weapons: [{ id: 'fireball', level: 5 }, { id: 'dualClaw', level: 1 }], buffs: [{ id: 'might', level: 3 }] }), 4 + 11 + 3);
  const F = minuteAt(240).F;
  assert.deepEqual(bestMaxedBuild(0, F).b, start, 'no picks: the starting build');
});

test('dps: the ceiling search takes items to their top level and checks every maxed build', () => {
  // The beam steps by whole items too: even one build wide it finds at least every item taken
  // straight to its top level (the mini tower L5 here, which no single pick toward pays for).
  const F = minuteAt(120).F;
  const best = ceilingBuild(6, F, 1);
  for (const m of maxMoves(START_BUILD)) {
    if (m.cost <= 6) assert.ok(best.dps >= buildDps(m.b, F).dps - 1e-9, `${JSON.stringify(m.b)}`);
  }
  // The exhaustive search wins where a narrow beam misses the proc build, and the row keeps it.
  const r = minuteRow(180, { seeds: 2, beam: 2, levels: { 180: 12 } });
  assert.equal(r.picks, 11);
  assert.ok(r.ceil.dps >= bestMaxedBuild(r.picks, r.F).dps - 1e-9);
  assert.ok(r.ceil.exhaustive);
  assert.ok(picksOf(r.ceil.b) <= r.picks && r.ceil.dps >= r.floor.dps);
});

test('dps: the flags: unwinnable below the pressure, trivial above 3×', () => {
  const row = (rate) => [{ t: 0, rate, stage: 'Test', weights: { knight: 1 } }];
  const opts = { seeds: 2, beam: 2, levels: { 30: 1 } };
  const hard = minuteRow(30, { ...opts, timeline: row(40) });
  assert.ok(hard.ceil.dps < hard.pressure);
  assert.equal(hard.flag, 'unwinnable');
  const easy = minuteRow(30, { ...opts, timeline: row(0.01) });
  assert.ok(easy.floor.dps > 3 * easy.pressure);
  assert.equal(easy.flag, 'trivial');
  const r = minuteRow(90, { seeds: 4, beam: 6 });
  assert.ok(r.pressure > 0 && r.F.rho > 0);
  assert.ok(r.ceil.dps >= r.floor.dps - 1e-9, `${r.ceil.dps} >= ${r.floor.dps}`);
  assert.ok(picksOf(r.ceil.b) <= r.picks);
});

test('dps: --check fails up front on a weapon without a model and exits 1 on a case off the tolerance', () => {
  const saved = MODELS.saw;
  delete MODELS.saw;
  try {
    assert.throws(() => main(['--check', '--weapon', 'saw']), /no damage model for weapon "saw"/);
    assert.throws(() => main([]), /no damage model for weapon "saw"/);
  } finally {
    MODELS.saw = saved;
  }
  const log = console.log;
  console.log = () => {};
  try {
    const args = ['--check', '--weapon', 'bite', '--seconds', '1', '--warm', '0', '--reshuffle', '1', '--settle', '0'];
    assert.equal(main([...args, '--tolerance', '-1']), 1, 'every case off');
    assert.equal(main([...args, '--tolerance', '100']), 0, 'every case within');
  } finally {
    console.log = log;
  }
});
