// Debug tools (§19): debug intents in the sim, game speed in the loop, debug keys in the
// input, the App wiring, and the overlay's render purity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, normalizeDebug } from '../src/sim/game.js';
import { App, DEBUG_JUMP_TO } from '../src/app.js';
import { Accumulator, STEP_MS, SPEEDS } from '../src/loop.js';
import { readFrame, createInputState } from '../src/input.js';
import { drawDebugWorld, drawDebugStats, debugLines } from '../src/render/debug.js';
import { WEAPON_IDS, DT } from '../src/sim/content.js';
import { createWeapon } from '../src/sim/weapons.js';

const levels = (g) => g.weapons.map((w) => `${w.id}:${w.level}`).join(',');

test('debug: commands are ignored without { debug: true } and applied with it', () => {
  const plain = new Game({ seed: 3 });
  const dbg = new Game({ seed: 3, debug: true });
  for (const g of [plain, dbg]) {
    g.tick({ debug: { grant: 'laser' } });
    g.tick({ debug: { jumpTo: 100 } });
  }
  assert.equal(levels(plain), 'fireball:1');
  assert.equal(plain.tickCount, 2);
  assert.equal(levels(dbg), 'fireball:1,laser:5');
  assert.equal(dbg.tickCount, Math.round(100 / DT) + 1, 'the jump tick then runs as usual');
  // Without debug intents a debug game plays exactly like a plain one.
  const a = new Game({ seed: 9 }), b = new Game({ seed: 9, debug: true });
  for (let i = 0; i < 600; i++) { a.tick({ moveX: 1 }); b.tick({ moveX: 1 }); }
  assert.equal(a.digest(), b.digest());
});

test('debug: grant raises an owned weapon to level 5 and adds a missing one at level 5', () => {
  const g = new Game({ seed: 1, debug: true });
  for (const id of WEAPON_IDS) g.tick({ debug: { grant: id } });
  assert.equal(levels(g), 'fireball:5,laser:5,miniTower:5,ring:5');
  assert.ok(Array.isArray(g.weapons[3].balls), 'the ring is a real ring weapon');
  // A full set of slots with the weapon owned: nothing is added.
  g.tick({ debug: { grant: 'ring' } });
  assert.equal(g.weapons.length, 4);
});

test('debug: malformed commands read as none; commands wait while offers are open', () => {
  assert.equal(normalizeDebug({}), null);
  assert.equal(normalizeDebug({ debug: { grant: 'sword' } }), null);
  assert.equal(normalizeDebug({ debug: { jumpTo: NaN } }), null);
  assert.equal(normalizeDebug({ debug: 'x' }), null);
  assert.deepEqual(normalizeDebug({ debug: { grant: 'ring', jumpTo: 5 } }), { grant: 'ring' });
  const g = new Game({ seed: 1, debug: true });
  g.offers = [{ kind: 'repair', id: 'repair', level: 1 }];
  g.pendingLevelUps = 1;
  g.tick({ debug: { grant: 'laser' } });
  assert.equal(levels(g), 'fireball:1', 'the world is frozen, debug commands too');
});

test('debug: jump lands on 4:50, never goes back, and the golem spawns at 5:00', () => {
  const g = new Game({ seed: 4, debug: true });
  g.tower.hp = g.tower.maxHp = 1e9; // test only: the horde must not end the run
  g.tick({ debug: { jumpTo: 290 } });
  assert.equal(g.tickCount, 290 * 60 + 1);
  assert.ok(Math.abs(g.t - (290 + DT)) < 1e-9);
  g.tick({ debug: { jumpTo: 10 } });
  assert.equal(g.tickCount, 290 * 60 + 2, 'no jump backwards');
  const golem = () => g.enemies.some((e) => e.type === 'golem');
  while (g.tickCount < 300 * 60 - 1) { g.tick({}); if (g.offers.length) g.tick({ pick: 0 }); }
  assert.equal(golem(), false);
  assert.equal(g.spawner.golem, false);
  g.tick({});
  assert.equal(g.t >= 300, true);
  assert.equal(golem(), true);
  assert.ok(g.events.some((e) => e.name === 'ohno'));
});

test('debug: a replay of the same intents, debug commands included, gives the same digest', () => {
  const play = () => {
    const g = new Game({ seed: 77, debug: true });
    for (let i = 0; i < 900; i++) {
      const it = { moveX: Math.cos(i / 50), moveY: Math.sin(i / 50), pick: 0 };
      if (i === 10) it.debug = { grant: 'ring' };
      if (i === 20) it.debug = { jumpTo: 120 };
      g.tick(it);
    }
    return g.digest();
  };
  assert.equal(play(), play());
});

test('loop: game speed runs more or fewer ticks per frame, with the cap scaled above 1x', () => {
  assert.deepEqual(SPEEDS, [0.25, 0.5, 1, 2, 4]);
  const ticks = (speed, frames, frameMs = STEP_MS) => {
    const a = new Accumulator();
    a.speed = speed;
    a.advance(0);
    let n = 0;
    for (let i = 1; i <= frames; i++) n += a.advance(i * frameMs);
    return n;
  };
  assert.equal(ticks(1, 60), 60);
  assert.equal(ticks(2, 60), 120);
  assert.equal(ticks(4, 60), 240);
  assert.equal(ticks(0.5, 60), 30);
  assert.equal(ticks(0.25, 60), 15);
  assert.equal(ticks(4, 30, 2 * STEP_MS), 240, '4x at 30 fps: 8 ticks per frame');
  const a = new Accumulator();
  a.speed = 4;
  a.advance(0);
  assert.equal(a.advance(60_000), 16, 'a stall still drops owed ticks beyond the scaled cap');
});

test('input: F1–F4 grant, F5 jumps, + / - change speed (edges only)', () => {
  const s = createInputState();
  const f = (pressed, held = new Set()) => readFrame({ held, pressed }, s).debug;
  assert.deepEqual(f([]), { grant: null, jump: false, speed: 0 });
  assert.equal(f(['F1']).grant, 'fireball');
  assert.equal(f(['F2']).grant, 'laser');
  assert.equal(f(['F3']).grant, 'miniTower');
  assert.equal(f(['F4']).grant, 'ring');
  assert.equal(f(['F5']).jump, true);
  assert.equal(f(['Equal']).speed, 1);
  assert.equal(f(['NumpadSubtract']).speed, -1);
  assert.deepEqual(f([], new Set(['F1'])), { grant: null, jump: false, speed: 0 }, 'holding is not a press');
});

const idle = { intent: {}, pause: false, confirm: false, pick: -1, nav: 0, click: null, debug: { grant: null, jump: false, speed: 0 } };
const press = (debug) => ({ ...idle, debug: { ...idle.debug, ...debug } });
const audio = { play: () => true, resume: () => Promise.resolve() };

function makeApp(debug) {
  let clock = 0;
  const app = new App({
    makeGame: (seed) => new Game({ seed, debug }), randomSeed: () => 5, audio, debug,
    now: () => (clock += 0.5),
  });
  return app;
}

test('app: debug keys reach the sim as the next tick\'s intent.debug only in a debug App', () => {
  for (const debug of [false, true]) {
    const app = makeApp(debug);
    app.frame(0, { ...idle, confirm: true }); // title -> play
    app.frame(STEP_MS, idle);
    app.frame(2 * STEP_MS, press({ grant: 'laser' }));
    app.frame(3 * STEP_MS, press({ jump: true }));
    app.frame(4 * STEP_MS, idle);
    if (debug) {
      assert.equal(levels(app.game), 'fireball:1,laser:5');
      assert.equal(app.game.tickCount, DEBUG_JUMP_TO * 60 + 2);
    } else {
      assert.equal(levels(app.game), 'fireball:1');
      assert.equal(app.game.tickCount, 4);
    }
  }
});

test('app: + / - step the game speed through 0.25x..4x (debug only), and stats track ticks', () => {
  const plain = makeApp(false);
  plain.frame(0, press({ speed: 1 }));
  assert.equal(plain.speed, 1);
  const app = makeApp(true);
  app.frame(0, { ...idle, confirm: true });
  for (let i = 0; i < 5; i++) app.frame(0, press({ speed: 1 }));
  assert.equal(app.speed, 4);
  for (let i = 0; i < 2; i++) app.frame(0, press({ speed: -1 }));
  assert.equal(app.speed, 1);
  app.frame(0, press({ speed: -1 }));
  app.frame(0, press({ speed: -1 }));
  app.frame(0, press({ speed: -1 }));
  assert.equal(app.speed, 0.25);
  app.changeSpeed(3);
  assert.equal(app.speed, 2);
  app.frame(0, idle);
  assert.equal(app.frame(STEP_MS, idle), 2, '2x: two ticks per 60 Hz frame');
  assert.equal(app.stats.ticks, 2);
  assert.ok(app.stats.tickMs > 0);
});

// A 2D context that accepts every call.
function fakeCtx() {
  return new Proxy({}, {
    get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return (s) => ({ width: String(s).length * 8 }); return () => ({}); },
    set(t, k, v) { t[k] = v; return true; },
  });
}

test('debug overlay: draws circles and stats without writing game state', () => {
  const g = new Game({ seed: 12, debug: true });
  g.weapons.push(createWeapon('ring', 1), createWeapon('miniTower', 1));
  for (let i = 0; i < 1200; i++) g.tick({ moveX: Math.cos(i / 40), moveY: Math.sin(i / 40), pick: 0 });
  assert.ok(g.enemies.length > 0 && g.projectiles.length + g.miniTowers.length > 0);
  const before = g.digest();
  drawDebugWorld(fakeCtx(), g);
  drawDebugStats(fakeCtx(), g, { ticks: 1, tickMs: 0.25 }, 2);
  assert.equal(g.digest(), before);
  const lines = debugLines(g, { ticks: 3, tickMs: 0.25 }, 2).join('\n');
  assert.match(lines, /0\.25 ms\s+3\/frame\s+speed 2x/);
  assert.match(lines, new RegExp(`enemies ${g.enemies.length}\\b`));
  assert.match(lines, new RegExp(`gems ${g.gems.length}\\b`));
});
