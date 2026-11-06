// Tower: following the dragon on the tether (§7.1) and continuous contact damage (§7.2).
import {
  TOWER_HP, TOWER_START, TETHER_LENGTH, TOWER_FOLLOW_SPEED, TOWER_REST_DIST, TOWER_RADIUS, TOWER_QUERY_MARGIN, DT, ENEMIES,
} from './content.js';

// Distances within this of the rest distance count as at rest, so rounding never makes
// the tower creep (and its carriers flicker) while the dragon stands still.
export const REST_EPS = 1e-6;

export function createTower() {
  return { x: TOWER_START.x, y: TOWER_START.y, hp: TOWER_HP, maxHp: TOWER_HP, moved: false, anim: 'castle', frame: 0, frameTicks: 0 };
}

// Step 3: walk toward the dragon at TOWER_FOLLOW_SPEED, never closer than TOWER_REST_DIST;
// then, if still farther than TETHER_LENGTH, drag it to exactly TETHER_LENGTH.
// `moved` records whether either happened this tick (§7.3 carriers).
export function stepTether(game) {
  const t = game.tower, d = game.dragon;
  let moved = false;
  let dx = d.x - t.x, dy = d.y - t.y;
  let dist = Math.hypot(dx, dy);
  if (dist > TOWER_REST_DIST + REST_EPS) {
    const ux = dx / dist, uy = dy / dist;
    const step = TOWER_FOLLOW_SPEED * DT;
    if (dist - step <= TOWER_REST_DIST) {
      t.x = d.x - ux * TOWER_REST_DIST;
      t.y = d.y - uy * TOWER_REST_DIST;
    } else {
      t.x += ux * step;
      t.y += uy * step;
    }
    moved = true;
    dx = d.x - t.x; dy = d.y - t.y;
    dist = Math.hypot(dx, dy);
  }
  if (dist > TETHER_LENGTH) {
    t.x = d.x - (dx / dist) * TETHER_LENGTH;
    t.y = d.y - (dy / dist) * TETHER_LENGTH;
    moved = true;
  }
  t.moved = moved;
}

const scratch = [];

// Step 8 (last part): every enemy overlapping the tower deals contactDps × DT.
export function collideTower(game) {
  const t = game.tower;
  const cands = game.grid.nearby(t.x, t.y, TOWER_RADIUS + TOWER_QUERY_MARGIN, scratch);
  let dmg = 0;
  for (const e of cands) {
    if (e.hp <= 0) continue;
    const rr = e.r + TOWER_RADIUS;
    const dx = e.x - t.x, dy = e.y - t.y;
    if (dx * dx + dy * dy < rr * rr) dmg += ENEMIES[e.type].dps * DT;
  }
  if (dmg > 0) t.hp = Math.max(0, t.hp - dmg);
}
