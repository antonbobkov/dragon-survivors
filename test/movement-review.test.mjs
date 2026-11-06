// Pins for the T-013/T-014 review (reports/reviews/2026-11-06-T-013-T-014-review.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { FACING_DEADZONE } from '../src/sim/content.js';

const quiet = [{ t: 0, rate: 0, weights: { knight: 100 } }];

test('dragon facing: stick noise around straight up never flips the dragon', () => {
  const g = new Game({ seed: 1, timeline: quiet });
  g.tick({ moveX: -1, moveY: 0 }); // face left
  assert.equal(g.dragon.flip, true);
  const flips = [];
  for (let i = 0; i < 20; i++) {
    const jitter = (i % 2 ? 1 : -1) * FACING_DEADZONE * 0.5;
    g.tick({ moveX: jitter, moveY: -Math.sqrt(1 - jitter * jitter) });
    flips.push(g.dragon.flip);
  }
  assert.ok(flips.every((f) => f === true), `flips: ${flips.join(',')}`);
});

test('dragon facing: standing still, turning the aim to the left faces left on that same tick', () => {
  const g = new Game({ seed: 1, timeline: quiet });
  g.tick({ hasAim: true, aimX: 1, aimY: 0 });
  assert.equal(g.dragon.flip, false);
  g.tick({ hasAim: true, aimX: -1, aimY: 0 });
  assert.equal(g.dragon.flip, true);
});
