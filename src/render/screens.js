// Title, pause, level-up (§14.1) and game-over screens (§13), drawn over the world.
// Reads the game and never writes it.
import { VIEW_W, VIEW_H } from '../viewport.js';
import { shadowText, formatTime, FONT, BIG_FONT } from './hud.js';
import { drawAnim } from './draw.js';
import { cardInfo } from '../sim/levelup.js';

export const BUTTON = { x: VIEW_W / 2 - 90, y: 430, w: 180, h: 44 };
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
  shadowText(ctx, 'DRAGON SURVIVORS', VIEW_W / 2, 100, { align: 'center', font: BIG_FONT, color: '#ffb84a' });
  shadowText(ctx, 'Keep the tower alive.', VIEW_W / 2, 150, { align: 'center' });
  controls(ctx, 196);
  button(ctx, 'Start');
  shadowText(ctx, 'click, Enter or A', VIEW_W / 2, BUTTON.y + BUTTON.h + 14, { align: 'center', color: '#aaa', font: FONT });
}

export function drawPause(ctx) {
  overlay(ctx);
  shadowText(ctx, 'Paused', VIEW_W / 2, 130, { align: 'center', font: BIG_FONT });
  controls(ctx, 196);
  shadowText(ctx, 'Esc, P or Start to resume', VIEW_W / 2, 440, { align: 'center', color: '#aaa' });
}

export function drawGameOver(ctx, game) {
  overlay(ctx);
  shadowText(ctx, 'The tower has fallen', VIEW_W / 2, 90, { align: 'center', font: BIG_FONT, color: '#ff6a4a' });
  gameOverLines(game).forEach((line, i) => shadowText(ctx, line, VIEW_W / 2 - 80, 140 + i * 28));
  button(ctx, 'Retry');
  shadowText(ctx, 'click, Enter or A', VIEW_W / 2, BUTTON.y + BUTTON.h + 14, { align: 'center', color: '#aaa' });
}

// ---- level-up cards (§14.1) -------------------------------------------------------

export const CARD = { w: 260, h: 220, gap: 24, y: 170, iconScale: 3, textMax: 15, textMin: 9 };

// Screen rects of `n` cards, centred in a row: [{ x, y, w, h }].
export function cardRects(n) {
  const width = n * CARD.w + Math.max(0, n - 1) * CARD.gap;
  const x0 = Math.round(VIEW_W / 2 - width / 2);
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (CARD.w + CARD.gap), y: CARD.y, w: CARD.w, h: CARD.h }));
}

// Index of the card under internal point (x, y), or -1.
export function cardAt(x, y, n) {
  return cardRects(n).findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

// The largest monospace font from textMax down to textMin px at which `s` fits in `width`.
export function fitFont(ctx, s, width) {
  for (let px = CARD.textMax; px > CARD.textMin; px--) {
    ctx.font = `${px}px monospace`;
    if (ctx.measureText(s).width <= width) return ctx.font;
  }
  return `${CARD.textMin}px monospace`;
}

// `sel` is the highlighted card (d-pad + A); keys 1/2/3 and a click pick directly.
export function drawLevelUp(ctx, game, atlas, sel = 0) {
  overlay(ctx);
  shadowText(ctx, 'LEVEL UP', VIEW_W / 2, 100, { align: 'center', font: BIG_FONT, color: '#ffd23f' });
  const rects = cardRects(game.offers.length);
  game.offers.forEach((card, i) => {
    const r = rects[i];
    const info = cardInfo(card);
    ctx.fillStyle = i === sel ? '#ffd23f' : '#000';
    ctx.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
    ctx.fillStyle = '#2a1f3a';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    shadowText(ctx, String(i + 1), r.x + 10, r.y + 8, { color: '#aaa' });
    if (info.tag) shadowText(ctx, info.tag, r.x + r.w - 10, r.y + 8, { align: 'right', color: info.tag === 'NEW' ? '#7dff6a' : '#ffd23f' });
    drawAnim(ctx, atlas, info.icon.anim, info.icon.frame, r.x + r.w / 2, r.y + 72, { scale: info.icon.scale * CARD.iconScale });
    shadowText(ctx, info.name, r.x + r.w / 2, r.y + 132, { align: 'center' });
    shadowText(ctx, info.text, r.x + r.w / 2, r.y + 170, { align: 'center', color: '#ddd', font: fitFont(ctx, info.text, r.w - 16) });
  });
  if (game.pendingLevelUps > 1) {
    shadowText(ctx, `${game.pendingLevelUps - 1} more to pick`, VIEW_W / 2, 140, { align: 'center', color: '#ddd' });
  }
  shadowText(ctx, '1 / 2 / 3, click a card, or d-pad + A', VIEW_W / 2, CARD.y + CARD.h + 30, { align: 'center', color: '#aaa' });
}
