// Saw blade (§10.9): physical blades fired from the tower along the line through the dragon.
// Launched in the weapons step (6), moved in step 7 (out, dwell, back to the tower), hitting in
// the collisions step (8) every enemy they overlap, each at most once per `rehit` per blade.
import { WEAPONS, DT } from './content.js';
import { dealDamage } from './damage.js';
import { advanceAnim } from './effects.js';

const EPS = 1e-9;
const DEG = Math.PI / 180;
const REHIT_TICKS = Math.round(WEAPONS.saw.rehit / DT);
const scratch = [];

// The unit launch direction: from the tower through the dragon, or the dragon's aim when they
// coincide.
export function sawDirection(game) {
  const t = game.tower, d = game.dragon;
  const dx = d.x - t.x, dy = d.y - t.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  return len > 0 ? { x: dx / len, y: dy / len } : { x: d.aimX, y: d.aimY };
}

// One volley of the saw (level row L) with buff mods `mods` and damage after Might: count +
// Amount blades from the tower's centre, fanned fanStep degrees apart around the launch
// direction (evenly, centred on it). Speed and range × Velocity, r × Area, dwell × Duration
// (in ticks, rounded), knock × Force, all read now.
// Blade: { id, x, y, dx, dy (unit, outward), phase: 'out' | 'dwell' | 'back', speed, range,
// travelled, dwell (ticks left to spin), r, damage, knock, rehit (enemy id -> tickCount from
// which it may be hit again), anim, frame, frameTicks }.
export function sawVolley(game, L, mods, damage) {
  const def = WEAPONS.saw;
  const t = game.tower;
  const dir = sawDirection(game);
  const base = Math.atan2(dir.y, dir.x);
  const n = L.count + mods.amount;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * def.fanStep * DEG;
    const dx = n === 1 ? dir.x : Math.cos(a), dy = n === 1 ? dir.y : Math.sin(a);
    game.blades.push({
      id: game.nextId++, x: t.x, y: t.y, dx, dy, phase: 'out',
      speed: L.speed * mods.speed, range: L.range * mods.speed, travelled: 0,
      dwell: Math.round((L.dwell * mods.duration) / DT), r: L.r * mods.area,
      damage, knock: def.knock * mods.force, rehit: {},
      anim: def.anim, frame: 0, frameTicks: 0,
    });
  }
}

// Step 7, after the projectiles: each blade spins (its anim loops) and moves. Out: `speed` px
// per second along (dx, dy), stopping exactly at `range`, where it starts to dwell. Dwell: it
// stays put for `dwell` ticks. Back: it flies at `speed` straight at the tower's current
// centre and is removed on the tick it would reach it. Expired rehit entries are dropped.
export function stepBlades(game) {
  const list = game.blades;
  const t = game.tower;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const step = b.speed * DT;
    if (b.phase === 'out') {
      const s = Math.min(step, b.range - b.travelled);
      b.x += b.dx * s;
      b.y += b.dy * s;
      b.travelled += s;
      if (b.travelled >= b.range - EPS) b.phase = 'dwell';
    } else if (b.phase === 'dwell') {
      if (--b.dwell <= 0) b.phase = 'back';
    } else {
      const dx = t.x - b.x, dy = t.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= step) continue; // home: removed
      b.x += (dx / d) * step;
      b.y += (dy / d) * step;
    }
    advanceAnim(b, true);
    for (const k in b.rehit) if (b.rehit[k] <= game.tickCount) delete b.rehit[k];
    list[n++] = b;
  }
  list.length = n;
}

// Step 8, after the bite: every blade hits every live enemy whose circle overlaps its own and
// that it has not hit in the last `rehit` s, as physical damage (§12.1) with its knock away from
// the blade (§8.7). It never stops on a hit. Blades in list order, enemies in grid order.
// No procs, no random draws; the golem is hit and knocked by its own rule.
export function collideBlades(game) {
  for (const b of game.blades) {
    for (const e of game.grid.nearby(b.x, b.y, b.r + game.grid.maxR, scratch)) {
      if (e.hp <= 0) continue;
      const until = b.rehit[e.id];
      if (until !== undefined && until > game.tickCount) continue;
      const dx = e.x - b.x, dy = e.y - b.y;
      const rr = e.r + b.r;
      if (dx * dx + dy * dy >= rr * rr) continue;
      dealDamage(game, e, b.damage, WEAPONS.saw.type, b, b.knock);
      b.rehit[e.id] = game.tickCount + REHIT_TICKS;
    }
  }
}
