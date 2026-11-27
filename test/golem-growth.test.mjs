// The golem's stagger threshold grows with each stagger (§8.10), so no build holds it forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { createWeapon } from '../src/sim/weapons.js';
import { golemHit, golemPoiseNeeded, STAGGER_TICKS } from '../src/sim/golem.js';
import { GOLEM_POISE, GOLEM_POISE_GROWTH } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];

test('golem: each stagger multiplies the poise the next one needs', () => {
  const g = new Game({ seed: 1, timeline: QUIET });
  const e = createEnemy(g, 'golem', 300, 0);
  assert.equal(golemPoiseNeeded(e), GOLEM_POISE);
  golemHit(g, e, GOLEM_POISE);
  assert.equal(e.staggers, 1);
  assert.ok(e.stagger > 0);
  e.stagger = 0; // the stagger is over
  golemHit(g, e, GOLEM_POISE);
  assert.equal(e.staggers, 1, 'the base threshold no longer staggers it');
  golemHit(g, e, GOLEM_POISE * GOLEM_POISE_GROWTH - GOLEM_POISE);
  assert.equal(e.staggers, 2, 'the grown threshold does');
  assert.equal(golemPoiseNeeded(e), GOLEM_POISE * GOLEM_POISE_GROWTH ** 2);
});

test('golem: a full four-weapon build cannot hold it off; the tower falls', () => {
  const g = new Game({ seed: 1, timeline: QUIET });
  g.weapons = [['fireball', 5], ['laser', 5], ['ring', 5], ['miniTower', 5]].map(([id, l]) => createWeapon(id, l));
  g.buffs = [['might', 3], ['haste', 3], ['force', 3], ['amount', 3]].map(([id, level]) => ({ id, level }));
  const golem = createEnemy(g, 'golem', g.tower.x, g.tower.y + 500);
  for (let t = 0; t < 120 * 60 && g.phase === 'play'; t++) {
    const dx = golem.x - g.dragon.x, dy = golem.y - g.dragon.y, l = Math.hypot(dx, dy) || 1;
    g.tick({ hasAim: true, aimX: dx / l, aimY: dy / l });
    if (g.offers.length) { g.offers = []; g.pendingLevelUps = 0; }
  }
  assert.notEqual(g.phase, 'play', 'the tower fell within 120 s');
  assert.ok(golem.staggers >= 3, `it was staggered several times first (${golem.staggers})`);
  assert.ok(STAGGER_TICKS > 0);
});
