// Dragon: movement, aim with fallbacks, 16-direction facing, bob (§6).
import { DRAGON_SPEED, DRAGON_START, DEFAULT_AIM, DRAGON_BOB_PERIOD, DT } from './content.js';

export function createDragon() {
  return {
    x: DRAGON_START.x, y: DRAGON_START.y,
    moveX: 0, moveY: 0,
    aimX: DEFAULT_AIM.x, aimY: DEFAULT_AIM.y,
    aimed: false, // true once any intent carried a real aim
    dirFrame: dirFrame(DEFAULT_AIM.x, DEFAULT_AIM.y),
    bob: -1,
    anim: 'dragon.dir', frame: dirFrame(DEFAULT_AIM.x, DEFAULT_AIM.y), frameTicks: 0,
  };
}

// §6.3: frame index of a 16-direction sheet, 0 = up, 4 = left, 8 = down, 12 = right.
export function dirFrame(dx, dy) {
  const a = Math.atan2(dy, dx);
  return (Math.round(-a / (2 * Math.PI) * 16) + 12 + 16) % 16;
}

// §6.3: ±1 px, half a cycle each.
export function bobAt(tickCount) {
  return Math.floor(tickCount / (DRAGON_BOB_PERIOD / 2)) % 2 === 0 ? -1 : 1;
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
  d.dirFrame = dirFrame(d.aimX, d.aimY);
  d.frame = d.dirFrame;
}

// Step 2.
export function moveDragon(game) {
  const d = game.dragon;
  d.x += d.moveX * DRAGON_SPEED * DT;
  d.y += d.moveY * DRAGON_SPEED * DT;
  d.bob = bobAt(game.tickCount);
}
