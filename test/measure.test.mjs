// The balance instrument (tools/measure.mjs) runs every bot without throwing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POLICIES, PICKS, botIntent, gemTarget, GEM_RANGE, runOne, summarize, summaryTable, timelineTable, median, applySets } from '../tools/measure.mjs';
import { Game } from '../src/sim/game.js';
import { TIMELINE } from '../src/sim/content.js';

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

test('measure: aim and kite fly to gems near the tower and level up; idle collects none', () => {
  const g = new Game({ seed: 5 });
  for (let i = 0; i < 700; i++) g.tick(botIntent(g, 'aim', 'greedy'));
  assert.ok(g.enemies.length > 0);
  assert.equal(POLICIES.aim(g).hasAim, true);
  assert.deepEqual(POLICIES.idle(g), {});
  const gem = { id: 1e6, x: g.tower.x + 100, y: g.tower.y, value: 1, homing: false };
  g.gems = [gem];
  assert.equal(gemTarget(g), gem);
  const m = POLICIES.kite(g);
  assert.ok(Math.abs(Math.hypot(m.moveX, m.moveY) - 1) < 1e-9);
  assert.ok(m.moveX * (gem.x - g.dragon.x) + m.moveY * (gem.y - g.dragon.y) > 0, 'kite heads for the gem');
  gem.x = g.tower.x + GEM_RANGE + 1;
  assert.equal(gemTarget(g), null, 'too far from the tower');
  const runs = ['idle', 'kite'].map((policy) => runOne({ policy, pick: 'greedy', seed: 2, maxSeconds: 70 }));
  assert.equal(runs[0].level, 1);
  assert.ok(runs[1].level > 1, `kite level ${runs[1].level}`);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
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
