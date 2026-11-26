// Spawner: ring spawn, budget, timeline interpolation, weights by row, cap (§8.2, §9).
import { SPAWN_RING_RADIUS, MAX_ENEMIES, DT } from './content.js';
import { createEnemy } from './enemies.js';

export function createSpawner() {
  return { budget: 0, spawned: 0, golem: false };
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

// §8.6 a tier from a row's tier weights (keys 1–4); tier 1 when every weight is 0.
export function pickTier(tiers, roll) {
  const k = pickType(tiers, roll);
  return k === null ? 1 : Number(k);
}

// Step 4. Uses game.t at the start of the tick. Each spawn draws its type, then its tier
// (only when the row has tier weights, so a row without them draws nothing extra), then its angle.
export function stepSpawner(game) {
  const sp = game.spawner;
  const tl = game.timeline;
  sp.budget += rateAt(tl, game.t) * DT;
  const row = tl[rowIndexAt(tl, game.t)];
  while (sp.budget >= 1 && game.enemies.length < MAX_ENEMIES) {
    sp.budget -= 1;
    const type = pickType(row.weights, game.rng());
    if (!type) break;
    const tier = row.tiers ? pickTier(row.tiers, game.rng()) : 1;
    const a = game.rng() * 2 * Math.PI;
    const c = game.dragon; // the camera centre is the dragon
    createEnemy(game, type, c.x + SPAWN_RING_RADIUS * Math.cos(a), c.y + SPAWN_RING_RADIUS * Math.sin(a), tier);
    sp.spawned++;
  }
  // At the cap the budget does not bank up: at most one spawn is waiting.
  if (game.enemies.length >= MAX_ENEMIES && sp.budget > 1) sp.budget = 1;
}

// Called from the clock step after `t` advances. On the first tick where `t` reaches a
// timeline row marked `golem` (5:00 in the default table), spawn the mega golem once, on
// the spawn ring on the far side of the tower from the dragon, sound `ohno`. It ignores
// the cap.
export function spawnGolemIfDue(game) {
  const sp = game.spawner;
  if (sp.golem) return;
  const row = game.timeline.find((r) => r.golem);
  if (!row || game.t < row.t) return;
  sp.golem = true;
  const d = game.dragon, t = game.tower;
  let ux = t.x - d.x, uy = t.y - d.y;
  const len = Math.sqrt(ux * ux + uy * uy);
  if (len > 0) { ux /= len; uy /= len; } else { ux = 0; uy = 1; }
  createEnemy(game, 'golem', d.x + SPAWN_RING_RADIUS * ux, d.y + SPAWN_RING_RADIUS * uy);
  game.sound('ohno');
}
