// Pins for the T-015 review (reports/reviews/2026-11-06-T-015-review.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { spawnOrb } from '../src/sim/enemyShots.js';
import { DT, MAGE_ORB_RANGE, MAGE_ORB_SPEED } from '../src/sim/content.js';
import { ANIMS } from '../src/sim/anims.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = () => { const g = new Game({ seed: 1, timeline: QUIET }); g.weapons = []; return g; };
const firstShotTick = (g, max = 400) => { for (let i = 1; i <= max; i++) { g.tick({}); if (g.enemyShots.length) return i; } return -1; };

test('orbs: out of range the timer holds, so the spawn offset still staggers mages walking into range', () => {
  // Two mages walk toward the dragon side by side from just outside range; offsets 30 and 120 ticks.
  const g = still();
  const a = createEnemy(g, 'mage', MAGE_ORB_RANGE + 30, -5);
  const b = createEnemy(g, 'mage', MAGE_ORB_RANGE + 30, 5);
  a.orbTimer = 30; b.orbTimer = 120;
  const fired = new Map();
  for (let i = 1; i <= 600 && fired.size < 2; i++) {
    g.tick({});
    for (const o of g.enemyShots) {
      const who = Math.abs(o.y - a.y) < Math.abs(o.y - b.y) ? 'a' : 'b';
      if (!fired.has(who)) fired.set(who, i);
    }
  }
  assert.equal(fired.size, 2);
  assert.equal(fired.get('b') - fired.get('a'), 90, 'the offsets survive the walk into range');
});

test('orbs: in range the timer keeps counting during a cast', () => {
  const g = still();
  const m = createEnemy(g, 'mage', 0, -200); // in range of the dragon, far enough from the tower to cast
  m.castTimer = 479; // the 60-tick cast starts on the first tick
  m.orbTimer = 30; // runs out mid-cast
  assert.equal(firstShotTick(g), 61, 'fires on the first tick after the cast');
});

test('orbs: frozen while the tower is dying and while level-up offers are open', () => {
  for (const freeze of ['dying', 'offers']) {
    const g = still();
    const o = spawnOrb(g, 200, 0, -1, 0);
    if (freeze === 'dying') { g.tower.hp = 0; g.tick({}); assert.equal(g.phase, 'dying'); }
    else { g.pendingLevelUps = 1; g.offers = [{ kind: 'repair', id: 'repair', level: 1 }]; }
    const x = o.x, hp = g.tower.hp;
    for (let i = 0; i < 30; i++) g.tick({});
    assert.equal(o.x, x, `${freeze}: the orb does not move`);
    assert.equal(g.tower.hp, hp, `${freeze}: no orb damage`);
  }
});

test('orbs: a mage standing on the dragon fires along (0, 1), never NaN', () => {
  const g = still();
  const m = createEnemy(g, 'mage', g.dragon.x, g.dragon.y);
  m.orbTimer = 0;
  g.stepEnemies();
  const [o] = g.enemyShots;
  assert.ok(o, 'it fired');
  assert.deepEqual([o.dx, o.dy], [0, 1]);
});

test('orbs: the orb animation loops while it flies', () => {
  const g = still();
  const o = spawnOrb(g, 300, 300, 1, 0); // flies away from the dragon
  const frames = new Set();
  const total = ANIMS['orb.green'].ticks.reduce((s, t) => s + t, 0);
  for (let i = 0; i < total + 5; i++) { g.tick({}); frames.add(o.frame); }
  assert.equal(frames.size, ANIMS['orb.green'].ticks.length, 'every frame shows');
  assert.ok(o.travelled < 400 && MAGE_ORB_SPEED * DT * (total + 5) < 400, 'still in flight');
});
