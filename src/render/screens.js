// Title, pause and game-over screens (§13), drawn over the world. The level-up screen
// belongs to the growth flow (§14.1). Reads the game and never writes it.
import { VIEW_W, VIEW_H } from '../viewport.js';
import { shadowText, formatTime, FONT, BIG_FONT } from './hud.js';

export const BUTTON = { x: VIEW_W / 2 - 90, y: 400, w: 180, h: 44 };
export const OVERLAY = 'rgba(0, 0, 0, 0.6)';

export const CONTROLS = [
  'Move   WASD / arrows   left stick',
  'Aim    mouse           right stick',
  'Pause  Esc / P         Start',
];

// Game-over lines: time survived, level reached, kills, score.
export function gameOverLines(game) {
  return [
    `Time   ${formatTime(game.t)}`,
    `Level  ${game.level}`,
    `Kills  ${game.kills}`,
    `Score  ${game.score()}`,
  ];
}

function overlay(ctx) {
  ctx.fillStyle = OVERLAY;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function button(ctx, label) {
  const b = BUTTON;
  ctx.fillStyle = '#000';
  ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  ctx.fillStyle = '#b8402a';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  shadowText(ctx, label, b.x + b.w / 2, b.y + b.h / 2, { align: 'center', baseline: 'middle' });
}

function controls(ctx, y) {
  CONTROLS.forEach((line, i) => shadowText(ctx, line, VIEW_W / 2, y + i * 24, { align: 'center', color: '#ddd' }));
}

export function drawTitle(ctx) {
  overlay(ctx);
  shadowText(ctx, 'DRAGON SURVIVORS', VIEW_W / 2, 150, { align: 'center', font: BIG_FONT, color: '#ffb84a' });
  shadowText(ctx, 'Keep the tower alive.', VIEW_W / 2, 210, { align: 'center' });
  controls(ctx, 270);
  button(ctx, 'Start');
  shadowText(ctx, 'click, Enter or A', VIEW_W / 2, BUTTON.y + BUTTON.h + 14, { align: 'center', color: '#aaa', font: FONT });
}

export function drawPause(ctx) {
  overlay(ctx);
  shadowText(ctx, 'Paused', VIEW_W / 2, 170, { align: 'center', font: BIG_FONT });
  controls(ctx, 260);
  shadowText(ctx, 'Esc, P or Start to resume', VIEW_W / 2, 370, { align: 'center', color: '#aaa' });
}

export function drawGameOver(ctx, game) {
  overlay(ctx);
  shadowText(ctx, 'The tower has fallen', VIEW_W / 2, 140, { align: 'center', font: BIG_FONT, color: '#ff6a4a' });
  gameOverLines(game).forEach((line, i) => shadowText(ctx, line, VIEW_W / 2 - 80, 220 + i * 30));
  button(ctx, 'Retry');
  shadowText(ctx, 'click, Enter or A', VIEW_W / 2, BUTTON.y + BUTTON.h + 14, { align: 'center', color: '#aaa' });
}
