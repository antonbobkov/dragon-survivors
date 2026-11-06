// Weapon slots, cooldowns and firing (§10). The fireball is complete; laser,
// mini tower and ring are hooks for the growth task (T-005).
import { WEAPONS, DT } from './content.js';
import { spawnProjectile } from './projectiles.js';

const EPS = 1e-9;

// A newly gained weapon fires on the next weapons step.
export function createWeapon(id, level = 1) {
  if (!WEAPONS[id]) throw new Error(`unknown weapon "${id}"`);
  return { id, level, timer: 0 };
}

export function weaponLevel(w) {
  return WEAPONS[w.id].levels[w.level - 1];
}

// Hook for T-005: multipliers from stat buffs (§11). Neutral until buffs exist.
// damage: multiply then round up; cooldown: multiplies cooldown and fireRate;
// area: projectile radius, explosion radius, ring orbit; speed: projectile speed and range.
export function buffMods(game) {
  return { damage: 1, cooldown: 1, area: 1, speed: 1 };
}

// §10.1. `count` fireballs in the aim direction, evenly across a fan `spread` degrees wide.
// `timer` is the time left until the next volley; a volley fires when it reaches 0.
export function fireFireball(game, w, mods) {
  if (w.timer > EPS) { w.timer -= DT; return; }
  const def = WEAPONS.fireball;
  const L = weaponLevel(w);
  w.timer += L.cooldown * mods.cooldown - DT;
  const d = game.dragon;
  const base = Math.atan2(d.aimY, d.aimX);
  const big = w.level >= def.bigFrom;
  const spreadRad = (L.spread * Math.PI) / 180;
  for (let i = 0; i < L.count; i++) {
    const a = L.count === 1 ? base : base - spreadRad / 2 + (spreadRad * i) / (L.count - 1);
    spawnProjectile(game, {
      kind: 'fireball', x: d.x, y: d.y, dx: Math.cos(a), dy: Math.sin(a),
      speed: L.speed * mods.speed, range: L.range * mods.speed,
      r: (big ? def.bigR : def.r) * mods.area,
      damage: Math.ceil(L.damage * mods.damage),
      anim: big ? def.bigAnim : def.anim,
    });
  }
  game.sound(def.sound);
}

// Hooks for T-005 (§10.2–10.4). Each owns its timer in `w`.
export function fireLaser(game, w, mods) {}
export function fireMiniTower(game, w, mods) {}
export function spinRing(game, w, mods) {}

const FIRE = { fireball: fireFireball, laser: fireLaser, miniTower: fireMiniTower, ring: spinRing };

// Step 6.
export function stepWeapons(game) {
  const mods = buffMods(game);
  for (const w of game.weapons) FIRE[w.id](game, w, mods);
}
