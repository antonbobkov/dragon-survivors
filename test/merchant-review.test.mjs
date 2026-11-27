// Gaps found reviewing the merchant (T-038): each test pins a rule of §14.2, §14.3, §16 or §19
// that a plausible mutation of the code would break.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { spawnProjectile, collideProjectiles } from '../src/sim/projectiles.js';
import { collideSlashes } from '../src/sim/claws.js';
import { createMerchant, stepMerchants, MERCHANT_FLEE_TICKS, TRADE_TICKS } from '../src/sim/merchant.js';
import { CHEST, DESPAWN_DIST, SHOP_PRICES } from '../src/sim/content.js';
import { App } from '../src/app.js';
import { STEP_MS } from '../src/loop.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = (opts = {}) => { const g = new Game({ seed: 1, timeline: QUIET, ...opts }); g.weapons = []; return g; };
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(intent); };
const chestPickup = (g, x = 0, y = 0) => g.pickups.push({ id: g.nextId++, kind: 'chest', x, y, life: 1800, anim: CHEST.anim, frame: 0, frameTicks: 0 });
const ball = (g, x, y, extra = {}) => spawnProjectile(g, {
  kind: 'fireball', x, y, dx: 1, dy: 0, speed: 0, range: 100, r: 12, damage: 2, anim: 'fireball.anim', ...extra,
});
const hit = (u) => u.hp < u.maxHp;

test('chests: two collected on one tick roll one set of offers (3 draws) and queue two level-ups', () => {
  const one = still();
  chestPickup(one);
  one.tick({});
  const g = still();
  const rng = g.rng;
  let n = 0;
  g.rng = () => { n++; return rng(); };
  chestPickup(g);
  chestPickup(g, 1, 0);
  g.tick({});
  assert.equal(g.pendingLevelUps, 2);
  assert.equal(n, 3, 'one openOffers, not one per chest');
  assert.deepEqual(g.offers, one.offers);
});

test('the shop does not open on the tick the tower falls, even though the trade completes on it', () => {
  const g = still();
  createMerchant(g, 30, 0, 0, 1);
  run(g, TRADE_TICKS - 1);
  assert.equal(g.shop, null);
  g.tower.hp = 0;
  g.tick({});
  assert.equal(g.phase, 'dying');
  assert.equal(g.shop, null);
});

test('projectile: hits the nearest of merchant and enemy even when both overlap, not the enemy first', () => {
  const g = still();
  const m = createMerchant(g, 102, 0, 0, 0);
  const e = createEnemy(g, 'knight', 112, 0);
  g.grid.build(g.enemies);
  ball(g, 100, 0);
  collideProjectiles(g);
  assert.ok(hit(m), 'the nearer merchant is hit');
  assert.ok(!hit(e), 'the farther enemy is not');
  // and the other way round: a nearer enemy shields the merchant
  const h = still();
  const e2 = createEnemy(h, 'knight', 102, 0);
  const m2 = createMerchant(h, 112, 0, 0, 0);
  h.grid.build(h.enemies);
  ball(h, 100, 0);
  collideProjectiles(h);
  assert.ok(hit(e2));
  assert.ok(!hit(m2));
});

test('projectile: at equal distance the lower id is hit, whether the merchant or the enemy has it', () => {
  const g = still();
  const m = createMerchant(g, 105, 0, 0, 0); // lower id
  const e = createEnemy(g, 'knight', 95, 0);
  g.grid.build(g.enemies);
  ball(g, 100, 0);
  collideProjectiles(g);
  assert.ok(hit(m) && !hit(e), 'merchant has the lower id');
  const h = still();
  const e2 = createEnemy(h, 'knight', 95, 0); // lower id
  const m2 = createMerchant(h, 105, 0, 0, 0);
  h.grid.build(h.enemies);
  ball(h, 100, 0);
  collideProjectiles(h);
  assert.ok(hit(e2) && !hit(m2), 'enemy has the lower id');
});

function cone(g, maxTargets) {
  g.slashes.push({
    id: g.nextId++, weapon: 'rightClaw', shape: 'cone', side: 1, dx: 1, dy: 0, w: 0, h: 0, angle: 60, reach: 80,
    maxTargets, damage: 4, knock: 0, delay: 0, struck: false, x: 0, y: 0, hits: [], anim: 'claw.cone', frame: 0, frameTicks: 0,
  });
}

test('claw cone: hits a merchant in it and he does not use up a target slot (one slot, merchant nearer: the enemy is hit too)', () => {
  const g = still();
  const m = createMerchant(g, 30, 0, 0, 0);
  const e = createEnemy(g, 'knight', 50, 0);
  g.grid.build(g.enemies);
  cone(g, 1);
  collideSlashes(g);
  assert.ok(hit(m), 'merchant hit');
  assert.ok(hit(e), 'the one slot still goes to the enemy');
});

test('each hit restarts his flee: a second hit while fleeing sets the full time again', () => {
  const g = still();
  const m = createMerchant(g, 300, 0, 0, 1);
  m.hp = m.maxHp = 100;
  ball(g, 300, 0);
  g.tick({});
  assert.equal(m.flee, MERCHANT_FLEE_TICKS);
  run(g, 60);
  assert.ok(m.flee < MERCHANT_FLEE_TICKS - 50);
  ball(g, m.x, m.y);
  g.tick({});
  assert.equal(m.flee, MERCHANT_FLEE_TICKS);
});

test('despawn: measured from the tower, not the dragon', () => {
  const g = still();
  g.dragon.x = DESPAWN_DIST + 300;
  const far = createMerchant(g, DESPAWN_DIST + 200, 0, 0, 0); // past the limit from the tower, near the dragon
  stepMerchants(g);
  assert.ok(!g.merchants.includes(far));
  const h = still();
  h.dragon.x = -(DESPAWN_DIST + 300);
  const near = createMerchant(h, DESPAWN_DIST - 100, 0, 0, 0); // inside the limit from the tower, far from the dragon
  stepMerchants(h);
  assert.ok(h.merchants.includes(near));
});

const idle = { intent: {}, pause: false, confirm: false, pick: -1, nav: 0, click: null, menu: { x: 0, y: 0 }, leave: false, reroll: false };
const press = (o) => ({ ...idle, ...o });
const audio = { play() {}, resume: () => Promise.resolve() };

test('App: with level-up offers open the shop screen is not used, though the shop is open behind them', () => {
  const app = new App({
    makeGame: () => {
      const g = still();
      createMerchant(g, 30, 0, 0, 1).trade = TRADE_TICKS - 1;
      chestPickup(g); // collected on the tick the trade completes
      return g;
    },
    randomSeed: () => 5,
    audio,
  });
  app.frame(0, press({ confirm: true }));
  let f = 1;
  while (!app.game.shop && f < 200) app.frame(f++ * STEP_MS, idle);
  assert.ok(app.game.shop, 'shop open');
  assert.equal(app.game.offers.length, 3);
  assert.equal(app.shopOpen(), false);
  assert.equal(app.levelUpOpen(), true);
});

function appAtShop(xp) {
  const app = new App({
    makeGame: () => { const g = still(); createMerchant(g, 30, 0, 0, 1); g.xp = xp; return g; },
    randomSeed: () => 5,
    audio,
  });
  app.frame(0, press({ confirm: true }));
  let f = 1;
  while (!app.shopOpen() && f < 200) app.frame(f++ * STEP_MS, idle);
  assert.ok(app.shopOpen(), 'shop open');
  return { app, step: (input = idle) => app.frame(f++ * STEP_MS, input) };
}

test('App: keys 1/2/3 do not buy on the cards page', () => {
  const xp = SHOP_PRICES.card + 5;
  const { app, step } = appAtShop(xp);
  step(press({ pick: 1 })); // the cards offer
  assert.equal(app.game.shop.page, 'cards');
  for (const pick of [0, 1, 2]) {
    step(press({ pick }));
    step();
  }
  assert.equal(app.game.shop.page, 'cards');
  assert.equal(app.game.xp, xp);
  assert.equal(app.game.weapons.length + app.game.buffs.length, 0);
});

test('debug commands are not applied while the shop is open', () => {
  const g = still({ debug: true });
  createMerchant(g, 30, 0, 0, 1);
  run(g, TRADE_TICKS);
  assert.ok(g.shop);
  const ticks = g.tickCount;
  g.tick({ debug: { jumpTo: 500 } });
  g.tick({ debug: { grant: 'fireball' } });
  assert.equal(g.tickCount, ticks);
  assert.equal(g.weapons.length, 0);
});
