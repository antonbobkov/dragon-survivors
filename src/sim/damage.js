// Damage types, resistances and the one damage function every hit on an enemy goes through
// (§12.1): projectiles, explosions, the ring, and every later weapon. Knockback by weapon
// knock and enemy mass (§8.6) is applied here, right after the damage.
import { ENEMIES, DAMAGE_TYPES, RESIST_MIN } from './content.js';
import { onEnemyHit } from './enemies.js';

const EPS = 1e-9;

// §4.1 `meta`: the armoury's per-damage-type modifiers, given at construction. `power[type]`
// multiplies the damage of that type (default 1), `shred[type]` is taken off every enemy's
// resistance to it (default 0). Missing, non-finite, zero or negative powers read as neutral,
// so `new Game({ seed })` and `new Game({ seed, meta: {} })` play the same run.
export function normalizeMeta(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const power = {}, shred = {};
  for (const t of DAMAGE_TYPES) {
    const p = m.power && m.power[t];
    const s = m.shred && m.shred[t];
    power[t] = typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : 1;
    shred[t] = typeof s === 'number' && Number.isFinite(s) ? s : 0;
  }
  return { power, shred };
}

// An enemy type's resistance to a damage type after the armoury's shred, never below
// RESIST_MIN. Types without a resistance entry read 0.
export function effectiveResist(enemyType, type, meta) {
  const def = ENEMIES[enemyType];
  const base = (def && def.resist && def.resist[type]) || 0;
  const shred = meta ? meta.shred[type] || 0 : 0;
  return Math.max(RESIST_MIN, base - shred);
}

// Damage taken from a hit of `amount` at resistance `r` and armoury power `power`:
// ceil(amount × power × (1 − r)), at least 1 for any hit that does damage, 0 when r >= 1
// (immune). The epsilon keeps exact products (2 × 1.5 = 3) from rounding up past float error.
export function damageTaken(amount, r, power = 1) {
  if (r >= 1) return 0;
  const v = amount * power * (1 - r);
  if (!(v > 0)) return 0;
  return Math.max(1, Math.ceil(v - EPS));
}

// §8.6 knockback: the px a hit of effective knock `knock` (the weapon's knock × Force) pushes
// an enemy type: knock / mass. 0 for a type without a mass (the golem, which has its own rule).
export function knockDistance(enemyType, knock) {
  const def = ENEMIES[enemyType];
  const mass = def && def.mass;
  if (!(knock > 0) || !(mass > 0)) return 0;
  return knock / mass;
}

// Pushes `e` knockDistance px straight away from `source`, at once (no velocity), along
// (0, 1) when they coincide. Separation sorts out any overlap on the next enemies step.
export function knockBack(e, knock, source) {
  const dist = knockDistance(e.type, knock);
  if (dist <= 0) return;
  let dx = e.x - source.x, dy = e.y - source.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 0) { dx /= d; dy /= d; } else { dx = 0; dy = 1; }
  e.x += dx * dist;
  e.y += dy * dist;
}

// Every hit on an enemy: `amount` is the hit's damage after buffs, `type` one of
// DAMAGE_TYPES, `source` the hitter ({ x, y }: the projectile, ring fireball or explosion
// centre), `knock` the hit's knock after Force (§8.6, default 0). Applies the resistance and
// the armoury, takes the result off the enemy's HP, then knocks a survivor back from
// `source`, and returns the damage (not capped at the HP left). A killing hit pushes nothing.
// An unkillable enemy (the golem) takes nothing and returns 0; it ignores `knock` and keeps
// its own knockback rule (§8.4). Deaths are resolved in the deaths step from `hp <= 0`.
export function dealDamage(game, e, amount, type, source, knock = 0) {
  if (e.unkillable) {
    onEnemyHit(game, e, source);
    return 0;
  }
  const meta = game.meta;
  const dmg = damageTaken(amount, effectiveResist(e.type, type, meta), meta ? meta.power[type] : 1);
  e.hp -= dmg;
  onEnemyHit(game, e, source);
  if (e.hp > 0) knockBack(e, knock, source);
  return dmg;
}
