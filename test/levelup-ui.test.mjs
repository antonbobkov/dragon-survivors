// Level-up screen under node (§14.1, §16): card layout and hit-testing, picking through the
// App with keys, clicks and d-pad + A, render purity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { App } from '../src/app.js';
import { STEP_MS } from '../src/loop.js';
import { cardRects, cardAt, drawLevelUp, fitFont, CARD } from '../src/render/screens.js';
import { createRenderer } from '../src/render/draw.js';
import { drawHud } from '../src/render/hud.js';
import { cardInfo } from '../src/sim/levelup.js';
import { VIEW_W } from '../src/viewport.js';
import { createWeapon } from '../src/sim/weapons.js';
import { xpToNext } from '../src/sim/content.js';

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
const atlas = { image: {}, frames: atlasJson.frames, anims: atlasJson.anims };

function fakeCtx() {
  const calls = [];
  return new Proxy({}, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * (parseInt(t.font, 10) || 16) * 0.6 });
      return (...args) => { calls.push([k, ...args]); return {}; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const idle = { intent: {}, pause: false, confirm: false, pick: -1, nav: 0, click: null };
const press = (o) => ({ ...idle, ...o });
const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];

// An App whose game reaches `levels` level-ups on its first tick.
function appAtLevelUp(levels = 1) {
  const app = new App({
    makeGame: (seed) => {
      const g = new Game({ seed, timeline: QUIET });
      let need = 0;
      for (let l = 1; l <= levels; l++) need += xpToNext(l);
      g.gems.push({ id: g.nextId++, x: 0, y: 0, value: need, homing: false });
      return g;
    },
    randomSeed: () => 5,
    audio: { play() {}, resume: () => Promise.resolve() },
  });
  app.frame(0, press({ confirm: true }));
  let f = 1;
  while (!app.levelUpOpen() && f < 10) app.frame(f++ * STEP_MS, idle);
  assert.ok(app.levelUpOpen(), 'level-up open');
  const step = (input = idle) => app.frame(f++ * STEP_MS, input);
  return { app, step };
}
const owns = (g, card) => card.kind === 'repair' || (card.kind === 'weapon' ? g.weapons : g.buffs).some((x) => x.id === card.id && x.level === card.level);
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

test('cards: 3 cards in a centred row, hit-testing finds each and misses the gaps', () => {
  const rs = cardRects(3);
  assert.equal(rs.length, 3);
  assert.ok(Math.abs((rs[0].x + rs[2].x + rs[2].w) / 2 - VIEW_W / 2) <= 1, 'centred');
  for (let i = 0; i < 3; i++) {
    const c = centre(rs[i]);
    assert.equal(cardAt(c.x, c.y, 3), i);
  }
  assert.equal(cardAt(rs[0].x + rs[0].w + CARD.gap / 2, rs[0].y + 10, 3), -1, 'gap');
  assert.equal(cardAt(rs[0].x + 5, rs[0].y - 5, 3), -1, 'above');
  const one = cardRects(1);
  assert.equal(one[0].x + one[0].w / 2, VIEW_W / 2);
  assert.equal(cardAt(10, 10, 0), -1);
});

test('App: keys 1/2/3 pick that card through the next tick; the world resumes after', () => {
  const { app, step } = appAtLevelUp();
  const g = app.game;
  const card = g.offers[2];
  const t0 = g.tickCount;
  step();
  step();
  assert.equal(g.tickCount, t0, 'frozen while the cards are shown');
  step(press({ pick: 2 }));
  assert.ok(owns(g, card));
  assert.equal(app.levelUpOpen(), false);
  step();
  assert.equal(g.tickCount, t0 + 1);
});

test('App: a click on a card picks it; a click elsewhere does nothing', () => {
  const { app, step } = appAtLevelUp();
  const g = app.game;
  step(press({ click: { x: 2, y: 2 } }));
  assert.ok(app.levelUpOpen());
  const card = g.offers[1];
  step(press({ click: centre(cardRects(3)[1]) }));
  assert.ok(owns(g, card));
  assert.equal(app.levelUpOpen(), false);
});

test('App: d-pad moves the highlight (clamped), A picks it; a new set of offers starts at 0', () => {
  const { app, step } = appAtLevelUp(2);
  const g = app.game;
  assert.equal(app.cardSel, 0);
  step(press({ nav: -1 }));
  assert.equal(app.cardSel, 0);
  step(press({ nav: 1 }));
  step(press({ nav: 1 }));
  step(press({ nav: 1 }));
  assert.equal(app.cardSel, 2);
  const card = g.offers[2];
  step(press({ confirm: true }));
  assert.ok(owns(g, card));
  assert.ok(app.levelUpOpen(), 'second level-up');
  assert.equal(app.cardSel, 0);
});

test('App: a pick key beyond the cards shown is ignored; pause works on the level-up screen', () => {
  const { app, step } = appAtLevelUp();
  const g = app.game;
  g.weapons = ['fireball', 'laser', 'miniTower', 'ring'].map((id) => createWeapon(id, 5));
  g.buffs = ['damage', 'cooldown', 'area', 'speed'].map((id) => ({ id, level: 3 }));
  g.offers = [{ kind: 'repair', id: 'repair', level: 1 }]; // test only: what a full build is offered
  step(press({ pick: 2 }));
  assert.ok(app.levelUpOpen());
  step(press({ pause: true }));
  assert.equal(app.screen, 'paused');
  assert.equal(app.levelUpOpen(), false);
  step(press({ pause: true }));
  assert.ok(app.levelUpOpen());
  step(press({ pick: 0 }));
  assert.equal(app.levelUpOpen(), false);
});

test('level-up screen: draws every card with its icon and never writes the game', () => {
  const { app } = appAtLevelUp(3);
  const g = app.game;
  const before = g.digest();
  const ctx = fakeCtx();
  createRenderer({ atlas, makeCanvas: () => ({ getContext: () => fakeCtx() }) }).drawWorld(ctx, g);
  drawHud(ctx, g, atlas);
  drawLevelUp(ctx, g, atlas, 1);
  assert.equal(g.digest(), before);
  const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  for (const card of g.offers) {
    const info = cardInfo(card);
    assert.ok(texts.includes(info.name) && texts.includes(info.text), info.name);
  }
  assert.ok(texts.includes('LEVEL UP'));
  assert.ok(texts.includes('2 more to pick'));
});

test('fitFont: shrinks long text to fit the card, never below the minimum', () => {
  const ctx = fakeCtx();
  assert.equal(fitFont(ctx, 'short', 200), `${CARD.textMax}px monospace`);
  const long = 'x'.repeat(30); // 30 × 0.6 × px must fit 200: px <= 11
  assert.equal(fitFont(ctx, long, 200), '11px monospace');
  assert.equal(fitFont(ctx, 'x'.repeat(500), 200), `${CARD.textMin}px monospace`);
});
