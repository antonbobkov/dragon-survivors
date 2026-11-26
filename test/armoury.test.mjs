// Gold and the armoury (§13.1): purse maths, storage wrapper, ranks -> meta, the App flow
// title <-> armoury and the game-over payout, the screen's layout, input and the
// instrument's --meta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { App } from '../src/app.js';
import { STEP_MS } from '../src/loop.js';
import { readFrame, createInputState, PAD } from '../src/input.js';
import {
  ARMOURY_KEY, MAX_RANK, goldFor, rankCost, spentOn, freshPurse, normalizePurse, buy, canBuy, nextCost,
  refundAll, totalSpent, addGold, metaFromRanks, createStore, trackText,
} from '../src/armoury.js';
import {
  armouryRects, armouryItemAt, armouryNav, cellItem, cellInfo, drawArmoury, CELLS, RESET, BACK, ITEMS, ARMOURY,
} from '../src/render/armoury.js';
import { drawTitle, drawGameOver, gameOverLines, ARMOURY_BUTTON, BUTTON } from '../src/render/screens.js';
import { VIEW_W, VIEW_H } from '../src/viewport.js';
import { parseMeta, runOne } from '../tools/measure.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// A Storage-like object kept in a Map, or one that throws on every call.
function memoryStorage() {
  const m = new Map();
  return { map: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
}
const throwingStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };

const purseWith = (gold, set = {}) => {
  const p = freshPurse();
  p.gold = gold;
  for (const [k, v] of Object.entries(set)) { const [track, type] = k.split('.'); p.ranks[track][type] = v; }
  return p;
};

test('gold: floor(score / 20)', () => {
  assert.equal(goldFor(0), 0);
  assert.equal(goldFor(19), 0);
  assert.equal(goldFor(20), 1);
  assert.equal(goldFor(1299), 64);
  assert.equal(goldFor(NaN), 0);
  assert.equal(goldFor(-40), 0);
});

test('rank costs: rank n costs 20 n²; a full track costs 1100', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(rankCost), [20, 80, 180, 320, 500]);
  assert.equal(spentOn(MAX_RANK), 1100);
  assert.equal(spentOn(0), 0);
});

test('buying takes the next rank cost; unaffordable or maxed buys nothing; the old purse is untouched', () => {
  const p = purseWith(100);
  assert.equal(nextCost(p, 'power', 'fire'), 20);
  const a = buy(p, 'power', 'fire');
  assert.equal(a.gold, 80);
  assert.equal(a.ranks.power.fire, 1);
  assert.equal(p.ranks.power.fire, 0, 'pure');
  const b = buy(a, 'power', 'fire');
  assert.equal(b.gold, 0);
  assert.equal(b.ranks.power.fire, 2);
  assert.equal(canBuy(b, 'power', 'fire'), false);
  assert.equal(buy(b, 'shred', 'arcane'), null, 'no gold');
  const maxed = purseWith(9999, { 'shred.physical': MAX_RANK });
  assert.equal(nextCost(maxed, 'shred', 'physical'), null);
  assert.equal(buy(maxed, 'shred', 'physical'), null);
});

test('refund sells every rank back for what it cost', () => {
  const p = purseWith(7, { 'power.fire': 3, 'shred.arcane': 1, 'power.physical': 5 });
  assert.equal(totalSpent(p), 280 + 20 + 1100);
  const r = refundAll(p);
  assert.equal(r.gold, 7 + 1400);
  assert.equal(totalSpent(r), 0);
  assert.equal(addGold(r, 12.9).gold, 1419);
  assert.equal(addGold(r, -5).gold, 1407);
});

test('a purse from untrusted data is clamped and defaulted', () => {
  assert.deepEqual(normalizePurse(null), freshPurse());
  assert.deepEqual(normalizePurse('junk'), freshPurse());
  const p = normalizePurse({ gold: 12.7, ranks: { power: { fire: 9, arcane: -2, physical: 'x' }, shred: { fire: 2.5 } } });
  assert.equal(p.gold, 12);
  assert.deepEqual(p.ranks.power, { fire: MAX_RANK, arcane: 0, physical: 0 });
  assert.deepEqual(p.ranks.shred, { fire: 2, arcane: 0, physical: 0 });
  assert.equal(normalizePurse({ gold: -5 }).gold, 0);
  assert.equal(normalizePurse({ gold: Infinity }).gold, 0);
});

test('ranks -> meta: power 1 + 0.08 × rank, shred 0.1 × rank', () => {
  const m = metaFromRanks(purseWith(0, { 'power.fire': 3, 'shred.fire': 1, 'shred.arcane': 5 }).ranks);
  close(m.power.fire, 1.24); close(m.power.arcane, 1); close(m.power.physical, 1);
  close(m.shred.fire, 0.1); close(m.shred.arcane, 0.5); close(m.shred.physical, 0);
  const g = new Game({ seed: 1, meta: m });
  close(g.meta.power.fire, 1.24);
  assert.deepEqual(metaFromRanks(freshPurse().ranks), { power: { fire: 1, arcane: 1, physical: 1 }, shred: { fire: 0, arcane: 0, physical: 0 } });
});

test('store: round trip under the v1 key; storage that throws or holds junk gives a fresh purse', () => {
  const s = memoryStorage();
  const store = createStore(() => s);
  assert.deepEqual(store.load(), freshPurse(), 'empty storage');
  const p = purseWith(42, { 'power.arcane': 2 });
  assert.equal(store.save(p), true);
  assert.deepEqual(JSON.parse(s.map.get(ARMOURY_KEY)), p);
  assert.deepEqual(createStore(() => s).load(), p, 'a new store (a reload) reads it back');
  s.setItem(ARMOURY_KEY, '{not json');
  assert.deepEqual(store.load(), freshPurse());

  const bad = createStore(() => throwingStorage);
  assert.deepEqual(bad.load(), freshPurse());
  assert.equal(bad.save(p), false);
  const blocked = createStore(() => { throw new Error('SecurityError'); });
  assert.deepEqual(blocked.load(), freshPurse());
  assert.equal(blocked.save(p), false);
  const none = createStore(null);
  assert.deepEqual(none.load(), freshPurse());
  assert.equal(none.save(p), false);
});

// ---- App flow ----------------------------------------------------------------------

const idle = { intent: {}, pause: false, bestiary: false, armoury: false, back: false, confirm: false, pick: -1, nav: 0, menu: { x: 0, y: 0 }, click: null };
const press = (o) => ({ ...idle, ...o });
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

function makeApp({ storage = memoryStorage(), fixedSeed = null } = {}) {
  const built = [];
  const played = [];
  let next = 100;
  const app = new App({
    makeGame: (seed, meta) => { built.push({ seed, meta }); return new Game({ seed, meta }); },
    fixedSeed,
    randomSeed: () => next++,
    audio: { play: (n) => { played.push(n); return true; }, resume: () => Promise.resolve() },
    store: createStore(() => storage),
  });
  let f = 0;
  const step = (input = idle) => app.frame(f++ * STEP_MS, input);
  return { app, step, storage, built, played };
}

test('App: U / Y or the Armoury button opens the armoury from the title; Esc, U, B or Back close it', () => {
  const { app, step } = makeApp();
  step(press({ armoury: true }));
  assert.equal(app.screen, 'armoury');
  for (let i = 0; i < 30; i++) step();
  assert.equal(app.game.tickCount, 0, 'no ticks in the armoury');
  step(press({ pause: true }));
  assert.equal(app.screen, 'title');
  step(press({ click: centre(ARMOURY_BUTTON) }));
  assert.equal(app.screen, 'armoury');
  step(press({ back: true }));
  assert.equal(app.screen, 'title');
  step(press({ armoury: true }));
  step(press({ armoury: true }));
  assert.equal(app.screen, 'title');
  step(press({ armoury: true }));
  step(press({ click: centre(armouryRects()[BACK]) }));
  assert.equal(app.screen, 'title', 'the Back button');
  step(press({ click: centre(BUTTON) }));
  assert.equal(app.screen, 'play', 'any other click starts');
  step(press({ armoury: true }));
  assert.equal(app.screen, 'play', 'U does nothing during a run');
});

test('App: buying with Enter / A and clicks, saved at once; the run then uses the ranks', () => {
  const storage = memoryStorage();
  storage.setItem(ARMOURY_KEY, JSON.stringify({ gold: 120, ranks: {} }));
  const { app, step, built, played } = makeApp({ storage });
  assert.equal(app.purse.gold, 120);
  const title = app.game;
  step(press({ armoury: true }));
  assert.equal(app.armourySel, 0);
  step(press({ confirm: true })); // Fire Power rank 1: 20
  assert.equal(app.purse.ranks.power.fire, 1);
  assert.equal(app.purse.gold, 100);
  assert.ok(played.includes('powerup'));
  step(press({ menu: { x: 0, y: 1 } })); // down to Fire Shred
  assert.equal(app.armourySel, 3);
  step(press({ confirm: true }));
  assert.equal(app.purse.ranks.shred.fire, 1);
  step(press({ click: centre(armouryRects()[4]) })); // Arcane Shred
  assert.equal(app.armourySel, 4);
  assert.equal(app.purse.ranks.shred.arcane, 1);
  assert.equal(app.purse.gold, 60);
  step(press({ confirm: true })); // Arcane Shred rank 2 costs 80: not enough
  assert.equal(app.purse.ranks.shred.arcane, 1);
  assert.equal(app.purse.gold, 60);
  assert.deepEqual(JSON.parse(storage.map.get(ARMOURY_KEY)), app.purse, 'saved');

  step(press({ pause: true }));
  assert.notEqual(app.game, title, 'the title game is rebuilt with the new ranks');
  assert.equal(app.game.seed, title.seed, 'same seed');
  assert.equal(built.length, 2);
  step(press({ confirm: true }));
  assert.equal(app.screen, 'play');
  close(app.game.meta.power.fire, 1.08);
  close(app.game.meta.shred.fire, 0.1);
  close(app.game.meta.shred.arcane, 0.1);
  assert.deepEqual(app.game.snapshot().meta, app.game.meta, 'meta is part of the snapshot');

  // A reload: a new App on the same storage sees the same purse and builds its games with it.
  const again = makeApp({ storage });
  assert.deepEqual(again.app.purse, app.purse);
  close(again.app.game.meta.power.fire, 1.08);
});

test('App: Reset needs a confirm, refunds everything, and is disarmed by moving away', () => {
  const storage = memoryStorage();
  storage.setItem(ARMOURY_KEY, JSON.stringify(purseWith(5, { 'power.fire': 2, 'shred.physical': 1 })));
  const { app, step } = makeApp({ storage });
  step(press({ armoury: true }));
  step(press({ click: centre(armouryRects()[RESET]) }));
  assert.equal(app.armourySel, RESET);
  assert.equal(app.resetArmed, true);
  assert.equal(app.purse.gold, 5, 'nothing refunded yet');
  step(press({ menu: { x: 1, y: 0 } }));
  assert.equal(app.armourySel, BACK);
  assert.equal(app.resetArmed, false, 'moving away disarms');
  step(press({ menu: { x: -1, y: 0 } }));
  step(press({ confirm: true }));
  assert.equal(app.resetArmed, true);
  step(press({ confirm: true }));
  assert.equal(app.resetArmed, false);
  assert.equal(app.purse.gold, 5 + 100 + 20);
  assert.equal(totalSpent(app.purse), 0);
  assert.deepEqual(JSON.parse(storage.map.get(ARMOURY_KEY)), app.purse);
  step(press({ confirm: true }));
  assert.equal(app.resetArmed, false, 'nothing to refund: Reset does not arm');
});

test('App: game over pays floor(score / 20) gold once, saves it, and Retry uses the ranks', () => {
  const storage = memoryStorage();
  storage.setItem(ARMOURY_KEY, JSON.stringify(purseWith(3, { 'power.arcane': 1 })));
  const { app, step, built } = makeApp({ storage });
  step(press({ confirm: true }));
  for (let i = 0; i < 90; i++) step();
  app.game.kills = 57; // test only: a score worth some gold
  app.game.tower.hp = 0; // test only: force the fall
  assert.equal(app.goldLine(), null);
  for (let i = 0; i < 130; i++) step();
  assert.equal(app.game.phase, 'over');
  const score = app.game.score();
  assert.ok(score >= 58);
  assert.equal(app.goldEarned, goldFor(score));
  assert.equal(app.purse.gold, 3 + goldFor(score));
  assert.deepEqual(app.goldLine(), { earned: goldFor(score), purse: 3 + goldFor(score) });
  for (let i = 0; i < 30; i++) step();
  assert.equal(app.purse.gold, 3 + goldFor(score), 'paid once');
  assert.equal(JSON.parse(storage.map.get(ARMOURY_KEY)).gold, 3 + goldFor(score));
  step(press({ confirm: true }));
  assert.equal(app.screen, 'play');
  close(built[built.length - 1].meta.power.arcane, 1.08);
  close(app.game.meta.power.arcane, 1.08);
});

test('App: with storage unavailable the armoury still works for the session', () => {
  const { app, step } = makeApp({ storage: throwingStorage });
  assert.deepEqual(app.purse, freshPurse());
  app.purse = purseWith(20); // test only: as if a run had paid out
  step(press({ armoury: true }));
  step(press({ confirm: true }));
  assert.equal(app.purse.ranks.power.fire, 1);
  assert.equal(app.purse.gold, 0);
});

test('App: ?seed runs use the armoury too, and the same ranks give the same digest', () => {
  const play = () => {
    const storage = memoryStorage();
    storage.setItem(ARMOURY_KEY, JSON.stringify(purseWith(0, { 'power.fire': 4, 'shred.fire': 2 })));
    const { app, step } = makeApp({ storage, fixedSeed: 9 });
    step(press({ confirm: true }));
    const input = press({ intent: { moveX: 1, moveY: 0, aimX: 0, aimY: -1, hasAim: true } });
    for (let i = 0; i < 900; i++) step(input);
    return app.game;
  };
  const a = play(), b = play();
  assert.equal(a.digest(), b.digest());
  close(a.meta.power.fire, 1.32);
  const plain = new Game({ seed: 9 });
  assert.notEqual(plain.digest(), new Game({ seed: 9, meta: a.meta }).digest(), 'meta is in the digest');
});

// ---- screen, input, instrument -----------------------------------------------------

test('armoury layout: everything inside 960×600, no overlaps, hit testing finds each item', () => {
  const rects = armouryRects();
  assert.equal(rects.length, ITEMS);
  rects.forEach((r, i) => {
    assert.ok(r.x >= 0 && r.y > ARMOURY.goldY && r.x + r.w <= VIEW_W && r.y + r.h <= VIEW_H, `item ${i} on screen`);
    assert.equal(armouryItemAt(centre(r).x, centre(r).y), i);
    for (let j = 0; j < i; j++) {
      const o = rects[j];
      assert.ok(r.x >= o.x + o.w || o.x >= r.x + r.w || r.y >= o.y + o.h || o.y >= r.y + r.h, `items ${i} and ${j} overlap`);
    }
  });
  assert.ok(rects[RESET].y + rects[RESET].h < ARMOURY.msgY);
  assert.equal(armouryItemAt(5, 5), -1);
  assert.deepEqual(cellItem(0), { track: 'power', type: 'fire' });
  assert.deepEqual(cellItem(CELLS - 1), { track: 'shred', type: 'physical' });
  // The title's Armoury button sits below Start and its hint, inside the screen.
  assert.ok(ARMOURY_BUTTON.y > BUTTON.y + BUTTON.h + 30 && ARMOURY_BUTTON.y + ARMOURY_BUTTON.h <= VIEW_H);
});

test('armoury navigation: a 3×2 grid with Reset under the first two columns and Back under the third', () => {
  assert.equal(armouryNav(0, 1, 0), 1);
  assert.equal(armouryNav(2, 1, 0), 2, 'stays at the edge');
  assert.equal(armouryNav(0, -1, 0), 0);
  assert.equal(armouryNav(0, 0, -1), 0);
  assert.equal(armouryNav(1, 0, 1), 4);
  assert.equal(armouryNav(3, 0, 1), RESET);
  assert.equal(armouryNav(4, 0, 1), RESET);
  assert.equal(armouryNav(5, 0, 1), BACK);
  assert.equal(armouryNav(RESET, 1, 0), BACK);
  assert.equal(armouryNav(BACK, -1, 0), RESET);
  assert.equal(armouryNav(RESET, 0, -1), 3);
  assert.equal(armouryNav(BACK, 0, -1), 5);
  assert.equal(armouryNav(BACK, 0, 1), BACK);
});

test('armoury cells: one line per rank effect, the next cost coloured by affordability', () => {
  const p = purseWith(30, { 'power.fire': 2, 'shred.arcane': MAX_RANK });
  const fire = cellInfo(p, 0);
  assert.equal(fire.title, 'Fire Power');
  assert.equal(fire.effect, '+8% fire damage per rank');
  assert.equal(fire.now, 'Now +16% damage');
  assert.equal(fire.cost, 'Next rank: 180 gold');
  assert.equal(fire.costColor, '#e0533a', 'cannot afford');
  assert.equal(cellInfo(p, 1).costColor, '#7dff6a', 'can afford 20');
  const arc = cellInfo(p, 4);
  assert.equal(arc.effect, '-10% enemy arcane resist per rank');
  assert.equal(arc.now, 'Now -50% resist');
  assert.equal(arc.cost, 'Max rank');
  assert.deepEqual(trackText('shred', 'Physical', 0), { effect: '-10% enemy physical resist per rank', now: '-0% resist' });
});

test('drawing the armoury, title and game over with gold does not throw or write the purse', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 9 });
      return (...a) => { calls.push([k, ...a]); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const p = purseWith(77, { 'power.fire': 1 });
  const before = JSON.stringify(p);
  for (let sel = 0; sel < ITEMS; sel++) drawArmoury(ctx, p, sel, sel === RESET);
  assert.equal(JSON.stringify(p), before);
  const texts = calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.ok(texts.includes('ARMOURY') && texts.includes('Gold 77') && texts.includes('Confirm reset'));
  drawTitle(ctx, 77);
  assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === 'Gold 77'));
  const g = new Game({ seed: 1 });
  drawGameOver(ctx, g, { earned: 4, purse: 81 });
  assert.equal(gameOverLines(g).length, 4);
  assert.equal(gameOverLines(g, { earned: 4, purse: 81 })[4], 'Gold   +4  (81 in purse)');
});

const raw = (o = {}) => ({ held: new Set(), pressed: [], clicks: [], mouse: null, mouseMoved: false, pad: null, dragon: { x: 480, y: 300 }, ...o });
const pad = (pressed = []) => {
  const buttons = Array(17).fill(false);
  for (const i of pressed) buttons[i] = true;
  return { axes: [0, 0, 0, 0], buttons };
};

test('input: U and gamepad Y are `armoury`, gamepad B is `back`, move keys and the d-pad step `menu`', () => {
  const s = createInputState();
  const f = readFrame(raw({ pressed: ['KeyU', 'ArrowDown'] }), s);
  assert.equal(f.armoury, true);
  assert.deepEqual(f.menu, { x: 0, y: 1 });
  assert.equal(readFrame(raw({ held: new Set(['KeyU', 'ArrowDown']) }), s).armoury, false, 'held is not an edge');
  assert.deepEqual(readFrame(raw({ pressed: ['KeyA'] }), s).menu, { x: -1, y: 0 });
  const p = createInputState();
  let g = readFrame(raw({ pad: pad([PAD.Y]) }), p);
  assert.equal(g.armoury, true);
  g = readFrame(raw({ pad: pad([PAD.Y]) }), p);
  assert.equal(g.armoury, false, 'one per press');
  g = readFrame(raw({ pad: pad([PAD.B, PAD.UP]) }), p);
  assert.equal(g.back, true);
  assert.deepEqual(g.menu, { x: 0, y: -1 });
  g = readFrame(raw({ pad: pad([PAD.RIGHT]) }), p);
  assert.deepEqual(g.menu, { x: 1, y: 0 });
  assert.equal(g.nav, 1, 'the level-up d-pad still works');
});

test('measure --meta: type:power/shred ranks, mapped as the browser maps them', () => {
  const { ranks, meta } = parseMeta('fire:3/1, arcane:0/2');
  assert.deepEqual(ranks.power, { fire: 3, arcane: 0, physical: 0 });
  assert.deepEqual(ranks.shred, { fire: 1, arcane: 2, physical: 0 });
  assert.deepEqual(meta, metaFromRanks(ranks));
  assert.deepEqual(parseMeta('').ranks, freshPurse().ranks);
  assert.throws(() => parseMeta('ice:1/1'));
  assert.throws(() => parseMeta('fire:6/0'));
  assert.throws(() => parseMeta('fire:1'));
  const plain = runOne({ policy: 'aim', pick: 'greedy', seed: 4, maxSeconds: 20 });
  const neutral = runOne({ policy: 'aim', pick: 'greedy', seed: 4, maxSeconds: 20, meta: parseMeta('fire:0/0').meta });
  assert.equal(neutral.kills, plain.kills);
  const strong = runOne({ policy: 'aim', pick: 'greedy', seed: 4, maxSeconds: 20, meta: parseMeta('fire:5/5').meta });
  assert.ok(strong.capped);
});
