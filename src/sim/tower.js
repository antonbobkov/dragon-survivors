// Tower: tether clamp (§7.1) and continuous contact damage (§7.2).
import { TOWER_HP, TOWER_START, TETHER_LENGTH, TOWER_SPEED, TOWER_RADIUS, TOWER_QUERY_MARGIN, DT, ENEMIES } from './content.js';

export function createTower() {
  return { x: TOWER_START.x, y: TOWER_START.y, hp: TOWER_HP, maxHp: TOWER_HP, anim: 'castle', frame: 0, frameTicks: 0 };
}

// Step 3: move toward the dragon at TOWER_SPEED, never closer than TETHER_LENGTH.
export function stepTether(game) {
  const t = game.tower, d = game.dragon;
  const dx = d.x - t.x, dy = d.y - t.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= TETHER_LENGTH) return;
  const ux = dx / dist, uy = dy / dist;
  const step = TOWER_SPEED * DT;
  if (dist - step <= TETHER_LENGTH) {
    t.x = d.x - ux * TETHER_LENGTH;
    t.y = d.y - uy * TETHER_LENGTH;
  } else {
    t.x += ux * step;
    t.y += uy * step;
  }
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
