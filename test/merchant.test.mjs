// The merchant (§14.3): schedule and route, trading (the shop, frozen world, picks in the
// intent), robbing (every weapon's hit, fleeing, the chest), the level-up reroll, determinism,
// the App's shop flow, input, rendering and the art.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { spawnProjectile, explode } from '../src/sim/projectiles.js';
import { createWeapon, buffMods, collideRing } from '../src/sim/weapons.js';
import { collideSlashes } from '../src/sim/claws.js';
import { collideBlades } from '../src/sim/saw.js';
import { bomb, pickupLifeTicks } from '../src/sim/braziers.js';
import { createMerchant, MERCHANT_INTERVAL_TICKS, MERCHANT_FLEE_TICKS, TRADE_TICKS } from '../src/sim/merchant.js';
import { shopCards, shopOffers } from '../src/sim/shop.js';
import { cardPool } from '../src/sim/levelup.js';
import {
  DT, CHARACTERS, CHEST, MERCHANT_INTERVAL, MERCHANT_LINE_OFFSET, MERCHANT_FLEE_TIME, TRADE_RADIUS, TRADE_TIME,
  SHOP_PRICES, SHOP_HEAL, SPAWN_RING_RADIUS, DESPAWN_DIST, ENEMY_TYPES, ATLAS_NAMES, SOUND_NAMES,
} from '../src/sim/content.js';
import { App } from '../src/app.js';
import { STEP_MS } from '../src/loop.js';
import { readFrame, createInputState, PAD } from '../src/input.js';
import { createRenderer, merchantOverlay, bombFlashAlpha } from '../src/render/draw.js';
import { edgeMarkers } from '../src/render/hud.js';
import {
  drawShop, drawLevelUp, tileRects, shopItemAt, shopNav, cardRects, SHOP_BUTTON, BACK_BUTTON, REROLL_BUTTON, TILE, clipText,
} from '../src/render/screens.js';
import { botIntent } from '../tools/measure.mjs';

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
const atlas = { image: {}, frames: atlasJson.frames, anims: atlasJson.anims };
const SPEC = readFileSync(new URL('../docs/demo-spec.md', import.meta.url), 'utf8');
const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = (seed = 1) => { const g = new Game({ seed, timeline: QUIET }); g.weapons = []; return g; };
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(intent); };
const sounded = (g, name) => g.events.some((e) => e.type === 'sound' && e.name === name);
const DEF = CHARACTERS.merchant;
// An rng that plays back `values` and counts the draws.
function scripted(values) {
  let i = 0;
  const f = () => { if (i >= values.length) throw new Error('rng drawn too often'); return values[i++]; };
  f.count = () => i;
  return f;
}
const noRng = () => scripted([]);
// A game with a merchant standing `dist` px right of the dragon (route straight down) and the
// dragon still, so the trade counts from the first tick.
function trading(dist = 30) {
  const g = still();
  const m = createMerchant(g, dist, 0, 0, 1);
  return { g, m };
}
function openShop(xp = 0) {
  const { g, m } = trading();
  g.xp = xp;
  run(g, TRADE_TICKS);
  assert.ok(g.shop, 'shop open');
  return { g, m };
}
const chestPickup = (g, x = 0, y = 0) => { const p = { id: g.nextId++, kind: 'chest', x, y, life: 1800, anim: CHEST.anim, frame: 0, frameTicks: 0 }; g.pickups.push(p); return p; };

// ---- constants and spec -------------------------------------------------------------

test('merchant: constants match the §14.3 tables', () => {
  const sec = SPEC.slice(SPEC.indexOf('### 14.3'), SPEC.indexOf('## 15.'));
  const row = (name) => sec.split('\n').find((l) => l.startsWith(`| \`${name}\``));
  const nums = (l) => l.split('|')[2].match(/\d+(\.\d+)?/g).map(Number).slice(0, 1); // the value, not the notes
  assert.deepEqual(nums(row('MERCHANT_INTERVAL')), [MERCHANT_INTERVAL]);
  assert.deepEqual(nums(row('MERCHANT_LINE_OFFSET')), [MERCHANT_LINE_OFFSET]);
  assert.deepEqual(nums(row('MERCHANT_FLEE_TIME')), [MERCHANT_FLEE_TIME]);
  assert.deepEqual(nums(row('TRADE_RADIUS')), [TRADE_RADIUS]);
  assert.deepEqual(nums(row('TRADE_TIME')), [TRADE_TIME]);
  assert.deepEqual(nums(row('SHOP_HEAL')), [SHOP_HEAL]);
  const stats = sec.split('\n').find((l) => l.startsWith('| Merchant |')).split('|').slice(2, -1).map((c) => c.trim());
  assert.deepEqual(stats.slice(0, 6).map(Number), [DEF.hp, DEF.speed, DEF.fleeSpeed, DEF.r, DEF.mass, DEF.resist.fire]);
  assert.deepEqual([DEF.resist.fire, DEF.resist.arcane, DEF.resist.physical], [0.5, 0.5, 0.5]);
  for (const id of ['reroll', 'card', 'heal']) {
    const l = sec.split('\n').find((x) => x.startsWith(`| ${id[0].toUpperCase() + id.slice(1)}`) || x.startsWith(`| Any card`) && id === 'card');
    assert.ok(l && l.includes(`${SHOP_PRICES[id]} XP`), `${id} price in the spec`);
  }
  assert.deepEqual(SHOP_PRICES, { reroll: 10, card: 25, heal: 15 });
  assert.equal(MERCHANT_INTERVAL_TICKS, 5400);
  assert.equal(TRADE_TICKS, 90);
  assert.equal(MERCHANT_FLEE_TICKS, 180);
  assert.ok(!ENEMY_TYPES.includes('merchant'), 'not an enemy, so no bestiary card');
  for (const a of ['merchant.walk', 'merchant.die', 'merchant.bubble', 'pickup.chest', 'icon.reroll']) assert.ok(ATLAS_NAMES.includes(a), a);
  for (const s of [CHEST.sound, DEF.dieSound]) assert.ok(SOUND_NAMES.includes(s), s);
});

test('art: the merchant is the pack trader (16 px, 2-frame walk, 7-frame death); chest 12×10, bubble 9×8, reroll die 9×9', () => {
  const size = (a) => atlas.anims[a].frames.map((f) => `${atlas.frames[f].w}x${atlas.frames[f].h}`);
  assert.deepEqual(size('merchant.walk'), ['16x16', '16x16']);
  assert.deepEqual(atlas.anims['merchant.walk'].frames, ['trader/trader0000.bmp', 'trader/trader0001.bmp']);
  assert.equal(atlas.anims['merchant.die'].frames.length, 7);
  assert.ok(atlas.anims['merchant.die'].frames.every((f) => f.startsWith('trader/merchant_die')));
  assert.deepEqual(size('pickup.chest'), ['12x10']);
  assert.deepEqual(size('merchant.bubble'), ['9x8']);
  assert.deepEqual(size('icon.reroll'), ['9x9']);
});

// ---- schedule and route -------------------------------------------------------------

test('spawn: the first merchant on tick 5400 (1:30), two draws (side, line offset), on the spawn ring, his line within 200 px of the tower', () => {
  const g = still();
  run(g, MERCHANT_INTERVAL_TICKS - 1);
  assert.equal(g.merchants.length, 0);
  assert.equal(g.merchantTimer, 1);
  const t = { x: g.tower.x, y: g.tower.y }, d = { x: g.dragon.x, y: g.dragon.y };
  g.rng = scripted([0.25, 0.75]); // side: straight below the dragon; offset +100
  g.tick({});
  assert.equal(g.rng.count(), 2);
  assert.equal(g.merchantTimer, MERCHANT_INTERVAL_TICKS);
  assert.equal(g.merchants.length, 1);
  const m = g.merchants[0];
  const sx = d.x + Math.cos(Math.PI / 2) * SPAWN_RING_RADIUS, sy = d.y + SPAWN_RING_RADIUS;
  // aimed at the point 100 px beside the tower, perpendicular to the line start -> tower
  const ux = t.x - sx, uy = t.y - sy, ul = Math.hypot(ux, uy);
  const tx = t.x - (uy / ul) * 100, ty = t.y + (ux / ul) * 100;
  const vl = Math.hypot(tx - sx, ty - sy);
  assert.ok(Math.abs(m.dx - (tx - sx) / vl) < 1e-12 && Math.abs(m.dy - (ty - sy) / vl) < 1e-12);
  assert.ok(Math.abs(m.x - (sx + m.dx * DEF.speed * DT)) < 1e-9 && Math.abs(m.y - (sy + m.dy * DEF.speed * DT)) < 1e-9, 'walked once in step 5');
  const off = Math.abs((t.x - sx) * m.dy - (t.y - sy) * m.dx);
  assert.ok(off <= MERCHANT_LINE_OFFSET && off > 90, `line passes ${off} px from the tower`);
  assert.deepEqual([m.hp, m.maxHp, m.r, m.willTrade, m.trade, m.flee], [80, 80, 12, true, 0, 0]);
  assert.equal(g.enemies.length, 0, 'not an enemy');
  assert.ok(!g.seen.includes('merchant'));
});

test('spawn: one at a time (a due merchant while one is about draws nothing), then every 90 s', () => {
  const g = still();
  run(g, MERCHANT_INTERVAL_TICKS);
  assert.equal(g.merchants.length, 1);
  g.merchants[0].dx = 0; g.merchants[0].dy = 0; // keep him about
  g.merchants[0].x = 300; g.merchants[0].y = 300;
  run(g, MERCHANT_INTERVAL_TICKS - 1);
  g.rng = noRng();
  g.tick({});
  assert.equal(g.merchants.length, 1, 'still one');
  g.merchants.length = 0;
  g.rng = () => 0.5; // the princess due on the way (§14.4) draws her side
  run(g, MERCHANT_INTERVAL_TICKS - 1);
  assert.equal(g.merchants.length, 0);
  g.rng = scripted([0, 0.5]);
  g.tick({});
  assert.equal(g.merchants.length, 1, 'the next one 90 s later');
});

test('spawn: the timer counts steps, so a debug jump neither skips nor adds merchants; a jump forward still waits 90 s of steps', () => {
  const g = new Game({ seed: 1, timeline: QUIET, debug: true });
  g.weapons = [];
  g.tick({ debug: { jumpTo: 200 } });
  assert.equal(g.merchants.length, 0);
  assert.equal(g.merchantTimer, MERCHANT_INTERVAL_TICKS - 1);
});

test('walk: 50 px/s along his route, flipped when it runs left; removed silently past DESPAWN_DIST from the tower', () => {
  const g = still();
  const m = createMerchant(g, 200, 0, -1, 0);
  g.tick({});
  assert.ok(Math.abs(m.x - (200 - DEF.speed * DT)) < 1e-9);
  assert.equal(m.flip, true);
  assert.equal(m.frameTicks, 1, 'the walk advances');
  const far = createMerchant(g, g.tower.x + DESPAWN_DIST - 0.5, g.tower.y, 1, 0);
  g.tick({});
  assert.ok(!g.merchants.includes(far));
  assert.equal(g.pickups.length, 0);
  assert.equal(g.kills, 0);
});

test('enemies ignore him: not in the grid, never separated or blocked, no contact with the tower', () => {
  const g = still();
  const m = createMerchant(g, 200, 0, 0, 1);
  const k = createEnemy(g, 'knight', 200, 0);
  g.tick({});
  assert.ok(Math.abs(m.x - 200) < 1e-9 && Math.abs(m.y - DEF.speed * DT) < 1e-9, 'walked his route, unpushed');
  assert.ok(!g.grid.nearby(200, 0, 50, []).includes(m));
  assert.ok(k.hp > 0);
});

// ---- trading ------------------------------------------------------------------------

test('trade: within TRADE_RADIUS he stops and the trade counts; 1.5 s continuous opens the shop at the end of that tick', () => {
  const { g, m } = trading(TRADE_RADIUS);
  run(g, TRADE_TICKS - 1);
  assert.equal(m.trade, TRADE_TICKS - 1);
  assert.deepEqual([m.x, m.y], [TRADE_RADIUS, 0], 'he stands');
  assert.equal(m.frame, 0);
  assert.equal(m.flip, true, 'facing the dragon on his left');
  assert.equal(g.shop, null);
  g.tick({});
  assert.deepEqual(g.shop, { merchant: m.id, page: 'main', cards: [] });
  assert.equal(g.tickCount, TRADE_TICKS, 'the opening tick ran in full');
  assert.ok(sounded(g, 'pickup'));
});

test('trade: stepping away resets the count; a hit ends trading for good', () => {
  const { g, m } = trading(30);
  run(g, 40);
  run(g, 1, { moveX: -1 }); // the dragon steps away
  run(g, 20, { moveX: -1 });
  assert.equal(m.trade, 0);
  const g2 = trading(30);
  run(g2.g, 40);
  spawnProjectile(g2.g, { kind: 'fireball', x: g2.m.x, y: g2.m.y, dx: 1, dy: 0, speed: 0, range: 100, r: 6, damage: 2, anim: 'fireball.anim' });
  g2.g.tick({});
  assert.deepEqual([g2.m.willTrade, g2.m.trade], [false, 0]);
  run(g2.g, 200);
  assert.equal(g2.g.shop, null, 'never opens');
});

test('shop: the world is frozen (no step runs, the digest holds) until a choice comes in the intent', () => {
  const { g } = openShop(0);
  const d0 = g.digest(), t0 = g.tickCount;
  run(g, 30, { moveX: 1, pick: -1 });
  run(g, 5, { pick: 0 }); // reroll unaffordable at 0 XP: ignored
  run(g, 5, { pick: 9 });
  assert.equal(g.digest(), d0);
  assert.equal(g.tickCount, t0);
});

test('shop: offers greyed by price, by an empty pool (card) and by a full tower (heal); the cards are the pool without Repair', () => {
  const { g } = openShop(14);
  assert.deepEqual(shopOffers(g).map((o) => [o.id, o.price, o.ok]), [['reroll', 10, true], ['card', 25, false], ['heal', 15, false]]);
  g.xp = 30;
  assert.deepEqual(shopOffers(g).map((o) => o.ok), [true, true, false], 'heal: tower at full HP');
  g.tower.hp = 50;
  assert.deepEqual(shopOffers(g).map((o) => o.ok), [true, true, true]);
  g.tower.hp = 10; // Repair is in the pool now, but not for sale
  assert.ok(cardPool(g).some((p) => p.card.kind === 'repair'));
  assert.deepEqual(shopCards(g), cardPool(g).map((p) => p.card).filter((c) => c.kind !== 'repair'));
});

test('shop: reroll costs 10 XP and banks a reroll; the shop closes and he walks on, never to trade again', () => {
  const { g, m } = openShop(12);
  const lv = g.level;
  g.rng = noRng();
  g.tick({ pick: 0 });
  assert.deepEqual([g.xp, g.rerolls, g.level, g.shop], [2, 1, lv, null]);
  assert.ok(sounded(g, 'powerup'));
  assert.equal(m.willTrade, false);
  const y = m.y;
  g.tick({});
  assert.ok(m.y > y, 'walks on although the dragon is by him');
});

test('shop: heal costs 15 XP and adds 30 tower HP, capped', () => {
  const { g } = openShop(20);
  g.tower.hp = 90;
  g.tick({ pick: 2 });
  assert.deepEqual([g.xp, g.tower.hp, g.shop], [5, 100, null]);
  const o = openShop(15);
  o.g.tower.hp = 40;
  o.g.tick({ pick: 2 });
  assert.equal(o.g.tower.hp, 40 + SHOP_HEAL);
});

test('shop: a chosen card opens the pool page; leave goes back; a card costs 25 XP and is applied as a level-up card', () => {
  const { g } = openShop(30);
  g.rng = noRng();
  g.tick({ pick: 1 });
  assert.equal(g.shop.page, 'cards');
  assert.deepEqual(g.shop.cards, shopCards(g));
  assert.equal(g.xp, 30, 'nothing paid yet');
  g.tick({ leave: true });
  assert.deepEqual([g.shop.page, g.shop.cards], ['main', []]);
  g.tick({ pick: 1 });
  const i = g.shop.cards.findIndex((c) => c.id === 'saw');
  assert.ok(i > 0);
  g.tick({ pick: 99 }); // no such card
  assert.equal(g.shop.page, 'cards');
  g.tick({ pick: i });
  assert.equal(g.shop, null);
  assert.equal(g.xp, 5);
  assert.ok(g.weapons.some((w) => w.id === 'saw' && w.level === 1));
  assert.equal(g.rng.count(), 0, 'the shop draws nothing');
});

test('shop: leave closes it without a trade; he will not trade again', () => {
  const { g, m } = openShop(30);
  g.tick({ leave: true });
  assert.deepEqual([g.shop, g.xp, m.willTrade], [null, 30, false]);
  run(g, TRADE_TICKS + 5);
  assert.equal(g.shop, null);
});

test('shop and level-up on one tick: the offers come first, then the shop', () => {
  const { g } = trading(30);
  run(g, TRADE_TICKS - 1);
  g.gems.push({ id: g.nextId++, x: 0, y: 0, value: 6, homing: false });
  g.tick({});
  assert.ok(g.offers.length > 0 && g.shop);
  g.tick({ leave: true });
  assert.ok(g.shop, 'leave does not reach the shop while cards are open');
  g.tick({ pick: 0 });
  assert.equal(g.offers.length, 0);
  g.tick({ leave: true });
  assert.equal(g.shop, null);
});

// ---- robbing ------------------------------------------------------------------------

test('rob: a fireball deals ceil(2 × 0.5) = 1, is used up, rolls no procs; he flees at 90 px/s away from the dragon for 3 s, then walks on', () => {
  const g = still();
  g.buffs = [{ id: 'explode', level: 3 }, { id: 'split', level: 3 }, { id: 'pierce', level: 3 }];
  const m = createMerchant(g, 100, 0, 0, 1);
  const p = spawnProjectile(g, { kind: 'fireball', x: 100, y: 0, dx: 1, dy: 0, speed: 0, range: 100, r: 6, damage: 2, anim: 'fireball.anim' });
  g.rng = noRng();
  g.tick({});
  assert.equal(m.hp, 79);
  assert.ok(!g.projectiles.includes(p));
  assert.deepEqual([m.flee, m.willTrade], [MERCHANT_FLEE_TICKS, false]);
  const x0 = m.x, y0 = m.y;
  g.tick({});
  const dx = m.x - x0, dy = m.y - y0;
  assert.ok(Math.abs(Math.hypot(dx, dy) - DEF.fleeSpeed * DT) < 1e-9, 'flee speed');
  assert.ok(dx > 0 && Math.abs(dy) < 0.05, 'straight away from the dragon');
  run(g, MERCHANT_FLEE_TICKS - 1);
  assert.equal(m.flee, 0);
  const y1 = m.y;
  g.tick({});
  assert.ok(Math.abs(m.y - y1 - DEF.speed * DT) < 1e-9, 'back on his route');
  assert.equal(g.rng.count(), 0);
});

test('rob: an explosion, a ring fireball, a claw slash and a saw blade hit him, each through resistances; the bite and the bomb do not', () => {
  const g = still();
  const m = createMerchant(g, 50, 0, 0, 0);
  g.grid.build(g.enemies);
  // explosion of a 4-damage projectile 30 px away: ceil(4 × 0.5) = 2, knock 10 / mass 3
  const p = { x: 80, y: 0, damage: 4, type: 'fire', kind: 'fireball' };
  explode(g, p, null, buffMods(g));
  assert.equal(m.hp, 78);
  assert.ok(Math.abs(m.x - (50 - 10 / 3)) < 1e-9, 'pushed by mass 3');
  // ring: 2 damage, once per rehit
  const ring = createWeapon('ring', 1);
  ring.balls = [{ x: m.x, y: m.y }];
  g.weapons = [ring];
  collideRing(g);
  collideRing(g);
  assert.equal(m.hp, 77);
  // a left-claw rectangle to the right of the dragon: ceil(4 × 0.5) = 2
  g.slashes.push({ id: g.nextId++, weapon: 'leftClaw', shape: 'rect', side: 1, dx: 0, dy: 0, w: 110, h: 36, angle: 0, reach: 0, maxTargets: 0, damage: 4, knock: 0, delay: 0, struck: false, x: 0, y: 0, hits: [], anim: 'claw.swipe', frame: 0, frameTicks: 0 });
  collideSlashes(g);
  assert.equal(m.hp, 75);
  assert.deepEqual(g.slashes[0].hits, [m.id]);
  // a saw blade on him: ceil(5 × 0.5) = 3, once per rehit
  g.blades.push({ id: g.nextId++, x: m.x, y: m.y, dx: 1, dy: 0, phase: 'dwell', speed: 0, range: 0, travelled: 0, dwell: 10, r: 10, damage: 5, knock: 0, rehit: {}, anim: 'saw.spin', frame: 0, frameTicks: 0 });
  collideBlades(g);
  collideBlades(g);
  assert.equal(m.hp, 72);
  // the bite takes foes only; the bomb blasts enemies only
  const b = still();
  const bm = createMerchant(b, 20, 0, 0, 0);
  b.weapons = [createWeapon('bite', 1)];
  b.tick({});
  bomb(b);
  assert.equal(bm.hp, DEF.hp);
  assert.ok(bm.willTrade);
});

test('rob: killed, he plays his death, drops a chest where he fell, sound death02; not a kill, no gem', () => {
  const g = still();
  const m = createMerchant(g, 100, 0, 0, 0);
  m.hp = 1;
  spawnProjectile(g, { kind: 'fireball', x: 100, y: 0, dx: 1, dy: 0, speed: 0, range: 100, r: 6, damage: 2, anim: 'fireball.anim' });
  g.tick({});
  assert.equal(g.merchants.length, 0);
  assert.deepEqual([g.kills, g.gems.length], [0, 0]);
  assert.ok(sounded(g, DEF.dieSound));
  assert.ok(g.effects.some((e) => e.anim === DEF.die && e.x === m.x && e.y === m.y));
  const c = g.pickups.find((p) => p.kind === 'chest');
  assert.deepEqual([c.x, c.y, c.anim, c.life], [m.x, m.y, 'pickup.chest', pickupLifeTicks(g)]);
});

test('chest: collected like a pickup, it is a free level-up pick: offers rolled, no level gained; with offers open it queues', () => {
  const g = still();
  chestPickup(g);
  g.tick({});
  assert.deepEqual([g.level, g.pendingLevelUps, g.offers.length], [1, 1, 3]);
  assert.ok(sounded(g, CHEST.sound));
  const offers = g.offers;
  g.tick({ pick: 0 });
  assert.deepEqual([g.level, g.pendingLevelUps, g.offers], [1, 0, []]);
  const h = still();
  chestPickup(h);
  chestPickup(h, 1, 0);
  h.tick({});
  assert.equal(h.pendingLevelUps, 2);
  assert.ok(offers.length === 3);
});

// ---- the level-up reroll ------------------------------------------------------------

test('reroll: on the level-up screen a banked reroll rolls new offers (3 draws) and is used up; without one it does nothing', () => {
  const g = still();
  chestPickup(g);
  g.tick({});
  const first = g.offers;
  g.tick({ reroll: true });
  assert.equal(g.offers, first, 'no reroll banked');
  g.rerolls = 2;
  const rng = g.rng;
  let n = 0;
  g.rng = () => { n++; return rng(); };
  g.tick({ reroll: true, pick: 0 });
  assert.equal(n, 3);
  assert.notEqual(g.offers, first);
  assert.deepEqual([g.rerolls, g.pendingLevelUps, g.offers.length], [1, 1, 3], 'the pick in the same intent is not applied');
  assert.ok(sounded(g, 'powerup03'));
});

// ---- determinism --------------------------------------------------------------------

test('determinism: the same seed and intents (walking to merchants, trading, leaving) give the same digest; the state is in the snapshot', () => {
  const play = () => {
    const g = new Game({ seed: 11 });
    for (let i = 0; i < 60 * 200; i++) {
      const m = g.merchants[0];
      let it = { pick: g.offers.length ? 0 : -1 };
      if (g.shop) it = { pick: g.shop.page === 'main' ? 0 : -1, leave: g.xp < 10 };
      else if (m && !g.offers.length) {
        const dx = m.x - g.dragon.x, dy = m.y - g.dragon.y, d = Math.hypot(dx, dy) || 1;
        it = { moveX: d > 20 ? dx / d : 0, moveY: d > 20 ? dy / d : 0, aimX: -dx / d, aimY: -dy / d, hasAim: true, pick: -1 };
      }
      g.tick(it);
      if (g.phase !== 'play') break;
    }
    return g;
  };
  const a = play(), b = play();
  assert.equal(a.digest(), b.digest());
  const s = a.snapshot();
  for (const k of ['merchants', 'merchantTimer', 'shop', 'rerolls']) assert.ok(k in s, k);
  const c = new Game({ seed: 11 });
  const d0 = c.digest();
  c.rerolls = 1;
  assert.notEqual(c.digest(), d0);
});

test('measure bots ignore the merchant: a shop that opens is left', () => {
  const { g } = openShop(50);
  const it = botIntent(g, 'aim', 'greedy');
  assert.equal(it.leave, true);
  g.tick(it);
  assert.equal(g.shop, null);
  assert.equal(botIntent(still(), 'aim').leave, false);
});

// ---- input --------------------------------------------------------------------------

test('input: Esc and gamepad B give `leave` (Esc still pauses); R and gamepad X give `reroll`', () => {
  const raw = (o = {}) => ({ held: new Set(), pressed: [], clicks: [], mouse: null, mouseMoved: false, pad: null, dragon: { x: 480, y: 300 }, ...o });
  const pad = (pressed) => { const buttons = Array(17).fill(false); for (const i of pressed) buttons[i] = true; return { axes: [0, 0, 0, 0], buttons }; };
  let f = readFrame(raw({ pressed: ['Escape'] }), createInputState());
  assert.deepEqual([f.leave, f.pause, f.reroll], [true, true, false]);
  f = readFrame(raw({ pressed: ['KeyP'] }), createInputState());
  assert.deepEqual([f.leave, f.pause], [false, true]);
  f = readFrame(raw({ pressed: ['KeyR'] }), createInputState());
  assert.equal(f.reroll, true);
  f = readFrame(raw({ pad: pad([PAD.B]) }), createInputState());
  assert.deepEqual([f.leave, f.back], [true, true]);
  f = readFrame(raw({ pad: pad([PAD.X]) }), createInputState());
  assert.equal(f.reroll, true);
});

// ---- the App ------------------------------------------------------------------------

const idle = { intent: {}, pause: false, confirm: false, pick: -1, nav: 0, click: null, menu: { x: 0, y: 0 }, leave: false, reroll: false };
const press = (o) => ({ ...idle, ...o });
function appAtShop(xp = 30) {
  const app = new App({
    makeGame: () => { const g = still(); createMerchant(g, 30, 0, 0, 1); g.xp = xp; return g; },
    randomSeed: () => 5,
    audio: { play() {}, resume: () => Promise.resolve() },
  });
  app.frame(0, press({ confirm: true }));
  let f = 1;
  while (!app.shopOpen() && f < 200) app.frame(f++ * STEP_MS, idle);
  assert.ok(app.shopOpen(), 'shop open');
  const step = (input = idle) => app.frame(f++ * STEP_MS, input);
  return { app, step };
}

test('App: keys 1/2/3 buy through the next tick; Esc leaves (it does not pause); P pauses', () => {
  let { app, step } = appAtShop(12);
  step(press({ pick: 0 }));
  assert.deepEqual([app.game.shop, app.game.rerolls], [null, 1]);
  ({ app, step } = appAtShop(12));
  step(press({ pause: true }));
  assert.equal(app.screen, 'paused');
  step(press({ pause: true }));
  step(press({ leave: true, pause: true }));
  assert.equal(app.screen, 'play');
  assert.equal(app.game.shop, null);
});

test('App: clicks on an offer, a card tile, Back and Leave; d-pad / move keys + A; the highlight resets per page', () => {
  const { app, step } = appAtShop(30);
  const c = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  step(press({ click: c(cardRects(3)[1]) }));
  assert.equal(app.game.shop.page, 'cards');
  assert.equal(app.shopSel, 0);
  step(press({ click: c(BACK_BUTTON) }));
  assert.equal(app.game.shop.page, 'main');
  step(press({ menu: { x: 1, y: 0 } }));
  assert.equal(app.shopSel, 1);
  step(press({ confirm: true }));
  assert.equal(app.game.shop.page, 'cards');
  const n = app.game.shop.cards.length;
  step(press({ menu: { x: 1, y: 0 } }));
  step(press({ menu: { x: 0, y: 1 } }));
  assert.equal(app.shopSel, 1 + TILE.cols);
  const card = app.game.shop.cards[app.shopSel];
  step(press({ confirm: true }));
  assert.equal(app.game.shop, null);
  assert.ok((card.kind === 'weapon' ? app.game.weapons : app.game.buffs).some((x) => x.id === card.id));
  assert.ok(n > TILE.cols);
  const b = appAtShop(0);
  b.step(press({ click: c(SHOP_BUTTON) }));
  assert.equal(b.app.game.shop, null, 'Leave');
});

test('App: on the level-up screen R / X or a click on the button spends a banked reroll', () => {
  const app = new App({
    makeGame: () => { const g = still(); chestPickup(g); g.rerolls = 2; return g; },
    randomSeed: () => 5,
    audio: { play() {}, resume: () => Promise.resolve() },
  });
  app.frame(0, press({ confirm: true }));
  let f = 1;
  while (!app.levelUpOpen() && f < 10) app.frame(f++ * STEP_MS, idle);
  const o = app.game.offers;
  app.frame(f++ * STEP_MS, press({ reroll: true }));
  assert.notEqual(app.game.offers, o);
  assert.equal(app.game.rerolls, 1);
  app.frame(f++ * STEP_MS, press({ click: { x: REROLL_BUTTON.x + 5, y: REROLL_BUTTON.y + 5 } }));
  assert.equal(app.game.rerolls, 0);
  app.frame(f++ * STEP_MS, press({ click: { x: REROLL_BUTTON.x + 5, y: REROLL_BUTTON.y + 5 } }));
  assert.equal(app.game.pendingLevelUps, 1, 'with none left the button is gone and a click there does nothing');
});

// ---- rendering ----------------------------------------------------------------------

function fakeCtx() {
  const calls = [];
  return new Proxy({}, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * (parseInt(t.font, 10) || 16) * 0.6 });
      return (...args) => { calls.push([k, ...args]); return {}; };
    },
    set(t, k, v) { calls.push(['set', k, v]); t[k] = v; return true; },
  });
}
const texts = (c) => c.calls.filter((x) => x[0] === 'fillText').map((x) => x[1]);

test('shop layout: 19 tiles fit above Back; hit tests and navigation', () => {
  const r = tileRects(19);
  assert.equal(r.length, 19);
  assert.ok(r.every((x) => x.x >= 0 && x.x + x.w <= 960 && x.y + x.h < BACK_BUTTON.y));
  assert.deepEqual([r[4].x, r[4].y - r[0].y], [r[0].x, TILE.h + TILE.gapY]);
  const main = { page: 'main', cards: [] }, cards = { page: 'cards', cards: Array(10).fill({}) };
  const c = (x) => [x.x + x.w / 2, x.y + x.h / 2];
  assert.equal(shopItemAt(main, ...c(cardRects(3)[2])), 2);
  assert.equal(shopItemAt(main, ...c(SHOP_BUTTON)), 3);
  assert.equal(shopItemAt(main, 5, 5), -1);
  assert.equal(shopItemAt(cards, ...c(r[7])), 7);
  assert.equal(shopItemAt(cards, ...c(BACK_BUTTON)), 10);
  assert.deepEqual([shopNav(main, 0, 1, 0), shopNav(main, 3, 1, 0), shopNav(main, 0, 0, 1), shopNav(main, 3, 0, -1), shopNav(main, 0, -1, 0)], [1, 3, 3, 1, 0]);
  assert.deepEqual([shopNav(cards, 1, 0, 1), shopNav(cards, 8, 0, 1), shopNav(cards, 9, 1, 0), shopNav(cards, 10, 0, -1), shopNav(cards, 2, 0, -1)], [5, 10, 9, 9, 0]);
});

test('shop screen: the offers (greyed when not ok), Leave; the cards page; level-up shows the reroll button; nothing written', () => {
  const { g } = openShop(12);
  const before = JSON.stringify(g.snapshot());
  let c = fakeCtx();
  drawShop(c, g, atlas, 0);
  assert.ok(texts(c).includes('MERCHANT') && texts(c).includes('Leave  Esc / B') && texts(c).includes('10 XP'));
  assert.equal(c.calls.filter((x) => x[0] === 'set' && x[1] === 'globalAlpha' && x[2] === 0.4).length, 2, 'card and heal greyed');
  g.xp = 30;
  g.tick({ pick: 1 });
  c = fakeCtx();
  drawShop(c, g, atlas, 0);
  assert.ok(texts(c).includes('ANY CARD') && texts(c).includes('Back  Esc / B'));
  assert.ok(texts(c).includes('Saw Blade'));
  const after = JSON.stringify(g.snapshot());
  drawShop(fakeCtx(), g, atlas, 3);
  assert.equal(JSON.stringify(g.snapshot()), after);
  assert.notEqual(before, after);
  const h = still();
  chestPickup(h);
  h.tick({});
  c = fakeCtx();
  drawLevelUp(c, h, atlas, 0);
  assert.ok(!texts(c).some((s) => s.startsWith('Reroll')));
  h.rerolls = 2;
  c = fakeCtx();
  drawLevelUp(c, h, atlas, 0);
  assert.ok(texts(c).includes('Reroll (2)  R / X'));
});

test('clipText: long text ends in an ellipsis within the width', () => {
  const c = fakeCtx();
  c.font = '10px monospace';
  assert.equal(clipText(c, 'short', 100), 'short');
  const s = clipText(c, 'Lobs turrets that shoot your fireball', 120);
  assert.ok(s.endsWith('…') && c.measureText(s).width <= 120);
});

test('render: the merchant above the pickups, below enemies; bubble while he trades, gold trade bar, red HP bar once hurt; edge marker off screen', () => {
  const g = still();
  const m = createMerchant(g, 100, 0, 0, 1);
  assert.deepEqual(merchantOverlay(m), { bars: [], bubble: true });
  m.trade = 45;
  assert.deepEqual(merchantOverlay(m), { bars: [{ kind: 'trade', frac: 0.5 }], bubble: true });
  m.hp = 40;
  m.willTrade = false;
  assert.deepEqual(merchantOverlay(m), { bars: [{ kind: 'hp', frac: 0.5 }], bubble: false });
  m.willTrade = true;
  createEnemy(g, 'knight', 50, 50);
  g.pickups.push({ id: g.nextId++, kind: 'heart', x: -50, y: 0, life: 1800, anim: 'pickup.heart', frame: 0, frameTicks: 0 });
  const r = createRenderer({ atlas, makeCanvas: (w, h) => ({ width: w, height: h, getContext: () => fakeCtx() }) });
  const before = JSON.stringify(g.snapshot());
  const c = fakeCtx();
  r.drawWorld(c, g);
  assert.equal(JSON.stringify(g.snapshot()), before);
  const at = (anim) => { const fr = atlas.frames[atlas.anims[anim].frames[0]]; return c.calls.findIndex((x) => x[0] === 'drawImage' && x.length === 10 && x[2] === fr.x && x[3] === fr.y); };
  assert.ok(at('pickup.heart') < at('merchant.walk') && at('merchant.walk') < at('knight.walk'));
  assert.ok(at('merchant.bubble') > at('merchant.walk'));
  assert.ok(c.calls.some((x) => x[0] === 'set' && x[1] === 'fillStyle' && x[2] === '#e03a3a'));
  assert.equal(edgeMarkers(g, atlas).length, 0);
  m.x = 2000;
  const mk = edgeMarkers(g, atlas);
  assert.equal(mk.length, 1);
  assert.equal(mk[0].anim, 'merchant.walk');
  // the bomb flash stays off while the shop freezes the world
  const s = openShop(0).g;
  s.lastBomb = s.tickCount - 1;
  assert.equal(bombFlashAlpha(s), 0);
});
