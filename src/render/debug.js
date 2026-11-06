// Debug overlay (§19, only with ?debug=1): collision circles over the world, and loop and
// entity stats at the top right. Reads the game and the loop stats; never writes them.
import { TOWER_RADIUS, DRAGON_PICKUP_RADIUS, WEAPONS } from '../sim/content.js';
import { VIEW_W, cameraOffset } from '../viewport.js';
import { shadowText } from './hud.js';

export const DEBUG_FONT = '12px monospace';
export const DEBUG_COLORS = {
  enemy: '#ff4040', tower: '#ffa020', projectile: '#ffff40', ring: '#ffff40', pickup: '#40e0ff', mini: '#c080ff',
};

// Text lines of the stats overlay. stats: { ticks, tickMs } from the App; speed: game speed.
export function debugLines(game, stats, speed) {
  return [
    `tick ${stats.tickMs.toFixed(2)} ms  ${stats.ticks}/frame  speed ${speed}x`,
    `enemies ${game.enemies.length}  proj ${game.projectiles.length}`,
    `gems ${game.gems.length}  effects ${game.effects.length}`,
    `t ${game.t.toFixed(1)}  seed ${game.seed}`,
  ];
}

function circle(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  ctx.stroke();
}

// Collision circles: enemies, the tower, projectiles, ring fireballs, mini towers' target
// radius and the dragon's gem pickup radius.
export function drawDebugWorld(ctx, game) {
  const o = cameraOffset(game.dragon);
  ctx.save();
  ctx.lineWidth = 1;
  for (const e of game.enemies) circle(ctx, e.x + o.x, e.y + o.y, e.r, DEBUG_COLORS.enemy);
  if (game.phase === 'play') circle(ctx, game.tower.x + o.x, game.tower.y + o.y, TOWER_RADIUS, DEBUG_COLORS.tower);
  for (const p of game.projectiles) circle(ctx, p.x + o.x, p.y + o.y, p.r, DEBUG_COLORS.projectile);
  for (const w of game.weapons) {
    if (w.id !== 'ring' || !Array.isArray(w.balls)) continue;
    for (const b of w.balls) circle(ctx, b.x + o.x, b.y + o.y, WEAPONS.ring.r, DEBUG_COLORS.ring);
  }
  for (const m of game.miniTowers || []) {
    if (!(m.lobTicks > 0)) circle(ctx, m.x + o.x, m.y + o.y, WEAPONS.miniTower.targetRadius, DEBUG_COLORS.mini);
  }
  circle(ctx, game.dragon.x + o.x, game.dragon.y + o.y, DRAGON_PICKUP_RADIUS, DEBUG_COLORS.pickup);
  ctx.restore();
}

export function drawDebugStats(ctx, game, stats, speed) {
  debugLines(game, stats, speed).forEach((s, i) => {
    shadowText(ctx, s, VIEW_W - 12, 12 + i * 16, { align: 'right', font: DEBUG_FONT });
  });
}
