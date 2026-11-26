// Armoury screen (§13.1): six track cells (Power and Shred per damage type), Reset and Back.
// Layout, hit testing and navigation are pure and tested under node; drawArmoury reads the
// purse and never writes it.
import { DAMAGE_TYPES, DAMAGE_TYPE_NAMES } from '../sim/content.js';
import { TRACKS, MAX_RANK, nextCost, canBuy, totalSpent, trackText } from '../armoury.js';
import { VIEW_W, VIEW_H } from '../viewport.js';
import { shadowText, BIG_FONT } from './hud.js';
import { fitFont, OVERLAY } from './screens.js';

export const ARMOURY = {
  titleY: 24, goldY: 66, top: 100,
  cellW: 290, cellH: 150, colGap: 16, rowGap: 16,
  buttonY: 440, buttonW: 180, buttonH: 40, buttonGap: 20,
  msgY: 498, hintY: 540, hint2Y: 564,
  pip: { w: 20, h: 12, gap: 6 },
};

// Items: 0..5 the track cells, row by row (Power fire, arcane, physical; then Shred), then
// Reset and Back.
export const CELLS = TRACKS.length * DAMAGE_TYPES.length;
export const RESET = CELLS;
export const BACK = CELLS + 1;
export const ITEMS = CELLS + 2;

export const TYPE_COLORS = { fire: '#ff8a3a', arcane: '#c98aff', physical: '#d8d8d8' };
export const TRACK_NAMES = { power: 'Power', shred: 'Shred' };

export function cellItem(i) {
  return { track: TRACKS[Math.floor(i / DAMAGE_TYPES.length)], type: DAMAGE_TYPES[i % DAMAGE_TYPES.length] };
}

// Screen rects of every item, in item order: [{ x, y, w, h }].
export function armouryRects() {
  const L = ARMOURY;
  const cols = DAMAGE_TYPES.length;
  const width = cols * L.cellW + (cols - 1) * L.colGap;
  const x0 = Math.round((VIEW_W - width) / 2);
  const rects = [];
  for (let i = 0; i < CELLS; i++) {
    rects.push({ x: x0 + (i % cols) * (L.cellW + L.colGap), y: L.top + Math.floor(i / cols) * (L.cellH + L.rowGap), w: L.cellW, h: L.cellH });
  }
  const bx = Math.round(VIEW_W / 2 - L.buttonW - L.buttonGap / 2);
  rects.push({ x: bx, y: L.buttonY, w: L.buttonW, h: L.buttonH });
  rects.push({ x: bx + L.buttonW + L.buttonGap, y: L.buttonY, w: L.buttonW, h: L.buttonH });
  return rects;
}

// The item under internal point (x, y), or -1.
export function armouryItemAt(x, y) {
  return armouryRects().findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

// Moving the selection by one step (dx, dy in −1..1). The cells are a 3×2 grid; below them
// Reset sits under the first two columns and Back under the third. Moves off the edge stay put.
export function armouryNav(sel, dx, dy) {
  const cols = DAMAGE_TYPES.length;
  if (sel === RESET || sel === BACK) {
    if (dy < 0) return sel === RESET ? CELLS - cols : CELLS - 1;
    if (dx > 0) return BACK;
    if (dx < 0) return RESET;
    return sel;
  }
  const col = sel % cols, row = Math.floor(sel / cols);
  if (dy > 0 && row === TRACKS.length - 1) return col === cols - 1 ? BACK : RESET;
  const c = Math.max(0, Math.min(cols - 1, col + Math.sign(dx)));
  const r = Math.max(0, Math.min(TRACKS.length - 1, row + Math.sign(dy)));
  return r * cols + c;
}

// What a cell shows.
export function cellInfo(purse, i) {
  const { track, type } = cellItem(i);
  const rank = purse.ranks[track][type];
  const cost = nextCost(purse, track, type);
  const text = trackText(track, DAMAGE_TYPE_NAMES[type], rank);
  return {
    track, type, rank,
    title: `${DAMAGE_TYPE_NAMES[type]} ${TRACK_NAMES[track]}`,
    effect: text.effect, now: `Now ${text.now}`,
    cost: cost === null ? 'Max rank' : `Next rank: ${cost} gold`,
    costColor: cost === null ? '#ffd23f' : canBuy(purse, track, type) ? '#7dff6a' : '#e0533a',
  };
}

function frame(ctx, r, selected, fill) {
  ctx.fillStyle = selected ? '#ffd23f' : '#000';
  ctx.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

// `sel` the highlighted item; `resetArmed` the Reset confirm step is open.
export function drawArmoury(ctx, purse, sel = 0, resetArmed = false) {
  const L = ARMOURY;
  ctx.fillStyle = OVERLAY;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  shadowText(ctx, 'ARMOURY', VIEW_W / 2, L.titleY, { align: 'center', font: BIG_FONT, color: '#ffb84a' });
  shadowText(ctx, `Gold ${purse.gold}`, VIEW_W / 2, L.goldY, { align: 'center', color: '#ffd23f' });
  const rects = armouryRects();
  for (let i = 0; i < CELLS; i++) {
    const r = rects[i];
    const c = cellInfo(purse, i);
    frame(ctx, r, i === sel, '#2a1f3a');
    shadowText(ctx, c.title, r.x + 12, r.y + 10, { color: TYPE_COLORS[c.type] });
    shadowText(ctx, `${c.rank}/${MAX_RANK}`, r.x + r.w - 12, r.y + 10, { align: 'right', color: '#ddd' });
    for (let k = 0; k < MAX_RANK; k++) {
      ctx.fillStyle = k < c.rank ? '#ffd23f' : '#4a4058';
      ctx.fillRect(r.x + 12 + k * (L.pip.w + L.pip.gap), r.y + 38, L.pip.w, L.pip.h);
    }
    shadowText(ctx, c.effect, r.x + 12, r.y + 64, { color: '#ddd', font: fitFont(ctx, c.effect, r.w - 24) });
    shadowText(ctx, c.now, r.x + 12, r.y + 90);
    shadowText(ctx, c.cost, r.x + 12, r.y + 118, { color: c.costColor });
  }
  const spent = totalSpent(purse);
  frame(ctx, rects[RESET], sel === RESET, resetArmed ? '#b8402a' : '#5a2a2a');
  shadowText(ctx, resetArmed ? 'Confirm reset' : 'Reset', rects[RESET].x + L.buttonW / 2, L.buttonY + L.buttonH / 2, { align: 'center', baseline: 'middle' });
  frame(ctx, rects[BACK], sel === BACK, '#3a3248');
  shadowText(ctx, 'Back', rects[BACK].x + L.buttonW / 2, L.buttonY + L.buttonH / 2, { align: 'center', baseline: 'middle' });
  if (resetArmed) {
    shadowText(ctx, `Reset refunds ${spent} gold. Select it again to confirm.`, VIEW_W / 2, L.msgY, { align: 'center', color: '#ff6a4a' });
  } else if (sel === RESET) {
    shadowText(ctx, spent ? `Sell every rank back for ${spent} gold` : 'Nothing to refund', VIEW_W / 2, L.msgY, { align: 'center', color: '#aaa' });
  }
  shadowText(ctx, 'Arrows / d-pad select   Enter / A / click buy', VIEW_W / 2, L.hintY, { align: 'center', color: '#aaa' });
  shadowText(ctx, 'Esc, U, B or Y: back to the title', VIEW_W / 2, L.hint2Y, { align: 'center', color: '#aaa' });
}
