// The mega golem (§8.10): poise and stagger, the tower shove, footsteps, and the screen-shake
// events its spawn, footsteps and staggers send to the renderer (§5).
import {
  DT, GOLEM_HP, GOLEM_POISE, GOLEM_POISE_GROWTH, GOLEM_POISE_DECAY, GOLEM_STAGGER_DIST, GOLEM_STAGGER_TIME, GOLEM_STAGGER_HOLD,
  GOLEM_SHOVE_DIST, GOLEM_SHOVE_INTERVAL, GOLEM_STEP_RANGE, GOLEM_STEP_FRAMES,
} from './content.js';

export const STAGGER_PUSH_TICKS = Math.round(GOLEM_STAGGER_TIME / DT); // 18
export const STAGGER_HOLD_TICKS = Math.round(GOLEM_STAGGER_HOLD / DT); // 30
export const STAGGER_TICKS = STAGGER_PUSH_TICKS + STAGGER_HOLD_TICKS;
export const SHOVE_TICKS = Math.round(GOLEM_SHOVE_INTERVAL / DT); // 60

// The golem's own state, set when it is created. `poise` builds with hits; `poiseHit` says a
// hit added poise since the last enemies step (no decay then); `stagger` counts the ticks of a
// stagger left (0 when not staggering) and `staggerDx, staggerDy` is its push direction;
// `shoveTimer` counts enemies steps until it may shove the tower again.
export function initGolem(e) {
  e.poise = 0;
  e.staggers = 0; // staggers so far: each raises the next threshold (golemPoiseNeeded)
  e.poiseHit = false;
  e.stagger = 0;
  e.staggerDx = 0;
  e.staggerDy = 0;
  e.shoveTimer = 0;
}

// The share of the stagger's push done after `k` of its STAGGER_PUSH_TICKS ticks: eased out
// (fast first, slowing to a stop), 0 at k = 0 and exactly 1 at the end.
export function staggerEase(k) {
  const p = Math.min(1, Math.max(0, k / STAGGER_PUSH_TICKS));
  return 1 - (1 - p) * (1 - p);
}

// Poise the next stagger needs: GOLEM_POISE × GOLEM_POISE_GROWTH^staggers, so a build can
// stagger the golem a few times but never hold it off for good.
export function golemPoiseNeeded(e) {
  return GOLEM_POISE * Math.pow(GOLEM_POISE_GROWTH, e.staggers || 0);
}

// Every hit on the golem (from the damage function, §12.1): it takes nothing (its HP stays
// GOLEM_HP) and `hit_golem` plays. Outside a stagger the hit's knock after Force adds to its
// poise; at GOLEM_POISE it staggers.
export function golemHit(game, e, knock) {
  e.hp = GOLEM_HP;
  game.sound('hit_golem');
  if (e.stagger > 0 || !(knock > 0)) return;
  e.poise += knock;
  e.poiseHit = true;
  if (e.poise >= golemPoiseNeeded(e)) startStagger(game, e);
}

// Poise back to 0; the push goes straight away from the dragon as it is now ((0, 1) when they
// coincide) and starts on the next enemies step.
function startStagger(game, e) {
  const d = game.dragon;
  let dx = e.x - d.x, dy = e.y - d.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) { dx /= len; dy /= len; } else { dx = 0; dy = 1; }
  e.poise = 0;
  e.poiseHit = false;
  e.staggers = (e.staggers || 0) + 1;
  e.stagger = STAGGER_TICKS;
  e.staggerDx = dx;
  e.staggerDy = dy;
  game.shake('stagger');
}

// Step 5, the golem's special, before it walks: the shove timer counts down, poise decays
// unless a hit added some since the last step, and a stagger pushes (its first
// STAGGER_PUSH_TICKS ticks) or holds it. Returns true while it staggers: it does not walk.
export function golemSpecial(game, e) {
  if (e.shoveTimer > 0) e.shoveTimer--;
  if (e.poiseHit) e.poiseHit = false;
  else if (e.poise > 0) e.poise = Math.max(0, e.poise - GOLEM_POISE_DECAY * DT);
  if (!(e.stagger > 0)) return false;
  const k = STAGGER_TICKS - e.stagger + 1; // this stagger tick, from 1
  if (k <= STAGGER_PUSH_TICKS) {
    const step = GOLEM_STAGGER_DIST * (staggerEase(k) - staggerEase(k - 1));
    e.x += e.staggerDx * step;
    e.y += e.staggerDy * step;
  }
  e.stagger--;
  return true;
}

// Step 5, after the golem's walk anim advanced: a foot lands when the anim reaches one of
// GOLEM_STEP_FRAMES; within GOLEM_STEP_RANGE of the dragon that shakes the screen.
export function golemFootstep(game, e) {
  if (e.frameTicks !== 0 || !GOLEM_STEP_FRAMES.includes(e.frame)) return;
  const d = game.dragon;
  const dx = e.x - d.x, dy = e.y - d.y;
  if (dx * dx + dy * dy <= GOLEM_STEP_RANGE * GOLEM_STEP_RANGE) game.shake('step');
}

// Step 8, enemy vs tower, for a golem overlapping the tower (after its contact damage): when
// its shove timer is 0 it shoves the tower GOLEM_SHOVE_DIST px straight away from itself
// ((0, 1) when they coincide) and the timer restarts. The tether pulls the tower back on the
// next tick's step 3 (§7.1).
export function golemShove(game, e) {
  if (e.shoveTimer > 0) return;
  const t = game.tower;
  let dx = t.x - e.x, dy = t.y - e.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) { dx /= len; dy /= len; } else { dx = 0; dy = 1; }
  t.x += dx * GOLEM_SHOVE_DIST;
  t.y += dy * GOLEM_SHOVE_DIST;
  t.moved = true;
  e.shoveTimer = SHOVE_TICKS;
}
