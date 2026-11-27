// Browser entry: load assets, build the App (Game + screens), start the loop.
import { Game } from './sim/game.js';
import { loadAssets } from './assets.js';
import { createAudio } from './audio.js';
import { attachInput, createInputState, readFrame } from './input.js';
import { startLoop } from './loop.js';
import { App } from './app.js';
import { VIEW_W, VIEW_H, fitScale, dragonScreen } from './viewport.js';
import { createRenderer } from './render/draw.js';
import { drawHud, shadowText } from './render/hud.js';
import { drawTitle, drawPause, drawGameOver, drawLevelUp } from './render/screens.js';
import { drawBestiary } from './render/bestiary.js';
import { drawArmoury } from './render/armoury.js';
import { createStore } from './armoury.js';
import { drawDebugWorld, drawDebugStats } from './render/debug.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function fit() {
  const s = fitScale(window.innerWidth, window.innerHeight);
  canvas.style.width = `${Math.floor(VIEW_W * s)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * s)}px`;
}
window.addEventListener('resize', fit);
fit();

function parseSeed(search) {
  const v = new URLSearchParams(search).get('seed');
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n >>> 0 : null;
}
const randomSeed = () => Math.floor(Math.random() * 2 ** 32) >>> 0;

function message(text) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  shadowText(ctx, text, VIEW_W / 2, VIEW_H / 2, { align: 'center', baseline: 'middle' });
}

async function boot() {
  message('Loading...');
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = AC ? new AC() : null;
  const { atlas, sounds } = await loadAssets(actx);
  const audio = createAudio(actx, sounds);
  const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const renderer = createRenderer({ atlas, makeCanvas });

  // §19: ?debug=1 turns on the debug tools and exposes the App as `app` in the console
  // (read it; do not write it).
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  // §5: ?shake=0 turns the screen shake off.
  const shake = new URLSearchParams(location.search).get('shake') !== '0';
  const app = new App({
    makeGame: (seed, meta) => new Game({ seed, debug, meta }),
    fixedSeed: parseSeed(location.search),
    randomSeed,
    audio,
    debug,
    shake,
    now: () => performance.now(),
    // §13.1: the purse lives in localStorage; reading `window.localStorage` itself can throw.
    store: createStore(() => window.localStorage),
  });
  if (debug) window.app = app;

  const input = attachInput(canvas, window, { debug });
  input.onGesture(() => audio.resume());
  const inputState = createInputState();
  window.addEventListener('blur', () => app.blur());
  document.addEventListener('visibilitychange', () => { if (document.hidden) app.blur(); });

  startLoop((f) => requestAnimationFrame(f), (now) => {
    const frame = readFrame(input.poll(dragonScreen(app.game.dragon)), inputState);
    app.frame(now, frame);
    const game = app.game;
    const shakeOffset = app.shake.offset(now); // §5: the world shakes, the HUD does not
    renderer.drawWorld(ctx, game, shakeOffset);
    if (debug) drawDebugWorld(ctx, game, shakeOffset);
    if (app.screen === 'title') { drawTitle(ctx, app.purse.gold); return; }
    if (app.screen === 'armoury') { drawArmoury(ctx, app.purse, app.armourySel, app.resetArmed); return; }
    drawHud(ctx, game, atlas);
    if (debug) drawDebugStats(ctx, game, app.stats, app.speed);
    if (app.screen === 'bestiary') drawBestiary(ctx, game, atlas, now, { makeCanvas });
    else if (app.screen === 'paused') drawPause(ctx);
    else if (game.phase === 'over') drawGameOver(ctx, game, app.goldLine());
    else if (app.levelUpOpen()) drawLevelUp(ctx, game, atlas, app.cardSel);
  });
}

boot().catch((err) => {
  console.error(err);
  message(`Failed to start: ${err.message}`);
});
