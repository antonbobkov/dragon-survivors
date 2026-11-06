// Projectiles: movement, range expiry (§2.1 step 7) and hits on enemies (step 8, §12).
import { DT, MAX_HITS_MEMORY, WEAPONS } from './content.js';
import { dirFrame } from './dragon.js';
import { advanceAnim, spawnEffect } from './effects.js';
import { onEnemyHit } from './enemies.js';

// p: { kind, x, y, dx, dy (unit), speed, range, r, damage, anim, gen? }
export function spawnProjectile(game, p) {
  const proj = {
    id: game.nextId++, kind: p.kind, x: p.x, y: p.y, dx: p.dx, dy: p.dy,
    speed: p.speed, r: p.r, damage: p.damage, range: p.range, travelled: 0,
    hits: [], gen: p.gen ?? 0, dirFrame: dirFrame(p.dx, p.dy),
    anim: p.anim, frame: 0, frameTicks: 0,
  };
  game.projectiles.push(proj);
  return proj;
}

// Step 7: move, expire once `range` px have been travelled.
export function stepProjectiles(game) {
  const list = game.projectiles;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const step = p.speed * DT;
    p.x += p.dx * step;
    p.y += p.dy * step;
    p.travelled += step;
    if (p.travelled >= p.range) continue;
    advanceAnim(p, true);
    list[n++] = p;
  }
  list.length = n;
}

// Hook for T-005: explode, split and pierce rolls (§12), in that order, after the damage.
// Return true when the projectile survives the hit (pierce, laser maxHits).
export function rollProcs(game, p, e) { return false; }

// Damage, hit effect, memory of the hit, procs. Returns true if the projectile survives.
export function resolveHit(game, p, e) {
  e.hp -= p.damage;
  onEnemyHit(game, e, p);
  const fx = WEAPONS[p.kind] && WEAPONS[p.kind].hitEffect;
  if (fx) spawnEffect(game, fx, p.x, p.y);
  if (p.hits.length >= MAX_HITS_MEMORY) p.hits.shift();
  p.hits.push(e.id);
  return rollProcs(game, p, e);
}

const scratch = [];

// Step 8 (first part): each projectile hits the nearest live, not-yet-hit enemy it overlaps.
export function collideProjectiles(game) {
  const list = game.projectiles;
  const grid = game.grid;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const cands = grid.nearby(p.x, p.y, p.r + grid.maxR, scratch);
    let best = null, bestD2 = Infinity;
    for (const e of cands) {
      if (e.hp <= 0 || p.hits.includes(e.id)) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d2 = dx * dx + dy * dy;
      const rr = e.r + p.r;
      if (d2 >= rr * rr) continue;
      if (d2 < bestD2 || (d2 === bestD2 && e.id < best.id)) { best = e; bestD2 = d2; }
    }
    if (best && !resolveHit(game, p, best)) continue;
    list[n++] = p;
  }
  list.length = n;
}
