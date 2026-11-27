// Braziers and pickups (§14.2): breakable fires that appear just outside the view and drop
// a heart, a magnet or a bomb, collected by the dragon on contact.
import {
  DT, DESPAWN_DIST, GEM_COLLECT_RADIUS, WEAPONS, VIEW_HALF_W, VIEW_HALF_H,
  BRAZIER_INTERVAL, BRAZIER_MIN_DIST, BRAZIER_MAX_DIST, BRAZIER_SPACING, MAX_BRAZIERS, BRAZIER_TRIES,
  BRAZIER_RADIUS, BRAZIER_SPRITE, BRAZIER_ANIM, BRAZIER_BREAK_ANIM, BRAZIER_SOUND,
  PICKUP_LIFE, PICKUP_KINDS, PICKUPS, HEART_HP, BOMB_DAMAGE, BOMB_TYPE, BOMB_EFFECT_SCALE, EXPLOSION_ANIM,
} from './content.js';
import { advanceAnim, spawnEffect } from './effects.js';
import { dealDamage } from './damage.js';
import { buffMods } from './weapons.js';
import { pickType } from './spawner.js';

export const BRAZIER_INTERVAL_TICKS = Math.round(BRAZIER_INTERVAL / DT);
const SPRITE_SCALE = 2; // §5
const HALF_W = (BRAZIER_SPRITE.w * SPRITE_SCALE) / 2, HALF_H = (BRAZIER_SPRITE.h * SPRITE_SCALE) / 2;
const PICKUP_WEIGHTS = Object.fromEntries(PICKUP_KINDS.map((k) => [k, PICKUPS[k].weight]));

// True when a brazier at (x, y) is wholly outside the view centred on the dragon.
export function outsideView(game, x, y) {
  const d = game.dragon;
  return Math.abs(x - d.x) > VIEW_HALF_W + HALF_W || Math.abs(y - d.y) > VIEW_HALF_H + HALF_H;
}

function spaced(game, x, y) {
  const s2 = BRAZIER_SPACING * BRAZIER_SPACING;
  for (const b of game.braziers) {
    const dx = b.x - x, dy = b.y - y;
    if (dx * dx + dy * dy < s2) return false;
  }
  return true;
}

// Up to BRAZIER_TRIES candidates, each one draw for the angle then one for the distance
// from the tower; the first that is spaced and outside the view wins. Without one, the
// first spaced candidate (inside the view); without that, no brazier. Returns the point or null.
export function placeBrazier(game) {
  const t = game.tower;
  let fallback = null;
  for (let i = 0; i < BRAZIER_TRIES; i++) {
    const a = game.rng() * 2 * Math.PI;
    const dist = BRAZIER_MIN_DIST + game.rng() * (BRAZIER_MAX_DIST - BRAZIER_MIN_DIST);
    const x = t.x + Math.cos(a) * dist, y = t.y + Math.sin(a) * dist;
    if (!spaced(game, x, y)) continue;
    if (outsideView(game, x, y)) return { x, y };
    if (!fallback) fallback = { x, y };
  }
  return fallback;
}

// Step 4, after the enemies: flicker, drop braziers left too far from the tower, and every
// BRAZIER_INTERVAL try to place one while fewer than MAX_BRAZIERS stand.
export function stepBraziers(game) {
  const t = game.tower;
  const far2 = DESPAWN_DIST * DESPAWN_DIST;
  const list = game.braziers;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const dx = b.x - t.x, dy = b.y - t.y;
    if (dx * dx + dy * dy > far2) continue;
    advanceAnim(b, true);
    list[n++] = b;
  }
  list.length = n;
  if (--game.brazierTimer > 0) return;
  game.brazierTimer = BRAZIER_INTERVAL_TICKS;
  if (list.length >= MAX_BRAZIERS) return;
  const p = placeBrazier(game);
  if (p) list.push({ id: game.nextId++, x: p.x, y: p.y, anim: BRAZIER_ANIM, frame: 0, frameTicks: 0 });
}

// A pickup lasts PICKUP_LIFE seconds × the Duration buff, when there is one (§11).
export function pickupLifeTicks(game) {
  const dur = buffMods(game).duration;
  return Math.round((PICKUP_LIFE * (dur > 0 ? dur : 1)) / DT);
}

// One draw picks the pickup; it lies where the brazier stood.
function breakBrazier(game, b) {
  spawnEffect(game, BRAZIER_BREAK_ANIM, b.x, b.y);
  game.sound(BRAZIER_SOUND);
  const kind = pickType(PICKUP_WEIGHTS, game.rng());
  game.pickups.push({ id: game.nextId++, kind, x: b.x, y: b.y, life: pickupLifeTicks(game), anim: PICKUPS[kind].anim, frame: 0, frameTicks: 0 });
}

// Every player hit area: breaks, in list order, each brazier whose circle overlaps the circle
// at (x, y) of radius r. Weapons call it for their hit circles (explosions, the bite's reach).
export function hitBraziers(game, x, y, r) {
  const rr = r + BRAZIER_RADIUS;
  breakBraziersWhere(game, (bx, by) => (bx - x) ** 2 + (by - y) ** 2 < rr * rr);
}

// Any other hit shape: breaks, in list order, each brazier for which `overlaps(x, y, r)` of its
// circle (its centre, BRAZIER_RADIUS) is true. The claws' rectangles and cones use it.
export function breakBraziersWhere(game, overlaps) {
  const list = game.braziers;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (overlaps(b.x, b.y, BRAZIER_RADIUS)) { breakBrazier(game, b); continue; }
    list[n++] = b;
  }
  list.length = n;
}

// Step 8, first: every projectile, then every ring fireball, then every saw blade, breaks the
// braziers it overlaps. Braziers are not targets: a projectile or blade flies on and remembers
// nothing.
export function collideBraziers(game) {
  if (game.braziers.length === 0) return;
  for (const p of game.projectiles) hitBraziers(game, p.x, p.y, p.r);
  for (const w of game.weapons) {
    if (w.id !== 'ring' || !Array.isArray(w.balls)) continue;
    for (const b of w.balls) hitBraziers(game, b.x, b.y, WEAPONS.ring.r);
  }
  for (const b of game.blades || []) hitBraziers(game, b.x, b.y, b.r);
}

// Step 8, last: a pickup within GEM_COLLECT_RADIUS of the dragon is collected; any other
// counts its life down and goes when it runs out.
export function collidePickups(game) {
  const d = game.dragon;
  const list = game.pickups;
  const c2 = GEM_COLLECT_RADIUS * GEM_COLLECT_RADIUS;
  const taken = [];
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const dx = p.x - d.x, dy = p.y - d.y;
    if (dx * dx + dy * dy <= c2) { taken.push(p); continue; }
    advanceAnim(p, true);
    if (--p.life > 0) list[n++] = p;
  }
  list.length = n;
  for (const p of taken) applyPickup(game, p.kind);
}

export function applyPickup(game, kind) {
  if (kind === 'heart') {
    const t = game.tower;
    t.hp = Math.min(t.maxHp, t.hp + HEART_HP);
  } else if (kind === 'magnet') {
    for (const g of game.gems) g.homing = true;
  } else if (kind === 'bomb') {
    bomb(game);
  }
  game.sound(PICKUPS[kind].sound);
}

// BOMB_DAMAGE of BOMB_TYPE through the damage function to every live enemy whose centre is in
// the view around the dragon, in list order; the golem is not touched. Its kills die in this
// tick's deaths step like any other.
export function bomb(game) {
  const d = game.dragon;
  const src = { x: d.x, y: d.y };
  for (const e of game.enemies) {
    if (e.hp <= 0 || e.unkillable) continue;
    if (Math.abs(e.x - d.x) > VIEW_HALF_W || Math.abs(e.y - d.y) > VIEW_HALF_H) continue;
    dealDamage(game, e, BOMB_DAMAGE, BOMB_TYPE, src);
  }
  spawnEffect(game, EXPLOSION_ANIM, d.x, d.y, { scale: BOMB_EFFECT_SCALE });
  game.lastBomb = game.tickCount;
}
