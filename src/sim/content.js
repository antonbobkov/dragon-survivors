// Data tables transcribed from docs/demo-spec.md. The spec is the authority:
// change the spec when you change a number here (test/content.test.mjs compares them).

// §4 Loop and timing
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

// §6 Dragon
export const DRAGON_SPEED = 87;
export const DRAGON_PICKUP_RADIUS = 48;
export const FACING_DEADZONE = 0.3; // |moveX| / |aimX| below this does not turn the dragon (§6.3)
export const DRAGON_RADIUS = 12; // collision circle for mage orbs (§8.5); enemies never collide with the dragon
export const DRAGON_START = { x: 0, y: 0 };
export const DEFAULT_AIM = { x: 1, y: 0 }; // firing right until there is any aim or movement
export const DRAGON_ANIM = 'dragon.walk'; // the sprite faces right; flipped to face left (§6.3)

// §7 Tower and tether
export const TOWER_HP = 100;
export const TETHER_LENGTH = 105;
export const TOWER_FOLLOW_SPEED = 60;
export const TOWER_REST_DIST = 50;
export const TOWER_RADIUS = 26;
export const TOWER_START = { x: 0, y: TOWER_REST_DIST }; // below the dragon, at rest
export const TOWER_QUERY_MARGIN = 60; // §15: enemy vs tower grid query radius is TOWER_RADIUS + this
export const CONTACT_INSET = 1; // enemies stop advancing this far inside contact range
export const REPAIR_HP = 25;
export const DYING_TIME = 2; // s of 'dying' phase before 'over' (§13)

// §8 Enemies. hp Infinity = cannot die. xp 0 = no gem.
export const ENEMY_TYPES = ['knight', 'skeleton', 'slime', 'mage', 'ghostKnight', 'ghost', 'golem'];
export const ENEMIES = {
  knight:      { name: 'Knight',       hp: 3,        speed: 27.5, r: 12, dps: 2,  xp: 1, walk: 'knight.walk',  die: 'knight.die',  alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0.25 } },
  skeleton:    { name: 'Skeleton',     hp: 1,        speed: 45,   r: 10, dps: 6,  xp: 1, walk: 'skelly.walk',  die: 'skelly.die',  alpha: 1, resist: { fire: 0,    arcane: 0.25, physical: -0.5 }, summon: 'skelly.summon' },
  slime:       { name: 'Slime',        hp: 2,        speed: 35,   r: 12, dps: 8,  xp: 1, walk: 'slime.walk',   die: 'slime.die',   alpha: 1, resist: { fire: -0.5, arcane: 0,    physical: 0.5 }, split: 'slime.split' },
  mage:        { name: 'Mage',         hp: 4,        speed: 20,   r: 12, dps: 5,  xp: 5, walk: 'mage.walk',    die: 'mage.die',    alpha: 1, resist: { fire: 0,    arcane: 0.5,  physical: -0.25 }, spell: 'mage.spell' },
  ghostKnight: { name: 'Ghost knight', hp: 10,       speed: 27.5, r: 12, dps: 10, xp: 2, walk: 'ghost.knight', die: 'ghost.burn',  alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0.25 } },
  ghost:       { name: 'Ghost',        hp: 2,        speed: 36,   r: 10, dps: 8,  xp: 1, walk: 'ghost.ghost',  die: 'ghost.die',   alpha: 0.6, resist: { fire: 0.25, arcane: -0.5, physical: 0.75 } },
  golem:       { name: 'Mega golem',   hp: Infinity, speed: 75,   r: 56, dps: 40, xp: 0, walk: 'golem.walk',   die: 'golem.die',   alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0 }, immovable: true, procImmune: true, unkillable: true },
};

// §8.6 Tiers: one sprite in four tiers. Multipliers on the type's HP (rounded up), contact DPS,
// XP and speed; `r` multiplies the radius; `scale` is the screen scale (the standard is 2×).
// Resistances never change with the tier. The golem is always tier 1.
export const TIER_IDS = [1, 2, 3, 4];
export const TIERS = {
  1: { name: 'Plain',  scale: 2, hp: 1,   dps: 1,    xp: 1, speed: 1,   r: 1 },
  2: { name: 'Bronze', scale: 2, hp: 2.5, dps: 1.25, xp: 2, speed: 1,   r: 1 },
  3: { name: 'Silver', scale: 3, hp: 6,   dps: 1.5,  xp: 4, speed: 0.9, r: 1.5 },
  4: { name: 'Gold',   scale: 3, hp: 15,  dps: 2,    xp: 8, speed: 0.8, r: 1.5 },
};
// The tier row of an enemy or effect; anything without a tier is tier 1.
export const tierOf = (ent) => TIERS[ent.tier] || TIERS[1];
// HP of a type (or a slime child) at a tier: rounded up, which kills on the same hits as the
// exact product since every hit deals whole damage (§12.1).
export const tierHp = (hp, tier) => Math.ceil(hp * TIERS[tier].hp - 1e-9);
// Atlas name of an anim at a tier: tier 1 is the plain anim, others `<anim>@t<tier>` (§3.3).
export const tierAnim = (anim, tier) => (tier > 1 ? `${anim}@t${tier}` : anim);
// Every anim with tier variants: all anims of every enemy type except the golem's.
export const TIERED_ANIMS = ENEMY_TYPES.filter((t) => !ENEMIES[t].unkillable)
  .flatMap((t) => { const d = ENEMIES[t]; return [d.walk, d.die, d.summon, d.split, d.spell].filter(Boolean); });

// §8 specials (implemented by the roster task)
export const SLIME_CHILDREN = 2;
export const SLIME_CHILD_HP = 1;
export const SLIME_CHILD_R = 8;
export const SLIME_CHILD_OFFSET = 20;
export const MAGE_CAST_INTERVAL = 8;
export const MAGE_CAST_TIME = 1;
export const MAGE_SUMMON_COUNT = 4;
export const MAGE_SUMMON_RING = 40;
export const MAGE_NO_CAST_DIST = 80;
// §8.5 mage orbs: fired at the dragon, an orb that hits it damages the tower
export const MAGE_ORB_RANGE = 320; // px from the mage to the dragon within which it fires
export const MAGE_ORB_INTERVAL = 3; // s between shots; the first at a random offset after spawn
export const MAGE_ORB_SPEED = 110;
export const MAGE_ORB_R = 6;
export const MAGE_ORB_TRAVEL = 400; // px an orb flies before it expires (its `range`)
export const MAGE_ORB_DAMAGE = 5; // tower HP per hit
export const MAGE_ORB_ANIM = 'orb.green';
export const MAGE_ORB_SOUND = 'slime_poke';
export const GHOST_BURN_TIME = 0.5;
export const GOLEM_KNOCKBACK = 1;
export const GOLEM_HP = 1e9; // finite stand-in for hp ∞ in state; restored after every hit

// §8.1–8.3
export const SEPARATION_MAX_NEIGHBOURS = 6;
export const MAX_ENEMIES = 400;
export const DESPAWN_DIST = 1400;

// §9 Spawning and the timeline. t in seconds; weights switch at row boundaries, rate is interpolated.
// `tiers` (optional) are the tier weights (§8.6); a row without them spawns tier 1 and draws no
// tier. The 2:30 and 3:30 rows only start tiers: their rates are the interpolated ones.
export const SPAWN_RING_RADIUS = 560;
export const GOLEM_TIME = 300;
export const TIMELINE = [
  { t: 0,   rate: 0.3,  weights: { knight: 100, skeleton: 0,  slime: 0,  mage: 0,  ghostKnight: 0 } },
  { t: 30,  rate: 0.5,  weights: { knight: 70,  skeleton: 30, slime: 0,  mage: 0,  ghostKnight: 0 } },
  { t: 60,  rate: 0.6,  weights: { knight: 50,  skeleton: 30, slime: 20, mage: 0,  ghostKnight: 0 } },
  { t: 120, rate: 2.5,  weights: { knight: 40,  skeleton: 25, slime: 25, mage: 10, ghostKnight: 0 } },
  { t: 150, rate: 6.25, weights: { knight: 40,  skeleton: 25, slime: 25, mage: 10, ghostKnight: 0 },  tiers: { 1: 90, 2: 10, 3: 0,  4: 0 } },
  { t: 180, rate: 10,   weights: { knight: 30,  skeleton: 25, slime: 20, mage: 10, ghostKnight: 15 }, tiers: { 1: 85, 2: 15, 3: 0,  4: 0 } },
  { t: 210, rate: 13,   weights: { knight: 30,  skeleton: 25, slime: 20, mage: 10, ghostKnight: 15 }, tiers: { 1: 80, 2: 15, 3: 5,  4: 0 } },
  { t: 240, rate: 16,   weights: { knight: 25,  skeleton: 25, slime: 20, mage: 10, ghostKnight: 20 }, tiers: { 1: 75, 2: 17, 3: 8,  4: 0 } },
  { t: 300, rate: 18,   weights: { knight: 25,  skeleton: 25, slime: 20, mage: 10, ghostKnight: 20 }, tiers: { 1: 65, 2: 20, 3: 10, 4: 5 }, golem: true },
];

// §12.1 Damage types. Every hit on an enemy has one; resistances r in [RESIST_MIN, 1] per enemy
// type (ENEMIES[type].resist): damage taken = ceil(damage × power × (1 − r)), r = 1 immune.
export const DAMAGE_TYPES = ['fire', 'arcane', 'physical'];
export const DAMAGE_TYPE_NAMES = { fire: 'Fire', arcane: 'Arcane', physical: 'Physical' };
export const RESIST_MIN = -0.5; // the floor of a resistance, after the armoury's shred

// §10 Weapons. levels[0] is level 1. `type` is the damage type of every hit (§12.1).
export const WEAPON_SLOTS = 4;
export const WEAPON_MAX_LEVEL = 5;
export const WEAPON_IDS = ['fireball', 'laser', 'miniTower', 'ring'];
export const WEAPONS = {
  fireball: {
    name: 'Fireball', aimed: true, type: 'fire',
    anim: 'fireball.anim', bigAnim: 'fireball.big', bigFrom: 4, r: 6, bigR: 8,
    sound: 'shoot01',
    levels: [
      { cooldown: 0.9, damage: 2, count: 1, spread: 0,  speed: 420, range: 420 },
      { cooldown: 0.8, damage: 2, count: 1, spread: 0,  speed: 420, range: 420 },
      { cooldown: 0.8, damage: 3, count: 2, spread: 15, speed: 420, range: 450 },
      { cooldown: 0.7, damage: 3, count: 2, spread: 15, speed: 460, range: 480 },
      { cooldown: 0.6, damage: 4, count: 3, spread: 20, speed: 460, range: 520 },
    ],
  },
  laser: {
    name: 'Laser', aimed: true, type: 'arcane',
    anim: 'laser.dir', bigAnim: 'laser.bigdir', bigFrom: 4, r: 6, bigR: 8,
    offset: 6, // with count 2: two parallel lasers, ±offset px perpendicular to the aim
    sound: 'laser01',
    levels: [
      { cooldown: 1.4, damage: 1, count: 1, speed: 700, range: 600 },
      { cooldown: 1.3, damage: 1, count: 1, speed: 700, range: 600 },
      { cooldown: 1.2, damage: 2, count: 1, speed: 750, range: 650 },
      { cooldown: 1.1, damage: 2, count: 2, speed: 750, range: 650 },
      { cooldown: 1.0, damage: 3, count: 2, speed: 800, range: 700 },
    ],
  },
  miniTower: {
    name: 'Mini tower', aimed: false, type: 'fire', // its shots are fireballs
    anim: 'castle', scale: 0.5,
    lobDist: 80, lobTime: 0.5, lobHeight: 30,
    targetRadius: 300, // each shot is a copy of the dragon's fireball (§10.3)
    levels: [
      { cooldown: 6, duration: 8,  fireRate: 0.8, maxActive: 1 },
      { cooldown: 6, duration: 10, fireRate: 0.7, maxActive: 2 },
      { cooldown: 5, duration: 10, fireRate: 0.6, maxActive: 2 },
      { cooldown: 5, duration: 12, fireRate: 0.5, maxActive: 3 },
      { cooldown: 4, duration: 14, fireRate: 0.4, maxActive: 4 },
    ],
  },
  ring: {
    name: 'Ring', aimed: false, type: 'fire',
    anim: 'fireball.anim', r: 6,
    levels: [
      { count: 2, orbit: 60, spin: 180, damage: 2, rehit: 0.5 },
      { count: 3, orbit: 60, spin: 180, damage: 2, rehit: 0.5 },
      { count: 3, orbit: 70, spin: 220, damage: 3, rehit: 0.4 },
      { count: 4, orbit: 70, spin: 220, damage: 3, rehit: 0.4 },
      { count: 5, orbit: 80, spin: 260, damage: 4, rehit: 0.3 },
    ],
  },
};

// §11 Buffs. levels[0] is level 1; stat values are fractions (+25% = 0.25), chances are probabilities.
export const BUFF_SLOTS = 4;
export const BUFF_MAX_LEVEL = 3;
export const BUFF_IDS = ['damage', 'cooldown', 'area', 'speed', 'explode', 'split', 'pierce'];
export const BUFFS = {
  damage:   { name: 'Damage',           icon: 'icon.big',     kind: 'stat',   levels: [0.25, 0.5, 0.8] },
  cooldown: { name: 'Cooldown',         icon: 'icon.multi',   kind: 'stat',   levels: [-0.1, -0.2, -0.3] },
  area:     { name: 'Area',             icon: 'icon.nuke',    kind: 'stat',   levels: [0.2, 0.4, 0.6] },
  speed:    { name: 'Projectile speed', icon: 'icon.speed',   kind: 'stat',   levels: [0.2, 0.4, 0.6] },
  explode:  { name: 'Explode chance',   icon: 'icon.explode', kind: 'chance', levels: [0.2, 0.35, 0.5] },
  split:    { name: 'Split chance',     icon: 'icon.split',   kind: 'chance', levels: [0.2, 0.35, 0.5] },
  pierce:   { name: 'Pierce chance',    icon: 'icon.laser',   kind: 'chance', levels: [0.2, 0.35, 0.5] },
};

// §12 Procs. Which procs each projectile kind can roll; mini-tower shots are fireballs.
// `type` is the damage type a projectile of that kind carries unless it is given one (§12.1).
// No hit spawns an effect: explosions come only from the Explode proc.
export const PROJECTILE_KINDS = {
  fireball: { type: 'fire',   explode: true, split: true, pierce: true },
  laser:    { type: 'arcane', explode: false, split: false, pierce: true },
};
export const EXPLOSION_ANIM = 'explosion.big';
export const EXPLOSION_SPRITE_PX = 57; // source frame width of EXPLOSION_ANIM
export const EXPLODE_RADIUS = 60;
export const SPLIT_ANGLE = 45; // degrees either side of the parent's direction
export const SPLIT_MAX_GEN = 2; // projectiles with gen >= this cannot split
export const MAX_HITS_MEMORY = 8;

// §14 XP, gems, level-up
export const GEM_SPEED = 500;
export const GEM_COLLECT_RADIUS = 12;
export const MAX_GEMS = 600;
export const xpToNext = (level) => 3 + 3 * level;
// A full build is offered Repair only while tower HP is below this fraction of max HP.
export const REPAIR_OFFER_BELOW = 0.5;
export const CARD_COUNT = 3;
export const CARD_WEIGHTS = { newWeapon: 3, upgradeWeapon: 4, newBuff: 3, upgradeBuff: 3, repair: 1 };

// §14.2 Braziers and pickups. Distances in px, times in s.
export const VIEW_HALF_W = 480; // §5: half the 960×600 view around the dragon (the camera centre)
export const VIEW_HALF_H = 300;
export const BRAZIER_INTERVAL = 25; // one spawn attempt this often
export const BRAZIER_MIN_DIST = 250; // from the tower
export const BRAZIER_MAX_DIST = 450;
export const BRAZIER_SPACING = 120; // never closer than this to another brazier
export const MAX_BRAZIERS = 4;
export const BRAZIER_TRIES = 12; // candidate points per spawn
export const BRAZIER_RADIUS = 12; // hit circle
export const BRAZIER_SPRITE = { w: 12, h: 16 }; // source px; drawn at 2×
export const BRAZIER_ANIM = 'brazier.burn';
export const BRAZIER_BREAK_ANIM = 'brazier.break';
export const BRAZIER_SOUND = 'dropping';
export const PICKUP_LIFE = 30;
export const PICKUP_BLINK = 5; // blinks for the last seconds of its life (drawn only)
export const PICKUP_KINDS = ['heart', 'magnet', 'bomb'];
export const PICKUPS = {
  heart:  { name: 'Heart',  weight: 60, anim: 'pickup.heart',  sound: 'powerup02' },
  magnet: { name: 'Magnet', weight: 25, anim: 'pickup.magnet', sound: 'powerup03' },
  bomb:   { name: 'Bomb',   weight: 15, anim: 'pickup.bomb',   sound: 'explosion02' },
};
export const HEART_HP = 20;
export const BOMB_DAMAGE = 60;
export const BOMB_TYPE = 'fire';
export const BOMB_EFFECT_SCALE = 2; // explosion.big at 2 × the standard 2×

// §15 Grid
export const GRID_CELL = 64;

// §3.3 Every atlas anim the game uses (the procedural `gem` is not in the atlas).
export const ATLAS_NAMES = [
  'dragon.walk',
  'knight.walk', 'knight.die',
  'skelly.walk', 'skelly.die', 'skelly.summon',
  'slime.walk', 'slime.die', 'slime.split',
  'mage.walk', 'mage.die', 'mage.spell',
  'ghost.knight', 'ghost.burn', 'ghost.ghost', 'ghost.die',
  'golem.walk', 'golem.die',
  'fireball.anim', 'fireball.big', 'orb.green',
  'laser.dir', 'laser.bigdir',
  'castle', 'castle.destroy', 'royal.prince', 'royal.princess',
  'explosion.small', 'explosion.big', 'explosion.laser', 'explosion.laserbig',
  'burn',
  'icon.laser', 'icon.explode', 'icon.split', 'icon.ring', 'icon.speed', 'icon.big', 'icon.multi', 'icon.nuke',
  'brazier.burn', 'brazier.break', 'pickup.heart', 'pickup.magnet', 'pickup.bomb',
];
// §8.6 the generated tier variants of every tiered enemy anim (tiers 2–4).
ATLAS_NAMES.push(...TIERED_ANIMS.flatMap((a) => TIER_IDS.filter((t) => t > 1).map((t) => tierAnim(a, t))));

// §3.3 Sounds copied from the pack root.
export const SOUND_NAMES = [
  'shoot01', 'laser01', 'explosion01', 'explosion02', 'death01', 'death02', 'pickup', 'powerup',
  'hit_golem', 'megaslime_hit', 'slime_poke', 'destroy_castle_sound', 'start_game', 'ohno', 'win_level_2',
  'dropping', 'powerup02', 'powerup03',
];
