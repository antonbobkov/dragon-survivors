// Bestiary (§17.1) under node: layout, rows, bar styles, silhouettes, render purity, and the
// App and input wiring (Tab / Back opens and closes it, ticks stop).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { App } from '../src/app.js';
import { STEP_MS } from '../src/loop.js';
import { createEnemy } from '../src/sim/enemies.js';
import { readFrame, createInputState, PAD, CAPTURED_KEYS } from '../src/input.js';
import {
  BESTIARY, RESIST_COLORS, bestiaryLayout, resistStyle, bestiaryRows, animFrameAt, spriteFit, drawBestiary,
} from '../src/render/bestiary.js';
import { CONTROLS } from '../src/render/screens.js';
import { ENEMY_TYPES, ENEMIES, GOLEM_KNOCKBACK } from '../src/sim/content.js';
import { VIEW_W, VIEW_H } from '../src/viewport.js';

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));

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

// ---- layout and styles -------------------------------------------------------------

test('layout: every type gets a card inside the screen, two centred columns, no overlaps; 10 types still fit', () => {
  for (const n of [ENEMY_TYPES.length, 9, 10]) {
    const rs = bestiaryLayout(n);
    assert.equal(rs.length, n);
    for (const r of rs) {
      assert.ok(r.x >= 0 && r.x + r.w <= VIEW_W, `x in view (${n})`);
      assert.ok(r.y >= BESTIARY.top && r.y + r.h <= BESTIARY.bottom, `y between title and hint (${n})`);
      assert.ok(r.h >= 3 * BESTIARY.rowH, 'three resistance rows fit');
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = rs[i], b = rs[j];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `cards ${i} and ${j} overlap`);
    }
    const left = rs[0].x, right = rs[1].x + rs[1].w;
    assert.ok(Math.abs(left - (VIEW_W - right)) <= 1, 'centred');
  }
  assert.ok(BESTIARY.hintY > BESTIARY.bottom && BESTIARY.hintY + 16 <= VIEW_H);
  assert.ok(BESTIARY.barsX + BESTIARY.nameW + BESTIARY.barW + 8 + 'resist 75%'.length * 8.4 <= BESTIARY.cardW, 'labels fit the card at 14 px');
  // name + three stat lines (HP/XP, SPD/DPS, MASS) fit the shortest card (10 types), and the
  // widest stat line fits between the text column and the bars at 14 px
  const h = bestiaryLayout(10)[0].h;
  const top = Math.round((h - 3 * BESTIARY.rowH) / 2) + 2;
  assert.ok(top + BESTIARY.rowH + 2 * BESTIARY.statH + 14 <= h, `stat lines fit a ${h} px card`);
  assert.ok(BESTIARY.textX + 'SPD 27.5  DPS 10'.length * 8.4 <= BESTIARY.barsX + 4);
});

test('resistance bars: red weak, grey neutral, blue resists, gold immune, with the percentage', () => {
  assert.deepEqual(resistStyle(-0.5), { label: 'weak 50%', color: RESIST_COLORS.weak, fill: 0.5 });
  assert.deepEqual(resistStyle(-0.25), { label: 'weak 25%', color: RESIST_COLORS.weak, fill: 0.25 });
  assert.deepEqual(resistStyle(0), { label: '0%', color: RESIST_COLORS.neutral, fill: 0 });
  assert.deepEqual(resistStyle(0.75), { label: 'resist 75%', color: RESIST_COLORS.resist, fill: 0.75 });
  assert.deepEqual(resistStyle(1), { label: 'immune', color: RESIST_COLORS.immune, fill: 1 });
  assert.equal(new Set(Object.values(RESIST_COLORS)).size, 4);
});

test('rows: met types show name, stats and resistances; others are ???; the golem takes no damage', () => {
  const g = new Game({ seed: 1, meta: { shred: { arcane: 0.25 } } });
  createEnemy(g, 'ghost', 0, 0);
  createEnemy(g, 'golem', 0, 0);
  const rows = bestiaryRows(g);
  assert.deepEqual(rows.map((r) => r.type), ENEMY_TYPES);
  const ghost = rows.find((r) => r.type === 'ghost');
  assert.equal(ghost.seen, true);
  assert.equal(ghost.name, 'Ghost');
  assert.deepEqual(ghost.stats, [`HP ${ENEMIES.ghost.hp}  XP ${ENEMIES.ghost.xp}`, `SPD ${ENEMIES.ghost.speed}  DPS ${ENEMIES.ghost.dps}`, `MASS ${ENEMIES.ghost.mass}`]);
  assert.deepEqual(ghost.resists.map((r) => [r.name, r.r, r.label]),
    [['Fire', 0.25, 'resist 25%'], ['Arcane', -0.5, 'weak 50%'], ['Physical', 0.75, 'resist 75%']], 'arcane −0.5 − 0.25 floors at −0.5');
  const knight = rows.find((r) => r.type === 'knight');
  assert.deepEqual([knight.seen, knight.name, knight.stats, knight.resists], [false, '???', [], []]);
  const golem = rows.find((r) => r.type === 'golem');
  assert.equal(golem.unkillable, true);
  assert.deepEqual(golem.resists, []);
  assert.match(golem.stats[0], /^HP ∞/);
  assert.equal(golem.stats[2], `KNOCKBACK ${GOLEM_KNOCKBACK}`, 'the golem has no mass: its fixed push per hit');
  assert.equal(ghost.stats[2], 'MASS 0.6');
});

test('anim frames loop over the atlas durations; sprites fit their box', () => {
  assert.equal(animFrameAt([6, 6], 0), 0);
  assert.equal(animFrameAt([6, 6], 5.9), 0);
  assert.equal(animFrameAt([6, 6], 6), 1);
  assert.equal(animFrameAt([6, 6], 12), 0);
  assert.equal(animFrameAt([2, 4, 6], 7), 2);
  assert.equal(animFrameAt([], 7), 0);
  assert.equal(spriteFit(16, 16, BESTIARY.spriteBox), 1);
  assert.equal(spriteFit(64, 64, BESTIARY.spriteBox), 0.5);
});

// ---- drawing -----------------------------------------------------------------------

test('draw: walks animate for met types, silhouettes for the rest; the game is not written', () => {
  const atlas = { image: { fake: 'image' }, frames: atlasJson.frames, anims: atlasJson.anims };
  const g = new Game({ seed: 4 });
  for (let i = 0; i < 200; i++) g.tick({});
  createEnemy(g, 'mage', 300, 0);
  const before = g.digest();
  const made = [];
  const makeCanvas = (w, h) => { const ctx = fakeCtx(); const c = { w, h, ctx, getContext: () => ctx }; made.push(c); return c; };
  const ctx = fakeCtx();
  drawBestiary(ctx, g, atlas, 0, { makeCanvas });
  assert.equal(g.digest(), before);
  const images = ctx.calls.filter((c) => c[0] === 'drawImage');
  assert.equal(images.length, ENEMY_TYPES.length, 'one sprite per type');
  const unseen = ENEMY_TYPES.filter((t) => !g.seen.includes(t));
  assert.equal(images.filter((c) => c[1] !== atlas.image).length, unseen.length, 'unseen types draw a silhouette canvas');
  assert.equal(made.length, unseen.length);
  for (const c of made) {
    assert.ok(c.ctx.calls.some((x) => x[0] === 'fillRect'), 'silhouette filled');
    assert.equal(c.ctx.globalCompositeOperation, 'source-in');
  }
  // Silhouettes are cached per atlas frame; a later frame animates the walks.
  const ctx2 = fakeCtx();
  drawBestiary(ctx2, g, atlas, 1000 * 6 / 60, { makeCanvas });
  assert.equal(made.length, unseen.length, 'cached');
  const mageFrames = atlas.anims['mage.walk'].frames.map((f) => atlas.frames[f]);
  const src = (c) => [c[2], c[3]];
  const drawn = (calls) => calls.filter((c) => c[0] === 'drawImage' && c[1] === atlas.image).map(src);
  assert.ok(drawn(ctx.calls).some(([x, y]) => x === mageFrames[0].x && y === mageFrames[0].y));
  assert.ok(drawn(ctx2.calls).some(([x, y]) => x === mageFrames[1].x && y === mageFrames[1].y), 'frame 1 after 6 ticks');
});

// ---- input and App -------------------------------------------------------------------

test('input: Tab and gamepad Back are bestiary edges; Tab\'s browser default is suppressed', () => {
  const raw = (o) => ({ held: new Set(), pressed: [], clicks: [], mouse: null, mouseMoved: false, pad: null, dragon: { x: 480, y: 300 }, ...o });
  const s = createInputState();
  assert.equal(readFrame(raw({ pressed: ['Tab'] }), s).bestiary, true);
  assert.equal(readFrame(raw({ held: new Set(['Tab']) }), s).bestiary, false, 'held is not a press');
  const pad = (b) => { const buttons = Array(17).fill(false); for (const i of b) buttons[i] = true; return { axes: [0, 0, 0, 0], buttons }; };
  assert.equal(PAD.BACK, 8);
  assert.equal(readFrame(raw({ pad: pad([PAD.BACK]) }), s).bestiary, true);
  assert.equal(readFrame(raw({ pad: pad([PAD.BACK]) }), s).bestiary, false, 'edge');
  assert.ok(CAPTURED_KEYS.has('Tab'));
  assert.ok(CONTROLS.some((l) => /Tab/.test(l) && /Back/.test(l)), 'the controls list names it');
});

const idle = { intent: {}, pause: false, bestiary: false, confirm: false, pick: -1, nav: 0, click: null };
const press = (o) => ({ ...idle, ...o });

function playing() {
  const app = new App({
    makeGame: (seed) => new Game({ seed }),
    randomSeed: () => 7,
    audio: { play() {}, resume: () => Promise.resolve() },
  });
  let f = 0;
  const step = (input = idle) => app.frame(f++ * STEP_MS, input);
  return { app, step };
}

test('App: Tab opens the bestiary from play and stops ticks; Tab or Esc closes it back to play', () => {
  const { app, step } = playing();
  step(press({ bestiary: true }));
  assert.equal(app.screen, 'title', 'ignored on the title');
  step(press({ confirm: true }));
  for (let i = 0; i < 10; i++) step();
  step(press({ bestiary: true }));
  assert.equal(app.screen, 'bestiary');
  const t0 = app.game.tickCount;
  for (let i = 0; i < 60; i++) step();
  assert.equal(app.game.tickCount, t0, 'no ticks while open');
  step(press({ bestiary: true }));
  assert.equal(app.screen, 'play');
  step(press({ bestiary: true }));
  step(press({ pause: true }));
  assert.equal(app.screen, 'play', 'Esc closes it');
  const t1 = app.game.tickCount;
  for (let i = 0; i < 3; i++) step();
  assert.equal(app.game.tickCount - t1, 3, 'resumes one tick per frame, no backlog');
});

test('App: opened from pause it returns to pause; blur keeps it open; ignored once the run is over', () => {
  const { app, step } = playing();
  step(press({ confirm: true }));
  step(press({ pause: true }));
  assert.equal(app.screen, 'paused');
  step(press({ bestiary: true }));
  assert.equal(app.screen, 'bestiary');
  app.blur();
  assert.equal(app.screen, 'bestiary');
  step(press({ bestiary: true }));
  assert.equal(app.screen, 'paused');
  step(press({ pause: true }));
  assert.equal(app.screen, 'play');
  app.game.tower.hp = 0; // test only: force the fall
  for (let i = 0; i < 140; i++) step();
  assert.equal(app.game.phase, 'over');
  step(press({ bestiary: true }));
  assert.equal(app.screen, 'play', 'the game-over screen stays');
});
