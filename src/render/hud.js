// HUD (§17): timer, tower HP bar, XP bar with level, weapon and buff icons with level pips,
// the stage banner. Reads the game and never writes it.
import { BUFFS, BUFF_MAX_LEVEL, weaponMaxLevel, xpToNext, BANNER_TIME, BANNER_FADE } from '../sim/content.js';
import { stageAt } from '../sim/spawner.js';
import { VIEW_W, VIEW_H, cameraOffset } from '../viewport.js';
import { drawAnim, frameRect, SPRITE_SCALE, pickupVisible } from './draw.js';

export const FONT = '16px monospace';
export const BIG_FONT = '32px monospace';
export const HUD = {
  hp: { x: 12, y: 12, w: 200, h: 16, back: '#3a0d0d', fill: '#e03a3a' },
  timerY: 12,
  icons: { y: 50, slot: 34, pipY: 72, pip: 4, pipGap: 2, gap: 16 },
  xp: { h: 14, back: '#10202e', fill: '#3fa9ff' },
  banner: { y: 92, color: '#ffd23f' },
};

// §17 the stage banner, `Stage n: Name`, for BANNER_TIME s from the start of each stage of the
// game's timeline (§9.1), fading out over the last BANNER_FADE s; null when none shows. Driven by
// `t` alone, so it needs no state.
export function stageBanner(game) {
  if (game.phase !== 'play') return null;
  const s = stageAt(game.timeline || [], game.t);
  if (!s) return null;
  const age = game.t - s.t;
  if (age >= BANNER_TIME - 1e-9) return null;
  const left = BANNER_TIME - age;
  return { text: `Stage ${s.n}: ${s.name}`, alpha: left >= BANNER_FADE ? 1 : left / BANNER_FADE };
}

// §17 weapon icons: fireball first frame, laser facing right, mini tower castle at 1×, ring icon,
// the claws' own icons.
export const WEAPON_ICONS = {
  fireball: { anim: 'fireball.anim', frame: 0, scale: 1 },
  laser: { anim: 'laser.dir', frame: 12, scale: 1 },
  miniTower: { anim: 'castle', frame: 0, scale: 0.5 },
  ring: { anim: 'icon.ring', frame: 0, scale: 1 },
  leftClaw: { anim: 'icon.leftclaw', frame: 0, scale: 1 },
  rightClaw: { anim: 'icon.rightclaw', frame: 0, scale: 1 },
  dualClaw: { anim: 'icon.dualclaw', frame: 0, scale: 1 },
};

export function buffIcon(id) {
  return { anim: BUFFS[id].icon, frame: 0, scale: 1 };
}

// Run timer `m:ss` from seconds.
export function formatTime(t) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Text with a 2 px drop shadow so it reads on grass.
export function shadowText(ctx, s, x, y, { align = 'left', font = FONT, color = '#fff', baseline = 'top' } = {}) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = '#000';
  ctx.fillText(s, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

// Icon slots for weapons then buffs, centred on the screen: [{ x, kind, id, level, max }];
// `max` is the number of pips: a weapon's top level (one for an evolution), 3 for buffs.
export function iconSlots(weapons, buffs) {
  const { slot, gap } = HUD.icons;
  const items = [
    ...weapons.map((w) => ({ kind: 'weapon', id: w.id, level: w.level, max: weaponMaxLevel(w.id) })),
    ...buffs.map((b) => ({ kind: 'buff', id: b.id, level: b.level, max: BUFF_MAX_LEVEL })),
  ];
  const width = items.length * slot + (weapons.length && buffs.length ? gap : 0);
  let x = VIEW_W / 2 - width / 2 + slot / 2;
  return items.map((it, i) => {
    if (i === weapons.length && i > 0) x += gap;
    const out = { ...it, x };
    x += slot;
    return out;
  });
}

// §17 edge markers: an arrow at the screen edge toward each brazier or pickup whose sprite is
// wholly off screen, with the thing's own sprite at 1× just inside it.
export const MARKER = { margin: 26, size: 7, iconGap: 20, fill: '#ffbf00', edge: '#7f0000' };

// The marker for a sprite of half size (hw, hh) at screen point (x, y), or null while any of it
// is on the w × h screen. The arrow sits where the line from the screen centre to the point
// meets the screen edge inset by `margin`, and points along that line (`angle`, radians).
export function edgeMarker(x, y, hw, hh, w = VIEW_W, h = VIEW_H, margin = MARKER.margin) {
  if (x + hw > 0 && x - hw < w && y + hh > 0 && y - hh < h) return null;
  const cx = w / 2, cy = h / 2;
  const dx = x - cx, dy = y - cy;
  const sx = dx !== 0 ? (cx - margin) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (cy - margin) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s, angle: Math.atan2(dy, dx) };
}

// Markers of every off-screen brazier, then every off-screen pickup still showing, in list order:
// [{ x, y, angle, anim, frame }].
export function edgeMarkers(game, atlas) {
  const o = cameraOffset(game.dragon);
  const out = [];
  const add = (ent) => {
    const r = frameRect(atlas, ent.anim, ent.frame);
    const hw = r ? (r.w * SPRITE_SCALE) / 2 : 0, hh = r ? (r.h * SPRITE_SCALE) / 2 : 0;
    const m = edgeMarker(ent.x + o.x, ent.y + o.y, hw, hh);
    if (m) out.push({ ...m, anim: ent.anim, frame: ent.frame });
  };
  for (const b of game.braziers || []) add(b);
  for (const p of game.pickups || []) if (pickupVisible(p)) add(p);
  return out;
}

function drawMarker(ctx, atlas, m) {
  const { size, iconGap } = MARKER;
  const ux = Math.cos(m.angle), uy = Math.sin(m.angle);
  drawAnim(ctx, atlas, m.anim, m.frame, Math.round(m.x - ux * iconGap), Math.round(m.y - uy * iconGap), { scale: 0.5 });
  ctx.save();
  ctx.translate(Math.round(m.x), Math.round(m.y));
  ctx.rotate(m.angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size, -size);
  ctx.lineTo(-size * 0.4, 0);
  ctx.lineTo(-size, size);
  ctx.closePath();
  ctx.fillStyle = MARKER.fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = MARKER.edge;
  ctx.stroke();
  ctx.restore();
}

export function drawHud(ctx, game, atlas) {
  const tw = game.tower;

  if (game.phase === 'play') for (const m of edgeMarkers(game, atlas)) drawMarker(ctx, atlas, m);

  // Tower HP, top left.
  const hp = HUD.hp;
  const frac = tw.maxHp > 0 ? Math.max(0, Math.min(1, tw.hp / tw.maxHp)) : 0;
  ctx.fillStyle = '#000';
  ctx.fillRect(hp.x - 2, hp.y - 2, hp.w + 4, hp.h + 4);
  ctx.fillStyle = hp.back;
  ctx.fillRect(hp.x, hp.y, hp.w, hp.h);
  ctx.fillStyle = hp.fill;
  ctx.fillRect(hp.x, hp.y, Math.round(hp.w * frac), hp.h);
  shadowText(ctx, `${Math.ceil(tw.hp)}/${tw.maxHp}`, hp.x + hp.w + 10, hp.y);

  // Timer, top centre.
  shadowText(ctx, formatTime(game.t), VIEW_W / 2, HUD.timerY, { align: 'center' });

  // Weapon and buff icons with level pips, below the timer.
  const ic = HUD.icons;
  for (const s of iconSlots(game.weapons, game.buffs)) {
    const icon = s.kind === 'weapon' ? WEAPON_ICONS[s.id] : buffIcon(s.id);
    if (icon) drawAnim(ctx, atlas, icon.anim, icon.frame, s.x, ic.y, { scale: icon.scale });
    const pw = s.max * ic.pip + (s.max - 1) * ic.pipGap;
    let px = Math.round(s.x - pw / 2);
    for (let i = 0; i < s.max; i++) {
      ctx.fillStyle = i < s.level ? '#ffd23f' : 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(px, ic.pipY, ic.pip, ic.pip);
      px += ic.pip + ic.pipGap;
    }
  }

  // Stage banner, top centre under the icons.
  const banner = stageBanner(game);
  if (banner) {
    ctx.save();
    ctx.globalAlpha = banner.alpha;
    shadowText(ctx, banner.text, VIEW_W / 2, HUD.banner.y, { align: 'center', font: BIG_FONT, color: HUD.banner.color });
    ctx.restore();
  }

  // XP bar across the bottom with the level at the left.
  const xp = HUD.xp;
  const need = xpToNext(game.level);
  const xfrac = need > 0 ? Math.max(0, Math.min(1, game.xp / need)) : 0;
  const y = VIEW_H - xp.h;
  ctx.fillStyle = xp.back;
  ctx.fillRect(0, y, VIEW_W, xp.h);
  ctx.fillStyle = xp.fill;
  ctx.fillRect(0, y, Math.round(VIEW_W * xfrac), xp.h);
  shadowText(ctx, `LV ${game.level}`, 8, y - 20);
}
