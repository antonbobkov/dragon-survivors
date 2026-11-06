// Browser shell under node: the App screen flow (§4, §13) and render purity (§5, §17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { App } from '../src/app.js';
import { STEP_MS } from '../src/loop.js';
import { createRenderer, drawAnim, enemyDrawOrder, tileStart, grassSpeckles, DIR_ANIMS } from '../src/render/draw.js';
import { drawHud, formatTime, iconSlots, WEAPON_ICONS, buffIcon } from '../src/render/hud.js';
import { drawTitle, drawPause, drawGameOver, gameOverLines } from '../src/render/screens.js';
import { BUFF_IDS, WEAPON_IDS } from '../src/sim/content.js';

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
const atlas = { image: { fake: 'image' }, frames: atlasJson.frames, anims: atlasJson.anims };

// A 2D context that accepts every call and records drawImage calls.
function fakeCtx() {
  const calls = [];
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      return (...args) => { calls.push([k, ...args]); return {}; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const makeCanvas = (width, height) => {
  const ctx = fakeCtx();
  return { width, height, getContext: () => ctx };
};

const idle = { intent: {}, pause: false, confirm: false, pick: -1, nav: 0, click: null };
const press = (o) => ({ ...idle, ...o });

function fakeAudio() {
  const played = [];
  return { played, play: (n) => { played.push(n); return true; }, resume: () => Promise.resolve() };
}

function makeApp(opts = {}) {
  const seeds = [];
  let next = 100;
  const audio = fakeAudio();
  const app = new App({
    makeGame: (seed) => { seeds.push(seed); return new Game({ seed }); },
    randomSeed: () => next++,
    audio,
    ...opts,
  });
  return { app, seeds, audio };
}

// Run frames at 60 Hz starting at `t0` frame index; returns the next frame index.
function run(app, frames, input = idle, t0 = 0) {
  for (let i = 0; i < frames; i++) app.frame((t0 + i) * STEP_MS, input);
  return t0 + frames;
}

test('title: no ticks until Start; Start plays start_game', async () => {
  const { app, audio } = makeApp();
  assert.equal(app.screen, 'title');
  let f = run(app, 30);
  assert.equal(app.game.tickCount, 0);
  app.frame(f++ * STEP_MS, press({ click: { x: 1, y: 1 } }));
  assert.equal(app.screen, 'play');
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(audio.played, ['start_game']);
  f = run(app, 60, idle, f);
  assert.ok(app.game.tickCount >= 59 && app.game.tickCount <= 60, `ticks ${app.game.tickCount}`);
});

test('Enter or A on the title starts as well', () => {
  const { app } = makeApp();
  app.frame(0, press({ confirm: true }));
  assert.equal(app.screen, 'play');
});

test('pause toggles and stops ticks; blur pauses; no burst on resume', () => {
  const { app } = makeApp();
  app.frame(0, press({ confirm: true }));
  let f = run(app, 11, idle, 1);
  const t0 = app.game.tickCount;
  app.frame(f++ * STEP_MS, press({ pause: true }));
  assert.equal(app.screen, 'paused');
  f = run(app, 120, idle, f);
  assert.equal(app.game.tickCount, t0);
  app.frame(f++ * STEP_MS, press({ pause: true }));
  assert.equal(app.screen, 'play');
  f = run(app, 3, idle, f);
  assert.ok(app.game.tickCount - t0 <= 4, 'resume runs no backlog');
  app.blur();
  assert.equal(app.screen, 'paused');
});

test('game over: Retry builds a new game with a new random seed and skips the title', async () => {
  const { app, seeds, audio } = makeApp();
  app.frame(0, press({ confirm: true }));
  let f = run(app, 5, idle, 1);
  app.game.tower.hp = 0; // test only: force the fall
  f = run(app, 140, idle, f);
  assert.equal(app.game.phase, 'over');
  const old = app.game;
  app.frame(f++ * STEP_MS, press({ pause: true }));
  assert.equal(app.screen, 'play', 'pause is ignored on the game-over screen');
  app.frame(f++ * STEP_MS, press({ click: { x: 480, y: 420 } }));
  assert.notEqual(app.game, old);
  assert.equal(app.screen, 'play');
  assert.deepEqual(seeds, [100, 101]);
  await Promise.resolve(); await Promise.resolve();
  assert.ok(audio.played.includes('destroy_castle_sound'));
  assert.equal(audio.played.filter((n) => n === 'start_game').length, 2);
});

test('pause works while dying; blur on the game-over screen does not pause', () => {
  const { app } = makeApp();
  app.frame(0, press({ confirm: true }));
  run(app, 3, idle, 1);
  app.game.tower.hp = 0; // test only
  run(app, 3, idle, 4);
  assert.equal(app.game.phase, 'dying');
  app.frame(7 * STEP_MS, press({ pause: true }));
  assert.equal(app.screen, 'paused');
  app.frame(8 * STEP_MS, press({ pause: true }));
  run(app, 140, idle, 9);
  assert.equal(app.game.phase, 'over');
  app.blur();
  assert.equal(app.screen, 'play');
});

test('Retry with ?seed keeps the same seed', () => {
  const { app, seeds } = makeApp({ fixedSeed: 42 });
  app.frame(0, press({ confirm: true }));
  app.game.tower.hp = 0;
  run(app, 140, idle, 1);
  app.frame(141 * STEP_MS, press({ confirm: true }));
  assert.deepEqual(seeds, [42, 42]);
});

test('edge fields wait for the next tick: a pick on a frame that runs no tick still reaches the sim', () => {
  const { app } = makeApp();
  app.frame(0, press({ confirm: true }));
  app.frame(STEP_MS, idle);
  const seen = [];
  const tick = app.game.tick.bind(app.game);
  app.game.tick = (intent) => { seen.push(intent); tick(intent); };
  app.frame(STEP_MS + 1, press({ pick: 1, confirm: true })); // too soon for a tick
  app.frame(2 * STEP_MS + 1, idle);
  app.frame(3 * STEP_MS + 1, idle);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].pick, 1); assert.equal(seen[0].confirm, true);
  assert.equal(seen[1].pick, -1); assert.equal(seen[1].confirm, false);
});

test('the same seed and the same intent stream through the App give the same digest', () => {
  const play = () => {
    const { app } = makeApp({ fixedSeed: 7 });
    app.frame(0, press({ confirm: true }));
    const input = press({ intent: { moveX: 1, moveY: 0, aimX: 0, aimY: -1, hasAim: true } });
    for (let i = 1; i <= 600; i++) app.frame(i * 1000 / 144, input);
    return app.game.digest();
  };
  assert.equal(play(), play());
});

// A game with enemies, projectiles and effects on screen.
function busyGame() {
  const g = new Game({ seed: 3 });
  for (let i = 0; i < 2000; i++) {
    g.tick({ moveX: i % 300 < 150 ? 1 : -1, aimX: 0, aimY: 1, hasAim: true, pick: 0 });
    if (i > 600 && g.enemies.length > 1 && g.projectiles.length > 0) break;
  }
  return g;
}

test('rendering never writes game state (world, HUD, every screen)', () => {
  const g = busyGame();
  assert.ok(g.enemies.length > 1 && g.projectiles.length > 0, 'scene has enemies and projectiles');
  g.gems = [{ id: 1, x: 10, y: 10, value: 1 }];
  const before = g.digest();
  const order = g.enemies.map((e) => e.id);
  const r = createRenderer({ atlas, makeCanvas });
  const ctx = fakeCtx();
  r.drawWorld(ctx, g);
  drawHud(ctx, g, atlas);
  drawTitle(ctx); drawPause(ctx); drawGameOver(ctx, g);
  assert.equal(g.digest(), before);
  assert.deepEqual(g.enemies.map((e) => e.id), order, 'enemy list order unchanged by the y-sort');
  const draws = ctx.calls.filter((c) => c[0] === 'drawImage').length;
  assert.ok(draws > g.enemies.length + g.projectiles.length, `drawImage calls: ${draws}`);
});

test('rendering the dying and over phases does not throw or write state', () => {
  const g = new Game({ seed: 1 });
  g.tick({});
  g.tower.hp = 0;
  const r = createRenderer({ atlas, makeCanvas });
  for (let i = 0; i < 130; i++) {
    g.tick({});
    const before = g.digest();
    r.drawWorld(fakeCtx(), g);
    drawHud(fakeCtx(), g, atlas);
    assert.equal(g.digest(), before);
  }
  assert.equal(g.phase, 'over');
  assert.equal(g.effects.some((fx) => fx.anim === 'castle.destroy'), true);
});

test('drawAnim: centred at 2x scale, flip mirrors, scale multiplies', () => {
  const ctx = fakeCtx();
  const r = atlas.frames[atlas.anims['knight.walk'].frames[0]];
  drawAnim(ctx, atlas, 'knight.walk', 0, 100, 100);
  const [, , sx, sy, sw, sh, dx, dy, dw, dh] = ctx.calls[0];
  assert.deepEqual([sx, sy, sw, sh], [r.x, r.y, r.w, r.h]);
  assert.deepEqual([dw, dh], [r.w * 2, r.h * 2]);
  assert.deepEqual([dx, dy], [100 - r.w, 100 - r.h]);
  const c2 = fakeCtx();
  drawAnim(c2, atlas, 'castle', 0, 0, 0, { scale: 0.5 });
  assert.equal(c2.calls[0][8], 30);
  const c3 = fakeCtx();
  drawAnim(c3, atlas, 'knight.walk', 0, 0, 0, { flip: true });
  assert.ok(c3.calls.some((c) => c[0] === 'scale' && c[1] === -1 && c[2] === 1));
  const c4 = fakeCtx();
  drawAnim(c4, atlas, 'no.such.anim', 0, 0, 0);
  assert.equal(c4.calls.length, 0);
});

test('projectiles on a 16-direction sheet draw their dirFrame', () => {
  assert.ok(DIR_ANIMS.has('laser.dir') && DIR_ANIMS.has('laser.bigdir'));
  assert.equal(DIR_ANIMS.has('fireball.anim'), false);
  for (const name of DIR_ANIMS) assert.equal(atlas.anims[name].frames.length, 16, name);
});

test('enemy draw order sorts a copy by y, then id', () => {
  const list = [{ id: 3, y: 5 }, { id: 1, y: 9 }, { id: 2, y: 5 }];
  assert.deepEqual(enemyDrawOrder(list).map((e) => e.id), [2, 3, 1]);
  assert.deepEqual(list.map((e) => e.id), [3, 1, 2]);
});

test('background: fixed-seed tile, independent of game.rng; tile start wraps the offset', () => {
  assert.deepEqual(grassSpeckles(), grassSpeckles());
  const g = new Game({ seed: 5 });
  const before = g.rng();
  const g2 = new Game({ seed: 5 });
  createRenderer({ atlas, makeCanvas }).drawWorld(fakeCtx(), g2);
  assert.equal(g2.rng(), before);
  assert.equal(tileStart(0), -64);
  assert.equal(tileStart(10), -54);
  assert.equal(tileStart(-10), -10);
  assert.equal(tileStart(130), -62);
});

test('HUD: m:ss timer, icons for every weapon and buff, weapons before buffs', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(59.99), '0:59');
  assert.equal(formatTime(61), '1:01');
  assert.equal(formatTime(300), '5:00');
  for (const id of WEAPON_IDS) assert.ok(atlas.anims[WEAPON_ICONS[id].anim], id);
  assert.equal(WEAPON_ICONS.laser.frame, 12);
  assert.equal(WEAPON_ICONS.miniTower.scale, 0.5);
  for (const id of BUFF_IDS) assert.ok(atlas.anims[buffIcon(id).anim], id);
  const slots = iconSlots([{ id: 'fireball', level: 2 }, { id: 'ring', level: 1 }], [{ id: 'damage', level: 3 }]);
  assert.deepEqual(slots.map((s) => s.id), ['fireball', 'ring', 'damage']);
  assert.ok(slots[0].x < slots[1].x && slots[1].x < slots[2].x);
  assert.equal(slots[0].max, 5); assert.equal(slots[2].max, 3);
});

test('game-over lines show time, level, kills and score', () => {
  const g = new Game({ seed: 1 });
  for (let i = 0; i < 125; i++) g.tick({});
  g.kills = 7; // test only
  assert.deepEqual(gameOverLines(g), ['Time   0:02', 'Level  1', 'Kills  7', `Score  ${2 + 7}`]);
});
