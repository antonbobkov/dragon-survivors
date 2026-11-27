// Claws: rules the first claws tests left unpinned (found by mutation in the T-022 review).
// Sides fixed at the volley, strike from the centre at strike time, dead enemies, Force on the left
// claw, the Amount repeat ticks, the step-8 order, frozen delays, and the evolution's conditions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { buffMods, createWeapon } from '../src/sim/weapons.js';
import { spawnProjectile } from '../src/sim/projectiles.js';
import { clawVolley, slashTargets } from '../src/sim/claws.js';
import { cardPool } from '../src/sim/levelup.js';
import { DT, ENEMIES, WEAPONS } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const armed = (id, level = 1, buffs = []) => {
  const g = new Game({ seed: 1, timeline: QUIET });
  g.weapons = [createWeapon(id, level)];
  g.buffs = buffs;
  return g;
};
const dummy = (g, type, x, y, hp = 1000) => { const e = createEnemy(g, type, x, y); e.hp = hp; return e; };
const tick = (g, intent = {}) => g.tick({ moveX: 0, moveY: 0, ...intent });
const lost = (e, hp = 1000) => hp - e.hp;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
// Queues one volley of the game's first weapon by hand, without running a tick.
const volley = (g) => {
  const w = g.weapons[0];
  const L = WEAPONS[w.id].levels[w.level - 1];
  clawVolley(g, w, L, buffMods(g), L.damage);
  return g.slashes;
};

// ---- the other side's slash: side fixed at the volley, centre read at the strike ----------

test('left claw L3: the delayed slash keeps the side it was queued with, whichever way the dragon turns', () => {
  const sideDelay = Math.round(WEAPONS.leftClaw.sideDelay / DT);
  for (const queuedFacing of [1, -1]) {
    const g = armed('leftClaw', 3);
    tick(g, { moveX: queuedFacing }); // the volley is queued facing `queuedFacing`
    assert.equal(g.dragon.flip, queuedFacing < 0);
    assert.deepEqual(g.slashes.map((s) => s.side), [queuedFacing, -queuedFacing]);
    // turn the other way and keep walking until the tick before the strike
    for (let i = 1; i < sideDelay; i++) tick(g, { moveX: -queuedFacing });
    assert.equal(g.dragon.flip, queuedFacing > 0, 'the dragon now faces the other way');
    const d = g.dragon;
    const queuedSide = dummy(g, 'knight', d.x - queuedFacing * 60, d.y, 1000); // the delayed slash's side
    const firstSide = dummy(g, 'knight', d.x + queuedFacing * 60, d.y, 1000); // the side the first slash struck at once
    tick(g, { moveX: -queuedFacing });
    assert.equal(g.slashes[1].struck, true);
    assert.equal(g.slashes[1].side, -queuedFacing, 'side unchanged');
    assert.ok(lost(queuedSide) > 0, `queued side ${-queuedFacing} is slashed`);
    assert.equal(firstSide.hp, 1000, 'the first slash\'s side is not slashed again');
  }
});

test('left claw L3: a slash strikes from the dragon\'s centre when it strikes, not where it stood when queued', () => {
  // Amount L3 stretches the last slash (the left side, queued facing right) to the longest delay
  const g = armed('leftClaw', 3, [{ id: 'amount', level: 3 }]);
  tick(g, { moveX: 1 }); // volley queued facing right at x0
  const x0 = g.dragon.x;
  const last = g.slashes[g.slashes.length - 1];
  assert.equal(last.side, -1);
  const wait = last.delay;
  for (let i = 1; i < wait; i++) tick(g, { moveX: 1 });
  const d = g.dragon;
  assert.ok(d.x - x0 > 25, `the dragon walked on (${d.x - x0} px), enough to tell the two centres apart`);
  // the delayed slash covers x1 - 110..x1; the enemy is inside it only from the new centre
  const e = dummy(g, 'knight', d.x - 5, d.y);
  const queuedRectEnd = x0 + ENEMIES.knight.r;
  assert.ok(e.x > queuedRectEnd, 'outside the rectangle struck from the queue-time position');
  tick(g, { moveX: 1 });
  const s = last;
  assert.equal(s.struck, true);
  assert.deepEqual([s.x, s.y], [d.x, d.y], 'the slash records the strike-time centre');
  assert.ok(lost(e) > 0, 'hit from the strike-time centre');
});

// ---- dead enemies --------------------------------------------------------------------------

test('slash targets: dead enemies still in the grid are skipped by rectangles and do not use up a cone target', () => {
  const g = armed('leftClaw');
  const dead = dummy(g, 'knight', 40, 0, 0), alive = dummy(g, 'knight', 80, 0);
  let [s] = volley(g);
  g.grid.build(g.enemies);
  assert.deepEqual(slashTargets(g, s, 0, 0).map((e) => e.id), [alive.id], 'rectangle');
  // the cone: one target; the nearer one is dead, so the further live one is the target
  const h = armed('rightClaw'); // maxTargets 1
  const dead2 = dummy(h, 'knight', 30, 0, 0), alive2 = dummy(h, 'knight', 60, 0);
  h.dragon.aimX = 1; h.dragon.aimY = 0;
  [s] = volley(h);
  h.grid.build(h.enemies);
  assert.deepEqual(slashTargets(h, s, 0, 0).map((e) => e.id), [alive2.id], 'cone');
  assert.ok(dead2.hp === 0 && dead.hp === 0);
});

// ---- Force on the left claw ----------------------------------------------------------------

test('left claw: Force scales its knockback', () => {
  const knockOf = (buffs) => {
    const g = armed('leftClaw', 1, buffs);
    const e = dummy(g, 'knight', 60, 0);
    let before = null;
    const step = g.stepCollisions.bind(g);
    g.stepCollisions = () => { before = { x: e.x, y: e.y }; step(); };
    tick(g);
    return Math.hypot(e.x - before.x, e.y - before.y);
  };
  const plain = knockOf([]);
  assert.ok(near(plain, WEAPONS.leftClaw.knock / ENEMIES.knight.mass), `knock ${plain}`);
  const forced = knockOf([{ id: 'force', level: 2 }]);
  const mods = buffMods({ buffs: [{ id: 'force', level: 2 }] });
  assert.ok(mods.force > 1);
  assert.ok(near(forced, (WEAPONS.leftClaw.knock * mods.force) / ENEMIES.knight.mass), `forced knock ${forced}`);
});

// ---- Amount repeats ------------------------------------------------------------------------

test('left claw L3 with Amount: each side repeats every repeatDelay; the other side starts sideDelay later, repeats included', () => {
  const g = armed('leftClaw', 3, [{ id: 'amount', level: 2 }]);
  const amount = buffMods(g).amount;
  assert.ok(amount >= 2, 'at least two repeats, so the repeat spacing shows');
  const rep = Math.round(WEAPONS.leftClaw.repeatDelay / DT), side = Math.round(WEAPONS.leftClaw.sideDelay / DT);
  const first = [], other = [];
  for (let j = 0; j <= amount; j++) { first.push(j * rep); other.push(side + j * rep); }
  assert.ok(new Set([...first, ...other]).size === first.length + other.length, 'the expected delays are all different');
  tick(g);
  assert.deepEqual(g.slashes.map((s) => [s.side, s.delay]), [
    ...first.map((d) => [1, d]), ...other.map((d) => [-1, d]),
  ]);
});

// ---- step 8 order --------------------------------------------------------------------------

test('step 8: the ring hits before the claw slashes, projectiles before both (a kill by the earlier hitter spares the slash)', () => {
  // A one-hit enemy inside the slash's rectangle (x 0..110) is also under a ring ball.
  const ring = (g) => {
    const w = createWeapon('ring', 1);
    w.balls = [{ x: 60, y: 0 }];
    return w;
  };
  const g = armed('leftClaw');
  g.weapons.push(ring(g));
  const e = dummy(g, 'skeleton', 60, 0, 1);
  const [s] = volley(g);
  g.stepCollisions();
  assert.equal(e.hp <= 0, true);
  assert.deepEqual(s.hits, [], 'the ring killed it first, so the slash hit nothing');

  const h = armed('leftClaw');
  const f = dummy(h, 'skeleton', 60, 0, 1);
  spawnProjectile(h, { kind: 'fireball', x: 60, y: 0, dx: 1, dy: 0, speed: 0, range: 400, r: 6, damage: 5, anim: 'fireball.anim' });
  const [t] = volley(h);
  h.stepCollisions();
  assert.equal(f.hp <= 0, true);
  assert.deepEqual(t.hits, [], 'the projectile killed it first');
});

// ---- delays hold while the world is frozen ------------------------------------------------

test('pending slashes: delays hold while offers are open, and never strike while the dragon is dying', () => {
  const g = armed('leftClaw', 3);
  const l = dummy(g, 'knight', -60, 0);
  tick(g);
  const delayed = g.slashes[1];
  const delay = delayed.delay;
  assert.ok(delay > 0);
  g.offers = [{ kind: 'repair', id: 'repair', level: 1 }];
  for (let i = 0; i < 3 * delay; i++) g.tick({});
  assert.equal(delayed.delay, delay, 'offers open: the delay does not count down');
  assert.equal(delayed.struck, false);
  assert.equal(l.hp, 1000);
  g.offers = [];
  tick(g);
  assert.equal(delayed.delay, delay - 1, 'the count resumes');

  const h = armed('leftClaw', 3);
  const m = dummy(h, 'knight', -60, 0);
  tick(h);
  const pending = h.slashes[1];
  h.phase = 'dying';
  h.dyingTicks = 0;
  for (let i = 0; i < 400 && h.phase === 'dying'; i++) h.tick({});
  assert.equal(h.phase, 'over');
  assert.equal(pending.struck, false, 'a pending slash never strikes while dying');
  assert.equal(pending.delay, delay, 'and does not count down');
  assert.equal(m.hp, 1000);
});

// ---- evolution -----------------------------------------------------------------------------

test('evolution: a debug grant of the dual claw evolves the claws at any level', () => {
  const g = new Game({ seed: 1, debug: true, timeline: QUIET });
  g.weapons = [createWeapon('leftClaw', 1), createWeapon('rightClaw', 2)];
  g.tick({ debug: { grant: 'dualClaw' } });
  assert.deepEqual(g.weapons.map((w) => `${w.id}:${w.level}`), ['dualClaw:1']);
});

test('evolution: the card is not offered when the result is already owned', () => {
  const g = armed('leftClaw', 5);
  g.weapons = [createWeapon('leftClaw', 5), createWeapon('rightClaw', 5)];
  assert.ok(cardPool(g).some((p) => p.card.kind === 'evolve'), 'offered while not owned');
  g.weapons.push(createWeapon('dualClaw', 1)); // reachable by a debug grant
  assert.ok(!cardPool(g).some((p) => p.card.kind === 'evolve'), 'not offered once owned');
});
