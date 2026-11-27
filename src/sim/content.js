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

// §8.4 slime generations: gen 0 is the §8 row. A slime of a generation with a `split` splits
// on death into SLIME_CHILDREN slimes of the next generation, `offset` px either side of its
// path; the last generation dies with its `die`. HP and radius are tier 1 (scaled by the tier).
export const SLIME_CHILDREN = 2;
export const SLIME_GENS = [
  { hp: 3, r: 12, walk: 'slime.walk',  split: 'slime.split',  offset: 20 },
  { hp: 2, r: 9,  walk: 'slime.walk1', split: 'slime.split1', offset: 15 },
  { hp: 1, r: 7,  walk: 'slime.walk2', die: 'slime.die2' },
];

// §8 Enemies. hp Infinity = cannot die. xp 0 = no gem. `mass` divides knockback (§8.7); the
// golem has none: hits build its poise instead (§8.10). `scale` (default 2, the
// standard) is the screen scale of a type drawn bigger (§5, §8.6). `stampede` marks the horse:
// it comes only in stampedes and runs straight (§8.8), never from the spawn budget. `gens` are
// the slime's generations (SLIME_GENS, §8.4). `fused` marks the megaslime: it comes only from a
// slime fusion (§8.9), which sets its HP and XP (`hp` and `xp` null here). `summon` is an anim
// played once on arrival, without walking, before `walk` (a summoned skeleton, a fusing megaslime).
// `rival` marks the prince (§14.5): an enemy that comes only on his own schedule, always tier 1,
// walks at the dragon and steals gems; he is not in ENEMY_TYPES (the §8 table and the bestiary).
// ENEMY_TYPES is the §8 table in order, which is also the bestiary's order (§17.1).
export const ENEMY_TYPES = ['knight', 'skeleton', 'slime', 'megaslime', 'mage', 'ghostKnight', 'ghost', 'horse', 'mountedKnight', 'golem'];
export const ENEMIES = {
  knight:      { name: 'Knight',       hp: 3,        speed: 27.5, r: 12, dps: 2,  xp: 1, mass: 1,    walk: 'knight.walk',  die: 'knight.die',  alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0.25 } },
  skeleton:    { name: 'Skeleton',     hp: 1,        speed: 45,   r: 10, dps: 6,  xp: 1, mass: 0.7,  walk: 'skelly.walk',  die: 'skelly.die',  alpha: 1, resist: { fire: 0,    arcane: 0.25, physical: -0.5 }, summon: 'skelly.summon' },
  slime:       { name: 'Slime',        hp: 3,        speed: 35,   r: 12, dps: 4,  xp: 1, mass: 0.8,  walk: 'slime.walk',   die: 'slime.die',   alpha: 1, resist: { fire: -0.5, arcane: 0,    physical: 0.5 }, split: 'slime.split', gens: SLIME_GENS },
  megaslime:   { name: 'Megaslime',    hp: null,     speed: 15,   r: 28, dps: 0,  xp: null, mass: 4, walk: 'megaslime.walk', die: 'megaslime.die', alpha: 1, resist: { fire: -0.5, arcane: 0, physical: 0.5 }, summon: 'megaslime.fuse', fused: true },
  mage:        { name: 'Mage',         hp: 4,        speed: 20,   r: 12, dps: 5,  xp: 5, mass: 1,    walk: 'mage.walk',    die: 'mage.die',    alpha: 1, resist: { fire: 0,    arcane: 0.5,  physical: -0.25 }, spell: 'mage.spell' },
  ghostKnight: { name: 'Ghost knight', hp: 10,       speed: 27.5, r: 12, dps: 10, xp: 2, mass: 1,    walk: 'ghost.knight', die: 'ghost.burn',  alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0.25 } },
  ghost:       { name: 'Ghost',        hp: 2,        speed: 36,   r: 10, dps: 8,  xp: 1, mass: 0.6,  walk: 'ghost.ghost',  die: 'ghost.die',   alpha: 0.6, resist: { fire: 0.25, arcane: -0.5, physical: 0.75 } },
  horse:       { name: 'Horse',        hp: 2,        speed: 120,  r: 10, dps: 4,  xp: 1, mass: 0.5,  walk: 'horse.walk',   die: 'horse.die',   alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0 }, stampede: true },
  mountedKnight: { name: 'Mounted knight', hp: 30,   speed: 60,   r: 16, dps: 15, xp: 8, mass: 2,    walk: 'mounted.walk', die: 'mounted.die', alpha: 1, resist: { fire: 0.25, arcane: -0.25, physical: 0.5 }, scale: 3 },
  golem:       { name: 'Mega golem',   hp: Infinity, speed: 75,   r: 56, dps: 40, xp: 0, mass: null, walk: 'golem.walk',   die: 'golem.die',   alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0 }, immovable: true, procImmune: true, unkillable: true },
  // §14.5 the prince: `xp` is his bounty, added to the XP in his sack when he drops his gem.
  prince:      { name: 'Prince',       hp: 40,       speed: 70,   r: 12, dps: 0,  xp: 5, mass: 1.5,  walk: 'prince.walk',  die: 'prince.die',  alpha: 1, resist: { fire: 0,    arcane: 0,    physical: 0.5 }, rival: true },
};
// Enemy types that are always tier 1 (§8.6): the golem and the prince.
export const untiered = (def) => !!(def.unkillable || def.rival);

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
// Every anim of an enemy type: walk, die, summon, split, spell, then the anims of the slime's
// later generations (§8.4). Tier variants exist for every enemy type's anims except the golem's.
export const enemyAnims = (d) => [d.walk, d.die, d.summon, d.split, d.spell,
  ...(d.gens || []).slice(1).flatMap((g) => [g.walk, g.split, g.die])].filter(Boolean);
export const TIERED_ANIMS = ENEMY_TYPES.filter((t) => !untiered(ENEMIES[t])).flatMap((t) => enemyAnims(ENEMIES[t]));
// §5, §8.6 the screen scale of an enemy or death-effect sprite: its type's scale (2 unless the
// type is drawn bigger) times the tier's ratio to the standard, rounded down to a whole number.
// A 3× type is 3× at tiers 1–2 and 4× at tiers 3–4; every other type 2× and 3×.
export const ANIM_SCALE = Object.fromEntries(ENEMY_TYPES.filter((t) => ENEMIES[t].scale)
  .flatMap((t) => enemyAnims(ENEMIES[t]).map((a) => [a, ENEMIES[t].scale])));
export const screenScale = (anim, tier) =>
  Math.floor((ANIM_SCALE[anim] || TIERS[1].scale) * (TIERS[tier] || TIERS[1]).scale / TIERS[1].scale + 1e-9);

// §8 specials
// §8.9 slime fusion: while more than SLIME_FUSE_COUNT slimes are alive, at most once per
// SLIME_FUSE_INTERVAL s, the SLIME_FUSE_SIZE slimes nearest the slime with the most slimes within
// SLIME_FUSE_RADIUS px fuse into a megaslime of MEGASLIME_HP_FACTOR × their HP and their XP.
export const SLIME_FUSE_COUNT = 100;
export const SLIME_FUSE_SIZE = 12;
export const SLIME_FUSE_RADIUS = 80;
export const SLIME_FUSE_INTERVAL = 1;
export const MEGASLIME_HP_FACTOR = 4;
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
export const GOLEM_HP = 1e9; // finite stand-in for hp ∞ in state; restored after every hit
// §8.10 the golem's poise and stagger, its tower shove and its footsteps (src/sim/golem.js).
export const GOLEM_POISE = 60; // poise (the sum of hits' knock after Force) at which it staggers
export const GOLEM_POISE_GROWTH = 1.5; // each stagger multiplies the poise the next one needs (unmeasured)
export const GOLEM_POISE_DECAY = 10; // poise lost per second while not hit
export const GOLEM_STAGGER_DIST = 40; // px a stagger pushes it straight away from the dragon
export const GOLEM_STAGGER_TIME = 0.3; // s the push takes (eased out)
export const GOLEM_STAGGER_HOLD = 0.5; // s it then stands still
export const GOLEM_SHOVE_DIST = 30; // px it shoves the tower away from itself
export const GOLEM_SHOVE_INTERVAL = 1; // s between shoves while it touches the tower
export const GOLEM_STEP_RANGE = 400; // px from the dragon within which a footstep shakes the screen
export const GOLEM_STEP_FRAMES = [3, 6]; // golem.walk frames where a foot lands (the body at its lowest)

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
  { t: 60,  rate: 0.6,  stage: 'Ooze',   weights: { knight: 45, skeleton: 30, slime: 25, mage: 0,  ghostKnight: 0,  mountedKnight: 0 }, stampede: { every: 20, min: 5, max: 6 } },
  { t: 120, rate: 2.5,  stage: 'Arcana', weights: { knight: 40, skeleton: 25, slime: 20, mage: 15, ghostKnight: 0,  mountedKnight: 0 }, stampede: { every: 30, min: 5, max: 7 } },
  { t: 150, rate: 6.25, weights: { knight: 39, skeleton: 25, slime: 20, mage: 15, ghostKnight: 0,  mountedKnight: 1 }, tiers: { 1: 90, 2: 10, 3: 0,  4: 0 }, stampede: { every: 30, min: 5, max: 7 } },
  { t: 180, rate: 10,   stage: 'Haunt',  weights: { knight: 28, skeleton: 23, slime: 17, mage: 10, ghostKnight: 20, mountedKnight: 2 }, tiers: { 1: 70, 2: 30, 3: 0,  4: 0 }, stampede: { every: 30, min: 6, max: 8 } },
  { t: 210, rate: 13,   weights: { knight: 28, skeleton: 23, slime: 17, mage: 10, ghostKnight: 20, mountedKnight: 2 }, tiers: { 1: 65, 2: 30, 3: 5,  4: 0 }, stampede: { every: 30, min: 6, max: 8 } },
  { t: 240, rate: 16,   stage: 'Siege',  weights: { knight: 26, skeleton: 25, slime: 18, mage: 10, ghostKnight: 18, mountedKnight: 3 }, tiers: { 1: 60, 2: 25, 3: 15, 4: 0 }, stampede: { every: 15, min: 8, max: 12 } },
  { t: 300, rate: 18,   weights: { knight: 26, skeleton: 25, slime: 18, mage: 10, ghostKnight: 18, mountedKnight: 3 }, tiers: { 1: 55, 2: 25, 3: 15, 4: 5 }, stampede: { every: 15, min: 8, max: 12 }, golem: true },
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
// the px a hit pushes an enemy of mass 1 (§8.7). A weapon's top level is its number of
// levels: WEAPON_MAX_LEVEL for every weapon but an evolution, which has one (§10.7).
// WEAPON_IDS is every weapon, in card-pool order (§14.1); evolutions are never offered as
// new weapons, only through EVOLUTIONS.
export const WEAPON_SLOTS = 4;
export const WEAPON_MAX_LEVEL = 5;
export const WEAPON_IDS = ['fireball', 'laser', 'miniTower', 'ring', 'leftClaw', 'rightClaw', 'dualClaw', 'bite', 'saw'];
export const weaponMaxLevel = (id) => WEAPONS[id].levels.length;
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
  // §10.5–10.7 claws: physical slashes from the dragon. A level with `width` slashes rectangles
  // (`sides` 1: the side the dragon faces; 2: both, the other `sideDelay` s later); a level with
  // `reach` slashes a cone of `angle` degrees in the aim direction, hitting the `maxTargets`
  // nearest enemies in it. Amount repeats each side's rectangle `repeatDelay` s apart and adds
  // to maxTargets.
  leftClaw: {
    name: 'Left claw', aimed: false, type: 'physical', knock: 14, sideDelay: 0.15, repeatDelay: 0.1,
    levels: [
      { cooldown: 1.3, damage: 2, width: 110, height: 36, sides: 1 },
      { cooldown: 1.2, damage: 3, width: 115, height: 38, sides: 1 },
      { cooldown: 1.1, damage: 3, width: 125, height: 40, sides: 2 },
      { cooldown: 1.0, damage: 4, width: 130, height: 42, sides: 2 },
      { cooldown: 0.9, damage: 5, width: 140, height: 44, sides: 2 },
    ],
  },
  rightClaw: {
    name: 'Right claw', aimed: true, type: 'physical', knock: 22,
    levels: [
      { cooldown: 1.1, damage: 4, angle: 60, reach: 80, maxTargets: 1 },
      { cooldown: 1.0, damage: 5, angle: 60, reach: 85, maxTargets: 1 },
      { cooldown: 0.9, damage: 6, angle: 65, reach: 90, maxTargets: 2 },
      { cooldown: 0.8, damage: 8, angle: 70, reach: 95, maxTargets: 2 },
      { cooldown: 0.7, damage: 9, angle: 75, reach: 100, maxTargets: 3 },
    ],
  },
  dualClaw: {
    name: 'Dual claw', aimed: true, type: 'physical', knock: 22, sideDelay: 0, repeatDelay: 0.1, evolution: true,
    levels: [
      { cooldown: 0.7, damage: 9, width: 140, height: 44, sides: 2, angle: 75, reach: 100, maxTargets: 3 },
    ],
  },
  // §10.8 bite: every cooldown the dragon bites the nearest live enemy whose circle overlaps
  // `reach` px around its centre (Amount: the next-nearest too); ×executeMult against an enemy
  // below `execute` of its max HP. No target: no bite, the cooldown waits.
  bite: {
    name: 'Bite', aimed: false, type: 'physical', knock: 30, execute: 0.3, executeMult: 2,
    anim: 'bite.jaws', sound: 'megaslime_hit',
    levels: [
      { cooldown: 1.6, damage: 8,  reach: 50 },
      { cooldown: 1.5, damage: 10, reach: 54 },
      { cooldown: 1.3, damage: 13, reach: 57 },
      { cooldown: 1.2, damage: 15, reach: 60 },
      { cooldown: 1.0, damage: 18, reach: 64 },
    ],
  },
  // §10.9 saw blade: every cooldown the tower launches `count` blades along the line from the
  // tower through the dragon (Amount adds blades, fanned `fanStep` degrees apart); each flies
  // `range` px out at `speed`, spins `dwell` s, flies back to the tower and hits every enemy it
  // overlaps (radius `r`), each at most once per `rehit` s.
  saw: {
    name: 'Saw blade', aimed: false, type: 'physical', knock: 6, rehit: 0.4, fanStep: 12,
    anim: 'saw.spin',
    levels: [
      { cooldown: 3,    damage: 2, count: 1, r: 10, range: 260, speed: 260, dwell: 0.6 },
      { cooldown: 2.75, damage: 3, count: 1, r: 11, range: 275, speed: 260, dwell: 0.75 },
      { cooldown: 2.5,  damage: 3, count: 1, r: 12, range: 290, speed: 260, dwell: 0.9 },
      { cooldown: 2.25, damage: 4, count: 2, r: 13, range: 305, speed: 260, dwell: 1.05 },
      { cooldown: 2,    damage: 5, count: 2, r: 14, range: 320, speed: 260, dwell: 1.2 },
    ],
  },
};

// §10.7 Evolutions: owning every weapon of `requires` at its top level puts `result` in the
// level-up pool (CARD_WEIGHTS.evolve); picking it replaces them with `result`.
export const EVOLUTIONS = [
  { result: 'dualClaw', requires: ['leftClaw', 'rightClaw'] },
];

// §10.5–10.6 claw slash effects and sound. A rectangle draws CLAW_RECT_ANIM from the dragon's
// centre sideways, a cone one of CLAW_CONE_ANIMS (16 directions, §5) from the dragon.
export const CLAW_RECT_ANIM = 'claw.swipe';
export const CLAW_CONE_ANIMS = ['claw.cone', 'claw.cone22', 'claw.cone45']; // 0°, 22.5°, 45°
export const CLAW_SOUND = 'screech';

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
export const CARD_WEIGHTS = { newWeapon: 3, upgradeWeapon: 4, evolve: 10, newBuff: 3, upgradeBuff: 3, repair: 1 };

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
// The chest a robbed merchant drops (§14.3): collected like the brazier pickups, never drawn by
// a brazier (not in PICKUP_KINDS).
export const CHEST = { name: 'Chest', anim: 'pickup.chest', sound: 'win_level_2' };

// §14.3 the merchant. Times in s, distances in px. Every MERCHANT_INTERVAL s from the first
// interval one crosses the field on a straight line passing within MERCHANT_LINE_OFFSET px of
// the tower; standing within TRADE_RADIUS of him for TRADE_TIME opens his shop, any player hit
// makes him flee for MERCHANT_FLEE_TIME and he never trades again.
export const MERCHANT_INTERVAL = 90;
export const MERCHANT_LINE_OFFSET = 200;
export const MERCHANT_FLEE_TIME = 3;
export const TRADE_RADIUS = 40;
export const TRADE_TIME = 1.5;
// Not an enemy: no grid, cap, bestiary, gem or kill. `resist` and `mass` are read by the
// damage function as an enemy type's are (§12.1, §8.7).
export const CHARACTERS = {
  merchant: {
    name: 'Merchant', hp: 80, speed: 50, fleeSpeed: 90, r: 12, mass: 3,
    resist: { fire: 0.5, arcane: 0.5, physical: 0.5 },
    walk: 'merchant.walk', die: 'merchant.die', bubble: 'merchant.bubble', dieSound: 'death02',
  },
};
// The shop's three offers, prices in banked XP (`game.xp`, never a level).
export const SHOP_ITEMS = ['reroll', 'card', 'heal'];
export const SHOP_PRICES = { reroll: 10, card: 25, heal: 15 };
export const SHOP_HEAL = 30;

// §14.5 the prince. Times in s, distances in px. From PRINCE_FIRST, every PRINCE_INTERVAL s on a
// fixed grid of the clock, one appears on the spawn ring unless one is alive. While within
// PRINCE_STEAL_RANGE of the dragon, every PRINCE_STEAL_INTERVAL he steals the nearest gem within
// PRINCE_GRAB_RADIUS of himself that is not homing; killed, he drops one gem worth his sack plus
// his bounty (ENEMIES.prince.xp).
export const PRINCE_TYPE = 'prince';
export const PRINCE_FIRST = 135;
export const PRINCE_INTERVAL = 100;
export const PRINCE_STEAL_RANGE = 60;
export const PRINCE_GRAB_RADIUS = 120;
export const PRINCE_STEAL_INTERVAL = 0.5;
export const PRINCE_STEAL_SOUND = 'dropping';
export const PRINCE_DIE_SOUND = 'ohno';

// §15 Grid
export const GRID_CELL = 64;

// §3.3 Every atlas anim the game uses (the procedural `gem` is not in the atlas).
export const ATLAS_NAMES = [
  'dragon.walk',
  'knight.walk', 'knight.die',
  'skelly.walk', 'skelly.die', 'skelly.summon',
  'slime.walk', 'slime.die', 'slime.split', 'slime.walk1', 'slime.split1', 'slime.walk2', 'slime.die2',
  'megaslime.walk', 'megaslime.die', 'megaslime.fuse',
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
  'icon.leftclaw', 'icon.rightclaw', 'icon.dualclaw', 'claw.swipe', 'claw.cone', 'claw.cone22', 'claw.cone45',
  'icon.bite', 'icon.saw', 'bite.jaws', 'saw.spin',
  'merchant.walk', 'merchant.die', 'merchant.bubble', 'pickup.chest', 'icon.reroll',
  'prince.walk', 'prince.die',
];
// §8.6 the generated tier variants of every tiered enemy anim (tiers 2–4).
ATLAS_NAMES.push(...TIERED_ANIMS.flatMap((a) => TIER_IDS.filter((t) => t > 1).map((t) => tierAnim(a, t))));

// §3.3 Sounds copied from the pack root.
export const SOUND_NAMES = [
  'shoot01', 'laser01', 'explosion01', 'explosion02', 'death01', 'death02', 'pickup', 'powerup',
  'hit_golem', 'megaslime_hit', 'slime_poke', 'destroy_castle_sound', 'start_game', 'ohno', 'win_level_2',
  'dropping', 'powerup02', 'powerup03', 'screech',
];
