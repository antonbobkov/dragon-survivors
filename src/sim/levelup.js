// Level-up cards (§14.1): the weighted pool, rolling offers, applying a pick, and the
// plain-data card description the level-up screen draws.
import {
  WEAPONS, WEAPON_IDS, WEAPON_SLOTS, WEAPON_MAX_LEVEL,
  BUFFS, BUFF_IDS, BUFF_SLOTS, BUFF_MAX_LEVEL,
  CARD_COUNT, CARD_WEIGHTS, REPAIR_HP,
} from './content.js';
import { createWeapon } from './weapons.js';

// Card: { kind: 'weapon' | 'buff' | 'repair', id, level } with `level` the level after the pick.
// Pool order is fixed: weapons in WEAPON_IDS order, buffs in BUFF_IDS order, then Repair.
export function cardPool(game) {
  const pool = [];
  for (const id of WEAPON_IDS) {
    const w = game.weapons.find((x) => x.id === id);
    if (w) { if (w.level < WEAPON_MAX_LEVEL) pool.push({ card: { kind: 'weapon', id, level: w.level + 1 }, weight: CARD_WEIGHTS.upgradeWeapon }); }
    else if (game.weapons.length < WEAPON_SLOTS) pool.push({ card: { kind: 'weapon', id, level: 1 }, weight: CARD_WEIGHTS.newWeapon });
  }
  for (const id of BUFF_IDS) {
    const b = game.buffs.find((x) => x.id === id);
    if (b) { if (b.level < BUFF_MAX_LEVEL) pool.push({ card: { kind: 'buff', id, level: b.level + 1 }, weight: CARD_WEIGHTS.upgradeBuff }); }
    else if (game.buffs.length < BUFF_SLOTS) pool.push({ card: { kind: 'buff', id, level: 1 }, weight: CARD_WEIGHTS.newBuff });
  }
  pool.push({ card: { kind: 'repair', id: 'repair', level: 1 }, weight: CARD_WEIGHTS.repair });
  return pool;
}

// min(CARD_COUNT, pool size) distinct cards, drawn by weight without replacement:
// one game.rng() per card, walked over the cumulative weights in pool order.
export function rollOffers(game) {
  const pool = cardPool(game);
  const out = [];
  const n = Math.min(CARD_COUNT, pool.length);
  for (let k = 0; k < n; k++) {
    let total = 0;
    for (const p of pool) total += p.weight;
    let r = game.rng() * total;
    let i = 0;
    while (i < pool.length - 1 && r >= pool[i].weight) { r -= pool[i].weight; i++; }
    out.push(pool[i].card);
    pool.splice(i, 1);
  }
  return out;
}

// A new weapon fires on the next weapons step; an upgrade keeps its timer and state.
export function applyCard(game, card) {
  if (card.kind === 'weapon') {
    const w = game.weapons.find((x) => x.id === card.id);
    if (w) w.level = card.level;
    else game.weapons.push(createWeapon(card.id, card.level));
  } else if (card.kind === 'buff') {
    const b = game.buffs.find((x) => x.id === card.id);
    if (b) b.level = card.level;
    else game.buffs.push({ id: card.id, level: card.level });
  } else {
    game.tower.hp = Math.min(game.tower.maxHp, game.tower.hp + REPAIR_HP);
  }
}

// ---- card text (pure data for the level-up screen) ----------------------------------

export const CARD_NAMES = {
  fireball: 'Fireball', laser: 'Laser', miniTower: 'Mini Tower', ring: 'Ring',
  damage: 'Damage', cooldown: 'Cooldown', area: 'Area', speed: 'Projectile Speed',
  explode: 'Explode', split: 'Split', pierce: 'Pierce', repair: 'Repair',
};

// §17 icons; the repair card shows the castle at 1×.
export const CARD_ICONS = {
  fireball: { anim: 'fireball.anim', frame: 0, scale: 1 },
  laser: { anim: 'laser.dir', frame: 12, scale: 1 },
  miniTower: { anim: 'castle', frame: 0, scale: 0.5 },
  ring: { anim: 'icon.ring', frame: 0, scale: 1 },
  repair: { anim: 'castle', frame: 0, scale: 0.5 },
};

const NEW_WEAPON_TEXT = {
  fireball: 'Aimed fireballs',
  laser: 'Fast aimed laser, pierces enemies',
  miniTower: 'Lobs turrets that shoot enemies',
  ring: 'Fireballs orbit the dragon',
};

// Short labels of weapon stats, in the order an upgrade lists its changes (first 3 shown).
const STAT_LABELS = [
  ['damage', 'dmg'], ['count', 'count'], ['maxHits', 'hits'], ['maxActive', 'max'],
  ['duration', 'life'], ['fireRate', 'rate'], ['cooldown', 'cd'], ['orbit', 'orbit'],
  ['spin', 'spin'], ['rehit', 'rehit'], ['spread', 'spread'], ['speed', 'speed'], ['range', 'range'],
];

const pct = (v) => `${Math.round(Math.abs(v) * 100)}%`;

function buffText(id, level) {
  const v = BUFFS[id].levels[level - 1];
  switch (id) {
    case 'damage': return `+${pct(v)} damage`;
    case 'cooldown': return `-${pct(v)} cooldowns`;
    case 'area': return `+${pct(v)} area and orbit`;
    case 'speed': return `+${pct(v)} shot speed and range`;
    case 'explode': return `${pct(v)} chance to explode`;
    case 'split': return `${pct(v)} chance to split in two`;
    case 'pierce': return `${pct(v)} pierce, laser +${BUFFS.pierce.laserHits[level - 1]} hit${level > 1 ? "s" : ""}`;
    default: return '';
  }
}

function upgradeText(id, level) {
  const a = WEAPONS[id].levels[level - 2], b = WEAPONS[id].levels[level - 1];
  const parts = [];
  for (const [key, label] of STAT_LABELS) {
    if (key in b && a[key] !== b[key]) parts.push(`${label} ${a[key]}→${b[key]}`);
  }
  return parts.slice(0, 3).join(', ');
}

// { name, icon: { anim, frame, scale }, tag: 'NEW' | 'L<n>', text }
export function cardInfo(card) {
  const name = CARD_NAMES[card.id];
  if (card.kind === 'repair') return { name, icon: CARD_ICONS.repair, tag: '', text: `Tower +${REPAIR_HP} HP` };
  const tag = card.level === 1 ? 'NEW' : `L${card.level}`;
  if (card.kind === 'weapon') {
    return { name, icon: CARD_ICONS[card.id], tag, text: card.level === 1 ? NEW_WEAPON_TEXT[card.id] : upgradeText(card.id, card.level) };
  }
  return { name, icon: { anim: BUFFS[card.id].icon, frame: 0, scale: 1 }, tag, text: buffText(card.id, card.level) };
}
