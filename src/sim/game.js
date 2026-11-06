// Game state, the tick order of §2.1 (one method per step), clock and game over.
import { DT, TIMELINE, DYING_TIME } from './content.js';
import { mulberry32 } from './rng.js';
import { Grid } from './grid.js';
import { createDragon, applyIntent, moveDragon } from './dragon.js';
import { createTower, stepTether, collideTower } from './tower.js';
import { stepEnemies, stepDeaths } from './enemies.js';
import { createSpawner, stepSpawner, spawnGolemIfDue } from './spawner.js';
import { createWeapon, stepWeapons } from './weapons.js';
import { stepProjectiles, collideProjectiles } from './projectiles.js';
import { stepEffects, spawnEffect } from './effects.js';
import { stepGems } from './gems.js';

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

export class Game {
  constructor({ seed = 1, timeline = TIMELINE } = {}) {
    this.seed = seed;
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
    this.effects = [];
    this.spawner = createSpawner();
    this.grid = new Grid();
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.pendingLevelUps = 0;
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

  // 1. Dragon velocity and aim. `confirm` and `pick` belong to the level-up flow (T-005).
  stepIntent(intent) { applyIntent(this, intent); }
  // 2.
  stepDragon() { moveDragon(this); }
  // 3. §7.1
  stepTether() { stepTether(this); }
  // 4. §9
  stepSpawner() { stepSpawner(this); }
  // 5. Special timers (mage cast, summon anim), AI, move, separation, despawn (§8).
  stepEnemies() { stepEnemies(this); }
  // 6. §10; laser, mini tower and ring are T-005 hooks in weapons.js.
  stepWeapons() { stepWeapons(this); }
  // 7.
  stepProjectiles() { stepProjectiles(this); }
  // 8. Projectile vs enemy, ring vs enemy (T-005, inside spinRing), enemy vs tower.
  stepCollisions() {
    this.grid.build(this.enemies);
    collideProjectiles(this);
    collideTower(this);
  }
  // 9. Deaths, slime split, ghost knight burn (§8.4); gems are T-005's dropGem.
  stepDeaths() { stepDeaths(this); }
  // 10. T-005.
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
    }
  }

  // Plain-data view of the state (no rng, grid or events).
  snapshot() {
    return {
      seed: this.seed, tickCount: this.tickCount, phase: this.phase, dyingTicks: this.dyingTicks,
      nextId: this.nextId, kills: this.kills, level: this.level, xp: this.xp,
      pendingLevelUps: this.pendingLevelUps, spawner: this.spawner,
      dragon: this.dragon, tower: this.tower, enemies: this.enemies,
      projectiles: this.projectiles, effects: this.effects,
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
