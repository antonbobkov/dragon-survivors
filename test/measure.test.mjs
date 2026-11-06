// The balance instrument (tools/measure.mjs) runs every policy without throwing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POLICIES, runOne, summarize, summaryTable, timelineTable, median, applySets } from '../tools/measure.mjs';
import { Game } from '../src/sim/game.js';
import { TIMELINE } from '../src/sim/content.js';

test('measure: one short seed per policy runs, is deterministic, and tabulates', () => {
  for (const policy of ['idle', 'aim', 'kite']) {
    const r = runOne({ policy, seed: 3, maxSeconds: 5, step: 1 });
    assert.equal(r.policy, policy);
    assert.ok(r.capped, `${policy} survives 5 s`);
    assert.ok(Math.abs(r.survived - 5) < 1e-9);
    assert.equal(r.samples.length, 5);
    assert.deepEqual(runOne({ policy, seed: 3, maxSeconds: 5 }).kills, r.kills);
    const row = summarize([r], 5);
    assert.equal(row.medianText, '>=5.0');
    assert.match(summaryTable([row]), new RegExp(`\\| ${policy} \\| 1 \\|`));
    assert.match(timelineTable([r], 1, 5), /\| 5 \| 100 \|/);
  }
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

test('measure: policies produce valid intents and pick card 0 when offers are open', () => {
  const g = new Game({ seed: 5 });
  for (let i = 0; i < 700; i++) g.tick(POLICIES.aim(g));
  assert.ok(g.enemies.length > 0);
  const a = POLICIES.aim(g);
  assert.equal(a.hasAim, true);
  assert.equal(POLICIES.idle(g).pick, -1);
  g.offers = [{}, {}, {}];
  for (const p of Object.values(POLICIES)) assert.equal(p(g).pick, 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});
