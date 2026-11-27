// Balance instrument: plays headless Game runs with scripted bots over a pool of seeds and
// prints Markdown tables (survival time, kills, level, what damaged the tower).
//
// Usage: node tools/measure.mjs [--policy idle|aim|kite|drag|all] [--pick naive|greedy|both] [--gem-range PX]
//                               [--no-dodge] [--no-braziers] [--merchant trade|ignore] [--princess ignore|escort]
//                               [--seeds N] [--first-seed S] [--max-seconds T] [--timeline] [--causes]
//                               [--extras] [--step S] [--set k=v ...] [--meta fire:P/S,arcane:P/S,physical:P/S]
//
// A bot is a movement policy plus a level-up pick rule, named `<policy>+<pick>`.
// Defaults: idle, aim and kite (`all`; drag only when named) with both pick rules, 16 seeds
// (1..16), 420 s cap (7:00). Judge balance with at least 48 seeds: 16 move by several runs.
// A run that reaches the cap is reported as surviving the cap (shown as ">=T"). Survival
// time is game.t at the tick the tower fell (the phase leaves 'play'). The summary also
// names what ended the fallen runs (the source that took the most tower HP in the last
// 30 s before the fall: an enemy type's contact, or `orb` for mage orbs) and the median
// share of ticks on which the tower moved. With --timeline, a second table per bot shows,
// every --step seconds (default 30), the median over seeds of tower HP, enemies alive,
// kills, spawned so far and level (a run that has fallen counts with its final values).
// With --causes, a third table per bot shows the mean tower HP lost per run in each --step
// window by source, and the HP repaired. With --extras, one more table: braziers broken,
// pickups collected, shop purchases, merchants robbed, princesses rescued and lost, rerolls.
//
// The tower follows the dragon (§7.1), so a bot anchored to the tower drifts across the map
// with it. Every bot is anchored to HOME, the dragon's start point, a fixed world point:
//   idle  no input at all: stands on HOME, the fireball fires right, no gems are collected,
//         no orb is dodged, no brazier or merchant is sought. The tower rests below it.
//   aim   stands on HOME and lets the tower come to rest; aims at the enemy nearest the tower.
//   kite  walks a circle of KITE_RADIUS px around HOME (inside the tether, so the tower
//         follows on a smaller circle and keeps moving); aims the same way.
//   drag  kite until the golem comes, then walks straight away from it for good, dragging
//         the tower (the golem check: can a dragged tower outrun it?).
// aim, kite and drag (before the golem) also, the first that applies setting the move:
//   dodge   a mage orb within DODGE_RANGE px that will pass closer than its radius + the
//           dragon's + DODGE_MARGIN: step straight away from its path (the most imminent
//           first). --no-dodge turns it off.
//   trade   a merchant who will trade, while an offer is affordable and he is within
//           MERCHANT_RANGE of HOME: stand TRADE_STAND px above or below him, aiming away from
//           him, until the shop opens; then the pick rule's shop rule. --merchant ignore
//           turns trading and robbing off (a shop that opens is left).
//   escort  with --princess escort: walk to the princess, aiming at the enemy nearest her.
//   pickup  walk to the pickup nearest the dragon within PICKUP_RANGE of HOME (a heart only
//           while the tower is hurt; a robbed merchant's chest too).
//   brazier walk toward the brazier nearest the dragon within BRAZIER_RANGE of HOME until
//           BRAZIER_STOP px from it; aim at it from SHOOT_RANGE. --no-braziers turns
//           braziers and pickups off.
//   gems    fly to the non-homing gem nearest the dragon whenever one lies within GEM_RANGE
//           px of HOME (a gem that has started homing follows the dragon by itself);
//   then the policy's own movement. Aim, first that applies: away from a merchant it
//   trades with; at a merchant it robs (one who was hit, or nothing affordable once he walks
//   away from HOME, within ROB_RANGE of the dragon; never chased); at the enemy nearest the
//   escorted princess; at a brazier within SHOOT_RANGE; at the enemy nearest the tower.
//
// Pick rules (only while `game.offers` is non-empty; the pick tick does not advance time):
//   naive   card 0. In the shop: the first affordable offer (Reroll, Any card, Heal), card 0.
//   greedy  Repair when tower HP < 40%; else an evolution (§10.7); else a new weapon while a slot
//           is free; else the upgrade of the highest-level weapon below 5; else a buff (upgrade
//           an owned one first, then a new one; ties by BUFF_PRIORITY); else card 0. A banked
//           reroll is spent on offers with no weapon card when the pool has one. In the shop:
//           Any card (picked by this rule), else Heal below 60% HP, else Reroll, else leave.
//
// --set runs a what-if without editing content.js (repeatable): `rate.<row t>=<v>` sets a
// timeline row's rate (row t in seconds), `towerHp=<v>` the starting tower HP, and
// `<enemy>.<field>=<v>` a field of ENEMIES, for example `knight.dps=2` (this mutates the
// table for the rest of the process, so only the CLI does it).
//
// --meta plays every run with armoury ranks (§13.1), mapped to the sim's `meta` as the
// browser does: `fire:3/1` is Power rank 3 and Shred rank 1 for fire; types left out are 0/0.
import { Game } from '../src/sim/game.js';
import { DT, TIMELINE, ENEMIES, ENEMY_TYPES, DAMAGE_TYPES, DRAGON_START, DRAGON_RADIUS, TOWER_RADIUS, tierOf, PRINCESS_LURE } from '../src/sim/content.js';
import { shopOffer } from '../src/sim/shop.js';
import { cardPool } from '../src/sim/levelup.js';
import { emptyRanks, metaFromRanks, MAX_RANK } from '../src/armoury.js';
import { pathToFileURL } from 'node:url';

export const HOME = { x: DRAGON_START.x, y: DRAGON_START.y };
export const KITE_RADIUS = 80;
export const GEM_RANGE = 300; // half the view height: about the gems on screen around HOME
export const DODGE_RANGE = 100;
export const DODGE_MARGIN = 4;
// Braziers land 250–450 px from the tower and just outside the view (§14.2), so a range of
// 300 px would see almost none: the bots look as far as the farthest one can land from HOME.
export const BRAZIER_RANGE = 450; // px from HOME: walk to a brazier and shoot it
export const PICKUP_RANGE = 450; // px from HOME: walk to a pickup (or a robbed merchant's chest)
export const SHOOT_RANGE = 380; // px from the dragon within which a bot aims at a brazier
export const BRAZIER_STOP = 150; // px from a brazier where the bot stops walking to it
export const MERCHANT_RANGE = 350; // px from HOME within which a bot walks to the merchant to trade
export const ROB_RANGE = 300; // px from the dragon within which a bot shoots a merchant it will not trade with
export const ESCORT_DIST = 30; // px from the princess where an escorting bot stops
export const TRADE_STAND = 34; // px straight above or below the merchant where a trading bot stands
const REPAIR_BELOW = 0.4;
const SHOP_HEAL_BELOW = 0.6; // the greedy bot buys the shop's heal only below this share of max HP
const CAUSE_WINDOW = 30; // s before a fall in which its cause is counted
export const SOURCES = [...ENEMY_TYPES, 'orb'];

// Nearest live enemy to the tower (ties to the lower list index), or null.
function nearestToTower(game) {
  const t = game.tower;
  let best = null, bestD2 = Infinity;
  for (const e of game.enemies) {
    if (e.hp <= 0) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { best = e; bestD2 = d2; }
  }
  return best;
}

function aimAt(game, e) {
  if (!e) return { aimX: 0, aimY: 0, hasAim: false };
  const d = game.dragon;
  return { aimX: e.x - d.x, aimY: e.y - d.y, hasAim: true };
}

// The non-homing gem nearest the dragon among those within `range` px of HOME, or null.
export function gemTarget(game, range = GEM_RANGE) {
  const d = game.dragon;
  let best = null, bestD2 = Infinity;
  for (const g of game.gems) {
    if (g.homing) continue;
    if (Math.hypot(g.x - HOME.x, g.y - HOME.y) > range) continue;
    const d2 = (g.x - d.x) ** 2 + (g.y - d.y) ** 2;
    if (d2 < bestD2) { best = g; bestD2 = d2; }
  }
  return best;
}

// The mage orb that threatens the dragon soonest, or null. An orb threatens when it is
// within `range` px, still flying toward its closest approach, gets there before it
// expires, and passes closer than its radius + DRAGON_RADIUS + DODGE_MARGIN.
// Returns { orb, along, mx, my }: `along` the px it still flies to the closest approach,
// (mx, my) that closest point minus the dragon.
export function orbThreat(game, range = DODGE_RANGE) {
  const d = game.dragon;
  let best = null;
  for (const o of game.enemyShots) {
    const px = o.x - d.x, py = o.y - d.y;
    if (px * px + py * py > range * range) continue;
    const along = -(px * o.dx + py * o.dy);
    if (along <= 0 || along > o.range - o.travelled) continue;
    const mx = px + o.dx * along, my = py + o.dy * along;
    if (Math.hypot(mx, my) >= o.r + DRAGON_RADIUS + DODGE_MARGIN) continue;
    if (!best || along < best.along) best = { orb: o, along, mx, my };
  }
  return best;
}

// Unit move straight away from the threat's path. A dead-on orb is sidestepped to the
// side of its path that HOME is on (the left of its flight on screen if HOME is on the line).
export function dodgeMove(game, threat) {
  const { orb, mx, my } = threat;
  const l = Math.hypot(mx, my);
  if (l > 1e-6) return { moveX: -mx / l, moveY: -my / l };
  const d = game.dragon;
  let px = orb.dy, py = -orb.dx;
  if (px * (HOME.x - d.x) + py * (HOME.y - d.y) < 0) { px = -px; py = -py; }
  return { moveX: px, moveY: py };
}

// Unit move toward (x, y), or zero when within `stop` px.
function toward(game, x, y, stop = 2) {
  const d = game.dragon;
  const dx = x - d.x, dy = y - d.y;
  const l = Math.hypot(dx, dy);
  return l <= stop ? { moveX: 0, moveY: 0 } : { moveX: dx / l, moveY: dy / l };
}

// Tangent (counter-clockwise on screen) plus a radial correction toward the circle.
function circleMove(game, cx, cy, radius) {
  const d = game.dragon;
  let rx = d.x - cx, ry = d.y - cy;
  const rl = Math.hypot(rx, ry);
  if (rl < 1e-9) { rx = 1; ry = 0; } else { rx /= rl; ry /= rl; }
  const k = Math.max(-1, Math.min(1, (radius - rl) / 20));
  const mx = ry + rx * k * 2, my = -rx + ry * k * 2;
  const ml = Math.hypot(mx, my);
  return { moveX: mx / ml, moveY: my / ml };
}

const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);

// The nearest to the dragon of `list` that passes `ok`, or null.
function nearestToDragon(game, list, ok) {
  const d = game.dragon;
  let best = null, bestD = Infinity;
  for (const it of list) {
    if (!ok(it)) continue;
    const dd = dist(it, d.x, d.y);
    if (dd < bestD) { best = it; bestD = dd; }
  }
  return best;
}

// The pickup the bot walks to: the nearest to the dragon within `range` px of HOME, but never a
// heart while the tower is at full HP (it is left for later). Null if none.
export function pickupTarget(game, range = PICKUP_RANGE) {
  const t = game.tower;
  return nearestToDragon(game, game.pickups, (p) => dist(p, HOME.x, HOME.y) <= range && !(p.kind === 'heart' && t.hp >= t.maxHp));
}

// The brazier the bot goes for: the nearest to the dragon within `range` px of HOME, or null.
export function brazierTarget(game, range = BRAZIER_RANGE) {
  return nearestToDragon(game, game.braziers, (b) => dist(b, HOME.x, HOME.y) <= range);
}

// Whether any shop offer is affordable and useful now (§14.3).
export function canTrade(game) {
  return ['reroll', 'card', 'heal'].some((id) => shopOffer(game, id).ok);
}

// What the bot does about the merchant: { mode: 'trade' | 'rob', m } or null. Trade: he will
// trade, an offer is affordable and he is within MERCHANT_RANGE of HOME (walk to him, aim away
// from him). Rob: he will not trade (hit already), or nothing is affordable and he is walking
// away from HOME (he has passed: the XP will not come in time), and he is within ROB_RANGE of
// the dragon (aim at him; the bot does not chase him). While he approaches and nothing is
// affordable yet, the bot waits.
export function merchantPlan(game, o = {}) {
  if (o.merchant === 'ignore') return null;
  const m = game.merchants.find((x) => x.hp > 0);
  if (!m) return null;
  const d = game.dragon;
  if (m.willTrade && canTrade(game)) return dist(m, HOME.x, HOME.y) <= MERCHANT_RANGE ? { mode: 'trade', m } : null;
  const leaving = m.dx * (m.x - HOME.x) + m.dy * (m.y - HOME.y) > 0;
  if (m.willTrade && !leaving) return null;
  return dist(m, d.x, d.y) <= ROB_RANGE ? { mode: 'rob', m } : null;
}

// The princess an escorting bot walks to, or null.
export function princessTarget(game) {
  return game.princesses.find((p) => p.hp > 0) || null;
}

// The live enemy nearest (x, y) within `range` px, or null.
function nearestEnemyTo(game, x, y, range = Infinity) {
  let best = null, bestD = range;
  for (const e of game.enemies) {
    if (e.hp <= 0) continue;
    const dd = dist(e, x, y);
    if (dd < bestD) { best = e; bestD = dd; }
  }
  return best;
}

// aim, kite and drag: one tick's move and aim. Move, first that applies: dodge an orb; stand by
// a merchant to trade; escort the princess (--princess escort); walk to a pickup; walk to a
// brazier until within BRAZIER_STOP; fly to a gem; the policy's own move. Aim, first that
// applies: away from a merchant it trades with; at a merchant it robs; at the enemy nearest the
// escorted princess; at a brazier within SHOOT_RANGE; at the enemy nearest the tower.
// --no-braziers drops pickups and braziers, --merchant ignore the merchant.
function moving(game, o, own) {
  const d = game.dragon;
  const threat = o.dodge === false ? null : orbThreat(game);
  const mp = merchantPlan(game, o);
  const princess = o.princess === 'escort' ? princessTarget(game) : null;
  const items = o.braziers !== false;
  const pickup = items ? pickupTarget(game) : null;
  const brazier = items ? brazierTarget(game) : null;
  let aim;
  if (mp && mp.mode === 'trade') {
    const ax = d.x - mp.m.x, ay = d.y - mp.m.y;
    aim = ax || ay ? { aimX: ax, aimY: ay, hasAim: true } : aimAt(game, nearestToTower(game));
  } else if (mp) aim = aimAt(game, mp.m);
  else if (princess) aim = aimAt(game, nearestEnemyTo(game, princess.x, princess.y, PRINCESS_LURE + 40) || nearestToTower(game));
  else if (brazier && dist(brazier, d.x, d.y) <= SHOOT_RANGE) aim = aimAt(game, brazier);
  else aim = aimAt(game, nearestToTower(game));
  let move;
  if (threat) move = dodgeMove(game, threat);
  else if (mp && mp.mode === 'trade') {
    // Stand TRADE_STAND px straight above or below him (the side the dragon is on), aiming away:
    // outside the left claw's rectangle band and the right claw's apex, inside the ring's orbit.
    const sy = d.y < mp.m.y ? -1 : 1;
    move = toward(game, mp.m.x, mp.m.y + sy * TRADE_STAND, 1);
  }
  else if (princess) move = toward(game, princess.x, princess.y, ESCORT_DIST);
  else if (pickup) move = toward(game, pickup.x, pickup.y, 0);
  else if (brazier && dist(brazier, d.x, d.y) > BRAZIER_STOP) move = toward(game, brazier.x, brazier.y);
  else {
    const gem = gemTarget(game, o.gemRange);
    move = gem ? toward(game, gem.x, gem.y, 0) : own();
  }
  return { ...move, ...aim };
}

// The golem, if it has come (§13).
const golemOf = (game) => game.enemies.find((e) => e.type === 'golem') || null;

// Movement policies: (game, opts) -> intent without `pick`.
export const POLICIES = {
  idle: () => ({}),
  aim: (game, o = {}) => moving(game, o, () => toward(game, HOME.x, HOME.y)),
  kite: (game, o = {}) => moving(game, o, () => circleMove(game, HOME.x, HOME.y, KITE_RADIUS)),
  // kite until the golem comes, then walk straight away from it for good, dragging the tower on
  // the tether (dodging orbs, still aiming at the enemy nearest the tower): can the tower outrun it?
  drag: (game, o = {}) => {
    const g = golemOf(game);
    if (!g) return moving(game, o, () => circleMove(game, HOME.x, HOME.y, KITE_RADIUS));
    const d = game.dragon;
    const threat = o.dodge === false ? null : orbThreat(game);
    let ux = d.x - g.x, uy = d.y - g.y;
    const l = Math.hypot(ux, uy) || 1;
    ux /= l; uy /= l;
    return { ...(threat ? dodgeMove(game, threat) : { moveX: ux, moveY: uy }), ...aimAt(game, nearestToTower(game)) };
  },
};

// `--policy all`: drag plays like kite until 5:00, so it runs only when named.
export const ALL_POLICIES = ['idle', 'aim', 'kite'];

const indexWhere = (offers, fn) => offers.findIndex(fn);

// The greedy bot's buff preference, best first: damage and fire rate, then more shots and the
// fireball's procs, then the rest.
export const BUFF_PRIORITY = ['might', 'haste', 'amount', 'explode', 'split', 'pierce', 'area', 'velocity', 'force', 'duration'];
const bestBuff = (offers, fn) => {
  let best = -1;
  offers.forEach((c, k) => {
    if (c.kind === 'buff' && fn(c) && (best < 0 || BUFF_PRIORITY.indexOf(c.id) < BUFF_PRIORITY.indexOf(offers[best].id))) best = k;
  });
  return best;
};

// Pick rules: game (with offers open) -> card index.
export const PICKS = {
  naive: () => 0,
  greedy: (game) => greedyCard(game, game.offers),
};

// The greedy rule over a list of cards (level-up offers or the shop's cards page).
export function greedyCard(game, o) {
  const tw = game.tower;
  let i;
  if (tw.hp < REPAIR_BELOW * tw.maxHp && (i = indexWhere(o, (c) => c.kind === 'repair')) >= 0) return i;
  if ((i = indexWhere(o, (c) => c.kind === 'evolve')) >= 0) return i;
  if ((i = indexWhere(o, (c) => c.kind === 'weapon' && c.level === 1)) >= 0) return i;
  let best = -1, bestLevel = -1;
  o.forEach((c, k) => { if (c.kind === 'weapon' && c.level > bestLevel) { best = k; bestLevel = c.level; } });
  if (best >= 0) return best;
  if ((i = bestBuff(o, (c) => c.level > 1)) >= 0) return i;
  if ((i = bestBuff(o, () => true)) >= 0) return i;
  return 0;
}

// Whether the greedy bot spends a reroll on these offers: it has one, no offer is an evolution,
// a new weapon or a weapon upgrade, Repair is not needed, and the pool holds such a card.
export function greedyRerolls(game) {
  if (game.rerolls <= 0) return false;
  const want = (c) => c.kind === 'evolve' || c.kind === 'weapon';
  const tw = game.tower;
  if (tw.hp < REPAIR_BELOW * tw.maxHp) return false;
  if (game.offers.some(want)) return false;
  return cardPool(game).some((p) => want(p.card));
}

// Shop rules (§14.3), while the shop is open: -> { pick, leave }. naive: the first affordable
// offer (Reroll, Any card, Heal), card 0 on the cards page. greedy: Any card (picked by the
// greedy rule), else Heal below SHOP_HEAL_BELOW of max HP, else Reroll, else leave.
export const SHOPS = {
  naive: (game) => {
    const s = game.shop;
    if (s.page === 'cards') return { pick: s.cards.length ? 0 : -1, leave: !s.cards.length };
    const i = ['reroll', 'card', 'heal'].findIndex((id) => shopOffer(game, id).ok);
    return i >= 0 ? { pick: i, leave: false } : { pick: -1, leave: true };
  },
  greedy: (game) => {
    const s = game.shop, tw = game.tower;
    if (s.page === 'cards') return s.cards.length ? { pick: greedyCard(game, s.cards), leave: false } : { pick: -1, leave: true };
    if (shopOffer(game, 'card').ok) return { pick: 1, leave: false };
    if (shopOffer(game, 'heal').ok && tw.hp < SHOP_HEAL_BELOW * tw.maxHp) return { pick: 2, leave: false };
    if (shopOffer(game, 'reroll').ok) return { pick: 0, leave: false };
    return { pick: -1, leave: true };
  },
};

// The intent of bot `policy` + `pick` for one tick. Level-up offers: the pick rule (greedy may
// reroll first). The shop (§14.3): the pick rule's shop rule, or leave at once with
// `merchant: 'ignore'` (and for idle, which never walks to him).
export function botIntent(game, policy, pick = 'naive', opts = {}) {
  const p = POLICIES[policy], k = PICKS[pick];
  if (!p) throw new Error(`unknown policy "${policy}"`);
  if (!k) throw new Error(`unknown pick rule "${pick}"`);
  const base = p(game, opts);
  if (game.offers.length) {
    if (pick === 'greedy' && greedyRerolls(game)) return { ...base, pick: -1, reroll: true, leave: false };
    return { ...base, pick: k(game), leave: false };
  }
  if (game.shop) {
    if (opts.merchant === 'ignore' || policy === 'idle') return { ...base, pick: -1, leave: true };
    return { ...base, ...SHOPS[pick](game) };
  }
  return { ...base, pick: -1, leave: false };
}

// Instrument only: wraps this game's collisions step to split the tower HP it takes by
// source, into whole-second buckets `lost[s][source]`. The orbs that will hit are those
// overlapping the dragon when the step starts (nothing in it moves them or the dragon);
// contact is split by the live enemies overlapping the tower afterwards (the step changes
// no position after enemy vs tower, and enemies it kills are already skipped there). The
// split is scaled to the HP actually lost, so a tower clamped at 0 adds up.
function trackDamage(game) {
  const lost = [];
  const step = game.stepCollisions.bind(game);
  game.stepCollisions = () => {
    const d = game.dragon, t = game.tower;
    let orb = 0;
    for (const o of game.enemyShots) {
      const dx = o.x - d.x, dy = o.y - d.y, rr = o.r + DRAGON_RADIUS;
      if (dx * dx + dy * dy < rr * rr) orb += o.damage;
    }
    const hp0 = t.hp;
    step();
    const drop = hp0 - t.hp;
    if (drop <= 0) return;
    const by = { orb };
    let total = orb;
    for (const e of game.enemies) {
      if (e.hp <= 0) continue;
      const rr = e.r + TOWER_RADIUS, dx = e.x - t.x, dy = e.y - t.y;
      if (dx * dx + dy * dy < rr * rr) { const v = ENEMIES[e.type].dps * tierOf(e).dps * DT; by[e.type] = (by[e.type] || 0) + v; total += v; }
    }
    const s = Math.floor(game.t + 1e-9);
    const b = lost[s] || (lost[s] = {});
    for (const k in by) if (by[k] > 0) b[k] = (b[k] || 0) + by[k] * drop / total;
  };
  return lost;
}

// One run. Returns { seed, policy, pick, bot, survived, capped, kills, level, spawned,
// samples, lost (per-second HP lost by source), repaired, cause (null if capped), moved,
// extras }. `extras`: braziers broken, pickups collected by kind (heart, magnet, bomb, chest),
// shop purchases by offer (reroll, card, heal), merchants robbed (killed), princesses rescued
// and lost, rerolls used. Options: `braziers` (false: ignore braziers and pickups), `merchant`
// ('trade', the default, or 'ignore'), `princess` ('ignore', the default, or 'escort').
export function runOne({ policy, pick = 'naive', seed, maxSeconds = 420, step = 0, timeline, towerHp, gemRange, dodge, meta, braziers, merchant, princess } = {}) {
  botIntent(new Game({ seed: 1 }), policy, pick); // validates the names
  const game = new Game({ seed, ...(timeline ? { timeline } : {}), ...(meta ? { meta } : {}) });
  if (towerHp) { game.tower.hp = towerHp; game.tower.maxHp = towerHp; }
  const lost = trackDamage(game);
  const maxTicks = Math.round(maxSeconds / DT);
  const stepTicks = step > 0 ? Math.round(step / DT) : 0;
  const samples = [];
  const sample = () => samples.push({ t: game.t, hp: game.tower.hp, alive: game.enemies.length, kills: game.kills, spawned: game.spawner.spawned, level: game.level });
  let repaired = 0, movedTicks = 0, worldTicks = 0;
  const extras = { broken: 0, collected: { heart: 0, magnet: 0, bomb: 0, chest: 0 }, bought: { reroll: 0, card: 0, heal: 0 }, robbed: 0, rescued: 0, princessLost: 0, rerolled: 0 };
  const seenPickups = new Set();
  // Ticks spent with offers open do not advance the clock; bound them so a broken pick
  // flow cannot hang the instrument.
  let guard = maxTicks * 4 + 1000;
  const opts = { gemRange, dodge, braziers, merchant, princess };
  while (game.phase === 'play' && game.tickCount < maxTicks && guard-- > 0) {
    const before = game.tickCount, hp0 = game.tower.hp, picking = game.offers.length > 0;
    const shop = game.shop ? { page: game.shop.page, xp: game.xp, rerolls: game.rerolls } : null;
    const live = new Map(game.pickups.filter((p) => p.life > 1).map((p) => [p.id, p.kind]));
    const ladies = game.princesses.map((p) => p.id), maxHp0 = game.tower.maxHp, rr0 = game.rerolls;
    const intent = botIntent(game, policy, pick, opts);
    game.tick(intent);
    if (picking) repaired += game.tower.hp - hp0;
    if (picking && game.rerolls < rr0) extras.rerolled++;
    if (shop && !game.shop && game.xp < shop.xp) {
      const what = shop.page === 'cards' ? 'card' : ['reroll', 'card', 'heal'][intent.pick];
      if (what) extras.bought[what]++;
    }
    if (game.tickCount !== before) {
      worldTicks++;
      if (game.tower.moved) movedTicks++;
      if (stepTicks && game.tickCount % stepTicks === 0) sample();
      const now = new Set(game.pickups.map((p) => p.id));
      for (const [id, kind] of live) if (!now.has(id)) extras.collected[kind]++;
      for (const p of game.pickups) {
        if (seenPickups.has(p.id)) continue;
        seenPickups.add(p.id);
        if (p.kind === 'chest') extras.robbed++; else extras.broken++;
      }
      if (game.tower.maxHp > maxHp0) extras.rescued++;
      else if (ladies.length && !game.princesses.some((p) => p.id === ladies[0])) extras.princessLost++;
    }
  }
  const capped = game.phase === 'play';
  let cause = null;
  if (!capped) {
    const sum = {};
    for (let s = Math.max(0, Math.floor(game.t) - CAUSE_WINDOW); s < lost.length; s++) {
      for (const k in lost[s] || {}) sum[k] = (sum[k] || 0) + lost[s][k];
    }
    for (const k of SOURCES) if (sum[k] > 0 && (!cause || sum[k] > sum[cause])) cause = k;
  }
  return {
    seed, policy, pick, bot: `${policy}+${pick}`, survived: game.t, capped, kills: game.kills, level: game.level,
    spawned: game.spawner.spawned, samples, lost, repaired, cause, moved: worldTicks ? movedTicks / worldTicks : 0, extras,
  };
}

// Per bot: what it did besides fighting, mean per run (runs with at least one in brackets where
// that reads better): braziers broken, pickups collected, shop purchases, merchants robbed,
// princesses rescued and lost, rerolls used.
export function extrasTable(runs) {
  const out = ['| Bot | Braziers broken | Hearts | Magnets | Bombs | Trades (runs) | Cards / heals / rerolls bought | Robbed (runs) | Chests | Rescued / lost | Rerolls used |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  const by = {};
  for (const r of runs) (by[r.bot] || (by[r.bot] = [])).push(r);
  for (const bot of Object.keys(by)) {
    const rs = by[bot], n = rs.length;
    const mean = (f) => (rs.reduce((x, r) => x + f(r.extras), 0) / n).toFixed(1);
    const runsWith = (f) => rs.filter((r) => f(r.extras) > 0).length;
    const trades = (e) => e.bought.reroll + e.bought.card + e.bought.heal;
    out.push(`| ${bot} | ${mean((e) => e.broken)} | ${mean((e) => e.collected.heart)} | ${mean((e) => e.collected.magnet)} | ${mean((e) => e.collected.bomb)} | ${mean(trades)} (${runsWith(trades)}/${n}) | ${mean((e) => e.bought.card)} / ${mean((e) => e.bought.heal)} / ${mean((e) => e.bought.reroll)} | ${mean((e) => e.robbed)} (${runsWith((e) => e.robbed)}/${n}) | ${mean((e) => e.collected.chest)} | ${mean((e) => e.rescued)} / ${mean((e) => e.princessLost)} | ${mean((e) => e.rerolled)} |`);
  }
  return out.join('\n');
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

const fmtT = (x, capped) => (capped ? '>=' : '') + x.toFixed(1);

// "golem 5, slime 3": what ended the fallen runs, most frequent first (ties in SOURCES order).
export function causeText(runs) {
  const n = {};
  for (const r of runs) if (r.cause) n[r.cause] = (n[r.cause] || 0) + 1;
  const keys = SOURCES.filter((k) => n[k]).sort((a, b) => n[b] - n[a]);
  return keys.length ? keys.map((k) => `${k} ${n[k]}`).join(', ') : '-';
}

// Summary row for one bot's runs. `golem` counts runs that reached 5:00.
export function summarize(runs, maxSeconds) {
  const ts = runs.map((r) => r.survived);
  const med = median(ts), min = Math.min(...ts), max = Math.max(...ts);
  const capT = (x) => x >= maxSeconds - DT / 2;
  return {
    policy: runs[0].bot || runs[0].policy, seeds: runs.length,
    median: med, min, max, capped: runs.filter((r) => r.capped).length,
    golem: runs.filter((r) => r.survived >= 300 - DT / 2).length,
    medianText: fmtT(med, capT(med)), minText: fmtT(min, capT(min)), maxText: fmtT(max, capT(max)),
    kills: median(runs.map((r) => r.kills)), level: median(runs.map((r) => r.level)),
    causes: causeText(runs), moved: median(runs.map((r) => r.moved || 0)),
  };
}

export function summaryTable(rows) {
  const out = ['| Bot | Seeds | Median s | Min s | Max s | Reached 5:00 | Reached cap | Kills (median) | Level (median) | Fall causes | Tower moving |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.policy} | ${r.seeds} | ${r.medianText} | ${r.minText} | ${r.maxText} | ${r.golem} | ${r.capped} | ${r.kills} | ${r.level} | ${r.causes} | ${Math.round(r.moved * 100)}% |`);
  return out.join('\n');
}

// Median over seeds at each sample time; a fallen run contributes its final values.
export function timelineTable(runs, step, maxSeconds) {
  const out = [`| t s | Tower HP | Enemies alive | Kills | Spawned | Level |`, '|---|---|---|---|---|---|'];
  for (let t = step; t <= maxSeconds + 1e-9; t += step) {
    const at = runs.map((r) => {
      const s = r.samples.filter((x) => x.t <= t + 1e-9);
      const last = s[s.length - 1];
      if (last && Math.abs(last.t - t) < 1e-6) return last;
      return { hp: 0, alive: last ? last.alive : 0, kills: r.kills, spawned: r.spawned, level: r.level, fallen: true };
    });
    const fallen = at.filter((x) => x.fallen).length;
    const m = (k) => median(at.map((x) => x[k]));
    out.push(`| ${Math.round(t)} | ${m('hp').toFixed(0)} | ${m('alive')} | ${m('kills')} | ${m('spawned')}${fallen ? ` (${fallen} fallen)` : ''} | ${m('level')} |`);
    if (fallen === runs.length) break;
  }
  return out.join('\n');
}

// Mean tower HP lost per run in each `step`-second window, by source; columns only for
// sources that did any damage. The last column is the mean HP repaired over the whole run.
export function causesTable(runs, step, maxSeconds) {
  const used = SOURCES.filter((k) => runs.some((r) => r.lost.some((b) => b && b[k] > 0)));
  const out = [`| Window | ${used.join(' | ')} | Total |`, `|---|${used.map(() => '---|').join('')}---|`];
  const last = Math.max(...runs.map((r) => r.survived));
  for (let a = 0; a < Math.min(maxSeconds, last + 1e-9); a += step) {
    const sum = Object.fromEntries(used.map((k) => [k, 0]));
    for (const r of runs) for (let s = a; s < a + step; s++) for (const k of used) sum[k] += (r.lost[s] && r.lost[s][k]) || 0;
    const cells = used.map((k) => (sum[k] / runs.length).toFixed(1));
    const total = used.reduce((x, k) => x + sum[k], 0) / runs.length;
    const mmss = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
    out.push(`| ${mmss(a)}–${mmss(a + step)} | ${cells.join(' | ')} | ${total.toFixed(1)} |`);
  }
  out.push(`\nRepaired (mean HP per run): ${(runs.reduce((x, r) => x + r.repaired, 0) / runs.length).toFixed(1)}`);
  return out.join('\n');
}

function parseArgs(argv) {
  const o = { policy: 'all', pick: 'both', gemRange: undefined, dodge: true, seeds: 16, firstSeed: 1, maxSeconds: 420, timeline: false, causes: false, step: 30, set: [], meta: null, braziers: true, merchant: 'trade', princess: 'ignore', extras: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--policy') { o.policy = v; i++; }
    else if (a === '--pick') { o.pick = v; i++; }
    else if (a === '--gem-range') { o.gemRange = Number(v); i++; }
    else if (a === '--seeds') { o.seeds = Number(v); i++; }
    else if (a === '--first-seed') { o.firstSeed = Number(v); i++; }
    else if (a === '--max-seconds') { o.maxSeconds = Number(v); i++; }
    else if (a === '--step') { o.step = Number(v); i++; }
    else if (a === '--set') { o.set.push(v); i++; }
    else if (a === '--meta') { o.meta = v; i++; }
    else if (a === '--timeline') o.timeline = true;
    else if (a === '--causes') o.causes = true;
    else if (a === '--no-dodge') o.dodge = false;
    else if (a === '--no-braziers') o.braziers = false;
    else if (a === '--merchant') { o.merchant = v; i++; if (!['trade', 'ignore'].includes(v)) throw new Error('--merchant trade|ignore'); }
    else if (a === '--princess') { o.princess = v; i++; if (!['ignore', 'escort'].includes(v)) throw new Error('--princess ignore|escort'); }
    else if (a === '--extras') o.extras = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

// --meta "fire:3/1,arcane:0/2": armoury ranks (Power/Shred per damage type, 0..MAX_RANK).
// Returns { ranks, meta } with `meta` mapped as the browser maps it.
export function parseMeta(text) {
  const ranks = emptyRanks();
  for (const part of String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^([a-z]+):(\d+)\/(\d+)$/.exec(part);
    if (!m || !DAMAGE_TYPES.includes(m[1])) throw new Error(`bad --meta "${part}" (want type:power/shred, type one of ${DAMAGE_TYPES.join(', ')})`);
    const p = Number(m[2]), sh = Number(m[3]);
    if (p > MAX_RANK || sh > MAX_RANK) throw new Error(`bad --meta "${part}" (ranks 0..${MAX_RANK})`);
    ranks.power[m[1]] = p;
    ranks.shred[m[1]] = sh;
  }
  return { ranks, meta: metaFromRanks(ranks) };
}

// --set overrides: returns { timeline, towerHp } for runOne; enemy fields are written to ENEMIES.
export function applySets(sets) {
  let timeline, towerHp;
  for (const s of sets) {
    const m = /^([A-Za-z]+)\.?([A-Za-z0-9]*)=(-?\d+(?:\.\d+)?)$/.exec(s || '');
    if (!m) throw new Error(`bad --set "${s}"`);
    const [, a, b, v] = m;
    const x = Number(v);
    if (a === 'towerHp' && !b) towerHp = x;
    else if (a === 'rate') {
      timeline = timeline || TIMELINE.map((r) => ({ ...r }));
      const row = timeline.find((r) => r.t === Number(b));
      if (!row) throw new Error(`no timeline row at t=${b}`);
      row.rate = x;
    } else if (ENEMIES[a] && b in ENEMIES[a]) ENEMIES[a][b] = x;
    else throw new Error(`bad --set "${s}"`);
  }
  return { timeline, towerHp };
}

export function main(argv) {
  const o = parseArgs(argv);
  if (o.help) { console.log('node tools/measure.mjs [--policy idle|aim|kite|drag|all] [--pick naive|greedy|both] [--gem-range PX] [--no-dodge] [--no-braziers] [--merchant trade|ignore] [--princess ignore|escort] [--extras] [--seeds N] [--first-seed S] [--max-seconds T] [--timeline] [--causes] [--step S] [--set k=v ...] [--meta fire:P/S,arcane:P/S,physical:P/S]'); return; }
  const names = o.policy === 'all' ? ALL_POLICIES : o.policy.split(',');
  const picks = o.pick === 'both' ? Object.keys(PICKS) : o.pick.split(',');
  const { timeline, towerHp } = applySets(o.set);
  const meta = o.meta !== null ? parseMeta(o.meta).meta : undefined;
  const rows = [], all = {};
  const start = process.hrtime.bigint();
  for (const policy of names) {
    for (const pick of picks) {
      const runs = [];
      for (let s = 0; s < o.seeds; s++) {
        runs.push(runOne({ policy, pick, seed: o.firstSeed + s, maxSeconds: o.maxSeconds, step: o.timeline ? o.step : 0, timeline, towerHp, gemRange: o.gemRange, dodge: o.dodge, meta, braziers: o.braziers, merchant: o.merchant, princess: o.princess }));
      }
      all[`${policy}+${pick}`] = runs;
      rows.push(summarize(runs, o.maxSeconds));
    }
  }
  const secs = Number(process.hrtime.bigint() - start) / 1e9;
  const notes = [o.gemRange !== undefined ? `gem range ${o.gemRange} px` : '', o.dodge ? '' : 'no dodge', o.set.length ? `set ${o.set.join(' ')}` : '', o.meta !== null ? `meta ${o.meta}` : '', o.braziers ? '' : 'no braziers', o.merchant === 'trade' ? '' : 'merchant ignored', o.princess === 'ignore' ? '' : 'princess escorted'].filter(Boolean);
  console.log(`Seeds ${o.firstSeed}..${o.firstSeed + o.seeds - 1}, cap ${o.maxSeconds} s${notes.length ? ', ' + notes.join(', ') : ''}\n`);
  console.log(summaryTable(rows));
  if (o.extras) console.log('\n' + extrasTable(Object.values(all).flat()));
  for (const bot of Object.keys(all)) {
    if (o.timeline) {
      console.log(`\n**${bot}** (median over seeds, every ${o.step} s)\n`);
      console.log(timelineTable(all[bot], o.step, o.maxSeconds));
    }
    if (o.causes) {
      console.log(`\n**${bot}** tower HP lost by source (mean per run, ${o.step} s windows)\n`);
      console.log(causesTable(all[bot], o.step, o.maxSeconds));
    }
  }
  console.log(`\n(${secs.toFixed(1)} s wall)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
