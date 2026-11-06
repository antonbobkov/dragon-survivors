// Dragon: movement, aim with fallbacks, facing and walk animation (§6).
import { DRAGON_SPEED, DRAGON_START, DEFAULT_AIM, DRAGON_ANIM, DT } from './content.js';
import { advanceAnim } from './effects.js';

export function createDragon() {
  return {
    x: DRAGON_START.x, y: DRAGON_START.y,
    moveX: 0, moveY: 0,
    aimX: DEFAULT_AIM.x, aimY: DEFAULT_AIM.y,
    aimed: false, // true once any intent carried a real aim
    flip: false, // the sprite faces right; true = facing left
    anim: DRAGON_ANIM, frame: 0, frameTicks: 0,
  };
}

// §10.2: frame index of a 16-direction sheet (the laser sprites), 0 = up, 4 = left,
// 8 = down, 12 = right.
export function dirFrame(dx, dy) {
  const a = Math.atan2(dy, dx);
  return (Math.round(-a / (2 * Math.PI) * 16) + 12 + 16) % 16;
}

// §6.3: facing left or right. The horizontal move wins, then the fire direction's x,
// else the last facing.
export function facingFlip(d) {
  if (d.moveX !== 0) return d.moveX < 0;
  if (d.aimX !== 0) return d.aimX < 0;
  return d.flip;
}

// Step 1: velocity and aim from the (already normalised) intent.
export function applyIntent(game, intent) {
  const d = game.dragon;
  d.moveX = intent.moveX;
  d.moveY = intent.moveY;
  if (intent.hasAim && (intent.aimX !== 0 || intent.aimY !== 0)) {
    d.aimX = intent.aimX;
    d.aimY = intent.aimY;
    d.aimed = true;
  } else if (!d.aimed && (d.moveX !== 0 || d.moveY !== 0)) {
    const ml = Math.hypot(d.moveX, d.moveY); // move may be shorter than 1 (half-pushed stick)
    d.aimX = d.moveX / ml;
    d.aimY = d.moveY / ml;
  }
  // otherwise keep the last aim (or the last movement direction, or the default)
  d.flip = facingFlip(d);
}

// Step 2: move; the walk anim advances only while moving, standing still shows frame 0.
export function moveDragon(game) {
  const d = game.dragon;
  d.x += d.moveX * DRAGON_SPEED * DT;
  d.y += d.moveY * DRAGON_SPEED * DT;
  if (d.moveX !== 0 || d.moveY !== 0) {
    advanceAnim(d, true);
  } else {
    d.frame = 0;
    d.frameTicks = 0;
  }
}
