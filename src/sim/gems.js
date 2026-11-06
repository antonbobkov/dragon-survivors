// XP gems (§14): drop on kill, home in once the dragon comes near, collect, queue level-ups.
import { ENEMIES, DT, DRAGON_PICKUP_RADIUS, GEM_SPEED, GEM_COLLECT_RADIUS, MAX_GEMS, xpToNext } from './content.js';
import { rollOffers } from './levelup.js';

// Called once per killed enemy (step 9), at its death position, before its death effect.
// Enemies worth no XP (the golem) drop nothing. Past MAX_GEMS the oldest gem is merged
// into the gem nearest to it (ties: lower id).
export function dropGem(game, enemy) {
  const value = ENEMIES[enemy.type].xp;
  if (!(value > 0)) return;
  game.gems.push({ id: game.nextId++, x: enemy.x, y: enemy.y, value, homing: false });
  if (game.gems.length > MAX_GEMS) mergeOldest(game.gems);
}

function mergeOldest(gems) {
  const old = gems.shift();
  let best = null, bestD2 = Infinity;
  for (const g of gems) {
    const dx = g.x - old.x, dy = g.y - old.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2 || (d2 === bestD2 && g.id < best.id)) { best = g; bestD2 = d2; }
  }
  best.value += old.value;
}

// Step 10: a gem within DRAGON_PICKUP_RADIUS starts homing and keeps homing at GEM_SPEED
// until collected within GEM_COLLECT_RADIUS. XP overflow carries over; every level gained
// queues a level-up, and the first queued one rolls the offers.
export function stepGems(game) {
  const d = game.dragon;
  const list = game.gems;
  const step = GEM_SPEED * DT;
  let n = 0, collected = false;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    let dx = d.x - g.x, dy = d.y - g.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (!g.homing && dist <= DRAGON_PICKUP_RADIUS) g.homing = true;
    if (g.homing) {
      if (dist <= step) { g.x = d.x; g.y = d.y; dist = 0; }
      else { g.x += (dx / dist) * step; g.y += (dy / dist) * step; dist -= step; }
    }
    if (dist <= GEM_COLLECT_RADIUS) {
      game.xp += g.value;
      collected = true;
      continue;
    }
    list[n++] = g;
  }
  list.length = n;
  if (!collected) return;
  game.sound('pickup');
  let gained = 0;
  for (let need = xpToNext(game.level); game.xp >= need; need = xpToNext(game.level)) {
    game.xp -= need;
    game.level++;
    gained++;
  }
  if (gained === 0) return;
  const wasIdle = game.pendingLevelUps === 0;
  game.pendingLevelUps += gained;
  if (wasIdle) game.offers = rollOffers(game);
}
