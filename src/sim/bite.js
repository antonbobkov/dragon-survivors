// Bite (§10.8): the dragon's single-target execute. Its cooldown runs in the weapons step (6);
// the bite itself happens in the collisions step (8), on the nearest live enemies in reach,
// through the damage function (§12.1) with heavy knockback away from the dragon (§8.7). With
// no enemy in reach there is no bite and the cooldown waits at 0.
import { WEAPONS, DT } from './content.js';
import { dealDamage } from './damage.js';
import { spawnEffect } from './effects.js';
import { hitBraziers } from './braziers.js';

const EPS = 1e-9;
const scratch = [];

// Step 6: the bite's cooldown counts down; at 0 it waits for a target (collideBites).
export function tickBite(game, w) {
  if (w.timer > EPS) w.timer -= DT;
}

// The `n` live enemies nearest the dragon's centre (x, y) whose circle overlaps the reach
// circle (centre distance below reach + r), nearest first, ties to the lower id.
export function biteTargets(game, x, y, reach, n) {
  const out = [];
  for (const e of game.grid.nearby(x, y, reach + game.grid.maxR, scratch)) {
    if (e.hp <= 0) continue;
    const rr = reach + e.r;
    if ((e.x - x) ** 2 + (e.y - y) ** 2 < rr * rr) out.push(e);
  }
  const d2 = (e) => (e.x - x) ** 2 + (e.y - y) ** 2;
  out.sort((a, b) => d2(a) - d2(b) || a.id - b.id);
  out.length = Math.min(out.length, n);
  return out;
}

// The damage one bite of `damage` (after Might) deals before resistances to enemy `e`:
// × executeMult while its HP is below `execute` of its max HP.
export function biteDamage(e, damage) {
  const def = WEAPONS.bite;
  return e.hp < def.execute * e.maxHp ? damage * def.executeMult : damage;
}

// Step 8, after the claw slashes: every bite whose cooldown has run out bites the 1 + Amount
// nearest enemies in reach (× Area), each once, nearest first: the jaws effect at the target
// (mirrored when it is left of the dragon), then physical damage (execute applied) with the
// bite's knock × Force away from the dragon. Then every brazier its reach circle overlaps
// breaks, sound, and the cooldown (× Haste) restarts. No procs, no random draws.
// `mods` is buffMods(game), `damage` the level's damage after Might.
export function collideBite(game, w, L, mods, damage) {
  if (w.timer > EPS) return;
  const def = WEAPONS.bite;
  const d = game.dragon;
  const reach = L.reach * mods.area;
  const targets = biteTargets(game, d.x, d.y, reach, 1 + mods.amount);
  if (targets.length === 0) return;
  const src = { x: d.x, y: d.y };
  const knock = def.knock * mods.force;
  for (const e of targets) {
    spawnEffect(game, def.anim, e.x, e.y, { flip: e.x < d.x });
    dealDamage(game, e, biteDamage(e, damage), def.type, src, knock);
  }
  hitBraziers(game, d.x, d.y, reach);
  game.sound(def.sound);
  w.timer += L.cooldown * mods.cooldown;
}
