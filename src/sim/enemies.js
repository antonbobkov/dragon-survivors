// Enemies: target the tower (or a princess near them, §14.4), move, separate, despawn (§8),
// slime fusion (§8.9), generic death (§2.1 step 9) and the roster specials: slime split, mage
// cast + summon, ghost knight burn, golem.
import {
  ENEMIES, TOWER_RADIUS, CONTACT_INSET, SEPARATION_MAX_NEIGHBOURS, DESPAWN_DIST, DT, MAX_ENEMIES,
  SLIME_CHILDREN, SLIME_GENS, SLIME_FUSE_COUNT, SLIME_FUSE_SIZE, SLIME_FUSE_RADIUS, SLIME_FUSE_INTERVAL, MEGASLIME_HP_FACTOR,
  MAGE_CAST_INTERVAL, MAGE_CAST_TIME, MAGE_SUMMON_COUNT, MAGE_SUMMON_RING, MAGE_NO_CAST_DIST,
  GHOST_BURN_TIME, GOLEM_HP, TIERS, tierOf, tierHp, untiered,
} from './content.js';
import { advanceAnim, setAnim, spawnEffect } from './effects.js';
import { dropGem } from './gems.js';
import { initialOrbTimer, stepMageOrb } from './enemyShots.js';
import { initGolem, golemSpecial, golemHit, golemFootstep } from './golem.js';
import { merchantHit } from './merchant.js';
import { lureOf } from './princess.js';
import { initPrince, princeSpecial, walkPrince, princeDeath } from './prince.js';

const MAGE_INTERVAL_TICKS = Math.round(MAGE_CAST_INTERVAL / DT);
const MAGE_CAST_TICKS = Math.round(MAGE_CAST_TIME / DT);
const GHOST_BURN_TICKS = Math.round(GHOST_BURN_TIME / DT);
const FUSE_INTERVAL_TICKS = Math.round(SLIME_FUSE_INTERVAL / DT);
// Summon ring angles relative to the mage's direction toward the tower: half a step off
// that direction (45°, 135°, ... for 4), so the mage walks on between the first two.
const SUMMON_ANGLES = Array.from({ length: MAGE_SUMMON_COUNT }, (_, i) => ((i + 0.5) / MAGE_SUMMON_COUNT) * 2 * Math.PI);

// `tier` (§8.6, default 1) scales HP and radius here (`maxHp` keeps the HP it starts with); DPS,
// XP and speed are read through tierOf(e) where they are used. The golem and the prince are
// always tier 1. A
// fused type (the megaslime) has no HP of its own: the fusion sets it, `maxHp` with it, and its
// gem (`xp`); made otherwise it has 1 HP.
export function createEnemy(game, type, x, y, tier = 1) {
  const def = ENEMIES[type];
  if (!def) throw new Error(`unknown enemy type "${type}"`);
  if (untiered(def)) tier = 1;
  if (!TIERS[tier]) throw new Error(`unknown enemy tier "${tier}"`);
  const e = {
    id: game.nextId++, type, tier, x, y, r: def.r * TIERS[tier].r, hp: def.hp === null ? 1 : tierHp(def.hp, tier), gen: 0,
    flip: false, alpha: def.alpha,
    anim: def.walk, frame: 0, frameTicks: 0,
  };
  if (type === 'mage') { e.castTimer = 0; e.orbTimer = initialOrbTimer(game); }
  if (def.stampede) { // §8.8 its run: toward the tower as it is now, unless the stampede sets it
    const tw = game.tower;
    let ux = tw.x - x, uy = tw.y - y;
    const d = Math.sqrt(ux * ux + uy * uy);
    if (d > 0) { ux /= d; uy /= d; } else { ux = 0; uy = 1; }
    e.dx = ux; e.dy = uy; e.flip = ux < 0;
  }
  if (def.unkillable) { e.hp = GOLEM_HP; e.unkillable = true; initGolem(e); }
  if (def.procImmune) e.procImmune = true;
  if (def.rival) initPrince(e); // §14.5 his sack and theft timer
  e.maxHp = e.hp; // the HP it was created with (§4.1), read by the bite's execute (§10.8)
  game.enemies.push(e);
  if (!game.seen.includes(type)) game.seen.push(type); // §17.1 bestiary
  noteTier(game.seenTiers, type, tier);
  return e;
}

// §17.1 the tiers met per type, ascending.
function noteTier(seenTiers, type, tier) {
  const list = seenTiers[type] || (seenTiers[type] = []);
  if (list.includes(tier)) return;
  list.push(tier);
  list.sort((a, b) => a - b);
}

// ---- specials ------------------------------------------------------------------

// Step 5, per enemy, before it walks. Returns true when the enemy is busy this tick and
// must not walk (a casting mage, a skeleton or a megaslime still playing its summon anim).
export function enemySpecial(game, e) {
  if (e.type === 'mage') {
    const casting = mageSpecial(game, e);
    stepMageOrb(game, e, casting); // §8.5
    return casting;
  }
  if (e.unkillable) return golemSpecial(game, e); // §8.10 poise, stagger, shove timer
  if (ENEMIES[e.type].rival) return princeSpecial(game, e); // §14.5 theft
  const def = ENEMIES[e.type];
  if (def.summon && e.anim === def.summon) {
    if (advanceAnim(e, false)) setAnim(e, def.walk);
    return true;
  }
  return false;
}

// §8.4 mage. `castTimer` counts ticks since spawn or since the last cast started (0 on the
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
    summonSkeletons(game, e);
  }
  return true;
}

function summonSkeletons(game, e) {
  const t = game.tower;
  const base = Math.atan2(t.y - e.y, t.x - e.x); // atan2(0, 0) = 0: defined even at the tower
  for (const a of SUMMON_ANGLES) {
    if (game.enemies.length >= MAX_ENEMIES) break;
    const s = createEnemy(game, 'skeleton',
      e.x + Math.cos(base + a) * MAGE_SUMMON_RING, e.y + Math.sin(base + a) * MAGE_SUMMON_RING, e.tier);
    setAnim(s, ENEMIES.skeleton.summon);
  }
}

// Called on every hit, after the damage, with the hit's knock after Force. An unkillable
// enemy (the golem) keeps its HP and builds poise (§8.10).
// A merchant (§14.3) flees and stops trading.
export function onEnemyHit(game, e, knock = 0) {
  if (e.unkillable) golemHit(game, e, knock);
  else if (e.type === 'merchant') merchantHit(e);
}

// Step 9, for each dead enemy after kills/gem. Returns true when the death was handled
// specially so the generic die effect is skipped.
export function onEnemyDeath(game, e) {
  if (e.type === 'slime') {
    const g = slimeGen(e);
    if (g.split) splitSlime(game, e, g);
    else spawnEffect(game, g.die, e.x, e.y, { flip: e.flip, alpha: e.alpha, tier: e.tier });
    return true;
  }
  if (e.type === 'ghostKnight') {
    spawnEffect(game, ENEMIES.ghostKnight.die, e.x, e.y, { flip: e.flip, alpha: e.alpha, life: GHOST_BURN_TICKS, tier: e.tier });
    return true;
  }
  if (ENEMIES[e.type].rival) princeDeath(game); // §14.5 his sound; the generic die plays
  return false;
}

// §8.4 a slime's generation row (SLIME_GENS); a generation past the last reads as the last.
export const slimeGen = (e) => SLIME_GENS[Math.min(e.gen, SLIME_GENS.length - 1)];

// Make slime `e` a slime of generation `gen`: that generation's HP and radius at its tier, and
// its walk.
export function setSlimeGen(e, gen) {
  const g = SLIME_GENS[gen];
  e.gen = gen;
  e.hp = tierHp(g.hp, e.tier);
  e.maxHp = e.hp;
  e.r = g.r * tierOf(e).r;
  setAnim(e, g.walk);
}

// §8.4 slime: the parent plays its generation's `split`; two slimes of the next generation
// appear `offset` px to either side, perpendicular to the unit direction u from the parent to
// the tower: the first at parent + offset × (−uy, ux), the second at parent − offset × (−uy, ux).
// The children take the parent's tier (HP and radius scaled like any enemy's).
function splitSlime(game, e, g) {
  spawnEffect(game, g.split, e.x, e.y, { flip: e.flip, alpha: e.alpha, tier: e.tier });
  const t = game.tower;
  let ux = t.x - e.x, uy = t.y - e.y;
  const d = Math.sqrt(ux * ux + uy * uy);
  if (d > 0) { ux /= d; uy /= d; } else { ux = 0; uy = 1; }
  const gen = Math.min(e.gen, SLIME_GENS.length - 1) + 1;
  for (let i = 0; i < SLIME_CHILDREN; i++) {
    const sgn = i === 0 ? 1 : -1;
    const c = createEnemy(game, 'slime', e.x - uy * g.offset * sgn, e.y + ux * g.offset * sgn, e.tier);
    setSlimeGen(c, gen);
  }
}

// §8.9 slime fusion, at the end of the enemies step. While more than SLIME_FUSE_COUNT slimes
// are alive and no fusion happened in the last SLIME_FUSE_INTERVAL s, the slime with the most
// other slimes within SLIME_FUSE_RADIUS (centre to centre; ties: lower id) is the core; the
// SLIME_FUSE_SIZE slimes nearest it (itself included; ties: lower id) leave the list and a
// megaslime joins it at their centroid: the highest tier among them, MEGASLIME_HP_FACTOR × the
// sum of their HP, and a gem worth the sum of theirs. It first plays its summon anim (the
// fusion) without walking. No random draws. Returns the megaslime, or null.
export function fuseSlimes(game) {
  if (game.lastFusion !== null && game.tickCount - game.lastFusion < FUSE_INTERVAL_TICKS) return null;
  const slimes = [];
  for (const e of game.enemies) if (e.type === 'slime') slimes.push(e);
  if (slimes.length <= SLIME_FUSE_COUNT) return null;
  const r2 = SLIME_FUSE_RADIUS * SLIME_FUSE_RADIUS;
  let core = null, coreN = -1;
  for (const a of slimes) {
    let n = 0;
    for (const b of slimes) {
      if (b === a) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy <= r2) n++;
    }
    if (n > coreN || (n === coreN && a.id < core.id)) { core = a; coreN = n; }
  }
  const near = slimes.map((e) => {
    const dx = e.x - core.x, dy = e.y - core.y;
    return { e, d2: dx * dx + dy * dy };
  }).sort((p, q) => p.d2 - q.d2 || p.e.id - q.e.id).slice(0, SLIME_FUSE_SIZE).map((p) => p.e);
  let x = 0, y = 0, hp = 0, xp = 0, tier = 1;
  for (const e of near) {
    x += e.x; y += e.y; hp += e.hp;
    xp += ENEMIES.slime.xp * tierOf(e).xp;
    if (e.tier > tier) tier = e.tier;
  }
  const fused = new Set(near);
  const list = game.enemies;
  let n = 0;
  for (const e of list) if (!fused.has(e)) list[n++] = e;
  list.length = n;
  const m = createEnemy(game, 'megaslime', x / near.length, y / near.length, tier);
  m.hp = MEGASLIME_HP_FACTOR * hp;
  m.maxHp = m.hp;
  m.xp = xp;
  m.flip = game.tower.x < m.x;
  setAnim(m, ENEMIES.megaslime.summon);
  game.lastFusion = game.tickCount;
  return m;
}

// Step 11, from onEffectDone: a finished ghost burn becomes a ghost at its spot. Nothing
// rises once the run is no longer in play (enemies are frozen while dying). The ghost takes
// the burn's tier, which is the ghost knight's.
export function riseGhost(game, fx) {
  if (game.phase !== 'play') return;
  const g = createEnemy(game, 'ghost', fx.x, fx.y, fx.tier || 1);
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
    if (def.stampede) { // §8.8: straight on along its run, through the tower and past it
      const step = def.speed * tierOf(e).speed * DT;
      e.x += e.dx * step;
      e.y += e.dy * step;
      advanceAnim(e, true);
      continue;
    }
    if (def.rival) { walkPrince(game, e); continue; } // §14.5: at the dragon, never lured
    // §14.4 a princess within PRINCESS_LURE draws it off the tower (never the golem).
    const p = e.unkillable ? null : lureOf(game, e);
    const tx = p ? p.x : tower.x, ty = p ? p.y : tower.y;
    const dx = tx - e.x, dy = ty - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const stop = e.r + (p ? p.r : TOWER_RADIUS) - CONTACT_INSET;
    if (dist > stop) {
      const step = Math.min(def.speed * tierOf(e).speed * DT, dist - stop);
      const vx = (dx / dist) * step;
      e.x += vx;
      e.y += (dy / dist) * step;
      if (vx < 0) e.flip = true;
      else if (vx > 0) e.flip = false;
    }
    advanceAnim(e, true);
    if (e.unkillable) golemFootstep(game, e); // §8.10, a shake within range of the dragon
  }

  // Separation
  game.grid.build(list);
  separate(game);

  // Despawn far from the tower, refunding the spawn budget (not for a stampede's horses, §8.8,
  // nor the prince, §14.5, who is not a budget spawn either)
  let n = 0;
  const d2 = DESPAWN_DIST * DESPAWN_DIST;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const dx = e.x - tower.x, dy = e.y - tower.y;
    if (dx * dx + dy * dy > d2 && !e.unkillable) {
      const def = ENEMIES[e.type];
      if (!def.stampede && !def.rival) game.spawner.budget += 1;
      continue;
    }
    list[n++] = e;
  }
  list.length = n;

  fuseSlimes(game); // §8.9
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
      spawnEffect(game, ENEMIES[e.type].die, e.x, e.y, { flip: e.flip, alpha: e.alpha, tier: e.tier });
    }
  }
}
