// The mega golem (§8.10): poise and stagger, the tower shove, footsteps and the screen-shake
// events; the render-only screen shake (§5.1), the debug poise bar (§19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { App } from '../src/app.js';
import { STEP_MS } from '../src/loop.js';
import { createEnemy } from '../src/sim/enemies.js';
import { createWeapon } from '../src/sim/weapons.js';
import { resolveHit } from '../src/sim/projectiles.js';
import { dealDamage } from '../src/sim/damage.js';
import { collideTower } from '../src/sim/tower.js';
import { golemFootstep, staggerEase, STAGGER_TICKS, STAGGER_PUSH_TICKS, SHOVE_TICKS } from '../src/sim/golem.js';
import {
  DT, ENEMIES, TOWER_RADIUS, TETHER_LENGTH, GOLEM_HP, GOLEM_POISE, GOLEM_POISE_DECAY, GOLEM_STAGGER_DIST,
  GOLEM_SHOVE_DIST, GOLEM_STEP_RANGE, WEAPONS,
} from '../src/sim/content.js';
import { Shake, SHAKES, SHAKE_CAP, SHAKE_HZ } from '../src/render/shake.js';
import { createRenderer, worldOffset } from '../src/render/draw.js';
import { drawDebugWorld, poiseBar, POISE_BAR } from '../src/render/debug.js';
import { cameraOffset } from '../src/viewport.js';

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
const atlas = { image: { fake: 'image' }, frames: atlasJson.frames, anims: atlasJson.anims };
const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const GOLEM_NOW = [{ t: 0, rate: 0, weights: { knight: 100 }, golem: true }];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const still = (timeline = QUIET, seed = 1) => {
  const g = new Game({ seed, timeline });
  g.weapons = [];
  return g;
};
const shakes = (g) => g.events.filter((e) => e.type === 'shake').map((e) => e.kind);
const sounded = (g, name) => g.events.some((e) => e.type === 'sound' && e.name === name);
const ORIGIN = { x: 0, y: 0 };

// ---- poise ---------------------------------------------------------------------------

test('golem: starts with no poise; each hit adds its knock after Force, never moves it', () => {
  const g = still();
  const m = createEnemy(g, 'golem', 300, 400);
  assert.deepEqual([m.poise, m.poiseHit, m.stagger, m.staggerDx, m.staggerDy, m.shoveTimer], [0, false, 0, 0, 0, 0]);
  // a level-1 fireball with Force L2 carries knock 4 × 2
  g.buffs = [{ id: 'force', level: 2 }];
  g.weapons = [createWeapon('fireball', 1)];
  g.stepWeapons();
  const p = g.projectiles[0];
  assert.equal(p.knock, 8);
  resolveHit(g, p, m);
  assert.deepEqual([m.x, m.y, m.poise, m.poiseHit, m.hp], [300, 400, 8, true, GOLEM_HP]);
  assert.ok(sounded(g, 'hit_golem'));
  dealDamage(g, m, 5, 'physical', ORIGIN, 0);
  assert.equal(m.poise, 8, 'a hit without knock adds nothing');
  dealDamage(g, m, 5, 'physical', ORIGIN, 51);
  assert.equal(m.poise, 59);
  assert.equal(m.stagger, 0, 'one short of GOLEM_POISE: no stagger');
  dealDamage(g, m, 5, 'physical', ORIGIN, 1);
  assert.deepEqual([m.poise, m.poiseHit, m.stagger], [0, false, STAGGER_TICKS], 'exactly GOLEM_POISE staggers, poise reset');
  assert.equal(STAGGER_TICKS, 48);
});

test('golem: a bite with Force L3 (30 × 2.5) staggers it in one hit; without Force it takes two', () => {
  for (const [buffs, staggered] of [[[{ id: 'force', level: 3 }], true], [[], false]]) {
    const g = still();
    g.weapons = [createWeapon('bite', 1)];
    g.buffs = buffs;
    const m = createEnemy(g, 'golem', 40, 0);
    g.tick({});
    assert.ok(sounded(g, 'hit_golem'));
    assert.equal(m.stagger > 0, staggered, JSON.stringify(buffs));
    assert.equal(m.poise, staggered ? 0 : WEAPONS.bite.knock);
    assert.deepEqual(shakes(g), staggered ? ['stagger'] : []);
  }
});

test('golem: poise decays 10/s on steps not following a hit; a hit holds it for one step', () => {
  const g = still();
  const m = createEnemy(g, 'golem', 0, 600);
  m.poise = 30;
  for (let i = 0; i < 60; i++) g.stepEnemies();
  assert.ok(near(m.poise, 30 - GOLEM_POISE_DECAY), `${m.poise}`);
  dealDamage(g, m, 1, 'fire', ORIGIN, 5);
  const p = m.poise;
  g.stepEnemies();
  assert.equal(m.poise, p, 'the step after a hit: no decay');
  assert.equal(m.poiseHit, false);
  g.stepEnemies();
  assert.ok(near(m.poise, p - GOLEM_POISE_DECAY * DT));
  m.poise = 0.05;
  g.stepEnemies();
  assert.equal(m.poise, 0, 'never below 0');
  // chip damage slower than the decay never reaches a stagger: knock 4 every half second
  const c = still();
  const n = createEnemy(c, 'golem', 0, 2000);
  for (let i = 0; i < 600; i++) {
    if (i % 30 === 0) dealDamage(c, n, 1, 'fire', ORIGIN, 4);
    c.stepEnemies();
  }
  assert.ok(n.poise < 8 && n.stagger === 0, `poise ${n.poise}`);
});

// ---- stagger -------------------------------------------------------------------------

test('golem: a stagger pushes it 40 px straight away from the dragon over 18 ticks, eased, then holds 30 ticks', () => {
  const g = still();
  const m = createEnemy(g, 'golem', 300, 400); // the dragon at the origin: away is (0.6, 0.8)
  m.poise = GOLEM_POISE - 1;
  dealDamage(g, m, 1, 'fire', { x: 300, y: 500 }, 1); // the hitter's position does not matter
  assert.deepEqual([m.staggerDx, m.staggerDy], [0.6, 0.8]);
  assert.deepEqual(shakes(g), ['stagger']);
  assert.ok(sounded(g, 'hit_golem'));
  const steps = [];
  for (let k = 1; k <= STAGGER_PUSH_TICKS; k++) {
    const x0 = m.x, y0 = m.y;
    g.stepEnemies();
    steps.push(Math.hypot(m.x - x0, m.y - y0));
    const d = GOLEM_STAGGER_DIST * staggerEase(k);
    assert.ok(near(m.x, 300 + 0.6 * d) && near(m.y, 400 + 0.8 * d), `tick ${k}: ${m.x}, ${m.y}`);
  }
  assert.equal(STAGGER_PUSH_TICKS, 18);
  assert.ok(near(Math.hypot(m.x - 300, m.y - 400), 40), '40 px in all');
  assert.ok(steps[0] > steps[8] && steps[8] > steps[17] && steps[17] > 0, 'eased out: fast first');
  // hits during the stagger add no poise
  dealDamage(g, m, 1, 'fire', ORIGIN, 1000);
  assert.deepEqual([m.poise, m.stagger], [0, STAGGER_TICKS - STAGGER_PUSH_TICKS]);
  assert.ok(sounded(g, 'hit_golem'), 'the hit still sounds');
  const held = [m.x, m.y, m.frame, m.frameTicks];
  for (let k = 0; k < 30; k++) g.stepEnemies();
  assert.deepEqual([m.x, m.y, m.frame, m.frameTicks], held, 'stands still, anim frozen');
  assert.equal(m.stagger, 0);
  g.stepEnemies(); // walks again: straight at the tower
  const tw = g.tower, L = Math.hypot(tw.x - held[0], tw.y - held[1]);
  assert.ok(near(Math.hypot(m.x - held[0], m.y - held[1]), ENEMIES.golem.speed * DT, 1e-9));
  assert.ok(near((m.x - held[0]) * L / (ENEMIES.golem.speed * DT), tw.x - held[0], 1e-6));
});

test('golem: others are moved out of a staggering golem by separation; it is never moved', () => {
  const g = still();
  const m = createEnemy(g, 'golem', 0, 400);
  const k = createEnemy(g, 'knight', 0, 400 + 56 + 12 + 10); // just below it, in the push's way
  m.poise = GOLEM_POISE;
  dealDamage(g, m, 1, 'fire', ORIGIN, 1);
  for (let i = 0; i < STAGGER_PUSH_TICKS; i++) g.stepEnemies();
  assert.ok(near(m.y, 440) && near(m.x, 0), `${m.x}, ${m.y}`);
  assert.ok(Math.hypot(k.x - m.x, k.y - m.y) >= m.r + k.r - 1e-6, 'the knight is out of its body');
});

// ---- shove ---------------------------------------------------------------------------

test('golem: in contact it shoves the tower 30 px away from itself once per second', () => {
  const g = still();
  const m = createEnemy(g, 'golem', g.tower.x, g.tower.y + TOWER_RADIUS + 56 - 4);
  const shoveTicks = [];
  let hp = g.tower.hp;
  for (let i = 1; i <= 150; i++) {
    const t0 = { x: g.tower.x, y: g.tower.y };
    g.tick({});
    if (m.shoveTimer === SHOVE_TICKS) {
      shoveTicks.push(i);
      assert.equal(g.tower.moved, true);
    }
    if (i === 1) {
      assert.ok(near(g.tower.y, t0.y - GOLEM_SHOVE_DIST) && near(g.tower.x, t0.x), 'straight away from the golem (up)');
      assert.ok(near(hp - g.tower.hp, 40 * DT), 'the contact damage of the tick as well');
    }
    hp = g.tower.hp;
  }
  assert.deepEqual(shoveTicks, [1, 61, 121]);
});

test('golem: a shove past the tether is undone on the next step 3: dragged to TETHER_LENGTH', () => {
  const g = still();
  g.tower.x = 0; g.tower.y = 100; // the dragon at the origin
  createEnemy(g, 'golem', 0, 100 - (56 + TOWER_RADIUS - 1)); // between them, touching the tower
  g.grid.build(g.enemies);
  collideTower(g);
  assert.ok(near(g.tower.y, 130) && g.tower.moved);
  assert.ok(g.tower.y > TETHER_LENGTH);
  g.stepTether();
  assert.ok(near(g.tower.y, TETHER_LENGTH) && near(g.tower.x, 0), `${g.tower.y}`);
  // a golem exactly on the tower shoves it along (0, 1)
  const h = still();
  const z = createEnemy(h, 'golem', h.tower.x, h.tower.y);
  h.grid.build(h.enemies);
  const y0 = h.tower.y;
  collideTower(h);
  assert.ok(near(h.tower.y, y0 + GOLEM_SHOVE_DIST) && z.shoveTimer === SHOVE_TICKS);
});

// ---- shake events --------------------------------------------------------------------

test('shake events: the golem\'s spawn; at most one per kind per tick', () => {
  const g = still(GOLEM_NOW);
  g.tick({});
  assert.equal(g.enemies.filter((e) => e.type === 'golem').length, 1);
  assert.deepEqual(shakes(g), ['spawn']);
  g.tick({});
  assert.deepEqual(shakes(g), [], 'only once');
  g.shake('step'); g.shake('step'); g.shake('stagger');
  assert.deepEqual(shakes(g), ['step', 'stagger']);
});

test('shake events: a footstep on golem.walk frames 3 and 6, only within 400 px of the dragon', () => {
  const g = still();
  const m = createEnemy(g, 'golem', 0, 300);
  const steps = [];
  for (let i = 1; i <= 84; i++) {
    g.tick({});
    if (shakes(g).includes('step')) {
      steps.push(i);
      assert.ok([3, 6].includes(m.frame) && m.frameTicks === 0, `frame ${m.frame}`);
    }
  }
  assert.deepEqual(steps, [18, 36, 60, 78], 'twice a 42-tick cycle');
  const far = still();
  createEnemy(far, 'golem', 0, 1000);
  for (let i = 0; i < 84; i++) { far.tick({}); assert.ok(!shakes(far).includes('step')); }
  // the range is inclusive; only the tick a step frame starts
  const h = still();
  const z = createEnemy(h, 'golem', 0, GOLEM_STEP_RANGE);
  z.frame = 3; z.frameTicks = 0;
  golemFootstep(h, z);
  assert.deepEqual(shakes(h), ['step']);
  for (const [y, frame, ft] of [[GOLEM_STEP_RANGE + 0.01, 3, 0], [0, 4, 0], [0, 6, 1]]) {
    h.events.length = 0;
    Object.assign(z, { y, frame, frameTicks: ft });
    golemFootstep(h, z);
    assert.deepEqual(shakes(h), [], `${y} ${frame} ${ft}`);
  }
});

// ---- determinism and snapshot --------------------------------------------------------

test('golem: determinism and the snapshot with staggers and shoves', () => {
  const play = () => {
    const g = new Game({ seed: 5, timeline: GOLEM_NOW });
    g.weapons = [createWeapon('bite', 5), createWeapon('ring', 5), createWeapon('fireball', 5)];
    g.buffs = [{ id: 'force', level: 3 }];
    let staggers = 0;
    for (let i = 0; i < 900; i++) {
      g.tick({ moveX: i % 300 < 150 ? 0 : 0.3, moveY: 0.2, aimX: 0, aimY: 1, hasAim: true });
      staggers += shakes(g).filter((k) => k === 'stagger').length;
    }
    return { g, staggers };
  };
  const a = play(), b = play();
  assert.ok(a.staggers > 0, 'it staggered');
  assert.equal(a.g.digest(), b.g.digest());
  const m = a.g.enemies.find((e) => e.type === 'golem');
  const snap = JSON.parse(JSON.stringify(a.g.snapshot())).enemies.find((e) => e.type === 'golem');
  for (const k of ['poise', 'poiseHit', 'stagger', 'staggerDx', 'staggerDy', 'shoveTimer']) assert.ok(k in snap, k);
  const d = a.g.digest();
  m.poise += 1;
  assert.notEqual(a.g.digest(), d, 'poise is in the digest');
});

// ---- screen shake (render) -----------------------------------------------------------

test('shake: amplitude, linear decay, sum and cap; finished shakes dropped', () => {
  assert.deepEqual(SHAKES, { spawn: { amp: 8, time: 0.6 }, step: { amp: 2, time: 0.15 }, stagger: { amp: 5, time: 0.3 } });
  assert.equal(SHAKE_CAP, 10);
  const s = new Shake();
  s.add('spawn', 1000);
  assert.equal(s.amplitude(1000), 8);
  assert.ok(near(s.amplitude(1300), 4));
  assert.ok(near(s.amplitude(1450), 2));
  assert.equal(s.amplitude(1600), 0);
  assert.equal(s.list.length, 0);
  s.add('step', 0);
  assert.ok(near(s.amplitude(75), 1));
  s.add('stagger', 0);
  assert.ok(near(s.amplitude(75), 1 + 5 * 0.75));
  s.add('spawn', 0); s.add('spawn', 0);
  assert.equal(s.amplitude(0), SHAKE_CAP, 'capped');
  s.add('nonsense', 0);
  assert.equal(s.list.length, 4, 'unknown kinds ignored');
});

test('shake: the offset is a fixed pattern of time in whole px within the amplitude; ?shake=0 is none', () => {
  const a = new Shake(), b = new Shake();
  for (const s of [a, b]) { s.add('spawn', 500); s.add('stagger', 600); }
  for (let t = 500; t < 1200; t += 16.7) {
    const o = a.offset(t);
    assert.deepEqual(o, b.offset(t), 'same events, same shake');
    const A = Math.min(SHAKE_CAP, 8 * Math.max(0, 1 - (t - 500) / 600) + 5 * Math.max(0, Math.min(1, 1 - (t - 600) / 300)));
    assert.equal(o.x, Math.round(A * Math.sin(2 * Math.PI * SHAKE_HZ.x * t / 1000)) || 0);
    assert.equal(o.y, Math.round(A * Math.cos(2 * Math.PI * SHAKE_HZ.y * t / 1000)) || 0);
    assert.ok(Number.isInteger(o.x) && Number.isInteger(o.y) && Math.abs(o.x) <= A + 0.5 && Math.abs(o.y) <= A + 0.5);
  }
  const c = new Shake();
  c.add('spawn', 0);
  const seen = new Set([...Array(30)].map((_, i) => JSON.stringify(c.offset(i * 16.7))));
  assert.ok(seen.size > 10, 'it moves around');
  assert.deepEqual(new Shake().offset(0), { x: 0, y: 0 }, 'no shake, no offset');
  const off = new Shake(false);
  off.add('spawn', 0);
  assert.equal(off.list.length, 0);
  assert.deepEqual(off.offset(10), { x: 0, y: 0 });
});

test('shake: the App feeds the sim\'s shake events to its Shake; shake: false ignores them', () => {
  for (const enabled of [true, false]) {
    const audio = { play() {}, resume: () => Promise.resolve() };
    const app = new App({ makeGame: (seed) => new Game({ seed, timeline: GOLEM_NOW }), randomSeed: () => 1, audio, shake: enabled });
    const idle = { intent: {}, pause: false, confirm: false, pick: -1, nav: 0, click: null };
    app.frame(0, { ...idle, confirm: true }); // title -> play
    let f = 1;
    while (app.game.tickCount < 1) app.frame(f++ * STEP_MS, idle);
    assert.equal(app.shake.list.length, enabled ? 1 : 0, `enabled ${enabled}`);
    const o = app.shake.offset(f * STEP_MS);
    if (!enabled) assert.deepEqual(o, { x: 0, y: 0 });
  }
});

function fakeCtx() {
  const calls = [];
  return new Proxy({}, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      return (...args) => { calls.push([k, ...args]); return {}; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

test('shake: offsets the whole world, the debug overlay with it; rendering writes nothing', () => {
  const g = still();
  const m = createEnemy(g, 'golem', 100, 200);
  g.tick({});
  m.poise = 30;
  assert.deepEqual(worldOffset(g), cameraOffset(g.dragon));
  assert.deepEqual(worldOffset(g, { x: 2.6, y: -1 }), { x: cameraOffset(g.dragon).x + 3, y: cameraOffset(g.dragon).y - 1 });
  const before = g.digest();
  const makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => fakeCtx() });
  const r = createRenderer({ atlas, makeCanvas });
  const draw = (shake) => { const ctx = fakeCtx(); r.drawWorld(ctx, g, shake); drawDebugWorld(ctx, g, shake); return ctx.calls; };
  const plain = draw(), shaken = draw({ x: 3, y: -2 });
  assert.equal(g.digest(), before, 'render writes no state');
  const castle = atlas.frames[atlas.anims.castle.frames[0]];
  const at = (calls, rect) => calls.find((c) => c[0] === 'drawImage' && c[2] === rect.x && c[3] === rect.y && c[4] === rect.w).slice(6, 8);
  const [cx, cy] = at(plain, castle), [sx, sy] = at(shaken, castle);
  assert.deepEqual([sx - cx, sy - cy], [3, -2], 'the tower moves with the shake');
  const dragon = atlas.frames[atlas.anims['dragon.walk'].frames[0]];
  const [dx, dy] = at(plain, dragon), [ex, ey] = at(shaken, dragon);
  assert.deepEqual([ex - dx, ey - dy], [3, -2], 'the dragon too');
  // the poise bar: half full, over the golem, shaken with the world
  const o = worldOffset(g, { x: 3, y: -2 });
  const bar = poiseBar(m, m.x + o.x, m.y + o.y);
  assert.deepEqual([bar.frac, bar.color, bar.w, bar.h], [0.5, POISE_BAR.fill, 60, 5]);
  assert.equal(bar.y, Math.round(m.y + o.y - m.r - POISE_BAR.gap - POISE_BAR.h));
  assert.ok(shaken.some((c) => c[0] === 'fillRect' && c[1] === bar.x && c[2] === bar.y && c[3] === 30 && c[4] === 5), 'filled to poise / 60');
  m.stagger = 10;
  assert.deepEqual([poiseBar(m, 0, 0).frac, poiseBar(m, 0, 0).color], [1, POISE_BAR.stagger]);
});
