// Projectiles: movement, range expiry (§2.1 step 7) and hits on enemies with procs (step 8, §12).
import {
  DT, MAX_HITS_MEMORY, PROJECTILE_KINDS, EXPLODE_RADIUS, EXPLOSION_ANIM, EXPLOSION_SPRITE_PX,
  SPLIT_ANGLE, SPLIT_MAX_GEN,
} from './content.js';
import { dirFrame } from './dragon.js';
import { advanceAnim, spawnEffect } from './effects.js';
import { onEnemyHit } from './enemies.js';
import { buffMods } from './weapons.js';

const SPRITE_SCALE = 2; // §5: every sprite is drawn at 2× source size

// p: { kind, x, y, dx, dy (unit), speed, range, r, damage, anim, gen?, hits? }
export function spawnProjectile(game, p) {
  const proj = {
    id: game.nextId++, kind: p.kind, x: p.x, y: p.y, dx: p.dx, dy: p.dy,
    speed: p.speed, r: p.r, damage: p.damage, range: p.range, travelled: 0,
    hits: p.hits ? p.hits.slice() : [], gen: p.gen ?? 0, dirFrame: dirFrame(p.dx, p.dy),
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

// §12, after the damage: explode, split and pierce rolls, in that order. A roll draws from
// game.rng only when the projectile's kind can have that proc and its chance buff is owned,
// and never against a proc-immune enemy (the golem). Returns true when the projectile
// survives the hit, which only a won pierce roll does.
export function rollProcs(game, p, e) {
  const kind = PROJECTILE_KINDS[p.kind];
  if (!kind || e.procImmune) return false;
  const mods = buffMods(game);
  let survives = false;
  if (kind.explode && mods.explode > 0 && game.rng() < mods.explode) explode(game, p, e, mods);
  if (kind.split && p.gen < SPLIT_MAX_GEN && mods.split > 0 && game.rng() < mods.split) split(game, p, e);
  if (kind.pierce && mods.pierce > 0 && game.rng() < mods.pierce) survives = true;
  return survives;
}

// Radius EXPLODE_RADIUS × area at the hit point; the projectile's damage to every live enemy
// overlapping the circle except the one just hit. Proc-immune enemies are not touched at all.
// The sprite is scaled so its diameter matches the circle.
export function explode(game, p, hit, mods) {
  const R = EXPLODE_RADIUS * mods.area;
  const cx = p.x, cy = p.y;
  const src = { x: cx, y: cy };
  for (const e of game.grid.nearby(cx, cy, R + game.grid.maxR, scratchExplode)) {
    if (e === hit || e.hp <= 0 || e.procImmune) continue;
    const dx = e.x - cx, dy = e.y - cy;
    const rr = R + e.r;
    if (dx * dx + dy * dy >= rr * rr) continue;
    e.hp -= p.damage;
    onEnemyHit(game, e, src);
  }
  const scale = (2 * R) / (EXPLOSION_SPRITE_PX * SPRITE_SCALE);
  spawnEffect(game, EXPLOSION_ANIM, cx, cy, { scale });
  game.sound('explosion01');
}

// Two fireballs at ±SPLIT_ANGLE from the parent's direction, from the hit point: same damage,
// radius, speed and sprite, the parent's remaining range, gen + 1, and the enemy just hit
// already in their hits. They first move and collide on the next tick.
export function split(game, p, hit) {
  const base = Math.atan2(p.dy, p.dx);
  for (const s of [-1, 1]) {
    const a = base + s * SPLIT_ANGLE * Math.PI / 180;
    spawnProjectile(game, {
      kind: 'fireball', x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a),
      speed: p.speed, range: Math.max(0, p.range - p.travelled), r: p.r, damage: p.damage,
      anim: p.anim, gen: p.gen + 1, hits: [hit.id],
    });
  }
}

// Damage, memory of the hit, procs; no hit effect. Returns true if the projectile survives.
export function resolveHit(game, p, e) {
  e.hp -= p.damage;
  onEnemyHit(game, e, p);
  if (p.hits.length >= MAX_HITS_MEMORY) p.hits.shift();
  p.hits.push(e.id);
  return rollProcs(game, p, e);
}

const scratch = [];
const scratchExplode = [];

// Step 8 (first part): each projectile hits the nearest live, not-yet-hit enemy it overlaps.
// Projectiles spawned here (split children) are kept but not tested until the next tick.
export function collideProjectiles(game) {
  const list = game.projectiles;
  const grid = game.grid;
  const n0 = list.length;
  let n = 0;
  for (let i = 0; i < n0; i++) {
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
  for (let i = n0; i < list.length; i++) list[n++] = list[i];
  list.length = n;
}
