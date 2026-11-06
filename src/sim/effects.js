// One-shot animations (§2.1 step 11) and the shared anim helper.
import { ANIMS } from './anims.js';
import { ENEMIES } from './content.js';
import { riseGhost } from './enemies.js';

export function animTicks(name) {
  const a = ANIMS[name];
  if (!a) throw new Error(`unknown anim "${name}" (not in src/sim/anims.js)`);
  return a.ticks;
}

// Point an entity at an anim from its first frame.
export function setAnim(ent, name) {
  ent.anim = name;
  ent.frame = 0;
  ent.frameTicks = 0;
}

// Advance ent.frame / ent.frameTicks by one tick. Returns true on the tick a
// non-looping anim finishes (its last frame has been shown for its full duration);
// the entity then stays on the last frame. Looping anims never finish.
export function advanceAnim(ent, loop) {
  const ticks = animTicks(ent.anim);
  ent.frameTicks++;
  if (ent.frameTicks < ticks[ent.frame]) return false;
  ent.frameTicks = 0;
  if (ent.frame + 1 < ticks.length) { ent.frame++; return false; }
  if (loop) { ent.frame = 0; return false; }
  ent.frameTicks = ticks[ent.frame];
  return true;
}

// Total length of an anim in ticks.
export function animLength(name) {
  let n = 0;
  for (const t of animTicks(name)) n += t;
  return n;
}

// Spawn a non-colliding one-shot effect. `hold` keeps it on its last frame instead of removing it.
// `life` (ticks, default 0) makes it last at least that long, holding its last frame until then.
export function spawnEffect(game, anim, x, y, opts = {}) {
  const fx = {
    id: game.nextId++, anim, frame: 0, frameTicks: 0, x, y,
    scale: opts.scale ?? 1, alpha: opts.alpha ?? 1, flip: opts.flip ?? false,
    hold: opts.hold ?? false, life: opts.life ?? 0, done: false,
  };
  game.effects.push(fx);
  return fx;
}

// Called once when an effect finishes, before it is removed: a finished ghost burn
// becomes a ghost.
export function onEffectDone(game, fx) {
  if (fx.anim === ENEMIES.ghostKnight.die) riseGhost(game, fx);
}

export function stepEffects(game) {
  const list = game.effects;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const fx = list[i];
    if (!fx.done) {
      const animEnded = advanceAnim(fx, false);
      if (fx.life > 0) fx.life--;
      if (animEnded && fx.life === 0) {
        fx.done = true;
        onEffectDone(game, fx);
      }
    }
    if (!fx.done || fx.hold) list[n++] = fx;
  }
  list.length = n;
}
