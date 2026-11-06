// Pins for faults found by the T-002 review (reports/reviews/2026-11-06-T-002-review.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';

test('aim taken from a partial move vector is a unit vector', () => {
  const g = new Game({ seed: 1 });
  g.tick({ moveX: 0.3, moveY: 0 });
  assert.ok(Math.abs(Math.hypot(g.dragon.aimX, g.dragon.aimY) - 1) < 1e-9);
  assert.equal(g.dragon.aimX, 1);
});
