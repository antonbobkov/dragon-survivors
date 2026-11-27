// The damage calculator (tools/dps.mjs): its maths, one minute of the report, and the check
// on one weapon against the real sim. The full `node tools/dps.mjs --check` is a manual command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODELS, poissonMinMean, lensArea, shotsIn, sawPath, hitsToKill, minuteAt, minuteRow, naiveBuild, nextBuilds,
  maxMoves, picksOf, bestFullBuild, checkCases, runCheck, CHECK_TOLERANCE, miniTowerShotRate, modsOf, rectArea, coneArea,
  xpBoundLevel, matchupTable,
} from '../tools/dps.mjs';
import { WEAPON_IDS, WEAPON_SLOTS, BUFF_SLOTS, DT } from '../src/sim/content.js';

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

test('dps: the mini tower steady state and the pressure of a minute', () => {
  // L1: a lob every 6 s, 8 s of life capped by 1 × 6 s − 0.5 s lob: 5.5 s at 0.8 s → 7 shots
  assert.ok(Math.abs(miniTowerShotRate(1, modsOf({ buffs: [] })) - 7 / 6) < 1e-9);
  // 0:30: 0.5 spawns/s of 70% knights (3 HP) and 30% skeletons (1 HP)
  const m = minuteAt(30);
  assert.ok(Math.abs(m.pressure - 0.5 * (0.7 * 3 + 0.3 * 1)) < 1e-9);
  assert.equal(m.stage, 'Muster');
  assert.ok(xpBoundLevel(60) >= 2);
});

test('dps: builds and searches respect slots and pick counts', () => {
  const a = naiveBuild(10, 3);
  assert.deepEqual(naiveBuild(10, 3), a, 'deterministic');
  assert.ok(a.weapons.length <= WEAPON_SLOTS && a.buffs.length <= BUFF_SLOTS);
  assert.ok(picksOf(a) <= 10);
  const start = { weapons: [{ id: 'fireball', level: 1 }], buffs: [] };
  for (const n of nextBuilds(start)) assert.equal(picksOf(n), 1);
  for (const m of maxMoves(start)) assert.equal(picksOf(m.b), m.cost);
  assert.equal(picksOf({ weapons: [{ id: 'fireball', level: 5 }, { id: 'dualClaw', level: 1 }], buffs: [{ id: 'might', level: 3 }] }), 4 + 11 + 3);
  const F = minuteAt(240).F;
  assert.equal(bestFullBuild(30, F), null, 'a full build needs 31 picks');
  assert.ok(bestFullBuild(31, F).dps > 0);
});

test('dps: one minute of the report runs, and the ceiling is at least the floor', () => {
  const r = minuteRow(90, { seeds: 4, beam: 6 });
  assert.ok(r.pressure > 0 && r.F.rho > 0);
  assert.ok(r.ceil.dps >= r.floor.dps - 1e-9, `${r.ceil.dps} >= ${r.floor.dps}`);
  assert.ok(picksOf(r.ceil.b) <= r.picks);
});

test('dps: --check on one weapon matches the real sim within the tolerance', () => {
  const c = { weapon: 'fireball', level: 1, set: 'stat', density: 'crowd', dummy: 'horse' };
  const r = runCheck(c, { seconds: 30 });
  assert.ok(r.measured > 0);
  assert.ok(Math.abs(r.err) <= CHECK_TOLERANCE, `model ${r.model}, measured ${r.measured}`);
  assert.ok(DT > 0);
});
