// Soak (§20): a 5-minute run with a scripted dragon circling the tower. No exceptions, the
// spawner never spawns above the cap, and the golem ends the run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { MAX_ENEMIES, TIMELINE } from '../src/sim/content.js';

// Circles the tower at 120 px (tangent plus a radial correction) without aiming, so the
// fireball fires along the flight path; picks card 0 when offers are open.
function circler(g) {
  const d = g.dragon, t = g.tower;
  let rx = d.x - t.x, ry = d.y - t.y;
  const rl = Math.hypot(rx, ry) || 1;
  rx /= rl; ry /= rl;
  const k = Math.max(-1, Math.min(1, (120 - rl) / 30));
  return { moveX: ry + rx * k * 2, moveY: -rx + ry * k * 2, pick: g.offers.length ? 0 : -1 };
}

// The default timeline with every rate from 3:00 on at least 30/s, so the horde reaches the
// cap whatever the balance and the cap check is never vacuous.
const STRESS = TIMELINE.map((r) => (r.t >= 180 ? { ...r, rate: Math.max(r.rate, 30) } : r));

test('soak: 5 minutes circling the tower; the cap holds and the golem ends the run', () => {
  const g = new Game({ seed: 7, timeline: STRESS });
  // Every spawner step: whenever it spawned, the count is at most the cap.
  let overCap = 0, spawnsAtCap = 0, peak = 0;
  const step = g.stepSpawner.bind(g);
  g.stepSpawner = () => {
    const before = g.spawner.spawned;
    const n0 = g.enemies.length;
    step();
    if (g.spawner.spawned > before && g.enemies.length > MAX_ENEMIES) overCap++;
    if (n0 >= MAX_ENEMIES && g.spawner.spawned > before) spawnsAtCap++;
    peak = Math.max(peak, g.enemies.length);
  };
  let golemAt = null;
  const limit = 12 * 60 * 60;
  for (let i = 0; i < limit && g.phase === 'play'; i++) {
    // Test only: the tower is held at full HP until the golem arrives, so the run lasts
    // the full 5 minutes whatever the balance; from then on it is left to fall.
    if (golemAt === null) {
      if (g.spawner.golem) golemAt = g.t;
      else g.tower.hp = g.tower.maxHp;
    }
    g.tick(circler(g));
  }
  assert.equal(overCap, 0, 'the spawner never spawns above the cap');
  assert.equal(spawnsAtCap, 0);
  assert.ok(peak >= MAX_ENEMIES, `the horde reached the cap: peak ${peak}`);
  assert.ok(Math.abs(golemAt - 300) < 0.02, `golem at ${golemAt}`);
  assert.notEqual(g.phase, 'play', 'the tower fell');
  assert.ok(g.t > golemAt, `fell at ${g.t}`);
  // The golem, not the horde alone, ends it: the tower falls soon after it arrives (it
  // walks faster than the tower follows and deals 40 DPS).
  assert.ok(g.t - golemAt < 15, `fell ${(g.t - golemAt).toFixed(1)} s after the golem`);
  assert.ok(g.level > 1 && g.kills > 100, `level ${g.level}, kills ${g.kills}`);
  console.log(`# soak: peak ${peak} enemies, fell at ${g.t.toFixed(1)} s, level ${g.level}, kills ${g.kills}`);
});
