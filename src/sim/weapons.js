// Weapon slots, cooldowns and firing (§10), buffs (§11) and proc affinity (§12), the ring
// and mini towers.
import { WEAPONS, BUFFS, DT } from './content.js';
import { spawnProjectile } from './projectiles.js';
import { advanceAnim } from './effects.js';
import { dealDamage } from './damage.js';

const EPS = 1e-9;
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;

// A newly gained weapon fires on the next weapons step. The ring also keeps its angle, the
// positions of its fireballs (`balls`, read by the renderer) and its rehit map
// (enemy id -> tickCount from which that enemy may be hit again).
export function createWeapon(id, level = 1) {
  if (!WEAPONS[id]) throw new Error(`unknown weapon "${id}"`);
  const w = { id, level, timer: 0 };
  if (id === 'ring') Object.assign(w, { angle: 0, balls: [], rehit: {}, anim: WEAPONS.ring.anim, frame: 0, frameTicks: 0 });
  return w;
}

export function weaponLevel(w) {
  return WEAPONS[w.id].levels[w.level - 1];
}

// The multiplier each stat buff sets (§11).
const STAT_MOD = { might: 'damage', haste: 'cooldown', area: 'area', velocity: 'speed', duration: 'duration', force: 'force' };

// Multipliers from stat buffs, Amount's extra projectiles, and chance buffs' probabilities
// and levels (§11). damage (Might): multiply then round up (buffDamage); cooldown (Haste):
// every cooldown and fireRate; area: projectile radius, explosion radius, ring orbit; speed
// (Velocity): projectile speed and range; duration: mini-tower life; force: every knock;
// amount: extra fireballs and lasers per volley, ring balls, mini towers' maxActive.
// procLevel holds the chance buffs' levels for their affinity (procChance).
export function buffMods(game) {
  const m = {
    damage: 1, cooldown: 1, area: 1, speed: 1, duration: 1, force: 1, amount: 0,
    explode: 0, split: 0, pierce: 0, procLevel: { explode: 0, split: 0, pierce: 0 },
  };
  for (const b of game.buffs) {
    const def = BUFFS[b.id];
    const v = def.levels[b.level - 1];
    if (def.kind === 'stat') m[STAT_MOD[b.id]] = 1 + v;
    else if (def.kind === 'count') m.amount = v;
    else { m[b.id] = v; m.procLevel[b.id] = b.level; }
  }
  return m;
}

// §12 affinity: the chance of proc `proc` (explode, split, pierce) for a projectile of damage
// type `type`: the buff's chance once its level reaches the type's affinity level, else 0
// (no roll). Explode: fire from L1, arcane from L3; Split: fire only; Pierce: arcane from L1,
// fire from L3.
export function procChance(mods, proc, type) {
  const level = mods.procLevel[proc];
  const need = BUFFS[proc].affinity[type];
  return level > 0 && need !== undefined && level >= need ? mods[proc] : 0;
}

// ceil(base × damage multiplier); the epsilon keeps 2 × 1.0 at 2 despite float error.
export function buffDamage(base, mods) {
  return Math.ceil(base * mods.damage - EPS);
}

// Shared cooldown pattern: `timer` is the time left until the weapon next fires; it fires
// when the timer reaches 0 and the next shot is `cooldown` later. Returns true on a shot.
function ready(w, cooldown) {
  if (w.timer > EPS) { w.timer -= DT; return false; }
  w.timer += cooldown - DT;
  return true;
}

// The stats of one fireball at weapon level `level` with the current buffs: what the dragon
// fires (§10.1) and what every mini-tower shot copies (§10.3).
export function fireballShot(level, mods) {
  const def = WEAPONS.fireball;
  const L = def.levels[level - 1];
  const big = level >= def.bigFrom;
  return {
    kind: 'fireball', type: def.type,
    speed: L.speed * mods.speed, range: L.range * mods.speed,
    r: (big ? def.bigR : def.r) * mods.area,
    damage: buffDamage(L.damage, mods), knock: def.knock * mods.force,
    anim: big ? def.bigAnim : def.anim,
  };
}

// The level of the dragon's fireball. It is the starting weapon and cannot be lost; a game
// without it (only a test can build one) reads level 1.
export function fireballLevel(game) {
  const w = game.weapons.find((x) => x.id === 'fireball');
  return w ? w.level : 1;
}

// §10.1. `count` fireballs in the aim direction, evenly across a fan `spread` degrees wide.
// Amount adds shots and widens the fan by one step per shot: the level's own step
// (spread / (count − 1)), or spreadStep when the level fires one.
export function fireFireball(game, w, mods) {
  const L = weaponLevel(w);
  if (!ready(w, L.cooldown * mods.cooldown)) return;
  const d = game.dragon;
  const base = Math.atan2(d.aimY, d.aimX);
  const n = L.count + mods.amount;
  const step = L.count > 1 ? L.spread / (L.count - 1) : WEAPONS.fireball.spreadStep;
  const spreadRad = (mods.amount > 0 ? step * (n - 1) : L.spread) * DEG;
  const stats = fireballShot(w.level, mods);
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? base : base - spreadRad / 2 + (spreadRad * i) / (n - 1);
    spawnProjectile(game, { ...stats, x: d.x, y: d.y, dx: Math.cos(a), dy: Math.sin(a) });
  }
  game.sound(WEAPONS.fireball.sound);
}

// §10.2. No fan: the count + Amount lasers fly parallel, offset × 2 px apart perpendicular
// to the aim and centred on the dragon (with 2: ±offset px). A laser is used up by its first
// hit unless it wins a pierce roll (§12).
export function fireLaser(game, w, mods) {
  const L = weaponLevel(w);
  if (!ready(w, L.cooldown * mods.cooldown)) return;
  const def = WEAPONS.laser;
  const d = game.dragon;
  const big = w.level >= def.bigFrom;
  const px = -d.aimY * def.offset, py = d.aimX * def.offset;
  const n = L.count + mods.amount;
  for (let i = 0; i < n; i++) {
    const s = n - 1 - 2 * i; // first at +offset × (n − 1), then 2 × offset apart
    spawnProjectile(game, {
      kind: 'laser', type: def.type, x: d.x + px * s, y: d.y + py * s, dx: d.aimX, dy: d.aimY,
      speed: L.speed * mods.speed, range: L.range * mods.speed,
      r: (big ? def.bigR : def.r) * mods.area,
      damage: buffDamage(L.damage, mods), knock: def.knock * mods.force,
      anim: big ? def.bigAnim : def.anim,
    });
  }
  game.sound(def.sound);
}

// §10.3. Every cooldown the tower lobs a mini tower 80 px toward the nearest enemy (a
// random direction if there is none). Then every mini tower takes its step.
export function fireMiniTower(game, w, mods) {
  const L = weaponLevel(w);
  if (ready(w, L.cooldown * mods.cooldown)) lobMiniTower(game, L, mods);
  stepMiniTowers(game, L, mods);
}

const LOB_TICKS = Math.round(WEAPONS.miniTower.lobTime / DT);

// maxActive + Amount stand at once; each lives duration × Duration after landing.
function lobMiniTower(game, L, mods) {
  const def = WEAPONS.miniTower;
  const t = game.tower;
  let best = null, bestD2 = Infinity;
  for (const e of game.enemies) {
    if (e.hp <= 0) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2 || (d2 === bestD2 && e.id < best.id)) { best = e; bestD2 = d2; }
  }
  let ux, uy;
  if (best) {
    const d = Math.sqrt(bestD2);
    if (d > 0) { ux = (best.x - t.x) / d; uy = (best.y - t.y) / d; } else { ux = 0; uy = 1; }
  } else {
    const a = game.rng() * TAU;
    ux = Math.cos(a); uy = Math.sin(a);
  }
  const list = game.miniTowers;
  const maxActive = L.maxActive + mods.amount;
  while (list.length >= maxActive) list.shift(); // the oldest goes when the cap is exceeded
  list.push({
    id: game.nextId++, x: t.x + ux * def.lobDist, y: t.y + uy * def.lobDist, fromX: t.x, fromY: t.y,
    lobTicks: LOB_TICKS, life: Math.round((L.duration * mods.duration) / DT), timer: 0,
    anim: def.anim, frame: 0, frameTicks: 0,
  });
}

const scratch = [];

// In flight a mini tower only counts down its lob. Landed, it shoots a fireball at the nearest
// enemy within targetRadius every fireRate seconds and lives `duration` seconds from landing.
function stepMiniTowers(game, L, mods) {
  const def = WEAPONS.miniTower;
  const list = game.miniTowers;
  // The enemies step built the grid before its despawn pass; rebuild so targets are current.
  if (list.some((m) => m.lobTicks === 0)) game.grid.build(game.enemies);
  const r2 = def.targetRadius * def.targetRadius;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.lobTicks > 0) { m.lobTicks--; list[n++] = m; continue; }
    if (m.timer > EPS) m.timer -= DT;
    else {
      let best = null, bestD2 = Infinity;
      for (const e of game.grid.nearby(m.x, m.y, def.targetRadius, scratch)) {
        if (e.hp <= 0) continue;
        const dx = e.x - m.x, dy = e.y - m.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        if (d2 < bestD2 || (d2 === bestD2 && e.id < best.id)) { best = e; bestD2 = d2; }
      }
      if (best) {
        const d = Math.sqrt(bestD2);
        const dx = d > 0 ? (best.x - m.x) / d : 0, dy = d > 0 ? (best.y - m.y) / d : 1;
        // A copy of the dragon's fireball at its current level: one shot, no fan, no sound.
        spawnProjectile(game, { ...fireballShot(fireballLevel(game), mods), knock: def.knock * mods.force, x: m.x, y: m.y, dx, dy });
        m.timer += L.fireRate * mods.cooldown - DT;
      }
    }
    if (--m.life > 0) list[n++] = m;
  }
  list.length = n;
}

// §10.4, step 6: turn the ring and place its count + Amount fireballs around the dragon.
// Expired rehit entries are dropped, so ids of dead enemies do not pile up.
export function spinRing(game, w, mods) {
  const L = weaponLevel(w);
  w.angle = (w.angle + L.spin * DEG * DT) % TAU;
  advanceAnim(w, true);
  const d = game.dragon;
  const orbit = L.orbit * mods.area;
  const n = L.count + mods.amount;
  w.balls.length = n;
  for (let i = 0; i < n; i++) {
    const a = w.angle + (i * TAU) / n;
    w.balls[i] = { x: d.x + Math.cos(a) * orbit, y: d.y + Math.sin(a) * orbit };
  }
  for (const k in w.rehit) if (w.rehit[k] <= game.tickCount) delete w.rehit[k];
}

// Step 8: every ring fireball hits every live enemy it overlaps that is off its rehit
// timer, with fire damage (§12.1) and the ring's knock × Force away from the ball (§8.7).
// No procs and no hit effect; the golem is knocked back by its own rule.
export function collideRing(game) {
  let mods = null;
  for (const w of game.weapons) {
    if (w.id !== 'ring') continue;
    mods = mods || buffMods(game);
    const L = weaponLevel(w);
    const r = WEAPONS.ring.r;
    const damage = buffDamage(L.damage, mods);
    const knock = WEAPONS.ring.knock * mods.force;
    const rehitTicks = Math.round(L.rehit / DT);
    for (const b of w.balls) {
      for (const e of game.grid.nearby(b.x, b.y, r + game.grid.maxR, scratch)) {
        if (e.hp <= 0) continue;
        const until = w.rehit[e.id];
        if (until !== undefined && until > game.tickCount) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        const rr = e.r + r;
        if (dx * dx + dy * dy >= rr * rr) continue;
        dealDamage(game, e, damage, WEAPONS.ring.type, b, knock);
        w.rehit[e.id] = game.tickCount + rehitTicks;
      }
    }
  }
}

const FIRE = { fireball: fireFireball, laser: fireLaser, miniTower: fireMiniTower, ring: spinRing };

// Step 6.
export function stepWeapons(game) {
  const mods = buffMods(game);
  for (const w of game.weapons) FIRE[w.id](game, w, mods);
}
