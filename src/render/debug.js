// Debug overlay (§19, only with ?debug=1): collision circles over the world, and loop and
// entity stats at the top right. Reads the game and the loop stats; never writes them.
import { TOWER_RADIUS, DRAGON_PICKUP_RADIUS, DRAGON_RADIUS, WEAPONS, BRAZIER_RADIUS } from '../sim/content.js';
import { VIEW_W, cameraOffset } from '../viewport.js';
import { shadowText } from './hud.js';
import { slashRect } from '../sim/claws.js';
import { buffMods, weaponLevel } from '../sim/weapons.js';

export const DEBUG_FONT = '12px monospace';
export const DEBUG_COLORS = {
  enemy: '#ff4040', tower: '#ffa020', projectile: '#ffff40', ring: '#ffff40', pickup: '#40e0ff', mini: '#c080ff', orb: '#60ff60', dragon: '#ffffff', brazier: '#ff8000',
  slash: '#ff80ff', bite: '#ff4040', blade: '#e0e0e0',
};

// Text lines of the stats overlay. stats: { ticks, tickMs } from the App; speed: game speed.
export function debugLines(game, stats, speed) {
  return [
    `tick ${stats.tickMs.toFixed(2)} ms  ${stats.ticks}/frame  speed ${speed}x`,
    `enemies ${game.enemies.length}  proj ${game.projectiles.length}  orbs ${(game.enemyShots || []).length}`,
    `gems ${game.gems.length}  effects ${game.effects.length}  braziers ${(game.braziers || []).length}  pickups ${(game.pickups || []).length}`,
    `t ${game.t.toFixed(1)}  seed ${game.seed}`,
  ];
}

function circle(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  ctx.stroke();
}

// A struck claw slash's hitbox where it struck: its rectangle, or its cone (§10.5–10.6).
function slashOutline(ctx, s, o) {
  ctx.strokeStyle = DEBUG_COLORS.slash;
  ctx.beginPath();
  if (s.shape === 'rect') {
    const R = slashRect(s);
    ctx.rect(Math.round(R.x0 + o.x), Math.round(R.y0 + o.y), Math.round(R.x1 - R.x0), Math.round(R.y1 - R.y0));
  } else {
    const a = Math.atan2(s.dy, s.dx), half = (s.angle / 2) * Math.PI / 180;
    const x = s.x + o.x, y = s.y + o.y;
    ctx.moveTo(x, y);
    ctx.arc(x, y, s.reach, a - half, a + half);
    ctx.closePath();
  }
  ctx.stroke();
}

// Collision circles: enemies, the tower, projectiles, enemy shots, ring fireballs, saw blades,
// mini towers' target radius, braziers, claw slash hitboxes, the bite's reach around the
// dragon, the dragon's hit circle and its gem pickup radius.
export function drawDebugWorld(ctx, game) {
  const o = cameraOffset(game.dragon);
  ctx.save();
  ctx.lineWidth = 1;
  for (const e of game.enemies) circle(ctx, e.x + o.x, e.y + o.y, e.r, DEBUG_COLORS.enemy);
  if (game.phase === 'play') circle(ctx, game.tower.x + o.x, game.tower.y + o.y, TOWER_RADIUS, DEBUG_COLORS.tower);
  for (const p of game.projectiles) circle(ctx, p.x + o.x, p.y + o.y, p.r, DEBUG_COLORS.projectile);
  for (const s of game.enemyShots || []) circle(ctx, s.x + o.x, s.y + o.y, s.r, DEBUG_COLORS.orb);
  for (const w of game.weapons) {
    if (w.id !== 'ring' || !Array.isArray(w.balls)) continue;
    for (const b of w.balls) circle(ctx, b.x + o.x, b.y + o.y, WEAPONS.ring.r, DEBUG_COLORS.ring);
  }
  for (const b of game.blades || []) circle(ctx, b.x + o.x, b.y + o.y, b.r, DEBUG_COLORS.blade);
  for (const m of game.miniTowers || []) {
    if (!(m.lobTicks > 0)) circle(ctx, m.x + o.x, m.y + o.y, WEAPONS.miniTower.targetRadius, DEBUG_COLORS.mini);
  }
  for (const s of game.slashes || []) if (s.struck) slashOutline(ctx, s, o);
  for (const b of game.braziers || []) circle(ctx, b.x + o.x, b.y + o.y, BRAZIER_RADIUS, DEBUG_COLORS.brazier);
  for (const w of game.weapons) {
    if (w.id !== 'bite') continue;
    const reach = weaponLevel(w).reach * buffMods(game).area;
    circle(ctx, game.dragon.x + o.x, game.dragon.y + o.y, reach, DEBUG_COLORS.bite);
  }
  circle(ctx, game.dragon.x + o.x, game.dragon.y + o.y, DRAGON_RADIUS, DEBUG_COLORS.dragon);
  circle(ctx, game.dragon.x + o.x, game.dragon.y + o.y, DRAGON_PICKUP_RADIUS, DEBUG_COLORS.pickup);
  ctx.restore();
}

export function drawDebugStats(ctx, game, stats, speed) {
  debugLines(game, stats, speed).forEach((s, i) => {
    shadowText(ctx, s, VIEW_W - 12, 12 + i * 16, { align: 'right', font: DEBUG_FONT });
  });
}
