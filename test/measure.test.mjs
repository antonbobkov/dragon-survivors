// The balance instrument (tools/measure.mjs) runs every bot without throwing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICIES, PICKS, botIntent, gemTarget, GEM_RANGE, HOME, KITE_RADIUS, orbThreat, dodgeMove, runOne, summarize, summaryTable,
  timelineTable, causesTable, causeText, median, applySets, BUFF_PRIORITY,
  pickupTarget, brazierTarget, merchantPlan, SHOPS, greedyRerolls, extrasTable, ALL_POLICIES,
  BRAZIER_RANGE, SHOOT_RANGE, BRAZIER_STOP, MERCHANT_RANGE, ROB_RANGE, TRADE_STAND,
} from '../tools/measure.mjs';
import { Game } from '../src/sim/game.js';
import { spawnOrb } from '../src/sim/enemyShots.js';
import { createEnemy } from '../src/sim/enemies.js';
import { createMerchant } from '../src/sim/merchant.js';
import { createPrincess } from '../src/sim/princess.js';
import { createWeapon } from '../src/sim/weapons.js';
import { TIMELINE, TETHER_LENGTH, TOWER_REST_DIST, BUFF_IDS, SHOP_PRICES } from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }]; // no enemies, so no gems and no orbs

test('measure: one short seed per bot runs, is deterministic, and tabulates', () => {
  for (const policy of Object.keys(POLICIES)) {
    for (const pick of Object.keys(PICKS)) {
      const r = runOne({ policy, pick, seed: 3, maxSeconds: 5, step: 1 });
      assert.equal(r.bot, `${policy}+${pick}`);
      assert.ok(r.capped, `${r.bot} survives 5 s`);
      assert.ok(Math.abs(r.survived - 5) < 1e-9);
      assert.equal(r.samples.length, 5);
      assert.deepEqual(runOne({ policy, pick, seed: 3, maxSeconds: 5 }).kills, r.kills);
      const row = summarize([r], 5);
      assert.equal(row.medianText, '>=5.0');
      assert.equal(row.golem, 0);
      assert.match(summaryTable([row]), new RegExp(`\\| ${policy}\\+${pick} \\| 1 \\|`));
      assert.match(timelineTable([r], 1, 5), /\| 5 \| 100 \|/);
    }
  }
  assert.throws(() => runOne({ policy: 'nope', seed: 1, maxSeconds: 1 }));
  assert.throws(() => runOne({ policy: 'aim', pick: 'nope', seed: 1, maxSeconds: 1 }));
});

test('measure: a run that falls reports the fall time, and towerHp / --set apply', () => {
  const r = runOne({ policy: 'idle', seed: 1, maxSeconds: 60, towerHp: 1 });
  assert.equal(r.capped, false);
  assert.ok(r.survived > 5 && r.survived < 60, `fell at ${r.survived}`);
  const s = applySets(['rate.30=0.25', 'towerHp=7']);
  assert.equal(s.towerHp, 7);
  assert.equal(s.timeline.find((x) => x.t === 30).rate, 0.25);
  assert.notEqual(TIMELINE.find((x) => x.t === 30).rate, 0.25, 'the shared table is not touched');
  assert.throws(() => applySets(['nope=1']));
  assert.throws(() => applySets(['rate.31=1']));
});

test('measure: aim and kite fly to gems near HOME and level up; idle collects none', () => {
  const g = new Game({ seed: 5 });
  for (let i = 0; i < 700; i++) g.tick(botIntent(g, 'aim', 'greedy'));
  assert.ok(g.enemies.length > 0);
  assert.equal(POLICIES.aim(g).hasAim, true);
  assert.deepEqual(POLICIES.idle(g), {});
  g.enemyShots = [];
  const gem = { id: 1e6, x: HOME.x + 100, y: HOME.y, value: 1, homing: false };
  g.gems = [gem];
  assert.equal(gemTarget(g), gem);
  const m = POLICIES.kite(g);
  assert.ok(Math.abs(Math.hypot(m.moveX, m.moveY) - 1) < 1e-9);
  assert.ok(m.moveX * (gem.x - g.dragon.x) + m.moveY * (gem.y - g.dragon.y) > 0, 'kite heads for the gem');
  gem.x = HOME.x + GEM_RANGE + 1;
  assert.equal(gemTarget(g), null, 'too far from HOME');
  const runs = ['idle', 'kite'].map((policy) => runOne({ policy, pick: 'greedy', seed: 2, maxSeconds: 90 }));
  assert.equal(runs[0].level, 1);
  assert.ok(runs[1].level > 1, `kite level ${runs[1].level}`);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('measure: the bots stay anchored to HOME while the tower follows (no drift)', () => {
  for (const policy of ['aim', 'kite']) {
    const g = new Game({ seed: 1, timeline: QUIET });
    let maxD = 0, moved = 0;
    for (let i = 0; i < 60 * 60; i++) {
      g.tick(botIntent(g, policy, 'greedy', { braziers: false })); // braziers would draw them off HOME
      maxD = Math.max(maxD, Math.hypot(g.dragon.x - HOME.x, g.dragon.y - HOME.y), Math.hypot(g.tower.x - HOME.x, g.tower.y - HOME.y));
      if (i >= 30 * 60 && g.tower.moved) moved++;
    }
    const r = Math.hypot(g.dragon.x - HOME.x, g.dragon.y - HOME.y);
    assert.ok(Math.hypot(g.tower.x - g.dragon.x, g.tower.y - g.dragon.y) <= TETHER_LENGTH + 1e-9, `${policy}: tower within the tether`);
    if (policy === 'aim') {
      assert.ok(r < 1e-9 && maxD <= TOWER_REST_DIST + 1e-6, `aim stands on HOME: ${r}, max ${maxD}`);
      assert.equal(moved, 0, 'aim: the tower comes to rest');
    } else {
      assert.ok(Math.abs(r - KITE_RADIUS) < 3, `kite circles HOME at ${KITE_RADIUS}: ${r}`);
      assert.ok(maxD < KITE_RADIUS + 5, `kite never drifts: max ${maxD}`);
      assert.ok(moved > 25 * 60, 'kite: the tower keeps following');
    }
  }
});

test("measure: aim and kite step out of an orb's path; --no-dodge and idle do not", () => {
  const g = new Game({ seed: 1, timeline: QUIET });
  const o = spawnOrb(g, g.dragon.x + 60, g.dragon.y, -1, 0); // 60 px right, flying straight at it
  const th = orbThreat(g);
  assert.ok(th && th.orb === o && Math.abs(th.along - 60) < 1e-9);
  const m = dodgeMove(g, th);
  assert.ok(Math.abs(m.moveX) < 1e-9 && Math.abs(Math.abs(m.moveY) - 1) < 1e-9, 'straight off the path');
  o.y = g.dragon.y + 5;
  assert.ok(dodgeMove(g, orbThreat(g)).moveY < 0, 'it passes below, so step up');
  o.y = g.dragon.y; o.dx = 1;
  assert.equal(orbThreat(g), null, 'flying away');
  o.dx = -1; o.x = g.dragon.x + 150;
  assert.equal(orbThreat(g), null, 'out of range');
  o.x = g.dragon.x + 60; o.y = g.dragon.y + 30;
  assert.equal(orbThreat(g), null, 'passes wide');
  // In play: the dodging bot is not hit; the same bot without the dodge, and idle, are.
  const hit = (policy, opts) => {
    const h = new Game({ seed: 1, timeline: QUIET });
    h.weapons = [];
    spawnOrb(h, h.dragon.x + 90, h.dragon.y, -1, 0);
    for (let i = 0; i < 90; i++) h.tick({ ...POLICIES[policy](h, opts), pick: -1 });
    return h.tower.hp < h.tower.maxHp;
  };
  assert.equal(hit('aim', {}), false);
  assert.equal(hit('kite', {}), false);
  assert.equal(hit('aim', { dodge: false }), true);
  assert.equal(hit('idle', {}), true);
});

test('measure: tower damage is split by source; fall causes and the causes table', () => {
  const r = runOne({ policy: 'idle', seed: 1, maxSeconds: 120, step: 30 });
  assert.equal(r.capped, false);
  const total = r.lost.reduce((x, b) => x + Object.values(b || {}).reduce((y, v) => y + v, 0), 0);
  assert.ok(Math.abs(total - r.repaired - 100) < 1e-6, `the split adds up to the HP lost: ${total}`);
  assert.equal(r.cause, 'knight');
  assert.equal(causeText([r, r]), 'knight 2');
  const rows = causesTable([r], 30, 120).split('\n').filter((l) => /^\| \d:\d\d–/.test(l));
  assert.match(causesTable([r], 30, 120), /^\| Window \| knight \| Total \|/);
  assert.ok(Math.abs(rows.reduce((x, l) => x + Number(l.split('|')[2]), 0) - 100) < 0.2, 'windows add up to the HP lost');
  assert.match(summaryTable([summarize([r], 120)]), /knight 1 \| 0% \|$/);
});

test('measure: pick rules (naive card 0; greedy repair < 40%, new weapon, top weapon, buff by priority)', () => {
  const g = new Game({ seed: 1 });
  const W = (id, level) => ({ kind: 'weapon', id, level });
  const B = (id, level) => ({ kind: 'buff', id, level });
  const R = { kind: 'repair', id: 'repair', level: 1 };
  const pick = (offers, hp = 100) => { g.offers = offers; g.tower.hp = hp; return PICKS.greedy(g); };
  assert.equal(pick([B('area', 1), W('laser', 1), R], 39), 2);
  assert.equal(pick([B('area', 1), W('laser', 1), R], 40), 1);
  assert.equal(pick([W('fireball', 3), W('ring', 4), B('area', 1)]), 1);
  assert.equal(pick([B('area', 1), B('split', 2), R]), 1);
  assert.equal(pick([B('area', 1), R]), 0);
  assert.equal(pick([R]), 0);
  // among buffs: upgrades first, then BUFF_PRIORITY
  assert.equal(pick([B('area', 1), B('might', 1), B('force', 1)]), 1);
  assert.equal(pick([B('duration', 1), B('amount', 1), B('haste', 1)]), 2);
  assert.equal(pick([B('might', 1), B('velocity', 2), B('explode', 3)]), 2, 'an upgrade beats a new buff');
  assert.deepEqual([...BUFF_PRIORITY].sort(), [...BUFF_IDS].sort(), 'every buff ranked once');
  g.offers = [B('area', 1), W('laser', 1), R];
  assert.equal(PICKS.naive(g), 0);
  assert.equal(botIntent(g, 'idle', 'greedy').pick, 1);
  g.offers = [];
  assert.equal(botIntent(g, 'kite', 'greedy').pick, -1);
});

// A still game with no enemies spawning and no weapons, for the bots' side goals.
const quiet = () => { const g = new Game({ seed: 1, timeline: QUIET }); g.weapons = []; return g; };
const brazierAt = (g, x, y) => { const b = { id: g.nextId++, x, y, anim: 'brazier.burn', frame: 0, frameTicks: 0 }; g.braziers.push(b); return b; };
const pickupAt = (g, kind, x, y) => { const p = { id: g.nextId++, kind, x, y, life: 1800, anim: 'pickup.heart', frame: 0, frameTicks: 0 }; g.pickups.push(p); return p; };
const heads = (it, g, x, y) => it.moveX * (x - g.dragon.x) + it.moveY * (y - g.dragon.y) > 0;

test('measure: aim and kite walk to braziers within range, shoot them in range, and collect pickups', () => {
  const g = quiet();
  const b = brazierAt(g, HOME.x + 400, HOME.y);
  assert.equal(brazierTarget(g), b);
  let it = POLICIES.aim(g);
  assert.ok(heads(it, g, b.x, b.y), 'walks to it');
  assert.ok(it.aimX < 0.5 || !it.hasAim || 400 > SHOOT_RANGE, 'out of shooting range: not aimed at it yet');
  g.dragon.x = b.x - (SHOOT_RANGE - 10);
  it = POLICIES.aim(g);
  assert.ok(it.hasAim && it.aimX > 0.99, 'aims at it within SHOOT_RANGE');
  g.dragon.x = b.x - BRAZIER_STOP + 1;
  it = POLICIES.aim(g);
  assert.ok(!heads(it, g, b.x, b.y) || it.moveX === 0, 'stops within BRAZIER_STOP');
  b.x = HOME.x + BRAZIER_RANGE + 1;
  assert.equal(brazierTarget(g), null, 'too far from HOME');
  assert.equal(POLICIES.aim(g, { braziers: false }).hasAim, false, '--no-braziers ignores them');
  // Pickups: walk to them; a heart only while the tower is hurt.
  g.dragon.x = HOME.x; g.braziers = [];
  const heart = pickupAt(g, 'heart', HOME.x - 100, HOME.y);
  assert.equal(pickupTarget(g), null, 'a heart is left at full HP');
  g.tower.hp = 50;
  assert.equal(pickupTarget(g), heart);
  assert.ok(heads(POLICIES.kite(g), g, heart.x, heart.y));
  const mag = pickupAt(g, 'magnet', HOME.x + 50, HOME.y);
  assert.equal(pickupTarget(g), mag, 'the nearest first');
  assert.equal(POLICIES.idle(g).moveX, undefined, 'idle goes for nothing');
  // In play: a brazier near HOME is broken and its pickup collected within a few seconds.
  const h = quiet();
  h.weapons = [createWeapon('fireball', 1)];
  brazierAt(h, HOME.x + 300, HOME.y - 200);
  let collected = false;
  for (let i = 0; i < 60 * 15 && !collected; i++) {
    const had = h.pickups.length;
    h.tick(botIntent(h, 'kite', 'greedy'));
    collected = had > 0 && h.pickups.length === 0 && h.braziers.length === 0;
  }
  assert.equal(h.braziers.length, 0, 'broken');
  assert.ok(collected || h.pickups.every((p) => p.kind === 'heart'), 'its pickup collected (a heart at full HP is left)');
});

test('measure: the merchant plan: trade when affordable, wait while he comes, rob once he leaves or was hit', () => {
  const g = quiet();
  const m = createMerchant(g, HOME.x + 200, HOME.y, -1, 0); // walking toward HOME
  assert.equal(merchantPlan(g), null, 'nothing affordable and he is coming: wait');
  g.xp = SHOP_PRICES.reroll;
  assert.deepEqual(merchantPlan(g), { mode: 'trade', m });
  assert.equal(merchantPlan(g, { merchant: 'ignore' }), null);
  let it = POLICIES.aim(g);
  assert.ok(heads(it, g, m.x, m.y), 'walks to him');
  assert.ok(it.aimX < -0.99, 'aims away from him');
  m.x = HOME.x + MERCHANT_RANGE + 50;
  assert.equal(merchantPlan(g), null, 'too far from HOME to walk to');
  g.xp = 0;
  m.x = HOME.x - 100; // past HOME, walking away
  assert.equal(merchantPlan(g).mode, 'rob');
  it = POLICIES.kite(g);
  assert.ok(it.aimX < -0.99, 'aims at him');
  m.x = HOME.x - ROB_RANGE - 50;
  assert.equal(merchantPlan(g), null, 'out of range: not chased');
  m.x = HOME.x + 100; m.willTrade = false;
  assert.equal(merchantPlan(g).mode, 'rob', 'hit once: robbed whatever he does');
  // Standing to trade: straight above or below him at TRADE_STAND.
  const h = quiet();
  h.xp = 20;
  const n = createMerchant(h, HOME.x + 60, HOME.y + 20, 0, 0);
  n.dx = 0; n.dy = 0;
  for (let i = 0; i < 120 && !h.shop; i++) h.tick(botIntent(h, 'aim', 'greedy'));
  assert.ok(h.shop, 'the shop opened');
  assert.ok(Math.abs(Math.abs(h.dragon.y - n.y) - TRADE_STAND) < 2 && Math.abs(h.dragon.x - n.x) < 2, 'stood above him');
});

test('measure: shop rules (naive the first affordable offer; greedy card, heal when low, reroll) and greedy rerolls', () => {
  const g = quiet();
  const m = createMerchant(g, 10, 0, 0, 1);
  g.shop = { merchant: m.id, page: 'main', cards: [] };
  g.xp = 0;
  assert.deepEqual(SHOPS.greedy(g), { pick: -1, leave: true });
  assert.deepEqual(SHOPS.naive(g), { pick: -1, leave: true });
  g.xp = SHOP_PRICES.reroll;
  assert.deepEqual(SHOPS.greedy(g), { pick: 0, leave: false });
  assert.deepEqual(SHOPS.naive(g), { pick: 0, leave: false });
  g.xp = Math.max(SHOP_PRICES.card, SHOP_PRICES.heal);
  assert.deepEqual(SHOPS.greedy(g), { pick: 1, leave: false });
  assert.deepEqual(SHOPS.naive(g), { pick: 0, leave: false });
  g.xp = SHOP_PRICES.heal; g.tower.hp = 50;
  if (SHOP_PRICES.heal < SHOP_PRICES.card) assert.deepEqual(SHOPS.greedy(g), { pick: 2, leave: false }, 'a heal below 60%');
  g.shop.page = 'cards';
  g.shop.cards = [{ kind: 'buff', id: 'area', level: 1 }, { kind: 'weapon', id: 'laser', level: 1 }];
  assert.deepEqual(SHOPS.greedy(g), { pick: 1, leave: false });
  assert.deepEqual(SHOPS.naive(g), { pick: 0, leave: false });
  // Rerolls: only with one banked, when no weapon card is offered but the pool has one.
  const h = quiet();
  h.weapons = [createWeapon('fireball', 1)];
  h.offers = [{ kind: 'buff', id: 'area', level: 1 }];
  assert.equal(greedyRerolls(h), false, 'none banked');
  h.rerolls = 1;
  assert.equal(greedyRerolls(h), true);
  assert.equal(botIntent(h, 'aim', 'greedy').reroll, true);
  assert.equal(botIntent(h, 'aim', 'naive').reroll, undefined, 'naive never rerolls');
  h.offers = [{ kind: 'weapon', id: 'laser', level: 1 }];
  assert.equal(greedyRerolls(h), false);
});

test('measure: --princess escort walks to her and aims near her; drag walks away from the golem', () => {
  const g = quiet();
  const p = createPrincess(g, HOME.x + 300, HOME.y);
  const k = createEnemy(g, 'knight', p.x + 50, p.y + 10);
  createEnemy(g, 'knight', g.tower.x - 40, g.tower.y + 10);
  const it = POLICIES.kite(g, { princess: 'escort' });
  assert.ok(heads(it, g, p.x, p.y), 'walks to her');
  assert.ok(Math.abs(Math.atan2(it.aimY, it.aimX) - Math.atan2(k.y - g.dragon.y, k.x - g.dragon.x)) < 1e-9, 'aims at the enemy nearest her');
  assert.notDeepEqual(POLICIES.kite(g), it, 'ignored by default');
  // drag: kite until the golem, then straight away from it.
  const h = quiet();
  assert.deepEqual(POLICIES.drag(h), POLICIES.kite(h));
  createEnemy(h, 'golem', h.dragon.x - 300, h.dragon.y);
  const d = POLICIES.drag(h);
  assert.ok(Math.abs(d.moveX - 1) < 1e-9 && Math.abs(d.moveY) < 1e-9);
  assert.deepEqual(ALL_POLICIES, ['idle', 'aim', 'kite']);
});

test('measure: a run counts braziers, pickups, trades and rescues; the extras table', () => {
  const r = runOne({ policy: 'kite', pick: 'greedy', seed: 3, maxSeconds: 130 });
  const e = r.extras;
  assert.ok(e.broken >= 1, `braziers broken ${e.broken}`);
  assert.ok(Object.values(e.collected).reduce((a, b) => a + b, 0) >= 1, 'a pickup collected');
  const none = runOne({ policy: 'kite', pick: 'greedy', seed: 3, maxSeconds: 130, braziers: false, merchant: 'ignore' });
  assert.equal(none.extras.broken, 0);
  assert.equal(none.extras.bought.reroll + none.extras.bought.card + none.extras.bought.heal, 0);
  const t = extrasTable([r, none]);
  assert.match(t, /^\| Bot \| Braziers broken \|/);
  assert.equal(t.split('\n').length, 3, 'one row per bot');
});
