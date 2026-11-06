// World rendering (§5): background, tether ring, entities in draw order, effects.
// Reads the game and never writes it.
import { mulberry32 } from '../sim/rng.js';
import { TETHER_LENGTH, WEAPONS, TICK_HZ } from '../sim/content.js';
import { VIEW_W, VIEW_H, cameraOffset } from '../viewport.js';

export const SPRITE_SCALE = 2;
export const TILE_SIZE = 64;
export const BG_SEED = 0x9e3779b9; // fixed: the background never touches game.rng
export const BG_COLORS = { base: '#2d5a27', light: '#3b6e31', dark: '#264d21' };
export const TETHER_RING_COLOR = 'rgba(0, 0, 0, 0.18)';
export const GEM_COLORS = { edge: '#2a7fd4', core: '#9be8ff' };
export const TOWER_BAR = { w: 40, h: 4, gap: 4, back: '#3a0d0d', fill: '#e03a3a' };

// Anims that are 16-direction sheets: projectiles pick their frame by `dirFrame`.
export const DIR_ANIMS = new Set(['laser.dir', 'laser.bigdir']);

// 6 px gem diamond: 1 = edge colour, 2 = core colour.
const GEM_PIXELS = [
  '..11..',
  '.1221.',
  '122221',
  '122221',
  '.1221.',
  '..11..',
];

// The source rect of frame `frame` of anim `name`, or null.
export function frameRect(atlas, name, frame) {
  const a = atlas.anims[name];
  if (!a || !a.frames.length) return null;
  const i = Math.min(Math.max(frame | 0, 0), a.frames.length - 1);
  return atlas.frames[a.frames[i]] || null;
}

// Draw a sprite centred on (x, y) at 2× × scale.
export function drawAnim(ctx, atlas, name, frame, x, y, opts = {}) {
  const r = frameRect(atlas, name, frame);
  if (!r) return;
  const s = SPRITE_SCALE * (opts.scale ?? 1);
  const dw = r.w * s, dh = r.h * s;
  const dx = Math.round(x - dw / 2), dy = Math.round(y - dh / 2);
  const alpha = opts.alpha ?? 1;
  if (!opts.flip && alpha === 1) {
    ctx.drawImage(atlas.image, r.x, r.y, r.w, r.h, dx, dy, dw, dh);
    return;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  if (opts.flip) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(atlas.image, r.x, r.y, r.w, r.h, 0, 0, dw, dh);
  } else {
    ctx.drawImage(atlas.image, r.x, r.y, r.w, r.h, dx, dy, dw, dh);
  }
  ctx.restore();
}

// Speckle positions of the grass tile, from its own fixed-seed RNG.
export function grassSpeckles(seed = BG_SEED) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < 28; i++) {
    out.push({
      x: Math.floor(rng() * (TILE_SIZE / 2)) * 2,
      y: Math.floor(rng() * (TILE_SIZE / 2)) * 2,
      color: rng() < 0.7 ? BG_COLORS.light : BG_COLORS.dark,
    });
  }
  return out;
}

// First tile origin for a tiled background with camera offset `o` (in [-TILE_SIZE, 0)).
export function tileStart(o) {
  return (((o % TILE_SIZE) + TILE_SIZE) % TILE_SIZE) - TILE_SIZE;
}

// §10.3: a mini tower in flight is drawn along the straight line from the tower to its
// landing point, raised by a sine arc of lobHeight px; a landed one at its position.
const LOB_TICKS = Math.round(WEAPONS.miniTower.lobTime * TICK_HZ);
export function miniTowerDrawPos(m) {
  if (!(m.lobTicks > 0)) return { x: m.x, y: m.y };
  const t = 1 - m.lobTicks / LOB_TICKS;
  return {
    x: m.fromX + (m.x - m.fromX) * t,
    y: m.fromY + (m.y - m.fromY) * t - Math.sin(t * Math.PI) * WEAPONS.miniTower.lobHeight,
  };
}

// §7.3 minion carriers: while the tower is moving, the prince and the princess walk at
// its base, one each side, bobbing out of phase. Derived from state only: the tether
// step records whether the tower moved this tick in `tower.moved`.
export const MINIONS = { anims: ['royal.prince', 'royal.princess'], dx: 14, dy: 26, bobTicks: 8 };
export function towerMoving(game) {
  return game.tower.moved === true;
}
export function minionSprites(game) {
  if (game.phase !== 'play' || !towerMoving(game)) return [];
  const t = game.tower, d = game.dragon;
  const flip = d.x < t.x; // face the way the tower is pulled
  const step = Math.floor(game.tickCount / MINIONS.bobTicks) % 2;
  return MINIONS.anims.map((anim, i) => ({
    anim, flip,
    x: t.x + (i === 0 ? -MINIONS.dx : MINIONS.dx),
    y: t.y + MINIONS.dy - ((step + i) % 2),
  }));
}

// Enemies in draw order (by y, then id), as a new array: the game's list is never reordered.
export function enemyDrawOrder(enemies, out = []) {
  out.length = 0;
  for (const e of enemies) out.push(e);
  out.sort((a, b) => a.y - b.y || a.id - b.id);
  return out;
}

// makeCanvas(w, h) -> a canvas with getContext('2d'); used for the grass tile and the gem sprite.
export function createRenderer({ atlas, makeCanvas }) {
  const tile = makeCanvas(TILE_SIZE, TILE_SIZE);
  {
    const g = tile.getContext('2d');
    g.fillStyle = BG_COLORS.base;
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    for (const s of grassSpeckles()) {
      g.fillStyle = s.color;
      g.fillRect(s.x, s.y, 2, 2);
    }
  }
  const gemSize = GEM_PIXELS.length * SPRITE_SCALE;
  const gem = makeCanvas(gemSize, gemSize);
  {
    const g = gem.getContext('2d');
    GEM_PIXELS.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '.') continue;
        g.fillStyle = row[x] === '1' ? GEM_COLORS.edge : GEM_COLORS.core;
        g.fillRect(x * SPRITE_SCALE, y * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
      }
    });
  }
  const sorted = [];

  function drawBackground(ctx, o) {
    const x0 = tileStart(o.x), y0 = tileStart(o.y);
    for (let y = y0; y < VIEW_H; y += TILE_SIZE) {
      for (let x = x0; x < VIEW_W; x += TILE_SIZE) ctx.drawImage(tile, x, y);
    }
  }

  // Draw order (§5): background, gems, tower, mini towers, enemies by y, ring fireballs,
  // projectiles, enemy shots (mage orbs), dragon, effects. The HUD and screens draw on top.
  function drawWorld(ctx, game) {
    ctx.imageSmoothingEnabled = false;
    const o = cameraOffset(game.dragon);
    drawBackground(ctx, o);

    const tw = game.tower;
    const tx = tw.x + o.x, ty = tw.y + o.y;
    ctx.strokeStyle = TETHER_RING_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(Math.round(tx), Math.round(ty), TETHER_LENGTH, 0, Math.PI * 2);
    ctx.stroke();

    for (const g of game.gems || []) {
      ctx.drawImage(gem, Math.round(g.x + o.x - gemSize / 2), Math.round(g.y + o.y - gemSize / 2));
    }

    // Once the tower falls the castle.destroy effect replaces it.
    if (game.phase === 'play') {
      drawAnim(ctx, atlas, tw.anim, tw.frame, tx, ty);
      const r = frameRect(atlas, tw.anim, tw.frame);
      const top = Math.round(ty - (r ? r.h : 30) * SPRITE_SCALE / 2) - TOWER_BAR.gap - TOWER_BAR.h;
      const left = Math.round(tx - TOWER_BAR.w / 2);
      const frac = tw.maxHp > 0 ? Math.max(0, Math.min(1, tw.hp / tw.maxHp)) : 0;
      ctx.fillStyle = TOWER_BAR.back;
      ctx.fillRect(left, top, TOWER_BAR.w, TOWER_BAR.h);
      ctx.fillStyle = TOWER_BAR.fill;
      ctx.fillRect(left, top, Math.round(TOWER_BAR.w * frac), TOWER_BAR.h);
      for (const m of minionSprites(game)) drawAnim(ctx, atlas, m.anim, 0, m.x + o.x, m.y + o.y, { flip: m.flip });
    }

    for (const m of game.miniTowers || []) {
      const p = miniTowerDrawPos(m);
      drawAnim(ctx, atlas, m.anim || 'castle', m.frame || 0, p.x + o.x, p.y + o.y, { scale: WEAPONS.miniTower.scale });
    }

    for (const e of enemyDrawOrder(game.enemies, sorted)) {
      drawAnim(ctx, atlas, e.anim, e.frame, e.x + o.x, e.y + o.y, { flip: e.flip, alpha: e.alpha });
    }
    sorted.length = 0;

    for (const w of game.weapons) {
      if (w.id !== 'ring' || !Array.isArray(w.balls)) continue;
      for (const b of w.balls) {
        drawAnim(ctx, atlas, w.anim || 'fireball.anim', w.frame ?? 0, b.x + o.x, b.y + o.y);
      }
    }

    for (const p of game.projectiles) {
      const f = DIR_ANIMS.has(p.anim) ? p.dirFrame : p.frame;
      drawAnim(ctx, atlas, p.anim, f, p.x + o.x, p.y + o.y);
    }

    for (const s of game.enemyShots || []) {
      drawAnim(ctx, atlas, s.anim, s.frame, s.x + o.x, s.y + o.y);
    }

    const d = game.dragon;
    drawAnim(ctx, atlas, d.anim, d.frame, d.x + o.x, d.y + o.y, { flip: d.flip });

    for (const fx of game.effects) {
      drawAnim(ctx, atlas, fx.anim, fx.frame, fx.x + o.x, fx.y + o.y, { flip: fx.flip, alpha: fx.alpha, scale: fx.scale });
    }
  }

  return { drawWorld };
}
