// Pins for the T-026 review (reports/reviews/2026-11-26-T-026-review.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { collideTower } from '../src/sim/tower.js';
import { golemPoiseNeeded } from '../src/sim/golem.js';
import { poiseBar } from '../src/render/debug.js';
import { DT, ENEMIES, GOLEM_POISE, GOLEM_POISE_GROWTH, TOWER_RADIUS } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = () => { const g = new Game({ seed: 1, timeline: QUIET }); g.weapons = []; return g; };

test('golem shove comes after every enemy contact damage of the tick', () => {
  for (const order of ['golem first', 'knight first']) {
    const g = still();
    const t = g.tower;
    const mk = (type, x, y) => createEnemy(g, type, x, y);
    // The golem touches the tower from the left; the knight just touches it from the left too,
    // so a shove (to the right, 30 px) applied before the knight's turn would lose its damage.
    const golemX = t.x - (ENEMIES.golem.r + TOWER_RADIUS - 5);
    const knightX = t.x - (ENEMIES.knight.r + TOWER_RADIUS - 2);
    if (order === 'golem first') { mk('golem', golemX, t.y); mk('knight', knightX, t.y + 1); }
    else { mk('knight', knightX, t.y + 1); mk('golem', golemX, t.y); }
    g.grid.rebuild ? g.grid.rebuild(g.enemies) : g.stepEnemies();
    const hp = t.hp;
    collideTower(g);
    const want = (ENEMIES.golem.dps + ENEMIES.knight.dps) * DT;
    assert.ok(Math.abs((hp - t.hp) - want) < 1e-9, `${order}: damage ${hp - t.hp} vs ${want}`);
  }
});

test('golem: the debug poise bar fills against the grown threshold', () => {
  const g = still();
  const e = createEnemy(g, 'golem', 300, 0);
  e.staggers = 2;
  e.poise = GOLEM_POISE;
  assert.ok(Math.abs(poiseBar(e, 0, 0).frac - GOLEM_POISE / (GOLEM_POISE * GOLEM_POISE_GROWTH ** 2)) < 1e-9);
});

test('golem: the threshold keeps growing (no cap)', () => {
  const g = still();
  const e = createEnemy(g, 'golem', 300, 0);
  e.staggers = 7;
  assert.equal(golemPoiseNeeded(e), GOLEM_POISE * GOLEM_POISE_GROWTH ** 7);
});

test('golem: no footstep shakes while it staggers; the shove timer keeps counting', () => {
  const g = still();
  const e = createEnemy(g, "golem", g.dragon.x + 150, g.dragon.y - 300); // within the footstep range of the dragon, clear of the tower
  e.frame = 3; e.frameTicks = 0; // a footstep frame
  e.stagger = 48;
  e.shoveTimer = 60;
  let steps = 0;
  for (let i = 0; i < 48; i++) {
    g.tick({});
    steps += g.events.filter((ev) => ev.type === 'shake' && ev.kind === 'step').length;
  }
  assert.equal(steps, 0, 'no footsteps during the stagger');
  for (let i = 0; i < 12; i++) g.tick({});
  assert.equal(e.shoveTimer, 0, 'the shove timer counted on every golem step');
});
