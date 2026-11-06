// The balance instrument (tools/measure.mjs) runs every bot without throwing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICIES, PICKS, botIntent, gemTarget, GEM_RANGE, HOME, KITE_RADIUS, orbThreat, dodgeMove, runOne, summarize, summaryTable,
  timelineTable, causesTable, causeText, median, applySets,
} from '../tools/measure.mjs';
import { Game } from '../src/sim/game.js';
import { spawnOrb } from '../src/sim/enemyShots.js';
import { TIMELINE, TETHER_LENGTH } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }]; // no enemies, so no gems and no orbs

test('measure: one short seed per bot runs, is deterministic, and tabulates', () => {
  for (const policy of Object.keys(POLICIES)) {
    for (const pick of Object.keys(PICKS)) {
      const r = runOne({ policy, pick, seed: 3, maxSeconds: 5, step: 1 });
      assert.equal(r.bot, `${policy}+${pick}`);
      assert.ok(r.capped, `${r.bot} survives 5 s`);
      assert.ok(Math.abs(r.survived - 5) < 1e-9);
      assert.equal(r.samples.length, 5);
      assert.deepEqual(runOne({ policy, pick, seed: 3, maxSeconds: 5 }).kills, r.kills);
      const row = summarize([r], 5);
      assert.equal(row.medianText, '>=5.0');
      assert.equal(row.golem, 0);
      assert.match(summaryTable([row]), new RegExp(`\\| ${policy}\\+${pick} \\| 1 \\|`));
      assert.match(timelineTable([r], 1, 5), /\| 5 \| 100 \|/);
    }
  }
  assert.throws(() => runOne({ policy: 'nope', seed: 1, maxSeconds: 1 }));
  assert.throws(() => runOne({ policy: 'aim', pick: 'nope', seed: 1, maxSeconds: 1 }));
});

test('measure: a run that falls reports the fall time, and towerHp / --set apply', () => {
  const r = runOne({ policy: 'idle', seed: 1, maxSeconds: 60, towerHp: 1 });
  assert.equal(r.capped, false);
  assert.ok(r.survived > 5 && r.survived < 60, `fell at ${r.survived}`);
  const s = applySets(['rate.30=0.25', 'towerHp=7']);
  assert.equal(s.towerHp, 7);
  assert.equal(s.timeline.find((x) => x.t === 30).rate, 0.25);
  assert.notEqual(TIMELINE.find((x) => x.t === 30).rate, 0.25, 'the shared table is not touched');
  assert.throws(() => applySets(['nope=1']));
  assert.throws(() => applySets(['rate.31=1']));
});

test('measure: aim and kite fly to gems near HOME and level up; idle collects none', () => {
  const g = new Game({ seed: 5 });
  for (let i = 0; i < 700; i++) g.tick(botIntent(g, 'aim', 'greedy'));
  assert.ok(g.enemies.length > 0);
  assert.equal(POLICIES.aim(g).hasAim, true);
  assert.deepEqual(POLICIES.idle(g), {});
  g.enemyShots = [];
  const gem = { id: 1e6, x: HOME.x + 100, y: HOME.y, value: 1, homing: false };
  g.gems = [gem];
  assert.equal(gemTarget(g), gem);
  const m = POLICIES.kite(g);
  assert.ok(Math.abs(Math.hypot(m.moveX, m.moveY) - 1) < 1e-9);
  assert.ok(m.moveX * (gem.x - g.dragon.x) + m.moveY * (gem.y - g.dragon.y) > 0, 'kite heads for the gem');
  gem.x = HOME.x + GEM_RANGE + 1;
  assert.equal(gemTarget(g), null, 'too far from HOME');
  const runs = ['idle', 'kite'].map((policy) => runOne({ policy, pick: 'greedy', seed: 2, maxSeconds: 70 }));
  assert.equal(runs[0].level, 1);
  assert.ok(runs[1].level > 1, `kite level ${runs[1].level}`);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('measure: the bots stay anchored to HOME while the tower follows (no drift)', () => {
  for (const policy of ['aim', 'kite']) {
    const g = new Game({ seed: 1, timeline: QUIET });
    let maxD = 0, moved = 0;
    for (let i = 0; i < 60 * 60; i++) {
      g.tick(botIntent(g, policy, 'greedy'));
      maxD = Math.max(maxD, Math.hypot(g.dragon.x - HOME.x, g.dragon.y - HOME.y), Math.hypot(g.tower.x - HOME.x, g.tower.y - HOME.y));
      if (i >= 30 * 60 && g.tower.moved) moved++;
    }
    const r = Math.hypot(g.dragon.x - HOME.x, g.dragon.y - HOME.y);
    assert.ok(Math.hypot(g.tower.x - g.dragon.x, g.tower.y - g.dragon.y) <= TETHER_LENGTH + 1e-9, `${policy}: tower within the tether`);
    if (policy === 'aim') {
      assert.ok(r < 1e-9 && maxD < 50, `aim stands on HOME: ${r}, max ${maxD}`);
      assert.equal(moved, 0, 'aim: the tower comes to rest');
    } else {
      assert.ok(Math.abs(r - KITE_RADIUS) < 3, `kite circles HOME at ${KITE_RADIUS}: ${r}`);
      assert.ok(maxD < KITE_RADIUS + 5, `kite never drifts: max ${maxD}`);
      assert.ok(moved > 25 * 60, 'kite: the tower keeps following');
    }
  }
});

test("measure: aim and kite step out of an orb's path; --no-dodge and idle do not", () => {
  const g = new Game({ seed: 1, timeline: QUIET });
  const o = spawnOrb(g, g.dragon.x + 60, g.dragon.y, -1, 0); // 60 px right, flying straight at it
  const th = orbThreat(g);
  assert.ok(th && th.orb === o && Math.abs(th.along - 60) < 1e-9);
  const m = dodgeMove(g, th);
  assert.ok(Math.abs(m.moveX) < 1e-9 && Math.abs(Math.abs(m.moveY) - 1) < 1e-9, 'straight off the path');
  o.y = g.dragon.y + 5;
  assert.ok(dodgeMove(g, orbThreat(g)).moveY < 0, 'it passes below, so step up');
  o.y = g.dragon.y; o.dx = 1;
  assert.equal(orbThreat(g), null, 'flying away');
  o.dx = -1; o.x = g.dragon.x + 150;
  assert.equal(orbThreat(g), null, 'out of range');
  o.x = g.dragon.x + 60; o.y = g.dragon.y + 30;
  assert.equal(orbThreat(g), null, 'passes wide');
  // In play: the dodging bot is not hit; the same bot without the dodge, and idle, are.
  const hit = (policy, opts) => {
    const h = new Game({ seed: 1, timeline: QUIET });
    h.weapons = [];
    spawnOrb(h, h.dragon.x + 90, h.dragon.y, -1, 0);
    for (let i = 0; i < 90; i++) h.tick({ ...POLICIES[policy](h, opts), pick: -1 });
    return h.tower.hp < h.tower.maxHp;
  };
  assert.equal(hit('aim', {}), false);
  assert.equal(hit('kite', {}), false);
  assert.equal(hit('aim', { dodge: false }), true);
  assert.equal(hit('idle', {}), true);
});

test('measure: tower damage is split by source; fall causes and the causes table', () => {
  const r = runOne({ policy: 'idle', seed: 1, maxSeconds: 120, step: 30 });
  assert.equal(r.capped, false);
  const total = r.lost.reduce((x, b) => x + Object.values(b || {}).reduce((y, v) => y + v, 0), 0);
  assert.ok(Math.abs(total - r.repaired - 100) < 1e-6, `the split adds up to the HP lost: ${total}`);
  assert.equal(r.cause, 'knight');
  assert.equal(causeText([r, r]), 'knight 2');
  const rows = causesTable([r], 30, 120).split('\n').filter((l) => /^\| \d:\d\d–/.test(l));
  assert.match(causesTable([r], 30, 120), /^\| Window \| knight \| Total \|/);
  assert.ok(Math.abs(rows.reduce((x, l) => x + Number(l.split('|')[2]), 0) - 100) < 0.2, 'windows add up to the HP lost');
  assert.match(summaryTable([summarize([r], 120)]), /knight 1 \| 0% \|$/);
});

test('measure: pick rules (naive card 0; greedy repair < 40%, new weapon, top weapon, buff)', () => {
  const g = new Game({ seed: 1 });
  const W = (id, level) => ({ kind: 'weapon', id, level });
  const B = (id, level) => ({ kind: 'buff', id, level });
  const R = { kind: 'repair', id: 'repair', level: 1 };
  const pick = (offers, hp = 100) => { g.offers = offers; g.tower.hp = hp; return PICKS.greedy(g); };
  assert.equal(pick([B('area', 1), W('laser', 1), R], 39), 2);
  assert.equal(pick([B('area', 1), W('laser', 1), R], 40), 1);
  assert.equal(pick([W('fireball', 3), W('ring', 4), B('area', 1)]), 1);
  assert.equal(pick([B('area', 1), B('split', 2), R]), 1);
  assert.equal(pick([B('area', 1), R]), 0);
  assert.equal(pick([R]), 0);
  g.offers = [B('area', 1), W('laser', 1), R];
  assert.equal(PICKS.naive(g), 0);
  assert.equal(botIntent(g, 'idle', 'greedy').pick, 1);
  g.offers = [];
  assert.equal(botIntent(g, 'kite', 'greedy').pick, -1);
});
