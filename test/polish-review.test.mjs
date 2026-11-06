// Pins for the test gaps found by the T-006 review (reports/reviews/2026-11-06-T-006-review.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { TETHER_LENGTH } from '../src/sim/content.js';
import { towerMoving } from '../src/render/draw.js';
import { Accumulator, STEP_MS, MAX_TICKS_PER_FRAME } from '../src/loop.js';

test('minion carriers: on the tether the tower moves whether the dragon pulls away or stands', () => {
  const g = new Game({ seed: 1, timeline: [{ t: 0, rate: 0, weights: { knight: 100 } }] });
  g.weapons = [];
  g.tower.x = 0; g.tower.y = 0;
  g.dragon.x = TETHER_LENGTH; g.dragon.y = 0; // exactly on the tether
  g.tick({ moveX: 0.5 });
  assert.equal(towerMoving(g), true, 'pulling away (half stick): moving');
  g.dragon.x = g.tower.x + TETHER_LENGTH; g.dragon.y = g.tower.y;
  g.tick({});
  assert.equal(towerMoving(g), true, 'standing on the tether: the tower still follows');
  g.dragon.x = g.tower.x + 10; g.dragon.y = g.tower.y; // inside the rest distance
  g.tick({});
  assert.equal(towerMoving(g), false, 'at rest: not moving');
});

test('loop: below 1x the per-frame tick cap stays at MAX_TICKS_PER_FRAME', () => {
  const a = new Accumulator();
  a.speed = 0.25;
  a.advance(0);
  const owed = Math.floor((1000 * 0.25) / STEP_MS);
  assert.ok(owed > MAX_TICKS_PER_FRAME);
  assert.equal(a.advance(1000), MAX_TICKS_PER_FRAME, 'a 1 s stall at 0.25x runs the full cap');
});
