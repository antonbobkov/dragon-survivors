// Spawner: ring spawn, budget, timeline interpolation, weights by row, cap (§8.2, §9).
import { SPAWN_RING_RADIUS, MAX_ENEMIES, DT } from './content.js';
import { createEnemy } from './enemies.js';

export function createSpawner() {
  return { budget: 0, spawned: 0 };
}

// Index of the last row with row.t <= t (weights switch at the boundary).
export function rowIndexAt(timeline, t) {
  let i = 0;
  while (i + 1 < timeline.length && timeline[i + 1].t <= t) i++;
  return i;
}

// Rate linearly interpolated between rows; constant after the last row.
export function rateAt(timeline, t) {
  const i = rowIndexAt(timeline, t);
  const a = timeline[i], b = timeline[i + 1];
  if (!b || t <= a.t) return a.rate;
  return a.rate + (b.rate - a.rate) * (t - a.t) / (b.t - a.t);
}

export function pickType(weights, roll) {
  let total = 0;
  for (const k in weights) total += weights[k];
  if (total <= 0) return null;
  let x = roll * total;
  let last = null;
  for (const k in weights) {
    if (weights[k] <= 0) continue;
    last = k;
    if (x < weights[k]) return k;
    x -= weights[k];
  }
  return last;
}

// Step 4. Uses game.t at the start of the tick.
export function stepSpawner(game) {
  const sp = game.spawner;
  const tl = game.timeline;
  sp.budget += rateAt(tl, game.t) * DT;
  const weights = tl[rowIndexAt(tl, game.t)].weights;
  while (sp.budget >= 1 && game.enemies.length < MAX_ENEMIES) {
    sp.budget -= 1;
    const type = pickType(weights, game.rng());
    if (!type) break;
    const a = game.rng() * 2 * Math.PI;
    const c = game.dragon; // the camera centre is the dragon
    createEnemy(game, type, c.x + SPAWN_RING_RADIUS * Math.cos(a), c.y + SPAWN_RING_RADIUS * Math.sin(a));
    sp.spawned++;
  }
  // At the cap the budget does not bank up: at most one spawn is waiting.
  if (game.enemies.length >= MAX_ENEMIES && sp.budget > 1) sp.budget = 1;
}

// Hook for the roster task (T-004), called from the clock step: at GOLEM_TIME spawn the
// mega golem on the ring on the far side of the tower from the dragon, sound `ohno`.
export function spawnGolemIfDue(game) {}
