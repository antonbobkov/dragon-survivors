// Roster specials (§8, §9, §13): skeleton, slime split, mage cast + summon, ghost knight
// burn -> ghost, mega golem at 5:00 with knockback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { setAnim, spawnEffect, animLength } from '../src/sim/effects.js';
import { spawnProjectile, resolveHit } from '../src/sim/projectiles.js';
import { createWeapon } from '../src/sim/weapons.js';
import {
  TIMELINE, MAX_ENEMIES, SPAWN_RING_RADIUS, DESPAWN_DIST, TOWER_RADIUS, GOLEM_HP, ENEMIES, TOWER_REST_DIST,
} from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
// No spawns, no weapons: only what a test places moves.
const still = (seed = 1, timeline = QUIET) => {
  const g = new Game({ seed, timeline });
  g.weapons = [];
  return g;
};
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(typeof intent === 'function' ? intent(i) : intent); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const ofType = (g, type) => g.enemies.filter((e) => e.type === type);
const kill = (g, e) => { e.hp = 0; g.stepDeaths(); };
const sounded = (g, name) => g.events.some((ev) => ev.type === 'sound' && ev.name === name);

// ---- skeleton ------------------------------------------------------------------

test('skeleton: no special; walks at its table speed and dies with the generic skelly.die', () => {
  const g = still();
  const s = createEnemy(g, 'skeleton', 0, 400);
  run(g, 60);
  assert.ok(near(s.y, 400 - ENEMIES.skeleton.speed), `y ${s.y}`);
  assert.equal(s.anim, 'skelly.walk');
  kill(g, s);
  assert.equal(g.kills, 1);
  assert.deepEqual(g.effects.map((f) => f.anim), ['skelly.die']);
});

// ---- slime -----------------------------------------------------------------------

test('slime split: a gen-0 slime yields two gen-1 slimes flanking its path; those yield none', () => {
  const g = still();
  const p = createEnemy(g, 'slime', 0, 300); // the tower is above: path points up
  p.flip = true;
  kill(g, p);
  assert.equal(g.kills, 1, 'the split counts as a kill');
  const kids = ofType(g, 'slime');
  assert.equal(kids.length, 2);
  // u = (0, -1): perpendicular (-uy, ux) = (1, 0)
  assert.deepEqual(kids.map((k) => [k.x, k.y, k.gen, k.hp, k.r, k.flip]), [
    [20, 300, 1, 1, 8, false],
    [-20, 300, 1, 1, 8, false],
  ]);
  assert.deepEqual(g.effects.map((f) => [f.anim, f.x, f.y, f.flip]), [['slime.split', 0, 300, true]]);
  for (const k of kids) kill(g, k);
  assert.equal(g.enemies.length, 0, 'gen-1 slimes do not split');
  assert.equal(g.kills, 3);
  assert.deepEqual(g.effects.map((f) => f.anim), ['slime.split', 'slime.die', 'slime.die']);
});

test('slime split: offsets are perpendicular to any direction; at the tower centre they use (0, 1)', () => {
  const g = still();
  const p = createEnemy(g, 'slime', g.tower.x + 30, g.tower.y + 40); // u = (-0.6, -0.8)
  kill(g, p);
  const [a, b] = ofType(g, 'slime');
  assert.ok(near(a.x, p.x + 16) && near(a.y, p.y - 12), `${a.x}, ${a.y}`);
  assert.ok(near(b.x, p.x - 16) && near(b.y, p.y + 12), `${b.x}, ${b.y}`);
  const h = still();
  const q = createEnemy(h, 'slime', h.tower.x, h.tower.y);
  kill(h, q);
  assert.deepEqual(ofType(h, 'slime').map((k) => [k.x - q.x, k.y - q.y]), [[-20, 0], [20, 0]]);
});

test('slime split: a fireball kill splits in play, and the children spawn even at the cap', () => {
  const g = still();
  g.weapons = [createWeapon('fireball', 1)];
  const p = createEnemy(g, 'slime', 0, 300);
  for (let i = 0; i < 120 && g.kills === 0; i++) g.tick({ aimX: 0, aimY: 1, hasAim: true });
  assert.equal(g.kills, 1);
  assert.deepEqual(ofType(g, 'slime').map((k) => k.gen), [1, 1]);
  assert.ok(p.hp <= 0);

  const h = still();
  for (let i = 0; i < MAX_ENEMIES - 1; i++) createEnemy(h, 'knight', 1000 + i * 30, 0);
  const s = createEnemy(h, 'slime', 0, 300);
  kill(h, s);
  assert.equal(h.enemies.length, MAX_ENEMIES + 1);
});

// ---- mage ------------------------------------------------------------------------

test('mage: casts 8 s after spawn, stands still 1 s, then summons 4 skeletons on a 40 px ring', () => {
  const g = still();
  const m = createEnemy(g, 'mage', 0, 1000);
  let castTick = -1, pos = null;
  for (let i = 1; i <= 480 && castTick < 0; i++) {
    g.tick({});
    if (m.anim === 'mage.spell') { castTick = i; pos = [m.x, m.y]; }
  }
  assert.equal(castTick, 480, 'the cast starts when the mage is 8 s old');
  assert.ok(near(m.y, 1000 - ENEMIES.mage.speed * 479 / 60), 'it walked until the cast');
  run(g, 58);
  assert.deepEqual([m.x, m.y], pos, 'no movement while casting');
  assert.equal(m.anim, 'mage.spell');
  assert.equal(ofType(g, 'skeleton').length, 0);
  g.tick({}); // tick 539: the 60th cast tick ends the cast
  assert.equal(m.anim, 'mage.walk');
  const sk = ofType(g, 'skeleton');
  assert.equal(sk.length, 4);
  // the tower is straight up: the ring sits at ±45° and ±135° from that direction
  const c = Math.round(40 * Math.SQRT1_2 * 1e6) / 1e6;
  assert.deepEqual(sk.map((s) => [s.x - m.x, s.y - m.y].map((v) => Math.round(v * 1e6) / 1e6)),
    [[c, -c], [c, c], [-c, c], [-c, -c]]);
  assert.ok(sk.every((s) => s.anim === 'skelly.summon' && s.frame === 0 && s.frameTicks === 0));
  assert.ok(!sounded(g, 'death02'), 'the summon is silent');
  g.tick({});
  assert.ok(m.y < pos[1], 'walks again after the cast');
  // next cast 8 s after the previous one started
  let next = -1;
  for (let i = 541; i <= 1000 && next < 0; i++) {
    g.tick({});
    if (m.anim === 'mage.spell') next = i;
  }
  assert.equal(next, 960);
});

test('mage: summoned skeletons stand still until skelly.summon ends, then walk; the mage walks between them', () => {
  const g = still();
  const m = createEnemy(g, 'mage', 0, 700);
  m.castTimer = 479; // cast on the first tick
  run(g, 60);
  const mx = m.x;
  const sk = ofType(g, 'skeleton');
  assert.equal(sk.length, 4);
  const start = sk.map((s) => [s.x, s.y]);
  const len = animLength('skelly.summon'); // 42 ticks
  run(g, len - 1);
  assert.deepEqual(sk.map((s) => [s.x, s.y]), start, 'still during the summon anim');
  assert.ok(sk.every((s) => s.anim === 'skelly.summon'));
  assert.ok(m.y < 700 - ENEMIES.mage.speed * 40 / 60 && near(m.x, mx), 'the mage walked on between the front two without pushing them');
  g.tick({}); // the anim ends: back to walk, still no step this tick
  assert.deepEqual(sk.map((s) => [s.x, s.y]), start);
  assert.ok(sk.every((s) => s.anim === 'skelly.walk' && s.frame === 0));
  g.tick({});
  assert.ok(sk.every((s, i) => s.x !== start[i][0] || s.y !== start[i][1]), 'walking');
});

test('mage: a summoning skeleton can be hit and killed', () => {
  const g = still();
  g.weapons = [createWeapon('fireball', 1)];
  const s = createEnemy(g, 'skeleton', 100, 0);
  setAnim(s, 'skelly.summon');
  let killedAt = -1;
  for (let i = 0; i < 42 && killedAt < 0; i++) {
    g.tick({ aimX: 1, aimY: 0, hasAim: true });
    if (g.kills === 1) killedAt = i;
  }
  assert.ok(killedAt > 0 && killedAt < 41, `killed at ${killedAt}`);
  assert.deepEqual([s.x, s.y], [100, 0]);
});

test('mage: within 80 px of the tower it never casts; a skipped cast restarts the 8 s timer', () => {
  const g = still();
  const m = createEnemy(g, 'mage', g.tower.x, g.tower.y + 70);
  for (let i = 0; i < 20 * 60; i++) {
    g.tick({});
    assert.notEqual(m.anim, 'mage.spell', `tick ${i}`);
  }
  assert.equal(ofType(g, 'skeleton').length, 0);

  const h = still();
  const n = createEnemy(h, 'mage', h.tower.x, h.tower.y + 79.9);
  run(h, 480); // the 8 s attempt is skipped (distance < 80 at that moment)
  assert.equal(n.castTimer, 0);
  assert.equal(n.anim, 'mage.walk');
  h.dragon.x = 500; h.tower.x = 500; // now far from the tower (the dragon too, so the tether holds)
  let cast = -1;
  for (let i = 481; i <= 1000 && cast < 0; i++) {
    h.tick({});
    if (n.anim === 'mage.spell') cast = i;
  }
  assert.equal(cast, 960);
});

test('mage: summons respect the cap; the surplus is not spawned', () => {
  const g = still();
  for (let i = 0; i < MAX_ENEMIES - 3; i++) createEnemy(g, 'knight', 1000 + (i % 20) * 30, Math.floor(i / 20) * 30);
  const m = createEnemy(g, 'mage', 0, 700);
  m.castTimer = 479;
  run(g, 60);
  assert.equal(ofType(g, 'skeleton').length, 2);
  assert.equal(g.enemies.length, MAX_ENEMIES);
});

// ---- ghost knight -> ghost --------------------------------------------------------

test('ghost: a ghost knight burns for 0.5 s (not collidable), then a ghost appears at its spot', () => {
  const g = still();
  const k = createEnemy(g, 'ghostKnight', 0, 300);
  k.flip = true;
  k.hp = 0;
  g.tick({}); // deaths step: kill + burn effect
  assert.equal(g.kills, 1);
  assert.equal(g.enemies.length, 0, 'the burn is an effect, not an enemy');
  const burn = g.effects.find((f) => f.anim === 'ghost.burn');
  assert.ok(burn && burn.flip === true && burn.x === k.x && burn.y === k.y);
  assert.ok(!g.effects.some((f) => f.anim === 'ghost.die'));
  run(g, animLength('ghost.burn') - 1); // 22 ticks: the anim has ended, its last frame holds
  assert.equal(burn.frame, 10);
  assert.ok(g.effects.includes(burn));
  run(g, 30 - animLength('ghost.burn') - 1); // 29 ticks since the death
  assert.equal(g.enemies.length, 0);
  g.tick({}); // 30 ticks = 0.5 s
  assert.ok(!g.effects.includes(burn), 'burn removed');
  const [gh] = g.enemies;
  assert.deepEqual([gh.type, gh.x, gh.y, gh.alpha, gh.hp, gh.r, gh.flip, gh.anim],
    ['ghost', k.x, k.y, 0.6, 2, 10, true, 'ghost.ghost']);
  kill(g, gh);
  assert.equal(g.kills, 2);
  const die = g.effects.find((f) => f.anim === 'ghost.die');
  assert.ok(die && die.alpha === 0.6);
  assert.equal(g.enemies.length, 0, 'a ghost dies normally');
});

test('ghost: projectiles pass through a burning ghost knight', () => {
  const g = still();
  spawnEffect(g, 'ghost.burn', 100, 0, { life: 30 });
  g.weapons = [createWeapon('fireball', 1)];
  run(g, 20, { aimX: 1, aimY: 0, hasAim: true });
  assert.equal(g.kills, 0);
  assert.ok(g.projectiles.some((p) => p.x > 110), 'the fireball flew past');
});

test('ghost: rises even when the cap is full; nothing rises once the tower has fallen', () => {
  const g = still();
  for (let i = 0; i < MAX_ENEMIES; i++) createEnemy(g, 'knight', 1000 + i * 30, 0);
  spawnEffect(g, 'ghost.burn', 0, 300, { life: 30 });
  for (let i = 0; i < 30; i++) g.stepEffects();
  assert.equal(g.enemies.length, MAX_ENEMIES + 1);
  assert.equal(g.enemies[MAX_ENEMIES].type, 'ghost');

  const h = still();
  const k = createEnemy(h, 'ghostKnight', 0, 300);
  k.hp = 0;
  h.tower.hp = 0;
  h.tick({});
  assert.equal(h.phase, 'dying');
  run(h, 60);
  assert.equal(h.enemies.length, 0);
});

// ---- golem ---------------------------------------------------------------------

test('timeline: the golem spawns once, on the first tick where t >= 300, beyond the tower, with ohno', () => {
  const g = new Game({ seed: 3 }); // the default timeline
  g.weapons = [];
  g.tickCount = 300 * 60 - 2;
  g.t = g.tickCount / 60;
  g.dragon.x = 100; g.dragon.y = -50;
  g.tower.x = 100 + 90; g.tower.y = -50 + 120; // 150 px away along (0.6, 0.8)
  g.tick({});
  assert.ok(g.t < 300);
  assert.equal(ofType(g, 'golem').length, 0);
  g.tick({});
  assert.equal(g.t, 300);
  const golems = ofType(g, 'golem');
  assert.equal(golems.length, 1);
  const [m] = golems;
  assert.ok(near(m.x, 100 + SPAWN_RING_RADIUS * 0.6) && near(m.y, -50 + SPAWN_RING_RADIUS * 0.8), `${m.x}, ${m.y}`);
  assert.ok(sounded(g, 'ohno'));
  assert.deepEqual([m.hp, m.unkillable, m.procImmune, m.r, m.anim], [GOLEM_HP, true, true, 56, 'golem.walk']);
  assert.equal(g.spawner.golem, true);
  run(g, 60);
  assert.equal(ofType(g, 'golem').length, 1, 'only once');
  assert.ok(TIMELINE.find((r) => r.golem).t === 300);
});

test('golem: spawn direction falls back to (0, 1); it ignores the cap; no golem row, no golem', () => {
  const g = still(1, [{ t: 0, rate: 0, weights: { knight: 100 } }, { t: 1, rate: 0, weights: { knight: 100 }, golem: true }]);
  for (let i = 0; i < MAX_ENEMIES; i++) createEnemy(g, 'knight', 3000 + i * 30, 0);
  g.tower.x = g.dragon.x; g.tower.y = g.dragon.y;
  run(g, 60);
  const [m] = ofType(g, 'golem');
  assert.ok(m, 'spawned with the cap full');
  assert.equal(m.x, g.dragon.x);
  assert.equal(m.y, g.dragon.y + SPAWN_RING_RADIUS, 'spawned straight below');

  const h = still();
  h.tickCount = 400 * 60; h.t = 400;
  h.tick({});
  assert.equal(ofType(h, 'golem').length, 0);
});

test('golem: a hit knocks it 6 px away from the projectile and does not lower its HP', () => {
  const g = still();
  const m = createEnemy(g, 'golem', 0, 400);
  const p = spawnProjectile(g, { kind: 'fireball', x: -30, y: 440, dx: 1, dy: 0, speed: 420, range: 420, r: 6, damage: 4, anim: 'fireball.anim' });
  resolveHit(g, p, m); // from (-30, 440): unit direction away is (0.6, -0.8)
  assert.ok(near(m.x, 3.6) && near(m.y, 400 - 4.8), `${m.x}, ${m.y}`);
  assert.equal(m.hp, GOLEM_HP);
  assert.ok(sounded(g, 'hit_golem'));
  m.hp = -100;
  g.stepDeaths();
  assert.ok(g.enemies.includes(m), 'cannot die');
  assert.equal(g.kills, 0);
});

test('golem: fireballs in play push it back; it is never despawned', () => {
  const g = still();
  g.weapons = [createWeapon('fireball', 1)];
  g.tower.x = 0; g.tower.y = -TOWER_REST_DIST; // behind the dragon, at rest so it stays put
  const m = createEnemy(g, 'golem', 0, 300);
  const aim = { aimX: 0, aimY: 1, hasAim: true };
  let hits = 0;
  const ticks = Math.round(180 / ENEMIES.golem.speed * 60); // 180 px of walking, short of the tower
  for (let i = 0; i < ticks; i++) {
    g.tick(aim);
    if (sounded(g, 'hit_golem')) hits++;
  }
  // it walks up 180 px; every hit from straight above pushes it 6 px down
  assert.ok(hits >= 1, `hits ${hits}`);
  assert.ok(near(m.y, 300 - 180 + 6 * hits, 1e-6), `y ${m.y} after ${hits} hits`);
  assert.ok(near(m.x, 0));
  assert.equal(m.hp, GOLEM_HP);

  const h = still();
  const far = createEnemy(h, 'golem', h.tower.x + DESPAWN_DIST + 500, h.tower.y);
  h.spawner.budget = 0;
  h.stepEnemies();
  assert.ok(h.enemies.includes(far));
  assert.equal(h.spawner.budget, 0);
});

test('golem: contact deals 40 DPS to the tower', () => {
  const g = still();
  createEnemy(g, 'golem', g.tower.x, g.tower.y + TOWER_RADIUS + 56 - 4);
  run(g, 60);
  assert.ok(Math.abs(g.tower.hp - 60) <= 40 / 60 + 1e-9, `hp ${g.tower.hp}`);
  assert.equal(ENEMIES.golem.dps, 40);
});

// ---- determinism with the whole roster -------------------------------------------

test('determinism: a mixed-roster run is identical for the same seed, and every special fires', () => {
  const ALL = [
    { t: 0, rate: 6, weights: { knight: 10, skeleton: 10, slime: 30, mage: 30, ghostKnight: 30 } },
    { t: 10, rate: 6, weights: { knight: 10, skeleton: 10, slime: 30, mage: 30, ghostKnight: 30 }, golem: true },
  ];
  const script = (i) => ({ moveX: Math.cos(i * 0.02), moveY: Math.sin(i * 0.02), aimX: Math.cos(i * 0.05), aimY: Math.sin(i * 0.05), hasAim: true, pick: 0 }); // pick: level-ups do not freeze the run
  const play = () => {
    const g = new Game({ seed: 77, timeline: ALL });
    g.tower.hp = 1e9;
    g.weapons = [createWeapon('fireball', 5)];
    const seen = new Set();
    for (let i = 0; i < 25 * 60; i++) {
      g.tick(script(i));
      for (const e of g.enemies) {
        if (e.type === 'slime' && e.gen === 1) seen.add('slimeChild');
        if (e.type === 'ghost') seen.add('ghost');
        if (e.type === 'golem') seen.add('golem');
        if (e.anim === 'skelly.summon') seen.add('summon');
      }
    }
    return { g, seen };
  };
  const a = play(), b = play();
  assert.equal(a.g.digest(), b.g.digest());
  assert.deepEqual([...a.seen].sort(), ['ghost', 'golem', 'slimeChild', 'summon']);
});
