// Data tables transcribed from docs/demo-spec.md. The spec is the authority:
// change the spec when you change a number here (test/content.test.mjs compares them).

// §4 Loop and timing
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

// §6 Dragon
export const DRAGON_SPEED = 260;
export const DRAGON_PICKUP_RADIUS = 48;
export const DRAGON_START = { x: 0, y: 0 };
export const DEFAULT_AIM = { x: 1, y: 0 }; // facing right until there is any aim or movement
export const DRAGON_BOB_PERIOD = 20; // ticks per full bob cycle (±1 px)

// §7 Tower and tether
export const TOWER_HP = 100;
export const TETHER_LENGTH = 150;
export const TOWER_SPEED = 200;
export const TOWER_RADIUS = 26;
export const TOWER_START = { x: 0, y: 60 };
export const TOWER_QUERY_MARGIN = 60; // §15: enemy vs tower grid query radius is TOWER_RADIUS + this
export const CONTACT_INSET = 1; // enemies stop advancing this far inside contact range
export const REPAIR_HP = 25;
export const DYING_TIME = 2; // s of 'dying' phase before 'over' (§13)

// §8 Enemies. hp Infinity = cannot die. xp 0 = no gem.
export const ENEMY_TYPES = ['knight', 'skeleton', 'slime', 'mage', 'ghostKnight', 'ghost', 'golem'];
export const ENEMIES = {
  knight:      { name: 'Knight',       hp: 3,        speed: 55, r: 12, dps: 10, xp: 1, walk: 'knight.walk',  die: 'knight.die',  alpha: 1 },
  skeleton:    { name: 'Skeleton',     hp: 1,        speed: 90, r: 10, dps: 6,  xp: 1, walk: 'skelly.walk',  die: 'skelly.die',  alpha: 1, summon: 'skelly.summon' },
  slime:       { name: 'Slime',        hp: 2,        speed: 70, r: 12, dps: 8,  xp: 1, walk: 'slime.walk',   die: 'slime.die',   alpha: 1, split: 'slime.split' },
  mage:        { name: 'Mage',         hp: 4,        speed: 40, r: 12, dps: 5,  xp: 5, walk: 'mage.walk',    die: 'mage.die',    alpha: 1, spell: 'mage.spell' },
  ghostKnight: { name: 'Ghost knight', hp: 3,        speed: 55, r: 12, dps: 10, xp: 2, walk: 'ghost.knight', die: 'ghost.burn',  alpha: 1 },
  ghost:       { name: 'Ghost',        hp: 2,        speed: 72, r: 10, dps: 8,  xp: 1, walk: 'ghost.ghost',  die: 'ghost.die',   alpha: 0.6 },
  golem:       { name: 'Mega golem',   hp: Infinity, speed: 30, r: 56, dps: 40, xp: 0, walk: 'golem.walk',   die: 'golem.die',   alpha: 1, immovable: true, procImmune: true, unkillable: true },
};

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
export const GHOST_BURN_TIME = 0.5;
export const GOLEM_KNOCKBACK = 6;
export const GOLEM_HP = 1e9; // finite stand-in for hp ∞ in state; restored after every hit

// §8.1–8.3
export const SEPARATION_MAX_NEIGHBOURS = 6;
export const MAX_ENEMIES = 400;
export const DESPAWN_DIST = 1400;

// §9 Spawning and the timeline. t in seconds; weights switch at row boundaries, rate is interpolated.
export const SPAWN_RING_RADIUS = 560;
export const GOLEM_TIME = 300;
export const TIMELINE = [
  { t: 0,   rate: 1.5, weights: { knight: 100, skeleton: 0,  slime: 0,  mage: 0,  ghostKnight: 0 } },
  { t: 30,  rate: 2.5, weights: { knight: 70,  skeleton: 30, slime: 0,  mage: 0,  ghostKnight: 0 } },
  { t: 60,  rate: 3.5, weights: { knight: 50,  skeleton: 30, slime: 20, mage: 0,  ghostKnight: 0 } },
  { t: 120, rate: 5,   weights: { knight: 40,  skeleton: 25, slime: 25, mage: 10, ghostKnight: 0 } },
  { t: 180, rate: 7,   weights: { knight: 30,  skeleton: 25, slime: 20, mage: 10, ghostKnight: 15 } },
  { t: 240, rate: 10,  weights: { knight: 25,  skeleton: 25, slime: 20, mage: 10, ghostKnight: 20 } },
  { t: 300, rate: 12,  weights: { knight: 25,  skeleton: 25, slime: 20, mage: 10, ghostKnight: 20 }, golem: true },
];

// §10 Weapons. levels[0] is level 1.
export const WEAPON_SLOTS = 4;
export const WEAPON_MAX_LEVEL = 5;
export const WEAPON_IDS = ['fireball', 'laser', 'miniTower', 'ring'];
export const WEAPONS = {
  fireball: {
    name: 'Fireball', aimed: true,
    anim: 'fireball.anim', bigAnim: 'fireball.big', bigFrom: 4, r: 6, bigR: 8,
    hitEffect: 'explosion.small', sound: 'shoot01',
    levels: [
      { cooldown: 0.9, damage: 2, count: 1, spread: 0,  speed: 420, range: 420 },
      { cooldown: 0.8, damage: 2, count: 1, spread: 0,  speed: 420, range: 420 },
      { cooldown: 0.8, damage: 3, count: 2, spread: 15, speed: 420, range: 450 },
      { cooldown: 0.7, damage: 3, count: 2, spread: 15, speed: 460, range: 480 },
      { cooldown: 0.6, damage: 4, count: 3, spread: 20, speed: 460, range: 520 },
    ],
  },
  laser: {
    name: 'Laser', aimed: true,
    anim: 'laser.dir', bigAnim: 'laser.bigdir', bigFrom: 4, r: 6, bigR: 8,
    offset: 6, // with count 2: two parallel lasers, ±offset px perpendicular to the aim
    hitEffect: 'explosion.laser', sound: 'laser01',
    levels: [
      { cooldown: 1.4, damage: 1, count: 1, speed: 700, range: 600, maxHits: 3 },
      { cooldown: 1.3, damage: 1, count: 1, speed: 700, range: 600, maxHits: 4 },
      { cooldown: 1.2, damage: 2, count: 1, speed: 750, range: 650, maxHits: 5 },
      { cooldown: 1.1, damage: 2, count: 2, speed: 750, range: 650, maxHits: 6 },
      { cooldown: 1.0, damage: 3, count: 2, speed: 800, range: 700, maxHits: 8 },
    ],
  },
  miniTower: {
    name: 'Mini tower', aimed: false,
    anim: 'castle', scale: 0.5,
    lobDist: 80, lobTime: 0.5, lobHeight: 30,
    shotSpeed: 380, shotRange: 300, targetRadius: 300, shotR: 6, shotAnim: 'fireball.anim',
    hitEffect: 'explosion.small',
    levels: [
      { cooldown: 6, duration: 8,  fireRate: 0.8, damage: 2, maxActive: 1 },
      { cooldown: 6, duration: 10, fireRate: 0.7, damage: 2, maxActive: 2 },
      { cooldown: 5, duration: 10, fireRate: 0.6, damage: 3, maxActive: 2 },
      { cooldown: 5, duration: 12, fireRate: 0.5, damage: 3, maxActive: 3 },
      { cooldown: 4, duration: 14, fireRate: 0.4, damage: 4, maxActive: 4 },
    ],
  },
  ring: {
    name: 'Ring', aimed: false,
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
  pierce:   { name: 'Pierce chance',    icon: 'icon.laser',   kind: 'chance', levels: [0.2, 0.35, 0.5], laserHits: [1, 2, 3] },
};

// §12 Procs. Which procs each projectile kind can roll (the laser's pierce is its maxHits),
// its hit effect and its explosion sprite.
export const PROJECTILE_KINDS = {
  fireball: { hitEffect: 'explosion.small', explosion: 'explosion.big', explode: true, split: true, pierce: true },
  laser:    { hitEffect: 'explosion.laser', explosion: 'explosion.laserbig', explode: true, split: false, pierce: false },
  miniShot: { hitEffect: 'explosion.small', explosion: 'explosion.big', explode: true, split: true, pierce: true },
};
export const EXPLOSION_SPRITE_PX = { 'explosion.big': 57, 'explosion.laserbig': 64 }; // source frame width
export const EXPLODE_RADIUS = 60;
export const SPLIT_ANGLE = 45; // degrees either side of the parent's direction
export const SPLIT_MAX_GEN = 2; // projectiles with gen >= this cannot split
export const MAX_HITS_MEMORY = 8;

// §14 XP, gems, level-up
export const GEM_SPEED = 500;
export const GEM_COLLECT_RADIUS = 12;
export const MAX_GEMS = 600;
export const xpToNext = (level) => 5 + 3 * level;
export const CARD_COUNT = 3;
export const CARD_WEIGHTS = { newWeapon: 3, upgradeWeapon: 4, newBuff: 3, upgradeBuff: 3, repair: 1 };

// §15 Grid
export const GRID_CELL = 64;

// §3.3 Every atlas anim the game uses (the procedural `gem` is not in the atlas).
export const ATLAS_NAMES = [
  'dragon.dir',
  'knight.walk', 'knight.die',
  'skelly.walk', 'skelly.die', 'skelly.summon',
  'slime.walk', 'slime.die', 'slime.split',
  'mage.walk', 'mage.die', 'mage.spell',
  'ghost.knight', 'ghost.burn', 'ghost.ghost', 'ghost.die',
  'golem.walk', 'golem.die',
  'fireball.anim', 'fireball.big',
  'laser.dir', 'laser.bigdir',
  'castle', 'castle.destroy',
  'explosion.small', 'explosion.big', 'explosion.laser', 'explosion.laserbig',
  'burn',
  'icon.laser', 'icon.explode', 'icon.split', 'icon.ring', 'icon.speed', 'icon.big', 'icon.multi', 'icon.nuke',
];

// §3.3 Sounds copied from the pack root.
export const SOUND_NAMES = [
  'shoot01', 'laser01', 'explosion01', 'explosion02', 'death01', 'death02', 'pickup', 'powerup',
  'hit_golem', 'megaslime_hit', 'slime_poke', 'destroy_castle_sound', 'start_game', 'ohno', 'win_level_2',
];
