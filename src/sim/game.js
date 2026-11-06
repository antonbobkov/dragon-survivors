// Game state, the tick order of §2.1 (one method per step), clock and game over.
import { DT, TIMELINE, DYING_TIME, WEAPON_IDS, WEAPON_MAX_LEVEL, WEAPON_SLOTS } from './content.js';
import { mulberry32 } from './rng.js';
import { Grid } from './grid.js';
import { createDragon, applyIntent, moveDragon } from './dragon.js';
import { createTower, stepTether, collideTower } from './tower.js';
import { stepEnemies, stepDeaths } from './enemies.js';
import { createSpawner, stepSpawner, spawnGolemIfDue } from './spawner.js';
import { createWeapon, stepWeapons, collideRing } from './weapons.js';
import { stepProjectiles, collideProjectiles } from './projectiles.js';
import { stepEnemyShots, collideEnemyShots } from './enemyShots.js';
import { stepEffects, spawnEffect } from './effects.js';
import { stepGems } from './gems.js';
import { applyCard, rollOffers } from './levelup.js';

const DYING_TICKS = Math.round(DYING_TIME / DT);

// §4: a missing or partial intent is all zeros; move is clamped to length 1, aim normalised.
export function normalizeIntent(intent) {
  const i = intent || {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  let moveX = num(i.moveX), moveY = num(i.moveY);
  const ml = Math.hypot(moveX, moveY);
  if (ml > 1) { moveX /= ml; moveY /= ml; }
  let aimX = num(i.aimX), aimY = num(i.aimY);
  const al = Math.hypot(aimX, aimY);
  if (al > 0) { aimX /= al; aimY /= al; }
  const pick = i.pick === 0 || i.pick === 1 || i.pick === 2 ? i.pick : -1;
  return { moveX, moveY, aimX, aimY, hasAim: i.hasAim === true && al > 0, confirm: i.confirm === true, pick };
}

// §19: the optional `intent.debug` command, `{ grant: <weapon id> }` or `{ jumpTo: <s> }`,
// or null when absent or malformed. Honoured only by a Game built with `{ debug: true }`.
export function normalizeDebug(intent) {
  const d = intent && intent.debug;
  if (!d || typeof d !== 'object') return null;
  if (WEAPON_IDS.includes(d.grant)) return { grant: d.grant };
  if (typeof d.jumpTo === 'number' && Number.isFinite(d.jumpTo)) return { jumpTo: d.jumpTo };
  return null;
}

export class Game {
  constructor({ seed = 1, timeline = TIMELINE, debug = false } = {}) {
    this.seed = seed;
    this.debug = debug === true; // §19: debug commands in the intent are honoured only then
    this.rng = mulberry32(seed);
    this.timeline = timeline;
    this.tickCount = 0;
    this.t = 0;
    this.phase = 'play';
    this.dyingTicks = 0;
    this.nextId = 1;
    this.events = [];
    this.dragon = createDragon();
    this.tower = createTower();
    this.enemies = [];
    this.projectiles = [];
    this.enemyShots = []; // mage orbs (§8.5), apart from the player's projectiles
    this.effects = [];
    this.gems = [];
    this.miniTowers = [];
    this.spawner = createSpawner();
    this.grid = new Grid();
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.pendingLevelUps = 0;
    this.offers = []; // the current level-up cards while pendingLevelUps > 0 (§14)
    this.weapons = [createWeapon('fireball', 1)];
    this.buffs = [];
  }

  // At most one event per sound name per tick.
  sound(name) {
    for (const ev of this.events) if (ev.type === 'sound' && ev.name === name) return;
    this.events.push({ type: 'sound', name });
  }

  score() {
    return Math.floor(this.t) + this.kills;
  }

  tick(intent) {
    this.events.length = 0;
    if (this.phase === 'over') return;
    if (this.phase === 'dying') {
      this.stepEffects();
      if (++this.dyingTicks >= DYING_TICKS) this.phase = 'over';
      return;
    }
    const it = normalizeIntent(intent);
    if (this.offers.length > 0) { this.stepPick(it); return; } // the world is frozen
    if (this.debug) this.stepDebug(normalizeDebug(intent)); // §19, before step 1
    this.stepIntent(it);       // 1
    this.stepDragon();         // 2
    this.stepTether();         // 3
    this.stepSpawner();        // 4
    this.stepEnemies();        // 5
    this.stepWeapons();        // 6
    this.stepProjectiles();    // 7
    this.stepCollisions();     // 8
    this.stepDeaths();         // 9
    this.stepGems();           // 10
    this.stepEffects();        // 11
    this.stepClock();          // 12
  }

  // §14: while offers are open no step runs; a valid `pick` applies that card, and the
  // next offers are rolled if level-ups remain.
  stepPick(intent) {
    const card = this.offers[intent.pick];
    if (!card) return;
    applyCard(this, card);
    this.pendingLevelUps--;
    this.sound('powerup');
    this.offers = this.pendingLevelUps > 0 ? rollOffers(this) : [];
  }
  // §19 debug command, applied before step 1 of a world-advancing tick; the tick then runs
  // as usual. grant: the weapon at level 5 (added if not owned and a slot is free).
  // jumpTo: sets the clock forward to that time (never back); the spawner reads its row
  // from the clock, nothing in between is simulated.
  stepDebug(cmd) {
    if (!cmd) return;
    if (cmd.grant) {
      const w = this.weapons.find((x) => x.id === cmd.grant);
      if (w) w.level = WEAPON_MAX_LEVEL;
      else if (this.weapons.length < WEAPON_SLOTS) this.weapons.push(createWeapon(cmd.grant, WEAPON_MAX_LEVEL));
    } else if (cmd.jumpTo !== undefined) {
      const ticks = Math.round(cmd.jumpTo / DT);
      if (ticks > this.tickCount) {
        this.tickCount = ticks;
        this.t = ticks * DT;
      }
    }
  }
  // 1. Dragon velocity and aim. `confirm` is the loop's business; `pick` is read by stepPick.
  stepIntent(intent) { applyIntent(this, intent); }
  // 2.
  stepDragon() { moveDragon(this); }
  // 3. §7.1
  stepTether() { stepTether(this); }
  // 4. §9
  stepSpawner() { stepSpawner(this); }
  // 5. Special timers (mage cast, summon anim), AI, move, separation, despawn (§8).
  stepEnemies() { stepEnemies(this); }
  // 6. §10: cooldowns, firing, ring positions, mini towers.
  stepWeapons() { stepWeapons(this); }
  // 7. Projectiles, then enemy shots: move, expire by range.
  stepProjectiles() {
    stepProjectiles(this);
    stepEnemyShots(this);
  }
  // 8. Projectile vs enemy (with procs), ring vs enemy, enemy vs tower, enemy shot vs dragon.
  stepCollisions() {
    this.grid.build(this.enemies);
    collideProjectiles(this);
    collideRing(this);
    collideTower(this);
    collideEnemyShots(this);
  }
  // 9. Deaths, gems, slime split, ghost knight burn (§8.4).
  stepDeaths() { stepDeaths(this); }
  // 10. §14: attract and collect gems, queue level-ups and roll offers.
  stepGems() { stepGems(this); }
  // 11.
  stepEffects() { stepEffects(this); }
  // 12. Clock, golem at 5:00 (§9), game over.
  stepClock() {
    this.tickCount++;
    this.t = this.tickCount * DT;
    spawnGolemIfDue(this);
    if (this.tower.hp <= 0) {
      this.phase = 'dying';
      this.dyingTicks = 0;
      spawnEffect(this, 'castle.destroy', this.tower.x, this.tower.y, { hold: true });
      this.sound('destroy_castle_sound');
      this.offers = []; // a level-up queued on the tick the tower fell is dropped
      this.pendingLevelUps = 0;
    }
  }

  // Plain-data view of the state (no rng, grid or events).
  snapshot() {
    return {
      seed: this.seed, tickCount: this.tickCount, phase: this.phase, dyingTicks: this.dyingTicks,
      nextId: this.nextId, kills: this.kills, level: this.level, xp: this.xp,
      pendingLevelUps: this.pendingLevelUps, offers: this.offers, spawner: this.spawner,
      dragon: this.dragon, tower: this.tower, enemies: this.enemies,
      projectiles: this.projectiles, enemyShots: this.enemyShots, effects: this.effects, gems: this.gems, miniTowers: this.miniTowers,
      weapons: this.weapons, buffs: this.buffs,
    };
  }

  // FNV-1a over a canonical JSON of the snapshot (sorted keys, numbers rounded to 1e-6).
  digest() {
    const s = canonical(this.snapshot());
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

export function canonical(v) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return JSON.stringify(String(v));
    const r = Math.round(v * 1e6) / 1e6;
    return String(r === 0 ? 0 : r);
  }
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const keys = Object.keys(v).filter((k) => typeof v[k] !== 'function' && v[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
