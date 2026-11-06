// Enemies: target the tower, move, separate, despawn (§8), and generic death (§2.1 step 9).
import {
  ENEMIES, TOWER_RADIUS, CONTACT_INSET, SEPARATION_MAX_NEIGHBOURS, DESPAWN_DIST, DT,
} from './content.js';
import { advanceAnim, spawnEffect } from './effects.js';
import { dropGem } from './gems.js';

export function createEnemy(game, type, x, y) {
  const def = ENEMIES[type];
  if (!def) throw new Error(`unknown enemy type "${type}"`);
  const e = {
    id: game.nextId++, type, x, y, r: def.r, hp: def.hp, gen: 0,
    flip: false, alpha: def.alpha,
    anim: def.walk, frame: 0, frameTicks: 0,
  };
  game.enemies.push(e);
  return e;
}

// ---- hooks for the roster task (T-004) -------------------------------------

// Per-enemy special timers (mage cast, skeleton summon anim). Return true when the
// enemy is busy this tick and must not walk (a casting mage stands still).
export function enemySpecial(game, e) { return false; }

// Called on every damaging hit, after the damage. `source` is the projectile (or
// later the ring/explosion). Golem knockback goes here.
export function onEnemyHit(game, e, source) {}

// Called for each dead enemy after kills/gem. Return true if the death was handled
// specially (slime split, ghost knight burn) so the generic die effect is skipped.
export function onEnemyDeath(game, e) { return false; }

// ---- step 5 ------------------------------------------------------------------

const scratch = [];

export function stepEnemies(game) {
  const tower = game.tower;
  const list = game.enemies;

  // AI target + move
  for (const e of list) {
    if (enemySpecial(game, e)) continue;
    const def = ENEMIES[e.type];
    const dx = tower.x - e.x, dy = tower.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const stop = e.r + TOWER_RADIUS - CONTACT_INSET;
    if (dist > stop) {
      const step = Math.min(def.speed * DT, dist - stop);
      const vx = (dx / dist) * step;
      e.x += vx;
      e.y += (dy / dist) * step;
      if (vx < 0) e.flip = true;
      else if (vx > 0) e.flip = false;
    }
    advanceAnim(e, true);
  }

  // Separation
  game.grid.build(list);
  separate(game);

  // Despawn far from the tower, refunding the spawn budget
  let n = 0;
  const d2 = DESPAWN_DIST * DESPAWN_DIST;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const dx = e.x - tower.x, dy = e.y - tower.y;
    if (dx * dx + dy * dy > d2) { game.spawner.budget += 1; continue; }
    list[n++] = e;
  }
  list.length = n;
}

// §8.1: push each enemy away from up to SEPARATION_MAX_NEIGHBOURS overlapping
// neighbours by half the overlap (the whole overlap against an immovable one).
export function separate(game) {
  const grid = game.grid;
  for (const e of game.enemies) {
    if (ENEMIES[e.type].immovable) continue;
    const cells = grid.cellsNear(e.x, e.y, e.r + grid.maxR, scratch);
    let count = 0;
    outer: for (const cell of cells) {
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (o === e) continue;
        const rr = e.r + o.r;
        let dx = e.x - o.x, dy = e.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        let d = Math.sqrt(d2);
        const overlap = rr - d;
        if (d === 0) { dx = e.id < o.id ? -1 : 1; dy = 0; d = 1; }
        const push = ENEMIES[o.type].immovable ? overlap : overlap / 2;
        e.x += (dx / d) * push;
        e.y += (dy / d) * push;
        if (++count >= SEPARATION_MAX_NEIGHBOURS) break outer;
      }
    }
  }
}

// ---- step 9 ------------------------------------------------------------------

export function stepDeaths(game) {
  const list = game.enemies;
  let n = 0;
  const dead = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.hp > 0) list[n++] = e;
    else dead.push(e);
  }
  list.length = n;
  for (const e of dead) {
    game.kills++;
    game.sound('death01');
    dropGem(game, e);
    if (!onEnemyDeath(game, e)) {
      spawnEffect(game, ENEMIES[e.type].die, e.x, e.y, { flip: e.flip, alpha: e.alpha });
    }
  }
}
