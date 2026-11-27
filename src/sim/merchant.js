// The merchant (§14.3): every MERCHANT_INTERVAL s one crosses the field. Stand by him to trade
// (his shop, shop.js), or rob him: player hits go through the damage function, make him flee and
// end his trading; killed, he drops a chest (a free level-up pick, §14.2). Not an enemy: enemies
// ignore him, he is not in the grid, the cap or the bestiary, and his death is not a kill.
import {
  DT, CHARACTERS, CHEST, MERCHANT_INTERVAL, MERCHANT_LINE_OFFSET, MERCHANT_FLEE_TIME, TRADE_RADIUS, TRADE_TIME,
  SPAWN_RING_RADIUS, DESPAWN_DIST,
} from './content.js';
import { advanceAnim, spawnEffect } from './effects.js';
import { pickupLifeTicks } from './braziers.js';
import { openShop } from './shop.js';

const DEF = CHARACTERS.merchant;
export const MERCHANT_INTERVAL_TICKS = Math.round(MERCHANT_INTERVAL / DT);
export const MERCHANT_FLEE_TICKS = Math.round(MERCHANT_FLEE_TIME / DT);
export const TRADE_TICKS = Math.round(TRADE_TIME / DT);

// Merchant: { id, type: 'merchant', x, y, dx, dy (unit, his route), r, hp, maxHp, flee (ticks
// left fleeing), trade (ticks the dragon has stood by him), willTrade, procImmune, flip, anim,
// frame, frameTicks }. `procImmune`: a projectile that hits him rolls nothing and is used up.
export function createMerchant(game, x, y, dx, dy) {
  const m = {
    id: game.nextId++, type: 'merchant', x, y, dx, dy, r: DEF.r, hp: DEF.hp, maxHp: DEF.hp,
    flee: 0, trade: 0, willTrade: true, procImmune: true, flip: dx < 0,
    anim: DEF.walk, frame: 0, frameTicks: 0,
  };
  game.merchants.push(m);
  return m;
}

// Step 4, after the braziers: `merchantTimer` counts spawner steps; at 0 it restarts and, unless
// a merchant is still about, one appears. Two draws: the side (angle `a`), then the line's
// offset `o` in [−MERCHANT_LINE_OFFSET, MERCHANT_LINE_OFFSET). He starts on the spawn ring,
// dragon + SPAWN_RING_RADIUS × (cos a, sin a), and walks straight at the point `o` px beside the
// tower, perpendicular to the line from his start to the tower, so he crosses the field.
export function spawnMerchantIfDue(game) {
  if (--game.merchantTimer > 0) return;
  game.merchantTimer = MERCHANT_INTERVAL_TICKS;
  if (game.merchants.length > 0) return;
  const a = game.rng() * 2 * Math.PI;
  const o = (game.rng() * 2 - 1) * MERCHANT_LINE_OFFSET;
  const d = game.dragon, t = game.tower;
  const x = d.x + Math.cos(a) * SPAWN_RING_RADIUS, y = d.y + Math.sin(a) * SPAWN_RING_RADIUS;
  const u = unit(t.x - x, t.y - y);
  const v = unit(t.x - u.y * o - x, t.y + u.x * o - y);
  createMerchant(game, x, y, v.x, v.y);
}

function unit(x, y) {
  const l = Math.sqrt(x * x + y * y);
  return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 1 };
}

// Step 5, after the enemies. Fleeing: MERCHANT fleeSpeed straight away from the dragon. Else, if
// he will trade and the dragon is within TRADE_RADIUS: he stands (frame 0) facing the dragon and
// `trade` counts up to TRADE_TICKS (the shop opens in the clock step). Else `trade` is 0 and he
// walks his route. A merchant farther than DESPAWN_DIST from the tower is removed silently.
export function stepMerchants(game) {
  const d = game.dragon, t = game.tower;
  const list = game.merchants;
  const far2 = DESPAWN_DIST * DESPAWN_DIST, near2 = TRADE_RADIUS * TRADE_RADIUS;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const ddx = m.x - d.x, ddy = m.y - d.y;
    if (m.flee > 0) {
      m.flee--;
      const u = ddx !== 0 || ddy !== 0 ? unit(ddx, ddy) : { x: m.dx, y: m.dy };
      walk(m, u.x, u.y, DEF.fleeSpeed);
    } else if (m.willTrade && ddx * ddx + ddy * ddy <= near2) {
      if (m.trade < TRADE_TICKS) m.trade++;
      if (ddx !== 0) m.flip = ddx > 0;
      m.frame = 0;
      m.frameTicks = 0;
    } else {
      m.trade = 0;
      walk(m, m.dx, m.dy, DEF.speed);
    }
    const tx = m.x - t.x, ty = m.y - t.y;
    if (tx * tx + ty * ty > far2) continue;
    list[n++] = m;
  }
  list.length = n;
}

function walk(m, ux, uy, speed) {
  m.x += ux * speed * DT;
  m.y += uy * speed * DT;
  if (ux < 0) m.flip = true;
  else if (ux > 0) m.flip = false;
  advanceAnim(m, true);
}

// Every player hit on him, from the damage function (§12.1): he flees for MERCHANT_FLEE_TIME
// (a new hit restarts it) and never trades again.
export function merchantHit(m) {
  m.flee = MERCHANT_FLEE_TICKS;
  m.trade = 0;
  m.willTrade = false;
}

// The live merchants for which `overlaps(x, y, r)` of their circle is true, in list order.
// Weapons call it with their hit shapes.
export function merchantsHit(game, overlaps) {
  const out = [];
  for (const m of game.merchants) if (m.hp > 0 && overlaps(m.x, m.y, m.r)) out.push(m);
  return out;
}

// Step 9, after the enemies' deaths: a merchant at 0 HP or below is removed, plays his death
// where he stood and leaves a chest there. Not a kill, no gem.
export function merchantDeaths(game) {
  const list = game.merchants;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.hp > 0) { list[n++] = m; continue; }
    spawnEffect(game, DEF.die, m.x, m.y, { flip: m.flip });
    game.sound(DEF.dieSound);
    game.pickups.push({ id: game.nextId++, kind: 'chest', x: m.x, y: m.y, life: pickupLifeTicks(game), anim: CHEST.anim, frame: 0, frameTicks: 0 });
  }
  list.length = n;
}

// Step 12, after the game-over check, while the run is in play: the first merchant who will
// trade and has been stood by for TRADE_TICKS opens his shop. The world freezes from the next tick.
export function openShopIfDue(game) {
  if (game.phase !== 'play' || game.shop) return;
  for (const m of game.merchants) {
    if (m.willTrade && m.hp > 0 && m.trade >= TRADE_TICKS) { openShop(game, m); return; }
  }
}
