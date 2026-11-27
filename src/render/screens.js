// Title, pause, level-up (§14.1), the merchant's shop (§14.3) and game-over screens (§13),
// drawn over the world.
// Reads the game and never writes it.
import { VIEW_W, VIEW_H } from '../viewport.js';
import { shadowText, formatTime, FONT, BIG_FONT } from './hud.js';
import { drawAnim } from './draw.js';
import { cardInfo } from '../sim/levelup.js';
import { shopOffers } from '../sim/shop.js';
import { SHOP_PRICES } from '../sim/content.js';

export const BUTTON = { x: VIEW_W / 2 - 90, y: 430, w: 180, h: 44 };
// The title's second button (§13.1); a click on it opens the armoury instead of starting.
export const ARMOURY_BUTTON = { x: VIEW_W / 2 - 90, y: 514, w: 180, h: 36 };
export const OVERLAY = 'rgba(0, 0, 0, 0.6)';

export const CONTROLS = [
  'Move   WASD / arrows   left stick',
  'Aim    mouse           right stick',
  'Pause  Esc / P         Start',
  'Foes   Tab             Back',
];

export function inRect(r, x, y) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

// Game-over lines: time survived, level reached, kills, score, and with `gold`
// ({ earned, purse }) the gold this run earned and the purse after it (§13.1).
export function gameOverLines(game, gold = null) {
  const lines = [
    `Time   ${formatTime(game.t)}`,
    `Level  ${game.level}`,
    `Kills  ${game.kills}`,
    `Score  ${game.score()}`,
  ];
  if (gold) lines.push(`Gold   +${gold.earned}  (${gold.purse} in purse)`);
  return lines;
}

function overlay(ctx) {
  ctx.fillStyle = OVERLAY;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function button(ctx, label, b = BUTTON, fill = '#b8402a') {
  ctx.fillStyle = '#000';
  ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  ctx.fillStyle = fill;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  shadowText(ctx, label, b.x + b.w / 2, b.y + b.h / 2, { align: 'center', baseline: 'middle' });
}

function controls(ctx, y) {
  CONTROLS.forEach((line, i) => shadowText(ctx, line, VIEW_W / 2, y + i * 24, { align: 'center', color: '#ddd' }));
}

// `gold`: the purse's gold, shown when given (§13.1).
export function drawTitle(ctx, gold = null) {
  overlay(ctx);
  shadowText(ctx, 'DRAGON SURVIVORS', VIEW_W / 2, 100, { align: 'center', font: BIG_FONT, color: '#ffb84a' });
  shadowText(ctx, 'Keep the tower alive.', VIEW_W / 2, 150, { align: 'center' });
  controls(ctx, 196);
  if (gold !== null) shadowText(ctx, `Gold ${gold}`, VIEW_W / 2, ARMOURY_BUTTON.y + ARMOURY_BUTTON.h + 12, { align: 'center', color: '#ffd23f' });
  button(ctx, 'Start');
  shadowText(ctx, 'click, Enter or A', VIEW_W / 2, BUTTON.y + BUTTON.h + 14, { align: 'center', color: '#aaa', font: FONT });
  button(ctx, 'Armoury  U / Y', ARMOURY_BUTTON, '#3a3248');
}

export function drawPause(ctx) {
  overlay(ctx);
  shadowText(ctx, 'Paused', VIEW_W / 2, 130, { align: 'center', font: BIG_FONT });
  controls(ctx, 196);
  shadowText(ctx, 'Esc, P or Start to resume', VIEW_W / 2, 440, { align: 'center', color: '#aaa' });
}

export function drawGameOver(ctx, game, gold = null) {
  overlay(ctx);
  shadowText(ctx, 'The tower has fallen', VIEW_W / 2, 90, { align: 'center', font: BIG_FONT, color: '#ff6a4a' });
  gameOverLines(game, gold).forEach((line, i) => shadowText(ctx, line, VIEW_W / 2 - 80, 140 + i * 28));
  button(ctx, 'Retry');
  shadowText(ctx, 'click, Enter or A', VIEW_W / 2, BUTTON.y + BUTTON.h + 14, { align: 'center', color: '#aaa' });
}

// ---- level-up cards (§14.1) -------------------------------------------------------

// Card tag colours: NEW green, EVOLVE orange, L<n> yellow.
export const TAG_COLORS = { NEW: '#7dff6a', EVOLVE: '#ff9a3d', level: '#ffd23f' };
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
    if (info.tag) shadowText(ctx, info.tag, r.x + r.w - 10, r.y + 8, { align: 'right', color: TAG_COLORS[info.tag] || TAG_COLORS.level });
    drawAnim(ctx, atlas, info.icon.anim, info.icon.frame, r.x + r.w / 2, r.y + 72, { scale: info.icon.scale * CARD.iconScale });
    shadowText(ctx, info.name, r.x + r.w / 2, r.y + 132, { align: 'center' });
    shadowText(ctx, info.text, r.x + r.w / 2, r.y + 170, { align: 'center', color: '#ddd', font: fitFont(ctx, info.text, r.w - 16) });
  });
  if (game.pendingLevelUps > 1) {
    shadowText(ctx, `${game.pendingLevelUps - 1} more to pick`, VIEW_W / 2, 140, { align: 'center', color: '#ddd' });
  }
  shadowText(ctx, '1 / 2 / 3, click a card, or d-pad + A', VIEW_W / 2, CARD.y + CARD.h + 30, { align: 'center', color: '#aaa' });
  drawRerollButton(ctx, game);
}

// A banked reroll (§14): a button under the cards while the game has any.
export const REROLL_BUTTON = { x: VIEW_W / 2 - 110, y: CARD.y + CARD.h + 56, w: 220, h: 36 };
export function drawRerollButton(ctx, game) {
  if (!(game.rerolls > 0)) return;
  button(ctx, `Reroll (${game.rerolls})  R / X`, REROLL_BUTTON, '#3a3248');
}

// ---- the merchant's shop (§14.3) -----------------------------------------------------

// The main page shows the three offers as cards (the level-up layout) and a Leave button; the
// cards page the pool in a grid of tiles, 4 a row, and a Back button. `sel` is the highlighted
// item: an offer or a tile, the button being the last index.
export const SHOP_INFO = {
  reroll: { name: 'Reroll', icon: { anim: 'icon.reroll', frame: 0, scale: 1 }, text: 'Bank a reroll for a level-up' },
  card: { name: 'Any card', icon: { anim: 'icon.big', frame: 0, scale: 1 }, text: 'Pick any card from the pool' },
  heal: { name: 'Heal', icon: { anim: 'pickup.heart', frame: 0, scale: 1 }, text: 'Tower +30 HP' },
};
export const SHOP_BUTTON = { x: VIEW_W / 2 - 90, y: CARD.y + CARD.h + 44, w: 180, h: 40 };
export const TILE = { w: 216, h: 64, gapX: 12, gapY: 8, cols: 4, y: 100 };
export const BACK_BUTTON = { x: VIEW_W / 2 - 90, y: 476, w: 180, h: 36 };

// `s` cut to fit `width` in the context's current font, ending in '…' when cut.
export function clipText(ctx, s, width) {
  if (ctx.measureText(s).width <= width) return s;
  let n = s.length;
  while (n > 0 && ctx.measureText(s.slice(0, n) + '…').width > width) n--;
  return s.slice(0, n).trimEnd() + '…';
}

// Screen rects of `n` pool tiles, row by row: [{ x, y, w, h }].
export function tileRects(n) {
  const width = TILE.cols * TILE.w + (TILE.cols - 1) * TILE.gapX;
  const x0 = Math.round(VIEW_W / 2 - width / 2);
  return Array.from({ length: n }, (_, i) => ({
    x: x0 + (i % TILE.cols) * (TILE.w + TILE.gapX), y: TILE.y + Math.floor(i / TILE.cols) * (TILE.h + TILE.gapY), w: TILE.w, h: TILE.h,
  }));
}

// The shop item under (x, y): on the main page an offer 0–2 or 3 (Leave); on the cards page a
// tile 0..n−1 or n (Back); -1 elsewhere.
export function shopItemAt(shop, x, y) {
  if (shop.page === 'cards') {
    const i = tileRects(shop.cards.length).findIndex((r) => inRect(r, x, y));
    if (i >= 0) return i;
    return inRect(BACK_BUTTON, x, y) ? shop.cards.length : -1;
  }
  const i = cardAt(x, y, 3);
  if (i >= 0) return i;
  return inRect(SHOP_BUTTON, x, y) ? 3 : -1;
}

// One step of the highlight. Main page: left/right along the offers and Leave, down to Leave,
// up from Leave to the middle offer. Cards page: left/right one tile, up/down one row (TILE.cols),
// down past the last row to Back, up from Back to the last tile; clamped.
export function shopNav(shop, sel, dx, dy) {
  if (shop.page !== 'cards') {
    if (dy > 0) return 3;
    if (dy < 0 && sel === 3) return 1;
    return Math.max(0, Math.min(3, sel + dx));
  }
  const n = shop.cards.length;
  if (sel >= n) return dy < 0 || dx < 0 ? Math.max(0, n - 1) : n;
  const s = sel + dx + dy * TILE.cols;
  if (s > n - 1) return dy > 0 ? n : n - 1;
  return Math.max(0, s);
}

function frame(ctx, r, on) {
  ctx.fillStyle = on ? '#ffd23f' : '#000';
  ctx.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  ctx.fillStyle = '#2a1f3a';
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

export function drawShop(ctx, game, atlas, sel = 0) {
  overlay(ctx);
  const shop = game.shop;
  if (shop.page === 'cards') { drawShopCards(ctx, game, atlas, sel); return; }
  shadowText(ctx, 'MERCHANT', VIEW_W / 2, 100, { align: 'center', font: BIG_FONT, color: '#ffd23f' });
  shadowText(ctx, `Banked XP ${game.xp}  -  one trade`, VIEW_W / 2, 140, { align: 'center', color: '#ddd' });
  const rects = cardRects(3);
  shopOffers(game).forEach((o, i) => {
    const r = rects[i];
    const info = SHOP_INFO[o.id];
    frame(ctx, r, i === sel);
    ctx.save();
    if (!o.ok) ctx.globalAlpha = 0.4; // unaffordable or of no use: greyed
    shadowText(ctx, String(i + 1), r.x + 10, r.y + 8, { color: '#aaa' });
    shadowText(ctx, `${o.price} XP`, r.x + r.w - 10, r.y + 8, { align: 'right', color: o.ok ? TAG_COLORS.level : '#aaa' });
    drawAnim(ctx, atlas, info.icon.anim, info.icon.frame, r.x + r.w / 2, r.y + 72, { scale: info.icon.scale * CARD.iconScale });
    shadowText(ctx, info.name, r.x + r.w / 2, r.y + 132, { align: 'center' });
    shadowText(ctx, info.text, r.x + r.w / 2, r.y + 170, { align: 'center', color: '#ddd', font: fitFont(ctx, info.text, r.w - 16) });
    ctx.restore();
  });
  if (sel === 3) frame(ctx, SHOP_BUTTON, true);
  button(ctx, 'Leave  Esc / B', SHOP_BUTTON, '#3a3248');
  shadowText(ctx, '1 / 2 / 3, click, or d-pad + A', VIEW_W / 2, SHOP_BUTTON.y + SHOP_BUTTON.h + 16, { align: 'center', color: '#aaa' });
}

function drawShopCards(ctx, game, atlas, sel) {
  const shop = game.shop;
  shadowText(ctx, 'ANY CARD', VIEW_W / 2, 24, { align: 'center', font: BIG_FONT, color: '#ffd23f' });
  shadowText(ctx, `${SHOP_PRICES.card} XP of ${game.xp} banked`, VIEW_W / 2, 66, { align: 'center', color: '#ddd' });
  const rects = tileRects(shop.cards.length);
  shop.cards.forEach((card, i) => {
    const r = rects[i];
    const info = cardInfo(card);
    frame(ctx, r, i === sel);
    drawAnim(ctx, atlas, info.icon.anim, info.icon.frame, r.x + 26, r.y + r.h / 2, { scale: info.icon.scale });
    shadowText(ctx, info.name, r.x + 50, r.y + 10);
    if (info.tag) shadowText(ctx, info.tag, r.x + r.w - 8, r.y + 10, { align: 'right', color: TAG_COLORS[info.tag] || TAG_COLORS.level });
    const font = fitFont(ctx, info.text, r.w - 58);
    shadowText(ctx, clipText(ctx, info.text, r.w - 58), r.x + 50, r.y + 38, { color: '#ddd', font });
  });
  if (sel >= shop.cards.length) frame(ctx, BACK_BUTTON, true);
  button(ctx, 'Back  Esc / B', BACK_BUTTON, '#3a3248');
  shadowText(ctx, 'click a card, or move + Enter / A', VIEW_W / 2, BACK_BUTTON.y + BACK_BUTTON.h + 16, { align: 'center', color: '#aaa' });
}
