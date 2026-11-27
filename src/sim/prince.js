// The prince (§14.5): a rival dragon-slayer. An enemy (in `game.enemies`, the grid, every
// weapon's targeting) with his own schedule, walk and theft: he walks at the dragon, steals the
// gems lying near it into his sack, and killed drops one gem worth his sack plus his bounty.
// Always tier 1; not in the spawn weights or the bestiary; harmless to the tower (contact DPS 0).
import {
  DT, ENEMIES, PRINCE_TYPE, PRINCE_INTERVAL, PRINCE_STEAL_RANGE, PRINCE_GRAB_RADIUS,
  PRINCE_STEAL_INTERVAL, PRINCE_STEAL_SOUND, PRINCE_DIE_SOUND, SPAWN_RING_RADIUS, DRAGON_RADIUS,
} from './content.js';
import { advanceAnim } from './effects.js';
import { createEnemy } from './enemies.js';

export const PRINCE_STEAL_TICKS = Math.round(PRINCE_STEAL_INTERVAL / DT);

// Set on a new prince by createEnemy: his sack (`stolen`, XP) and the ticks until his next theft.
export function initPrince(e) {
  e.stolen = 0;
  e.stealTimer = PRINCE_STEAL_TICKS;
}

export const isPrince = (e) => e.type === PRINCE_TYPE;

// Step 4, after the merchant. `game.princeNext` (s) is when the next prince is due. Once `t` (at
// the start of the tick) reaches it, it moves on by PRINCE_INTERVAL until it is past `t` (a debug
// jump skips the ones in between), and unless a prince is alive one appears: one draw, the angle
// `a`, on the spawn ring around the dragon. He is always added, cap or not.
export function spawnPrinceIfDue(game) {
  if (game.t < game.princeNext) return null;
  do game.princeNext += PRINCE_INTERVAL; while (game.princeNext <= game.t);
  if (game.enemies.some(isPrince)) return null;
  const a = game.rng() * 2 * Math.PI;
  const d = game.dragon;
  return createEnemy(game, PRINCE_TYPE, d.x + Math.cos(a) * SPAWN_RING_RADIUS, d.y + Math.sin(a) * SPAWN_RING_RADIUS);
}

// Step 5, his special, before he walks. While his centre is within PRINCE_STEAL_RANGE of the
// dragon's, `stealTimer` counts down; at 0 it restarts and he steals the nearest gem within
// PRINCE_GRAB_RADIUS of his centre that is not homing (ties: the lower id): it leaves
// `game.gems` and its value goes into `stolen`. Out of range the timer restarts, so his first
// theft comes PRINCE_STEAL_INTERVAL after he comes in range. Never busy: he always walks too.
export function princeSpecial(game, e) {
  const d = game.dragon;
  const dx = d.x - e.x, dy = d.y - e.y;
  if (dx * dx + dy * dy > PRINCE_STEAL_RANGE * PRINCE_STEAL_RANGE) {
    e.stealTimer = PRINCE_STEAL_TICKS;
    return false;
  }
  if (--e.stealTimer > 0) return false;
  e.stealTimer = PRINCE_STEAL_TICKS;
  const gems = game.gems;
  const r2 = PRINCE_GRAB_RADIUS * PRINCE_GRAB_RADIUS;
  let best = -1, bestD2 = Infinity;
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    if (g.homing) continue;
    const gx = g.x - e.x, gy = g.y - e.y;
    const d2 = gx * gx + gy * gy;
    if (d2 > r2) continue;
    if (d2 < bestD2 || (d2 === bestD2 && g.id < gems[best].id)) { best = i; bestD2 = d2; }
  }
  if (best < 0) return false;
  e.stolen += gems[best].value;
  gems.splice(best, 1);
  game.sound(PRINCE_STEAL_SOUND);
  return false;
}

// Step 5, instead of walking at the tower: straight at the dragon at his speed, stopping once his
// centre is `r + DRAGON_RADIUS` from the dragon's (never closer by walking). Faces the way he moves.
export function walkPrince(game, e) {
  const d = game.dragon;
  const dx = d.x - e.x, dy = d.y - e.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const stop = e.r + DRAGON_RADIUS;
  if (dist > stop) {
    const step = Math.min(ENEMIES[e.type].speed * DT, dist - stop);
    const vx = (dx / dist) * step;
    e.x += vx;
    e.y += (dy / dist) * step;
    if (vx < 0) e.flip = true;
    else if (vx > 0) e.flip = false;
  }
  advanceAnim(e, true);
}

// Step 9, his death (after the kill and his gem): sound PRINCE_DIE_SOUND; the generic die effect
// (`prince.die`) plays.
export function princeDeath(game) {
  game.sound(PRINCE_DIE_SOUND);
}
