// Roster rules the T-004 review found unheld (§8.1, §8.2, §8.4): each test below fails on
// a specific one-line mutation of the sim code; the mutation is named in the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy, separate } from '../src/sim/enemies.js';
import { setAnim } from '../src/sim/effects.js';
import { spawnProjectile, resolveHit } from '../src/sim/projectiles.js';
import { MAX_ENEMIES, MAGE_NO_CAST_DIST, GOLEM_KNOCKBACK, TOWER_HP } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = (timeline = QUIET) => {
  const g = new Game({ seed: 1, timeline });
  g.weapons = [];
  return g;
};
const run = (g, n) => { for (let i = 0; i < n; i++) g.tick({}); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const ofType = (g, type) => g.enemies.filter((e) => e.type === type);
const shot = (g, x, y) => spawnProjectile(g, { kind: 'fireball', x, y, dx: 1, dy: 0, speed: 420, range: 420, r: 6, damage: 1, anim: 'fireball.anim' });
const separated = (g) => { g.grid.build(g.enemies); separate(g); };

// ---- ghost -----------------------------------------------------------------------

// Mutation: the burn -> ghost check in effects.js also accepts `ghost.die`.
test('ghost: its own death plays ghost.die and never raises another ghost', () => {
  const g = still();
  const gh = createEnemy(g, 'ghost', 0, 300);
  gh.hp = 0;
  g.tick({});
  assert.equal(g.kills, 1);
  assert.ok(g.effects.some((f) => f.anim === 'ghost.die'));
  run(g, 120); // far longer than the die anim
  assert.equal(g.effects.length, 0, 'the die effect finished');
  assert.equal(g.enemies.length, 0, 'nothing rose');
  assert.equal(ofType(g, 'ghost').length, 0);
});

// ---- cap -------------------------------------------------------------------------

// Mutation: the spawner subtracts 1 from its live count once the golem exists.
test('cap: the golem counts toward MAX_ENEMIES; the spawner stops at the cap with it present', () => {
  const g = still([{ t: 0, rate: 6000, weights: { knight: 100 }, golem: true }]); // 100 spawn attempts a tick
  g.tower.hp = 1e9;
  let sawGolem = false;
  for (let i = 0; i < 12; i++) {
    g.tick({});
    sawGolem ||= ofType(g, 'golem').length === 1;
    assert.ok(g.enemies.length <= MAX_ENEMIES, `tick ${i}: ${g.enemies.length} enemies`);
  }
  assert.ok(sawGolem);
  assert.equal(g.enemies.length, MAX_ENEMIES, 'the cap was reached, golem included');
  assert.equal(ofType(g, 'knight').length, MAX_ENEMIES - 1);
});

// ---- tower contact ---------------------------------------------------------------

// Mutation: tower contact skips enemies playing `skelly.summon`.
test('tower: a summoning skeleton standing on the tower damages it (6 DPS)', () => {
  const g = still();
  const s = createEnemy(g, 'skeleton', g.tower.x, g.tower.y);
  setAnim(s, 'skelly.summon');
  run(g, 10);
  assert.equal(s.anim, 'skelly.summon', 'still summoning');
  assert.ok(near(g.tower.hp, TOWER_HP - 6 * 10 / 60, 1e-9), `hp ${g.tower.hp}`);
});

// ---- projectile collision --------------------------------------------------------

// Mutation: projectile collision skips enemies playing `mage.spell`.
test('projectiles: a casting mage can be hit', () => {
  const g = still();
  const m = createEnemy(g, 'mage', 300, 0);
  setAnim(m, 'mage.spell');
  m.castTimer = 10;
  const p = shot(g, 300, 0);
  g.stepCollisions();
  assert.equal(m.hp, 3, 'took the hit');
  assert.deepEqual(p.hits, [m.id]);
});

// ---- separation ------------------------------------------------------------------

// Mutation: separation skips enemies playing `mage.spell` (as mover and as neighbour).
test('separation: a casting mage and a neighbour push apart, the first in list order by half the overlap, the second by half of what is left', () => {
  const g = still();
  const m = createEnemy(g, 'mage', 1000, 0);
  setAnim(m, 'mage.spell');
  const k = createEnemy(g, 'knight', 1010, 0); // radii 12 + 12, 10 apart: overlap 14
  separated(g);
  assert.ok(near(m.x, 993) && near(k.x, 1013.5), `${m.x}, ${k.x}`);
  // and the order in the list does not matter
  const h = still();
  const k2 = createEnemy(h, 'knight', 1010, 0);
  const m2 = createEnemy(h, 'mage', 1000, 0);
  setAnim(m2, 'mage.spell');
  separated(h);
  assert.ok(near(k2.x, 1017) && near(m2.x, 996.5), `${m2.x}, ${k2.x}`);
});

// Mutation: separation skips enemies playing `skelly.summon` (as mover and as neighbour).
test('separation: a summoning skeleton and a neighbour push apart, the first in list order by half the overlap, the second by half of what is left', () => {
  for (const summonerFirst of [true, false]) {
    const g = still();
    let s, k;
    if (summonerFirst) {
      s = createEnemy(g, 'skeleton', 1000, 0);
      k = createEnemy(g, 'knight', 1010, 0); // radii 10 + 12, 10 apart: overlap 12
    } else {
      k = createEnemy(g, 'knight', 1010, 0);
      s = createEnemy(g, 'skeleton', 1000, 0);
    }
    setAnim(s, 'skelly.summon');
    separated(g);
    // overlap 12: the first mover steps 6, the second then sees an overlap of 6 and steps 3
    const [ex, ek] = summonerFirst ? [994, 1013] : [1000 - 3, 1010 + 6];
    assert.ok(near(s.x, ex) && near(k.x, ek), `first=${summonerFirst}: ${s.x}, ${k.x}`);
  }
});

// ---- golem -----------------------------------------------------------------------

// Mutation: the golem knockback fallback for a coincident hit changes to (0, -1).
test('golem: a hit exactly at its centre knocks it 6 px along (0, 1)', () => {
  const g = still();
  const m = createEnemy(g, 'golem', 40, 400);
  const p = shot(g, 40, 400);
  resolveHit(g, p, m);
  assert.deepEqual([m.x, m.y], [40, 400 + GOLEM_KNOCKBACK]);
});

// ---- mage cast threshold ---------------------------------------------------------

// Mutation: the mage's skip test `< 80` becomes `<= 80`.
test('mage: exactly 80 px from the tower it still casts; 79.9 px it does not', () => {
  const g = still();
  const m = createEnemy(g, 'mage', g.tower.x, g.tower.y + MAGE_NO_CAST_DIST);
  m.castTimer = 479;
  g.tick({});
  assert.equal(m.anim, 'mage.spell', 'cast at exactly 80 px');

  const h = still();
  const n = createEnemy(h, 'mage', h.tower.x, h.tower.y + MAGE_NO_CAST_DIST - 0.1);
  n.castTimer = 479;
  h.tick({});
  assert.equal(n.anim, 'mage.walk', 'skipped just inside 80 px');
  assert.equal(n.castTimer, 0);
});
