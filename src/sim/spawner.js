// Spawner: ring spawn, budget, timeline interpolation, weights by row, cap (§8.2, §9), horse
// stampedes (§8.8).
import { SPAWN_RING_RADIUS, MAX_ENEMIES, DT, STAMPEDE_TYPE, STAMPEDE_SPACING } from './content.js';
import { createEnemy } from './enemies.js';

// `spawned` counts budget spawns; `stampedes` the stampedes so far; `nextStampede` the time (s)
// from which the next stampede is due while the current row has stampedes.
export function createSpawner() {
  return { budget: 0, spawned: 0, golem: false, stampedes: 0, nextStampede: 0 };
}

// Index of the last row with row.t <= t (weights switch at the boundary).
export function rowIndexAt(timeline, t) {
  let i = 0;
  while (i + 1 < timeline.length && timeline[i + 1].t <= t) i++;
  return i;
}

// §9.1 the stages: the rows with a `stage` name, numbered from 1 in table order.
export function stagesOf(timeline) {
  return timeline.filter((r) => r.stage).map((r, i) => ({ n: i + 1, name: r.stage, t: r.t }));
}

// The stage running at `t` (the last one started), or null before the first.
export function stageAt(timeline, t) {
  let cur = null;
  for (const s of stagesOf(timeline)) if (s.t <= t) cur = s;
  return cur;
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
  stepStampede(game, row);
}

// §8.8, after the budget spawns. While the current row has a stampede and `t` has reached
// `nextStampede`, one stampede spawns and `nextStampede` moves on by the row's `every` until it
// is past `t` (so a debug jump skips the stampedes in between instead of releasing them).
// Draws, in order: the horse count, the tier (only when the row has tier weights), the angle.
export function stepStampede(game, row) {
  const sp = game.spawner;
  const st = row.stampede;
  if (!st || game.t < sp.nextStampede) return;
  const n = st.min + Math.floor(game.rng() * (st.max - st.min + 1));
  const tier = row.tiers ? pickTier(row.tiers, game.rng()) : 1;
  const a = game.rng() * 2 * Math.PI;
  spawnStampede(game, n, tier, a);
  sp.stampedes++;
  if (!(st.every > 0)) { sp.nextStampede = Infinity; return; } // a malformed row: once only
  do sp.nextStampede += st.every; while (sp.nextStampede <= game.t);
}

// A line of `n` horses of `tier` centred on the spawn ring at angle `a` around the dragon,
// STAMPEDE_SPACING px apart across their run. Every horse runs along the one direction from the
// line's centre to the tower as it is now. Horses join only while the enemies are under the cap.
export function spawnStampede(game, n, tier, a) {
  const d = game.dragon, tw = game.tower;
  const cx = d.x + SPAWN_RING_RADIUS * Math.cos(a), cy = d.y + SPAWN_RING_RADIUS * Math.sin(a);
  let ux = tw.x - cx, uy = tw.y - cy;
  const len = Math.sqrt(ux * ux + uy * uy);
  if (len > 0) { ux /= len; uy /= len; } else { ux = 0; uy = 1; }
  for (let i = 0; i < n; i++) {
    if (game.enemies.length >= MAX_ENEMIES) break;
    const off = (i - (n - 1) / 2) * STAMPEDE_SPACING;
    const h = createEnemy(game, STAMPEDE_TYPE, cx - uy * off, cy + ux * off, tier);
    h.dx = ux;
    h.dy = uy;
    h.flip = ux < 0;
  }
}

// Called from the clock step after `t` advances. On the first tick where `t` reaches a
// timeline row marked `golem` (5:00 in the default table), spawn the mega golem once, on
// the spawn ring on the far side of the tower from the dragon, sound `ohno`. It ignores
// the cap. The screen shakes (§5).
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
  game.shake('spawn'); // §5 a strong shake as it arrives
}
