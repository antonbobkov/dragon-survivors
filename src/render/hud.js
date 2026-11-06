// HUD (§17): timer, tower HP bar, XP bar with level, weapon and buff icons with level pips.
// Reads the game and never writes it.
import { BUFFS, WEAPON_MAX_LEVEL, BUFF_MAX_LEVEL, xpToNext } from '../sim/content.js';
import { VIEW_W, VIEW_H } from '../viewport.js';
import { drawAnim } from './draw.js';

export const FONT = '16px monospace';
export const BIG_FONT = '32px monospace';
export const HUD = {
  hp: { x: 12, y: 12, w: 200, h: 16, back: '#3a0d0d', fill: '#e03a3a' },
  timerY: 12,
  icons: { y: 50, slot: 34, pipY: 72, pip: 4, pipGap: 2, gap: 16 },
  xp: { h: 14, back: '#10202e', fill: '#3fa9ff' },
};

// §17 weapon icons: fireball first frame, laser facing right, mini tower castle at 1×, ring icon.
export const WEAPON_ICONS = {
  fireball: { anim: 'fireball.anim', frame: 0, scale: 1 },
  laser: { anim: 'laser.dir', frame: 12, scale: 1 },
  miniTower: { anim: 'castle', frame: 0, scale: 0.5 },
  ring: { anim: 'icon.ring', frame: 0, scale: 1 },
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

// Icon slots for weapons then buffs, centred on the screen: [{ x, kind, id, level, max }].
export function iconSlots(weapons, buffs) {
  const { slot, gap } = HUD.icons;
  const items = [
    ...weapons.map((w) => ({ kind: 'weapon', id: w.id, level: w.level, max: WEAPON_MAX_LEVEL })),
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

export function drawHud(ctx, game, atlas) {
  const tw = game.tower;

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
