// Movement feel (§6, §7): the following tower and its tether, the walking dragon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createRenderer } from '../src/render/draw.js';
import { ANIMS } from '../src/sim/anims.js';
import {
  DT, DRAGON_SPEED, TETHER_LENGTH, TOWER_FOLLOW_SPEED, TOWER_REST_DIST, DRAGON_ANIM, ENEMIES, ATLAS_NAMES,
} from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = () => { const g = new Game({ seed: 1, timeline: QUIET }); g.weapons = []; return g; };
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(intent); };
const dist = (g) => Math.hypot(g.dragon.x - g.tower.x, g.dragon.y - g.tower.y);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---- the owner's numbers -------------------------------------------------------------

test('speeds: dragon 87, tether 105, every enemy at half its former speed', () => {
  assert.equal(DRAGON_SPEED, 87);
  assert.equal(TETHER_LENGTH, 105);
  const half = { knight: 27.5, skeleton: 45, slime: 35, mage: 20, ghostKnight: 27.5, ghost: 36, golem: 75 };
  for (const [type, v] of Object.entries(half)) assert.equal(ENEMIES[type].speed, v, type);
  assert.ok(TOWER_FOLLOW_SPEED < DRAGON_SPEED, 'the tower lags the dragon');
  assert.ok(TOWER_REST_DIST < TETHER_LENGTH);
});

// ---- following tower (§7.1) ------------------------------------------------------------

test('tower: inside the tether it walks toward the dragon at the follow speed and stops at the rest distance', () => {
  const g = still();
  g.tower.x = 0; g.tower.y = 0;
  g.dragon.x = 80; g.dragon.y = 0; // inside the tether, beyond the rest distance
  g.tick({});
  assert.ok(near(g.tower.x, TOWER_FOLLOW_SPEED * DT) && g.tower.y === 0, `${g.tower.x}`);
  assert.equal(g.tower.moved, true);
  const ticks = Math.ceil((80 - TOWER_REST_DIST) / (TOWER_FOLLOW_SPEED * DT));
  run(g, ticks - 1);
  assert.ok(near(dist(g), TOWER_REST_DIST), `never closer than the rest distance: ${dist(g)}`);
  assert.equal(g.tower.moved, true, 'the step that arrives counts as moving');
  g.tick({});
  assert.equal(g.tower.moved, false, 'at rest');
  const at = [g.tower.x, g.tower.y];
  run(g, 120);
  assert.deepEqual([g.tower.x, g.tower.y], at, 'a resting tower does not creep');
  assert.equal(g.tower.moved, false);
});

test('tower: a last step shorter than the follow step lands exactly on the rest distance', () => {
  const g = still();
  g.tower.x = 0; g.tower.y = 0;
  g.dragon.x = 0; g.dragon.y = TOWER_REST_DIST + 0.25;
  g.tick({});
  assert.deepEqual([g.tower.x, g.tower.y], [0, 0.25]);
  assert.equal(g.tower.moved, true);
});

test('tower: closer than the rest distance it stands still', () => {
  const g = still();
  g.tower.x = 0; g.tower.y = 0;
  g.dragon.x = 10; g.dragon.y = -10;
  g.tick({});
  assert.deepEqual([g.tower.x, g.tower.y], [0, 0]);
  assert.equal(g.tower.moved, false);
});

test('tower: walking away opens the gap at dragon minus follow speed, then the tether drags it at exactly TETHER_LENGTH', () => {
  const g = still();
  const gap0 = dist(g);
  assert.equal(gap0, TOWER_REST_DIST);
  // The dragon walks straight away from the tower (up): the gap grows by (87 − 60) × DT a tick.
  const open = Math.floor((TETHER_LENGTH - TOWER_REST_DIST) / ((DRAGON_SPEED - TOWER_FOLLOW_SPEED) * DT));
  run(g, open, { moveY: -1 });
  assert.ok(near(dist(g), TOWER_REST_DIST + open * (DRAGON_SPEED - TOWER_FOLLOW_SPEED) * DT, 1e-6), `${dist(g)}`);
  assert.ok(dist(g) < TETHER_LENGTH);
  for (let i = 0; i < 300; i++) {
    const ty = g.tower.y;
    g.tick({ moveY: -1 });
    assert.ok(dist(g) <= TETHER_LENGTH + 1e-9, `tick ${i}: ${dist(g)}`);
    if (i > 2) {
      assert.ok(near(dist(g), TETHER_LENGTH), `held on the tether: ${dist(g)}`);
      assert.ok(near(ty - g.tower.y, DRAGON_SPEED * DT, 1e-9), 'dragged at the dragon speed');
    }
    assert.equal(g.tower.moved, true);
  }
  assert.ok(near(g.tower.x, 0) && g.tower.y > g.dragon.y, 'it trails straight behind');
});

test('tower: a teleport-sized gap is clamped to TETHER_LENGTH in one tick', () => {
  const g = still();
  g.dragon.x = 500; g.dragon.y = 0;
  g.tick({});
  assert.ok(near(dist(g), TETHER_LENGTH));
  assert.equal(g.tower.moved, true);
});

test('tower: `moved` is run state in the snapshot and the digest', () => {
  const g = still();
  assert.equal(g.snapshot().tower.moved, false);
  const d0 = g.digest();
  g.tower.moved = true;
  assert.notEqual(g.digest(), d0);
});

// ---- walking dragon (§6.3) ---------------------------------------------------------------

test('dragon: walk sprite, 2 frames, faces right at the start', () => {
  const g = still();
  assert.equal(DRAGON_ANIM, 'dragon.walk');
  assert.deepEqual([g.dragon.anim, g.dragon.frame, g.dragon.frameTicks, g.dragon.flip], ['dragon.walk', 0, 0, false]);
  assert.equal(ANIMS['dragon.walk'].ticks.length, 2);
  assert.ok(ATLAS_NAMES.includes('dragon.walk') && !ATLAS_NAMES.includes('dragon.dir'));
  assert.equal('dirFrame' in g.dragon || 'bob' in g.dragon, false, 'no 16-direction frame, no bob');
});

test('dragon: facing follows the horizontal move, then the aim x, then the last facing', () => {
  const g = still();
  g.tick({ moveX: -1 });
  assert.equal(g.dragon.flip, true, 'walking left');
  g.tick({ moveX: 1, aimX: -1, aimY: 0, hasAim: true });
  assert.equal(g.dragon.flip, false, 'walking right while aiming left: the move wins');
  g.tick({ aimX: -1, aimY: 0.2, hasAim: true });
  assert.equal(g.dragon.flip, true, 'standing: faces the aim');
  g.tick({ moveY: 1, aimX: 0.6, aimY: 1, hasAim: true });
  assert.equal(g.dragon.flip, false, 'walking straight down: faces the aim');
  g.tick({ moveY: -1, aimX: 0, aimY: -1, hasAim: true });
  assert.equal(g.dragon.flip, false, 'straight up, aiming straight up: keeps the last facing');
  g.tick({ moveX: -0.5, moveY: -0.5 });
  assert.equal(g.dragon.flip, true, 'diagonal left');
  g.tick({ moveY: 1 });
  assert.equal(g.dragon.flip, true, 'aim still straight up: keeps facing left');

  const h = still(); // never aimed: the fire direction follows the move
  h.tick({ moveX: -1 });
  h.tick({});
  assert.equal(h.dragon.flip, true, 'stopped: the fire direction (last move) still points left');
});

test('dragon: the walk anim advances only while moving; standing still shows frame 0', () => {
  const g = still();
  const per = ANIMS['dragon.walk'].ticks;
  run(g, 30);
  assert.deepEqual([g.dragon.frame, g.dragon.frameTicks], [0, 0], 'still: frame 0');
  run(g, per[0], { moveX: 1 });
  assert.deepEqual([g.dragon.frame, g.dragon.frameTicks], [1, 0], 'advanced to frame 1');
  run(g, per[1], { moveX: 1 });
  assert.deepEqual([g.dragon.frame, g.dragon.frameTicks], [0, 0], 'loops');
  run(g, 2, { moveY: 0.3 });
  assert.deepEqual([g.dragon.frame, g.dragon.frameTicks], [0, 2], 'a half stick walks too');
  g.tick({});
  assert.deepEqual([g.dragon.frame, g.dragon.frameTicks], [0, 0], 'stopping resets to frame 0');
  run(g, per[0] + 1, { moveX: -1 });
  g.tick({ aimX: 1, aimY: 0, hasAim: true });
  assert.deepEqual([g.dragon.frame, g.dragon.frameTicks], [0, 0], 'turning on the spot does not animate');
});

// ---- rendering ---------------------------------------------------------------------------

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
const atlas = { image: {}, frames: atlasJson.frames, anims: atlasJson.anims };
function fakeCtx() {
  const calls = [];
  return new Proxy({}, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      return (...args) => { calls.push([k, ...args]); return {}; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const makeCanvas = (width, height) => { const ctx = fakeCtx(); return { width, height, getContext: () => ctx }; };

test('render: the dragon is the walk frame at its position, mirrored when facing left, no bob', () => {
  const r = createRenderer({ atlas, makeCanvas });
  const g = still();
  g.weapons = [];
  run(g, 7, { moveX: 1 }); // frame 1, facing right
  const f1 = atlas.frames[atlas.anims['dragon.walk'].frames[1]];
  const draws = (ctx) => ctx.calls.filter((c) => c[0] === 'drawImage' && c.length === 10 && c[2] === f1.x && c[3] === f1.y);
  const c = fakeCtx();
  r.drawWorld(c, g);
  const right = draws(c);
  assert.equal(right.length, 1);
  assert.deepEqual(right[0].slice(6), [480 - f1.w, 300 - f1.h, f1.w * 2, f1.h * 2], 'centred on the dragon at 2×');
  g.dragon.flip = true; // test only: same frame, facing left
  const c2 = fakeCtx();
  r.drawWorld(c2, g);
  assert.equal(draws(c2).length, 1);
  assert.ok(c2.calls.some((x) => x[0] === 'scale' && x[1] === -1 && x[2] === 1), 'mirrored');
});
