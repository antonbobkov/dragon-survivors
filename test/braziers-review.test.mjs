// Pins for the T-027 review (reports/reviews/2026-11-26-T-027-review.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { stepBraziers, collidePickups, bomb } from '../src/sim/braziers.js';
import { bombFlashAlpha } from '../src/render/draw.js';
import { DESPAWN_DIST } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = () => { const g = new Game({ seed: 1, timeline: QUIET }); g.weapons = []; return g; };
const pickup = (g, kind, x, y, life) => {
  const p = { id: g.nextId++, kind, x, y, life, anim: `pickup.${kind}`, frame: 0, frameTicks: 0 };
  g.pickups.push(p);
  return p;
};

test('bomb flash: hidden while the tower is dying or over and while level-up offers are open', () => {
  const g = still();
  g.lastBomb = g.tickCount - 1;
  assert.ok(bombFlashAlpha(g) > 0, 'shown in play');
  g.offers = [{ kind: 'repair', id: 'repair', level: 1 }];
  assert.equal(bombFlashAlpha(g), 0, 'offers open');
  g.offers = [];
  for (const phase of ['dying', 'over']) { g.phase = phase; assert.equal(bombFlashAlpha(g), 0, phase); }
});

test('braziers draw after the spawner in step 4 (documented draw order)', () => {
  const g = new Game({ seed: 1, timeline: [{ t: 0, rate: 60, weights: { knight: 100 } }] });
  g.weapons = [];
  g.brazierTimer = 1; // the brazier attempt is due on this tick
  let n = 0;
  g.rng = () => (++n) / 1000; // 0.001, 0.002, ...: the k-th draw returns k / 1000
  g.tick({});
  const [e] = g.enemies;
  assert.ok(e, 'one enemy spawned');
  const a = Math.atan2(e.y - g.dragon.y, e.x - g.dragon.x);
  const draw = ((a / (2 * Math.PI)) + 1) % 1;
  assert.ok(Math.abs(draw - 0.002) < 3e-4, `the spawn angle is the spawner's 2nd draw (got ${draw})`);
});

test('pickups: the anim advances while they lie; one touched on its last tick is collected', () => {
  const g = still();
  const far = pickup(g, 'bomb', 400, 400, 1000);
  for (let i = 0; i < 9; i++) collidePickups(g);
  assert.notEqual(far.frame, 0, 'the bomb fuse flickers');
  const hp0 = (g.tower.hp = 50);
  pickup(g, 'heart', g.dragon.x, g.dragon.y, 1);
  collidePickups(g);
  assert.ok(g.tower.hp > hp0, 'collected on its last tick');
});

test('bomb: no knockback', () => {
  const g = still();
  const k = createEnemy(g, "knight", g.dragon.x + 100, g.dragon.y);
  k.hp = 1000; // survives the bomb
  const x = k.x, y = k.y;
  bomb(g);
  assert.ok(k.hp > 0);
  assert.deepEqual([k.x, k.y], [x, y]);
});

test('braziers: one exactly DESPAWN_DIST from the tower is kept; farther is dropped', () => {
  const g = still();
  const t = g.tower;
  g.braziers.push({ id: g.nextId++, x: t.x + DESPAWN_DIST, y: t.y, anim: 'brazier.burn', frame: 0, frameTicks: 0 });
  g.braziers.push({ id: g.nextId++, x: t.x - DESPAWN_DIST - 1, y: t.y, anim: 'brazier.burn', frame: 0, frameTicks: 0 });
  stepBraziers(g);
  assert.equal(g.braziers.length, 1);
  assert.equal(g.braziers[0].x, t.x + DESPAWN_DIST);
});
