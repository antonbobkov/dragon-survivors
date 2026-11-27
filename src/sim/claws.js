// Claws (§10.5–10.7): physical slashes from the dragon. A volley queues slashes in
// game.slashes in the weapons step (6); a slash strikes in the collisions step (8) once its
// delay has run out, hitting through the damage function (§12.1) with knockback away from the
// dragon (§8.7); a struck slash plays its effect and is removed when the effect ends (step 11).
import { WEAPONS, DT, CLAW_RECT_ANIM, CLAW_CONE_ANIMS, CLAW_SOUND } from './content.js';
import { dealDamage } from './damage.js';
import { advanceAnim } from './effects.js';
import { breakBraziersWhere } from './braziers.js';

const DEG = Math.PI / 180;
const scratch = [];

// Slash: { id, weapon, shape: 'rect' | 'cone', side (rect: 1 right, -1 left), dx, dy (cone: unit
// aim), w, h (rect px), angle (cone degrees), reach (cone px), maxTargets (cone), damage, knock,
// delay (ticks until it strikes), struck, x, y (the dragon's centre at the strike), hits (ids hit),
// anim, frame, frameTicks }.
function queue(game, w, s) {
  const slash = {
    id: game.nextId++, weapon: w.id, shape: s.shape, side: s.side ?? 0, dx: s.dx ?? 0, dy: s.dy ?? 0,
    w: s.w ?? 0, h: s.h ?? 0, angle: s.angle ?? 0, reach: s.reach ?? 0, maxTargets: s.maxTargets ?? 0,
    damage: s.damage, knock: s.knock, delay: s.delay, struck: false, x: 0, y: 0, hits: [],
    anim: s.shape === 'rect' ? CLAW_RECT_ANIM : CLAW_CONE_ANIMS[0], frame: 0, frameTicks: 0,
  };
  game.slashes.push(slash);
  return slash;
}

// One volley of claw weapon `w` (level row L) with buff mods `mods` (weapons.js buffMods) and
// damage already after Might. Rectangles: the facing side at once, the other side (sides 2)
// `sideDelay` s later; Amount repeats each side `repeatDelay` s apart. Cone: one, in the aim
// direction, maxTargets + Amount. Sizes × Area, knock × Force, read now.
export function clawVolley(game, w, L, mods, damage) {
  const def = WEAPONS[w.id];
  const d = game.dragon;
  const knock = def.knock * mods.force;
  if (L.width) {
    const facing = d.flip ? -1 : 1;
    const sides = L.sides === 2 ? [facing, -facing] : [facing];
    sides.forEach((side, k) => {
      for (let j = 0; j <= mods.amount; j++) {
        const delay = Math.round(((k ? def.sideDelay : 0) + j * def.repeatDelay) / DT);
        queue(game, w, { shape: 'rect', side, w: L.width * mods.area, h: L.height * mods.area, damage, knock, delay });
      }
    });
  }
  if (L.reach) {
    queue(game, w, {
      shape: 'cone', dx: d.aimX, dy: d.aimY, angle: L.angle, reach: L.reach * mods.area,
      maxTargets: L.maxTargets + mods.amount, damage, knock, delay: 0,
    });
  }
}

// Step 6, before any weapon fires: pending slashes count their delay down.
export function tickSlashes(game) {
  for (const s of game.slashes) if (!s.struck && s.delay > 0) s.delay--;
}

// The rectangle of a rect slash struck from (x, y): from the centre sideways by w, h tall.
export function slashRect(s, x = s.x, y = s.y) {
  const x0 = s.side > 0 ? x : x - s.w;
  return { x0, x1: x0 + s.w, y0: y - s.h / 2, y1: y + s.h / 2 };
}

// Circle (cx, cy, r) overlaps rectangle `R`: the nearest point of R is closer than r.
export function circleInRect(cx, cy, r, R) {
  const px = Math.min(Math.max(cx, R.x0), R.x1), py = Math.min(Math.max(cy, R.y0), R.y1);
  const dx = cx - px, dy = cy - py;
  return dx * dx + dy * dy < r * r;
}

// Squared distance from (px, py) to the segment (0, 0)–(ex, ey).
function segDist2(px, py, ex, ey) {
  const l2 = ex * ex + ey * ey;
  const t = l2 > 0 ? Math.min(1, Math.max(0, (px * ex + py * ey) / l2)) : 0;
  const qx = px - ex * t, qy = py - ey * t;
  return qx * qx + qy * qy;
}

// Circle (cx, cy, r) overlaps the cone (sector) with apex (ax, ay), unit direction (dx, dy),
// whole width `angle` degrees and radius `reach`: the apex is inside the circle, or the centre is
// within reach + r and inside the angle, or the circle crosses one of the two edges.
export function circleInCone(cx, cy, r, ax, ay, dx, dy, angle, reach) {
  const px = cx - ax, py = cy - ay;
  const d2 = px * px + py * py;
  if (d2 < r * r) return true;
  const d = Math.sqrt(d2);
  if (d >= reach + r) return false;
  const half = (angle / 2) * DEG;
  if ((px * dx + py * dy) / d >= Math.cos(half) - 1e-12) return true;
  const c = Math.cos(half), s = Math.sin(half);
  // the two edges: the direction turned by ±half, reach long
  const e1x = (dx * c - dy * s) * reach, e1y = (dx * s + dy * c) * reach;
  const e2x = (dx * c + dy * s) * reach, e2y = (-dx * s + dy * c) * reach;
  return segDist2(px, py, e1x, e1y) < r * r || segDist2(px, py, e2x, e2y) < r * r;
}

// A circle (cx, cy, r) overlaps slash `s` struck from (x, y).
export function slashOverlaps(s, x, y, cx, cy, r) {
  if (s.shape === 'rect') return circleInRect(cx, cy, r, slashRect(s, x, y));
  return circleInCone(cx, cy, r, x, y, s.dx, s.dy, s.angle, s.reach);
}

// The live enemies a slash struck from (x, y) hits, in hit order: a rectangle hits every enemy
// overlapping it in grid order; a cone the maxTargets nearest overlapping it (by centre distance
// from (x, y), ties to the lower id).
export function slashTargets(game, s, x, y) {
  const out = [];
  if (s.shape === 'rect') {
    const R = slashRect(s, x, y);
    const q = Math.max(s.w, s.h) / 2 + game.grid.maxR;
    for (const e of game.grid.nearby((R.x0 + R.x1) / 2, y, q, scratch)) {
      if (e.hp > 0 && slashOverlaps(s, x, y, e.x, e.y, e.r)) out.push(e);
    }
    return out;
  }
  for (const e of game.grid.nearby(x, y, s.reach + game.grid.maxR, scratch)) {
    if (e.hp > 0 && slashOverlaps(s, x, y, e.x, e.y, e.r)) out.push(e);
  }
  const d2 = (e) => (e.x - x) ** 2 + (e.y - y) ** 2;
  out.sort((a, b) => d2(a) - d2(b) || a.id - b.id);
  out.length = Math.min(out.length, s.maxTargets);
  return out;
}

// Step 8, after the ring: every slash whose delay has run out strikes from the dragon's centre,
// once: each target takes the slash's damage as physical damage (§12.1) and is pushed its knock
// away from the dragon (§8.7), then every brazier the slash overlaps breaks (§14.2). No procs.
// The golem is hit; the knock builds its poise (§8.10).
export function collideSlashes(game) {
  const d = game.dragon;
  for (const s of game.slashes) {
    if (s.struck || s.delay > 0) continue;
    s.struck = true;
    s.x = d.x;
    s.y = d.y;
    const src = { x: d.x, y: d.y };
    for (const e of slashTargets(game, s, d.x, d.y)) {
      dealDamage(game, e, s.damage, WEAPONS[s.weapon].type, src, s.knock);
      s.hits.push(e.id);
    }
    breakBraziersWhere(game, (bx, by, br) => slashOverlaps(s, d.x, d.y, bx, by, br));
    game.sound(CLAW_SOUND);
  }
}

// Step 11: struck slashes play their effect and are removed when it ends.
export function stepSlashes(game) {
  const list = game.slashes;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.struck && advanceAnim(s, false)) continue;
    list[n++] = s;
  }
  list.length = n;
}
