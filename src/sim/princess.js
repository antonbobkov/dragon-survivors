// The princess (§14.4): every PRINCESS_INTERVAL s, while none is about, a princess appears on
// the spawn ring and walks to the tower. Enemies near her walk at her instead and hurt her on
// contact as they hurt the tower; the player's weapons never touch her (she is in no hit pass).
// If she reaches the tower its max HP grows and it heals fully; if she falls, nothing else is
// lost. Not an enemy: not in the grid, the cap, the bestiary, separation or the kills.
import {
  DT, CHARACTERS, ENEMIES, tierOf, TOWER_RADIUS, SPAWN_RING_RADIUS, DESPAWN_DIST,
  PRINCESS_INTERVAL, PRINCESS_LURE, PRINCESS_TOWER_HP, PRINCESS_SPARKLE_SCALE,
} from './content.js';
import { advanceAnim, spawnEffect } from './effects.js';

const DEF = CHARACTERS.princess;
export const PRINCESS_INTERVAL_TICKS = Math.round(PRINCESS_INTERVAL / DT);

// Princess: { id, type: 'princess', x, y, r, hp, maxHp, flip, anim, frame, frameTicks }.
export function createPrincess(game, x, y) {
  const t = game.tower;
  const p = {
    id: game.nextId++, type: 'princess', x, y, r: DEF.r, hp: DEF.hp, maxHp: DEF.hp,
    flip: t.x < x, anim: DEF.walk, frame: 0, frameTicks: 0,
  };
  game.princesses.push(p);
  return p;
}

// Step 4, after the merchant: `princessTimer` counts spawner steps; at 0 it restarts and,
// unless a princess is still about, one appears. One draw: the side `a`. She starts on the
// spawn ring, dragon + SPAWN_RING_RADIUS × (cos a, sin a).
export function spawnPrincessIfDue(game) {
  if (--game.princessTimer > 0) return;
  game.princessTimer = PRINCESS_INTERVAL_TICKS;
  if (game.princesses.length > 0) return;
  const a = game.rng() * 2 * Math.PI;
  const d = game.dragon;
  createPrincess(game, d.x + Math.cos(a) * SPAWN_RING_RADIUS, d.y + Math.sin(a) * SPAWN_RING_RADIUS);
}

// The princess an enemy walks at instead of the tower: the nearest live one whose centre is
// within PRINCESS_LURE of the enemy's (ties: the first in the list), or null. The golem and
// the horses never call it.
export function lureOf(game, e) {
  let best = null, bestD2 = PRINCESS_LURE * PRINCESS_LURE;
  for (const p of game.princesses) {
    if (p.hp <= 0) continue;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2 && (best === null || d2 < bestD2)) { best = p; bestD2 = d2; }
  }
  return best;
}

// Step 5, after the merchants. Each princess walks DEF.speed straight at the tower's current
// centre (never past it), facing the way she walks. Once her circle overlaps the tower's she is
// rescued: removed, the tower's max HP grows by PRINCESS_TOWER_HP and it heals to full, sound
// and a sparkle over the tower. One farther than DESPAWN_DIST from the tower is removed silently.
export function stepPrincesses(game) {
  const t = game.tower;
  const list = game.princesses;
  const far2 = DESPAWN_DIST * DESPAWN_DIST, rr = DEF.r + TOWER_RADIUS;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    let dx = t.x - p.x, dy = t.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const step = Math.min(DEF.speed * DT, dist);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      if (dx < 0) p.flip = true;
      else if (dx > 0) p.flip = false;
    }
    advanceAnim(p, true);
    dx = t.x - p.x; dy = t.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < rr * rr) { rescue(game); continue; }
    if (d2 > far2) continue;
    list[n++] = p;
  }
  list.length = n;
}

function rescue(game) {
  const t = game.tower;
  t.maxHp += PRINCESS_TOWER_HP;
  t.hp = t.maxHp;
  game.sound(DEF.arriveSound);
  spawnEffect(game, DEF.sparkle, t.x, t.y, { scale: PRINCESS_SPARKLE_SCALE });
}

const scratch = [];

// Step 8, after enemy vs tower: every live enemy overlapping a princess deals its contact DPS
// (the type's times its tier's, the golem's included) × DT to her, as to the tower (§7.2).
// HP never goes below 0.
export function collidePrincesses(game) {
  const grid = game.grid;
  for (const p of game.princesses) {
    const cands = grid.nearby(p.x, p.y, p.r + grid.maxR, scratch);
    let dmg = 0;
    for (const e of cands) {
      if (e.hp <= 0) continue;
      const rr = e.r + p.r;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy < rr * rr) dmg += ENEMIES[e.type].dps * tierOf(e).dps * DT;
    }
    if (dmg > 0) p.hp = Math.max(0, p.hp - dmg);
  }
}

// Step 9, after the merchant's death: a princess at 0 HP is removed and plays her death where
// she fell (with her `flip`), sound DEF.dieSound. Nothing else is lost: no kill, no gem.
export function princessDeaths(game) {
  const list = game.princesses;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.hp > 0) { list[n++] = p; continue; }
    spawnEffect(game, DEF.die, p.x, p.y, { flip: p.flip });
    game.sound(DEF.dieSound);
  }
  list.length = n;
}
