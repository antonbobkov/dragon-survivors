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

// §8 Enemies. hp Infinity = cannot die. xp 0 = no gem. `mass` divides knockback (§8.7); the
// golem has none: it keeps its own knockback rule (GOLEM_KNOCKBACK). `scale` (default 2, the
// standard) is the screen scale of a type drawn bigger (§5, §8.6). `stampede` marks the horse:
// it comes only in stampedes and runs straight (§8.8), never from the spawn budget.
export const ENEMY_TYPES = ['knight', 'skeleton', 'slime', 'mage', 'ghostKnight', 'ghost', 'horse', 'mountedKnight', 'golem'];
export const ENEMIES = {
  knight:      { name: 'Knight',       hp: 3,        speed: 27.5, r: 12, dps: 2,  xp: 1, mass: 1,    walk: 'knight.walk',  die: 'knight.die',  alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0.25 } },
  skeleton:    { name: 'Skeleton',     hp: 1,        speed: 45,   r: 10, dps: 6,  xp: 1, mass: 0.7,  walk: 'skelly.walk',  die: 'skelly.die',  alpha: 1, resist: { fire: 0,    arcane: 0.25, physical: -0.5 }, summon: 'skelly.summon' },
  slime:       { name: 'Slime',        hp: 2,        speed: 35,   r: 12, dps: 8,  xp: 1, mass: 0.8,  walk: 'slime.walk',   die: 'slime.die',   alpha: 1, resist: { fire: -0.5, arcane: 0,    physical: 0.5 }, split: 'slime.split' },
  mage:        { name: 'Mage',         hp: 4,        speed: 20,   r: 12, dps: 5,  xp: 5, mass: 1,    walk: 'mage.walk',    die: 'mage.die',    alpha: 1, resist: { fire: 0,    arcane: 0.5,  physical: -0.25 }, spell: 'mage.spell' },
  ghostKnight: { name: 'Ghost knight', hp: 10,       speed: 27.5, r: 12, dps: 10, xp: 2, mass: 1,    walk: 'ghost.knight', die: 'ghost.burn',  alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0.25 } },
  ghost:       { name: 'Ghost',        hp: 2,        speed: 36,   r: 10, dps: 8,  xp: 1, mass: 0.6,  walk: 'ghost.ghost',  die: 'ghost.die',   alpha: 0.6, resist: { fire: 0.25, arcane: -0.5, physical: 0.75 } },
  horse:       { name: 'Horse',        hp: 2,        speed: 120,  r: 10, dps: 4,  xp: 1, mass: 0.5,  walk: 'horse.walk',   die: 'horse.die',   alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0 }, stampede: true },
  mountedKnight: { name: 'Mounted knight', hp: 30,   speed: 60,   r: 16, dps: 15, xp: 8, mass: 2,    walk: 'mounted.walk', die: 'mounted.die', alpha: 1, resist: { fire: 0.25, arcane: -0.25, physical: 0.5 }, scale: 3 },
  golem:       { name: 'Mega golem',   hp: Infinity, speed: 75,   r: 56, dps: 40, xp: 0, mass: null, walk: 'golem.walk',   die: 'golem.die',   alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0 }, immovable: true, procImmune: true, unkillable: true },
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
// §5, §8.6 the screen scale of an enemy or death-effect sprite: its type's scale (2 unless the
// type is drawn bigger) times the tier's ratio to the standard, rounded down to a whole number.
// A 3× type is 3× at tiers 1–2 and 4× at tiers 3–4; every other type 2× and 3×.
export const ANIM_SCALE = Object.fromEntries(ENEMY_TYPES.filter((t) => ENEMIES[t].scale)
  .flatMap((t) => { const d = ENEMIES[t]; return [d.walk, d.die, d.summon, d.split, d.spell].filter(Boolean).map((a) => [a, d.scale]); }));
export const screenScale = (anim, tier) =>
  Math.floor((ANIM_SCALE[anim] || TIERS[1].scale) * (TIERS[tier] || TIERS[1]).scale / TIERS[1].scale + 1e-9);

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
// tier. `stage` (optional) names the stage that starts at the row (§9.1; the banner, §17).
// `stampede` (optional) is the row's horse stampedes (§8.8): one every `every` s, each of
// `min`–`max` horses; a row without one has none. The 2:30 and 3:30 rows change the tiers (the
// 2:30 row also brings mounted knights); their rates are the interpolated ones.
export const SPAWN_RING_RADIUS = 560;
export const GOLEM_TIME = 300;
export const TIMELINE = [
  { t: 0,   rate: 0.3,  stage: 'Muster', weights: { knight: 100, skeleton: 0,  slime: 0,  mage: 0,  ghostKnight: 0,  mountedKnight: 0 } },
  { t: 30,  rate: 0.5,  weights: { knight: 70, skeleton: 30, slime: 0,  mage: 0,  ghostKnight: 0,  mountedKnight: 0 } },
  { t: 60,  rate: 0.6,  stage: 'Ooze',   weights: { knight: 33, skeleton: 30, slime: 37, mage: 0,  ghostKnight: 0,  mountedKnight: 0 }, stampede: { every: 20, min: 5, max: 6 } },
  { t: 120, rate: 2.5,  stage: 'Arcana', weights: { knight: 30, skeleton: 30, slime: 20, mage: 20, ghostKnight: 0,  mountedKnight: 0 }, stampede: { every: 30, min: 5, max: 7 } },
  { t: 150, rate: 6.25, weights: { knight: 28, skeleton: 30, slime: 20, mage: 20, ghostKnight: 0,  mountedKnight: 2 }, tiers: { 1: 90, 2: 10, 3: 0,  4: 0 }, stampede: { every: 30, min: 5, max: 7 } },
  { t: 180, rate: 10,   stage: 'Haunt',  weights: { knight: 22, skeleton: 23, slime: 17, mage: 10, ghostKnight: 25, mountedKnight: 3 }, tiers: { 1: 70, 2: 30, 3: 0,  4: 0 }, stampede: { every: 30, min: 6, max: 8 } },
  { t: 210, rate: 13,   weights: { knight: 22, skeleton: 23, slime: 17, mage: 10, ghostKnight: 25, mountedKnight: 3 }, tiers: { 1: 65, 2: 30, 3: 5,  4: 0 }, stampede: { every: 30, min: 6, max: 8 } },
  { t: 240, rate: 16,   stage: 'Siege',  weights: { knight: 22, skeleton: 22, slime: 18, mage: 10, ghostKnight: 23, mountedKnight: 5 }, tiers: { 1: 60, 2: 25, 3: 15, 4: 0 }, stampede: { every: 15, min: 8, max: 12 } },
  { t: 300, rate: 18,   weights: { knight: 22, skeleton: 22, slime: 18, mage: 10, ghostKnight: 23, mountedKnight: 5 }, tiers: { 1: 55, 2: 25, 3: 15, 4: 5 }, stampede: { every: 15, min: 8, max: 12 }, golem: true },
];
// §8.8 stampedes: horses in a line STAMPEDE_SPACING px apart, perpendicular to their run.
export const STAMPEDE_TYPE = 'horse';
export const STAMPEDE_SPACING = 24;
// §17 the stage banner: shown for BANNER_TIME s from a stage's start, fading over the last BANNER_FADE s.
export const BANNER_TIME = 2;
export const BANNER_FADE = 0.5;

// §12.1 Damage types. Every hit on an enemy has one; resistances r in [RESIST_MIN, 1] per enemy
// type (ENEMIES[type].resist): damage taken = ceil(damage × power × (1 − r)), r = 1 immune.
export const DAMAGE_TYPES = ['fire', 'arcane', 'physical'];
export const DAMAGE_TYPE_NAMES = { fire: 'Fire', arcane: 'Arcane', physical: 'Physical' };
export const RESIST_MIN = -0.5; // the floor of a resistance, after the armoury's shred

// §10 Weapons. levels[0] is level 1. `type` is the damage type of every hit (§12.1), `knock`
// the px a hit pushes an enemy of mass 1 (§8.7).
export const WEAPON_SLOTS = 4;
export const WEAPON_MAX_LEVEL = 5;
export const WEAPON_IDS = ['fireball', 'laser', 'miniTower', 'ring'];
export const WEAPONS = {
  fireball: {
    name: 'Fireball', aimed: true, type: 'fire', knock: 4,
    spreadStep: 10, // degrees between Amount's extra shots when the level fires one (§11)
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
    name: 'Laser', aimed: true, type: 'arcane', knock: 2,
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
    name: 'Mini tower', aimed: false, type: 'fire', knock: 4, // its shots are fireballs
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
    name: 'Ring', aimed: false, type: 'fire', knock: 8,
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

// §11 Buffs. levels[0] is level 1. Stat values are fractions (+20% = 0.2), Amount's are extra
// projectiles, chances are probabilities. A chance buff's `affinity` maps a damage type to the
// buff level from which it applies to projectiles of that type (§12).
export const BUFF_SLOTS = 4;
export const BUFF_MAX_LEVEL = 3;
export const BUFF_IDS = ['might', 'haste', 'area', 'velocity', 'duration', 'force', 'amount', 'explode', 'split', 'pierce'];
export const BUFFS = {
  might:    { name: 'Might',    icon: 'icon.might',    kind: 'stat',   levels: [0.2, 0.4, 0.6] },
  haste:    { name: 'Haste',    icon: 'icon.haste',    kind: 'stat',   levels: [-0.1, -0.2, -0.3] },
  area:     { name: 'Area',     icon: 'icon.nuke',     kind: 'stat',   levels: [0.2, 0.4, 0.6] },
  velocity: { name: 'Velocity', icon: 'icon.speed',    kind: 'stat',   levels: [0.2, 0.4, 0.6] },
  duration: { name: 'Duration', icon: 'icon.duration', kind: 'stat',   levels: [0.25, 0.5, 0.75] },
  force:    { name: 'Force',    icon: 'icon.force',    kind: 'stat',   levels: [0.5, 1, 1.5] },
  amount:   { name: 'Amount',   icon: 'icon.amount',   kind: 'count',  levels: [1, 2, 3] },
  explode:  { name: 'Explode',  icon: 'icon.explode',  kind: 'chance', levels: [0.2, 0.35, 0.5], affinity: { fire: 1, arcane: 3 } },
  split:    { name: 'Split',    icon: 'icon.split',    kind: 'chance', levels: [0.2, 0.35, 0.5], affinity: { fire: 1 } },
  pierce:   { name: 'Pierce',   icon: 'icon.laser',    kind: 'chance', levels: [0.2, 0.35, 0.5], affinity: { arcane: 1, fire: 3 } },
};

// §12 Procs. Which procs a projectile can roll follows its damage type (BUFFS[*].affinity);
// mini-tower shots are fireballs. `type` is the damage type a projectile of that kind carries
// unless it is given one (§12.1). No hit spawns an effect: explosions come only from Explode.
export const PROJECTILE_KINDS = {
  fireball: { type: 'fire' },
  laser:    { type: 'arcane' },
};
export const EXPLOSION_ANIM = 'explosion.big'; // fire (and physical) explosions
export const EXPLOSION_ANIMS = { fire: 'explosion.big', arcane: 'explosion.laser', physical: 'explosion.big' };
export const EXPLOSION_SPRITE_PX = { 'explosion.big': 57, 'explosion.laser': 45 }; // source frame widths
export const EXPLODE_RADIUS = 60;
export const EXPLODE_KNOCK = 10; // an explosion's knock (§8.7), like a weapon's
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
  'horse.walk', 'horse.die', 'mounted.walk', 'mounted.die',
  'fireball.anim', 'fireball.big', 'orb.green',
  'laser.dir', 'laser.bigdir',
  'castle', 'castle.destroy', 'royal.prince', 'royal.princess',
  'explosion.small', 'explosion.big', 'explosion.laser', 'explosion.laserbig',
  'burn',
  'icon.laser', 'icon.explode', 'icon.split', 'icon.ring', 'icon.speed', 'icon.big', 'icon.multi', 'icon.nuke',
  'icon.might', 'icon.haste', 'icon.duration', 'icon.force', 'icon.amount',
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
