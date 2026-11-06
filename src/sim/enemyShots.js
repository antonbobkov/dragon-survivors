// Enemy shots (§8.5): mage orbs. Fired in the enemies step (step 5), moved in step 7, and
// tested against the dragon in step 8. They live in `game.enemyShots`, apart from the
// player's projectiles: player projectiles and the ring never touch them, and they ignore
// enemies and the tower. An orb that hits the dragon damages the tower.
import {
  DT, DRAGON_RADIUS, MAGE_ORB_RANGE, MAGE_ORB_INTERVAL, MAGE_ORB_SPEED, MAGE_ORB_R,
  MAGE_ORB_TRAVEL, MAGE_ORB_DAMAGE, MAGE_ORB_ANIM, MAGE_ORB_SOUND,
} from './content.js';
import { advanceAnim } from './effects.js';

export const MAGE_ORB_INTERVAL_TICKS = Math.round(MAGE_ORB_INTERVAL / DT);

// At spawn: ticks until the mage may first fire, a random offset in [0, interval), so a
// pack of mages does not fire in volleys. The only rng draw of the orbs.
export function initialOrbTimer(game) {
  return Math.floor(game.rng() * MAGE_ORB_INTERVAL_TICKS);
}

// Step 5, once per mage per enemies step, after its cast logic and before it walks.
// `casting` is true on every tick of a cast (the start and the last tick included).
// The timer counts down to 0 and then waits there; a mage that is not casting and is
// within MAGE_ORB_RANGE of the dragon fires and the timer restarts at the interval.
export function stepMageOrb(game, e, casting) {
  if (e.orbTimer > 0) e.orbTimer--;
  if (e.orbTimer > 0 || casting) return;
  const d = game.dragon;
  let dx = d.x - e.x, dy = d.y - e.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > MAGE_ORB_RANGE) return;
  if (dist > 0) { dx /= dist; dy /= dist; } else { dx = 0; dy = 1; }
  spawnOrb(game, e.x, e.y, dx, dy);
  e.orbTimer = MAGE_ORB_INTERVAL_TICKS;
}

export function spawnOrb(game, x, y, dx, dy) {
  const o = {
    id: game.nextId++, kind: 'orb', x, y, dx, dy,
    speed: MAGE_ORB_SPEED, r: MAGE_ORB_R, damage: MAGE_ORB_DAMAGE, range: MAGE_ORB_TRAVEL, travelled: 0,
    anim: MAGE_ORB_ANIM, frame: 0, frameTicks: 0,
  };
  game.enemyShots.push(o);
  return o;
}

// Step 7: fly straight, expire once `range` px have been travelled.
export function stepEnemyShots(game) {
  const list = game.enemyShots;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    const step = o.speed * DT;
    o.x += o.dx * step;
    o.y += o.dy * step;
    o.travelled += step;
    if (o.travelled >= o.range) continue;
    advanceAnim(o, true);
    list[n++] = o;
  }
  list.length = n;
}

// Step 8 (last part): an orb overlapping the dragon is removed and the tower loses its
// damage (never below 0). One sound per tick however many hit.
export function collideEnemyShots(game) {
  const list = game.enemyShots;
  const d = game.dragon, t = game.tower;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    const dx = o.x - d.x, dy = o.y - d.y;
    const rr = o.r + DRAGON_RADIUS;
    if (dx * dx + dy * dy < rr * rr) {
      t.hp = Math.max(0, t.hp - o.damage);
      game.sound(MAGE_ORB_SOUND);
      continue;
    }
    list[n++] = o;
  }
  list.length = n;
}
