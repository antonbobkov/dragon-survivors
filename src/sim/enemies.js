// Enemies: target the tower, move, separate, despawn (§8), generic death (§2.1 step 9)
// and the roster specials: slime split, mage cast + summon, ghost knight burn, golem.
import {
  ENEMIES, TOWER_RADIUS, CONTACT_INSET, SEPARATION_MAX_NEIGHBOURS, DESPAWN_DIST, DT, MAX_ENEMIES,
  SLIME_CHILDREN, SLIME_CHILD_HP, SLIME_CHILD_R, SLIME_CHILD_OFFSET,
  MAGE_CAST_INTERVAL, MAGE_CAST_TIME, MAGE_SUMMON_COUNT, MAGE_SUMMON_RING, MAGE_NO_CAST_DIST,
  GHOST_BURN_TIME, GOLEM_KNOCKBACK, GOLEM_HP,
} from './content.js';
import { advanceAnim, setAnim, spawnEffect } from './effects.js';
import { dropGem } from './gems.js';

const MAGE_INTERVAL_TICKS = Math.round(MAGE_CAST_INTERVAL / DT);
const MAGE_CAST_TICKS = Math.round(MAGE_CAST_TIME / DT);
const GHOST_BURN_TICKS = Math.round(GHOST_BURN_TIME / DT);
// The summon ring, starting to the right and going clockwise on screen (y down).
const SUMMON_DIRS = Array.from({ length: MAGE_SUMMON_COUNT }, (_, i) => {
  const a = (i / MAGE_SUMMON_COUNT) * 2 * Math.PI;
  return [Math.round(Math.cos(a) * 1e12) / 1e12, Math.round(Math.sin(a) * 1e12) / 1e12];
});

export function createEnemy(game, type, x, y) {
  const def = ENEMIES[type];
  if (!def) throw new Error(`unknown enemy type "${type}"`);
  const e = {
    id: game.nextId++, type, x, y, r: def.r, hp: def.hp, gen: 0,
    flip: false, alpha: def.alpha,
    anim: def.walk, frame: 0, frameTicks: 0,
  };
  if (type === 'mage') e.castTimer = 0;
  if (def.unkillable) { e.hp = GOLEM_HP; e.unkillable = true; }
  if (def.procImmune) e.procImmune = true;
  game.enemies.push(e);
  return e;
}

// ---- specials ------------------------------------------------------------------

// Step 5, per enemy, before it walks. Returns true when the enemy is busy this tick and
// must not walk (a casting mage, a skeleton still playing its summon anim).
export function enemySpecial(game, e) {
  if (e.type === 'mage') return mageSpecial(game, e);
  if (e.type === 'skeleton' && e.anim === ENEMIES.skeleton.summon) {
    if (advanceAnim(e, false)) setAnim(e, ENEMIES.skeleton.walk);
    return true;
  }
  return false;
}

// §8 mage. `castTimer` counts ticks since spawn or since the last cast started (0 on the
// first cast tick). At MAGE_CAST_INTERVAL a cast starts unless the mage is within
// MAGE_NO_CAST_DIST of the tower (then the timer just starts again). A cast stands still
// for MAGE_CAST_TIME playing `spell`, then summons skeletons on a ring.
function mageSpecial(game, e) {
  const def = ENEMIES.mage;
  e.castTimer++;
  if (e.anim !== def.spell) {
    if (e.castTimer < MAGE_INTERVAL_TICKS) return false;
    e.castTimer = 0;
    const t = game.tower;
    const dx = t.x - e.x, dy = t.y - e.y;
    if (dx * dx + dy * dy < MAGE_NO_CAST_DIST * MAGE_NO_CAST_DIST) return false;
    setAnim(e, def.spell);
  }
  advanceAnim(e, true);
  if (e.castTimer >= MAGE_CAST_TICKS - 1) {
    setAnim(e, def.walk);
    for (const [ux, uy] of SUMMON_DIRS) {
      if (game.enemies.length >= MAX_ENEMIES) break;
      const s = createEnemy(game, 'skeleton', e.x + ux * MAGE_SUMMON_RING, e.y + uy * MAGE_SUMMON_RING);
      setAnim(s, ENEMIES.skeleton.summon);
    }
  }
  return true;
}

// Called on every damaging hit, after the damage. `source` is the projectile (or later the
// ring fireball or explosion), read only for its position. An unkillable enemy gets its
// HP back; the golem is pushed GOLEM_KNOCKBACK px away from the source.
export function onEnemyHit(game, e, source) {
  if (!e.unkillable) return;
  e.hp = GOLEM_HP;
  let dx = e.x - source.x, dy = e.y - source.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 0) { dx /= d; dy /= d; } else { dx = 0; dy = 1; }
  e.x += dx * GOLEM_KNOCKBACK;
  e.y += dy * GOLEM_KNOCKBACK;
  game.sound('hit_golem');
}

// Step 9, for each dead enemy after kills/gem. Returns true when the death was handled
// specially so the generic die effect is skipped.
export function onEnemyDeath(game, e) {
  if (e.type === 'slime' && e.gen === 0) {
    splitSlime(game, e);
    return true;
  }
  if (e.type === 'ghostKnight') {
    spawnEffect(game, ENEMIES.ghostKnight.die, e.x, e.y, { flip: e.flip, alpha: e.alpha, life: GHOST_BURN_TICKS });
    return true;
  }
  return false;
}

// §8 slime: the parent plays `split`; two gen-1 children appear SLIME_CHILD_OFFSET px to
// either side, perpendicular to the unit direction u from the parent to the tower: the
// first at parent + offset × (−uy, ux), the second at parent − offset × (−uy, ux).
function splitSlime(game, e) {
  spawnEffect(game, ENEMIES.slime.split, e.x, e.y, { flip: e.flip, alpha: e.alpha });
  const t = game.tower;
  let ux = t.x - e.x, uy = t.y - e.y;
  const d = Math.sqrt(ux * ux + uy * uy);
  if (d > 0) { ux /= d; uy /= d; } else { ux = 0; uy = 1; }
  for (let i = 0; i < SLIME_CHILDREN; i++) {
    const sgn = i === 0 ? 1 : -1;
    const c = createEnemy(game, 'slime', e.x - uy * SLIME_CHILD_OFFSET * sgn, e.y + ux * SLIME_CHILD_OFFSET * sgn);
    c.gen = 1;
    c.hp = SLIME_CHILD_HP;
    c.r = SLIME_CHILD_R;
  }
}

// Step 11, from onEffectDone: a finished ghost burn becomes a ghost at its spot. Nothing
// rises once the run is no longer in play (enemies are frozen while dying).
export function riseGhost(game, fx) {
  if (game.phase !== 'play') return;
  const g = createEnemy(game, 'ghost', fx.x, fx.y);
  g.flip = fx.flip;
}

// ---- step 5 ------------------------------------------------------------------

const scratch = [];

export function stepEnemies(game) {
  const tower = game.tower;
  const list = game.enemies;

  // AI target + move
  const n0 = list.length; // enemies summoned this step start next tick
  for (let i = 0; i < n0; i++) {
    const e = list[i];
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
    if (dx * dx + dy * dy > d2 && !e.unkillable) { game.spawner.budget += 1; continue; }
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
    if (e.hp > 0 || e.unkillable) list[n++] = e;
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
