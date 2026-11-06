// Mage orbs (§8.5): firing range, casting, interval and spawn offset, straight flight at the
// dragon's firing-time position, hits that damage the tower, expiry, and the rng budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { spawnOrb, collideEnemyShots, MAGE_ORB_INTERVAL_TICKS } from '../src/sim/enemyShots.js';
import { spawnProjectile } from '../src/sim/projectiles.js';
import { createWeapon } from '../src/sim/weapons.js';
import { createRenderer } from '../src/render/draw.js';
import { debugLines } from '../src/render/debug.js';
import {
  DT, DRAGON_RADIUS, MAGE_ORB_RANGE, MAGE_ORB_SPEED, MAGE_ORB_R, MAGE_ORB_TRAVEL, MAGE_ORB_DAMAGE,
  MAGE_ORB_ANIM, MAGE_ORB_SOUND, TOWER_HP, ENEMY_TYPES,
} from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = () => { const g = new Game({ seed: 1, timeline: QUIET }); g.weapons = []; return g; };
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(intent); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const sounded = (g, name) => g.events.some((e) => e.type === 'sound' && e.name === name);
const STEP = MAGE_ORB_SPEED * DT;

test('orbs: the constants are the work file numbers', () => {
  assert.equal(MAGE_ORB_INTERVAL_TICKS, 180);
  assert.deepEqual([MAGE_ORB_RANGE, MAGE_ORB_SPEED, MAGE_ORB_R, MAGE_ORB_TRAVEL, MAGE_ORB_DAMAGE, DRAGON_RADIUS], [320, 110, 6, 400, 5, 12]);
  assert.equal(MAGE_ORB_ANIM, 'orb.green');
  assert.equal(MAGE_ORB_SOUND, 'slime_poke');
});

test('orbs: a ready mage exactly MAGE_ORB_RANGE from the dragon fires one orb from its centre straight at it', () => {
  const g = still();
  const m = createEnemy(g, 'mage', MAGE_ORB_RANGE, 0); // the dragon is at the origin
  m.orbTimer = 0;
  g.tick({});
  assert.equal(g.enemyShots.length, 1);
  const [o] = g.enemyShots;
  assert.equal(o.kind, 'orb');
  assert.equal(o.anim, 'orb.green');
  assert.deepEqual([o.speed, o.r, o.damage, o.range], [MAGE_ORB_SPEED, MAGE_ORB_R, MAGE_ORB_DAMAGE, MAGE_ORB_TRAVEL]);
  assert.ok(near(o.dx, -1) && near(o.dy, 0), `direction ${o.dx}, ${o.dy}`);
  assert.ok(near(o.x, MAGE_ORB_RANGE - STEP) && near(o.y, 0), 'it started at the mage and moved in step 7 of the same tick');
  assert.ok(near(o.travelled, STEP));
  assert.equal(m.orbTimer, MAGE_ORB_INTERVAL_TICKS);
  assert.equal(g.projectiles.length, 0, 'orbs are not player projectiles');
});

test('orbs: out of range a ready mage waits at 0 and fires on the first step the dragon is in range', () => {
  const g = still();
  const m = createEnemy(g, 'mage', MAGE_ORB_RANGE + 0.5, 0);
  m.orbTimer = 0;
  let fired = -1;
  for (let i = 0; i < 60 && fired < 0; i++) {
    const d = Math.hypot(m.x - g.dragon.x, m.y - g.dragon.y); // the mage fires before it walks
    g.tick({});
    const shot = g.enemyShots.length > 0;
    assert.equal(shot, d <= MAGE_ORB_RANGE, `tick ${i}: distance ${d}`);
    if (!shot) assert.equal(m.orbTimer, 0, 'waits at 0');
    else fired = i;
  }
  assert.ok(fired > 0, 'walked into range and fired');
});

test('orbs: a mage never fires on a tick of its cast, and fires on the first tick after it', () => {
  const g = still();
  const m = createEnemy(g, 'mage', 0, -200); // 240 px from the tower: it casts; 200 px from the dragon
  m.castTimer = 479; // the cast starts on the first tick
  m.orbTimer = 0;
  for (let i = 1; i <= 60; i++) {
    g.tick({});
    assert.equal(g.enemyShots.length, 0, `cast tick ${i}`);
  }
  assert.equal(m.anim, 'mage.walk', 'the cast is over');
  g.tick({});
  assert.equal(g.enemyShots.length, 1);
});

test('orbs: the spawn offset is floor(rng × 180) and shots follow every 180 ticks', () => {
  const g = still();
  g.rng = () => 0.5;
  const m = createEnemy(g, 'mage', 0, -250); // still 100 px short of the dragon at tick 450
  assert.equal(m.orbTimer, 90);
  g.rng = () => 0;
  assert.equal(createEnemy(g, 'mage', 5000, 0).orbTimer, 0);
  g.rng = () => 0.9999999;
  assert.equal(createEnemy(g, 'mage', 5000, 0).orbTimer, 179);
  g.enemies.length = 1; // keep only the first mage
  const seen = new Set();
  const fireTicks = [];
  for (let i = 1; i <= 460; i++) {
    g.tick({});
    for (const o of g.enemyShots) if (!seen.has(o.id)) { seen.add(o.id); fireTicks.push(i); }
  }
  assert.deepEqual(fireTicks, [90, 270, 450]);
});

test('orbs: an orb flies straight at where the dragon was when it fired (no lead, no homing)', () => {
  const g = still();
  const m = createEnemy(g, 'mage', 200, 0);
  m.orbTimer = 0;
  g.tick({ moveY: 1 }); // the dragon moves in step 2, before the mage fires in step 5
  const [o] = g.enemyShots;
  const tx = g.dragon.x - 200, ty = g.dragon.y;
  const l = Math.hypot(tx, ty);
  assert.ok(near(o.dx, tx / l) && near(o.dy, ty / l), 'aimed at the dragon of this tick');
  const [dx, dy] = [o.dx, o.dy];
  run(g, 60, { moveY: 1 });
  assert.equal(g.enemyShots.length, 1, 'still flying: the dragon walked out of its path');
  assert.deepEqual([o.dx, o.dy], [dx, dy]);
  assert.ok(near(o.x, 200 + dx * o.travelled) && near(o.y, dy * o.travelled), 'on the firing line');
});

test('orbs: a hit removes the orb, takes MAGE_ORB_DAMAGE from the tower and plays slime_poke', () => {
  const g = still();
  const o = spawnOrb(g, 30, 0, -1, 0); // hits once its centre is within 6 + 12 of the dragon
  const hitTick = Math.ceil((30 - (MAGE_ORB_R + DRAGON_RADIUS)) / STEP + 1e-9);
  run(g, hitTick - 1);
  assert.ok(g.enemyShots.includes(o));
  assert.equal(g.tower.hp, TOWER_HP);
  assert.ok(!sounded(g, MAGE_ORB_SOUND));
  g.tick({});
  assert.equal(g.enemyShots.length, 0);
  assert.equal(g.tower.hp, TOWER_HP - MAGE_ORB_DAMAGE);
  assert.ok(sounded(g, MAGE_ORB_SOUND));
  g.tick({});
  assert.ok(!sounded(g, MAGE_ORB_SOUND));
});

test('orbs: overlap is strict (centres closer than 6 + 12 px); several hits in a tick each count', () => {
  const g = still();
  const rr = MAGE_ORB_R + DRAGON_RADIUS;
  const edge = spawnOrb(g, rr, 0, 1, 0);
  spawnOrb(g, rr - 1e-6, 0, 1, 0);
  spawnOrb(g, 0, -(rr - 1), 0, 1);
  collideEnemyShots(g);
  assert.deepEqual(g.enemyShots, [edge]);
  assert.equal(g.tower.hp, TOWER_HP - 2 * MAGE_ORB_DAMAGE);
  assert.equal(g.events.filter((e) => e.name === MAGE_ORB_SOUND).length, 1, 'one sound per tick');
});

test('orbs: an orb that brings the tower to 0 ends the run; HP never goes below 0', () => {
  const g = still();
  g.tower.hp = 3;
  spawnOrb(g, 0, 0, 1, 0);
  g.tick({});
  assert.equal(g.tower.hp, 0);
  assert.equal(g.phase, 'dying');
});

test('orbs: orbs ignore the tower and enemies; player projectiles do not touch them', () => {
  const g = still();
  g.weapons = [createWeapon('fireball', 1)];
  const k = createEnemy(g, 'knight', 600, 300);
  k.hp = 1000;
  const overTower = spawnOrb(g, g.tower.x, g.tower.y, 0, 1);
  const overKnight = spawnOrb(g, 600, 300, 1, 0);
  const ahead = spawnOrb(g, 100, 0, 1, 0); // the dragon's first fireball (fired right) overtakes it
  run(g, 30, { aimX: 1, aimY: 0, hasAim: true });
  assert.equal(g.tower.hp, TOWER_HP);
  assert.equal(k.hp, 1000);
  assert.deepEqual(g.enemyShots, [overTower, overKnight, ahead]);
  assert.ok(g.projectiles.length === 1 && g.projectiles[0].x > ahead.x, 'the fireball flew through the orb');
});

test('orbs: a dodged orb expires once it has travelled 400 px', () => {
  const g = still();
  const o = spawnOrb(g, 0, 300, 1, 0);
  const last = Math.ceil(MAGE_ORB_TRAVEL / STEP) - 1; // last tick on which it is still short of 400
  run(g, last);
  assert.ok(g.enemyShots.includes(o) && o.travelled < MAGE_ORB_TRAVEL);
  g.tick({});
  assert.equal(g.enemyShots.length, 0);
});

test('orbs: only a mage draws a random number when it is created; nothing else does', () => {
  for (const type of ENEMY_TYPES) {
    const g = still();
    let draws = 0;
    g.rng = () => { draws++; return 0.25; };
    createEnemy(g, type, 1000, 0);
    assert.equal(draws, type === 'mage' ? 1 : 0, type);
  }
  // a run without mages: the orb code draws nothing per tick either
  const g = still();
  let draws = 0;
  g.rng = () => { draws++; return 0.25; };
  createEnemy(g, 'knight', 300, 0);
  spawnOrb(g, 100, 100, 1, 0);
  run(g, 120);
  assert.equal(draws, 0);
});

test('orbs: enemy shots and the orb timer are run state (snapshot and digest)', () => {
  const g = still();
  const m = createEnemy(g, 'mage', 5000, 0);
  const d0 = g.digest();
  m.orbTimer++;
  const d1 = g.digest();
  assert.notEqual(d1, d0);
  spawnOrb(g, 1, 2, 1, 0);
  assert.deepEqual(g.snapshot().enemyShots, g.enemyShots);
  assert.notEqual(g.digest(), d1);
});

test('orbs: same seed, same intents, same digest in a run with firing mages', () => {
  const timeline = [{ t: 0, rate: 3, weights: { mage: 100 } }];
  const play = () => {
    const g = new Game({ seed: 11, timeline });
    for (let i = 0; i < 1800; i++) g.tick({ moveX: Math.sin(i / 90), moveY: Math.cos(i / 70), aimX: 1, aimY: 0, hasAim: true });
    return g;
  };
  const a = play();
  assert.ok(a.nextId > 0 && a.tower.hp < TOWER_HP);
  assert.equal(play().digest(), a.digest());
});

// ---- rendering and debug -------------------------------------------------------------

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

test('render: orbs draw their frame of orb.green above projectiles and below the dragon', () => {
  const r = createRenderer({ atlas, makeCanvas });
  const g = still();
  createEnemy(g, 'knight', 50, -50);
  spawnProjectile(g, { kind: 'fireball', x: 40, y: 0, dx: 1, dy: 0, speed: 420, range: 420, r: 6, damage: 2, anim: 'fireball.anim' });
  const o = spawnOrb(g, 60, 10, -1, 0);
  o.frame = 3;
  const before = JSON.stringify(g.snapshot());
  const c = fakeCtx();
  r.drawWorld(c, g);
  assert.equal(JSON.stringify(g.snapshot()), before, 'drawing writes nothing');
  const rect = (anim, f) => atlas.frames[atlas.anims[anim].frames[f]];
  const at = (fr) => c.calls.findIndex((x) => x[0] === 'drawImage' && x.length === 10 && x[2] === fr.x && x[3] === fr.y);
  const orbFrame = rect('orb.green', 3);
  const iOrb = at(orbFrame);
  assert.ok(iOrb >= 0, 'the orb is drawn');
  assert.deepEqual(c.calls[iOrb].slice(6), [480 + 60 - orbFrame.w, 300 + 10 - orbFrame.h, orbFrame.w * 2, orbFrame.h * 2]);
  assert.ok(at(rect('knight.walk', 0)) < iOrb, 'above enemies');
  assert.ok(at(rect('fireball.anim', 0)) < iOrb, 'above projectiles');
  assert.ok(at(rect('dragon.walk', 0)) > iOrb, 'below the dragon');
});

test('debug: the stats count orbs', () => {
  const g = still();
  spawnOrb(g, 0, 300, 1, 0);
  spawnOrb(g, 0, 300, 1, 0);
  assert.match(debugLines(g, { ticks: 1, tickMs: 0.1 }, 1).join('\n'), /orbs 2\b/);
});
