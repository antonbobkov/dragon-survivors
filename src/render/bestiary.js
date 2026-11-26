// Bestiary (§17.1): every enemy type with its sprite, stats and resistances; types not met
// this run as silhouettes. Pure helpers (layout, rows, bar styles) are tested under node;
// drawBestiary reads the game and never writes it.
import { ENEMIES, ENEMY_TYPES, DAMAGE_TYPES, DAMAGE_TYPE_NAMES, TICK_HZ } from '../sim/content.js';
import { effectiveResist } from '../sim/damage.js';
import { VIEW_W, VIEW_H } from '../viewport.js';
import { shadowText, BIG_FONT } from './hud.js';
import { frameRect, SPRITE_SCALE } from './draw.js';

export const BESTIARY = {
  titleY: 24, top: 72, bottom: 548, hintY: 568,
  cols: 2, cardW: 452, colGap: 16, rowGap: 8, maxCardH: 110,
  spriteBox: 80, textX: 92, barsX: 232, nameW: 72,
  barW: 52, barH: 10, rowH: 24,
  font: '16px monospace', small: '14px monospace',
};

export const RESIST_COLORS = { weak: '#e0533a', neutral: '#8a8a8a', resist: '#4a9cff', immune: '#ffd23f' };
const SILHOUETTE = '#0b0b12';

// Card rects for `n` types: two columns filled row by row, centred, between top and bottom.
export function bestiaryLayout(n) {
  const L = BESTIARY;
  const rows = Math.max(1, Math.ceil(n / L.cols));
  const h = Math.min(L.maxCardH, Math.floor((L.bottom - L.top - L.rowGap * (rows - 1)) / rows));
  const width = L.cols * L.cardW + (L.cols - 1) * L.colGap;
  const x0 = Math.round((VIEW_W - width) / 2);
  return Array.from({ length: n }, (_, i) => ({
    x: x0 + (i % L.cols) * (L.cardW + L.colGap),
    y: L.top + Math.floor(i / L.cols) * (h + L.rowGap),
    w: L.cardW, h,
  }));
}

// How a resistance reads: red = weak, grey = neutral, blue = resists, gold = immune.
// `fill` is the bar's filled fraction, |r| (full at 100%).
export function resistStyle(r) {
  const pct = Math.round(Math.abs(r) * 100);
  if (r >= 1) return { label: 'immune', color: RESIST_COLORS.immune, fill: 1 };
  if (r > 0) return { label: `resist ${pct}%`, color: RESIST_COLORS.resist, fill: Math.min(1, r) };
  if (r < 0) return { label: `weak ${pct}%`, color: RESIST_COLORS.weak, fill: Math.min(1, -r) };
  return { label: '0%', color: RESIST_COLORS.neutral, fill: 0 };
}

// One entry per enemy type, in ENEMY_TYPES order. Resistances are after the armoury's shred.
export function bestiaryRows(game) {
  return ENEMY_TYPES.map((type) => {
    const def = ENEMIES[type];
    const seen = game.seen.includes(type);
    return {
      type, seen, name: seen ? def.name : '???',
      walk: def.walk, alpha: def.alpha, unkillable: !!def.unkillable,
      stats: seen ? [
        `HP ${def.hp === Infinity ? '∞' : def.hp}  XP ${def.xp}`,
        `SPD ${def.speed}  DPS ${def.dps}`,
      ] : [],
      resists: seen && !def.unkillable ? DAMAGE_TYPES.map((t) => {
        const r = effectiveResist(type, t, game.meta);
        return { type: t, name: DAMAGE_TYPE_NAMES[t], r, ...resistStyle(r) };
      }) : [],
    };
  });
}

// The frame of a looping anim with per-frame durations `ticks` after `tick` ticks.
export function animFrameAt(ticks, tick) {
  const total = ticks.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return 0;
  let t = ((Math.floor(tick) % total) + total) % total;
  for (let i = 0; i < ticks.length; i++) {
    if (t < ticks[i]) return i;
    t -= ticks[i];
  }
  return 0;
}

// Sprite scale (× the standard 2×) so a w×h frame fits a box: 1, or 0.5 (1×) if 2× is too big.
export function spriteFit(w, h, box) {
  return w * SPRITE_SCALE <= box && h * SPRITE_SCALE <= box ? 1 : 0.5;
}

// Dark silhouettes of atlas frames, made once per frame in an offscreen canvas.
const silhouettes = new WeakMap();
function silhouette(atlas, r, makeCanvas) {
  let cache = silhouettes.get(atlas);
  if (!cache) { cache = new Map(); silhouettes.set(atlas, cache); }
  const key = `${r.x},${r.y},${r.w},${r.h}`;
  let c = cache.get(key);
  if (!c) {
    c = makeCanvas(r.w, r.h);
    const g = c.getContext('2d');
    g.drawImage(atlas.image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = SILHOUETTE;
    g.fillRect(0, 0, r.w, r.h);
    cache.set(key, c);
  }
  return c;
}

function defaultCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

// `ms` animates the walks while the panel is open (the sim is stopped). `makeCanvas(w, h)`
// builds the offscreen canvases for silhouettes.
export function drawBestiary(ctx, game, atlas, ms = 0, { makeCanvas = defaultCanvas } = {}) {
  const L = BESTIARY;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  shadowText(ctx, 'BESTIARY', VIEW_W / 2, L.titleY, { align: 'center', font: BIG_FONT, color: '#ffb84a' });
  const rows = bestiaryRows(game);
  const rects = bestiaryLayout(rows.length);
  const tick = (ms / 1000) * TICK_HZ;
  rows.forEach((row, i) => {
    const c = rects[i];
    ctx.fillStyle = '#000';
    ctx.fillRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4);
    ctx.fillStyle = row.seen ? '#2a1f3a' : '#16121e';
    ctx.fillRect(c.x, c.y, c.w, c.h);

    // Sprite, centred in its box at the card's left.
    const anim = atlas.anims[row.walk];
    const frame = row.seen && anim ? animFrameAt(anim.ticks, tick) : 0;
    const r = frameRect(atlas, row.walk, frame);
    if (r) {
      const s = SPRITE_SCALE * spriteFit(r.w, r.h, L.spriteBox);
      const dw = r.w * s, dh = r.h * s;
      const dx = Math.round(c.x + 8 + (L.spriteBox - dw) / 2), dy = Math.round(c.y + (c.h - dh) / 2);
      if (row.seen) {
        ctx.save();
        ctx.globalAlpha = row.alpha;
        ctx.drawImage(atlas.image, r.x, r.y, r.w, r.h, dx, dy, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(silhouette(atlas, r, makeCanvas), 0, 0, r.w, r.h, dx, dy, dw, dh);
      }
    }

    // Name and stats.
    const tx = c.x + L.textX;
    const ty = c.y + Math.round((c.h - 3 * L.rowH) / 2) + 2;
    shadowText(ctx, row.name, tx, ty, { font: L.font, color: row.seen ? '#fff' : '#777' });
    row.stats.forEach((line, k) => shadowText(ctx, line, tx, ty + (k + 1) * L.rowH, { font: L.small, color: '#ddd' }));

    // Resistances: name, bar, label.
    const bx = c.x + L.barsX;
    if (row.seen && row.unkillable) {
      shadowText(ctx, 'takes no damage', bx, ty + L.rowH, { font: L.small, color: '#aaa' });
    }
    row.resists.forEach((res, k) => {
      const y = ty + k * L.rowH;
      shadowText(ctx, res.name, bx, y, { font: L.small, color: '#ddd' });
      const barX = bx + L.nameW, barY = y + 3;
      ctx.fillStyle = '#000';
      ctx.fillRect(barX - 1, barY - 1, L.barW + 2, L.barH + 2);
      ctx.fillStyle = '#3a3448';
      ctx.fillRect(barX, barY, L.barW, L.barH);
      ctx.fillStyle = res.color;
      if (res.fill > 0) ctx.fillRect(barX, barY, Math.round(L.barW * res.fill), L.barH);
      else ctx.fillRect(barX, barY + L.barH / 2 - 1, L.barW, 2); // neutral: a thin grey line
      shadowText(ctx, res.label, barX + L.barW + 8, y, { font: L.small, color: res.color });
    });
  });
  shadowText(ctx, 'Tab or Esc to close', VIEW_W / 2, L.hintY, { align: 'center', color: '#aaa' });
}
