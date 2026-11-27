// Game state, the tick order of §2.1 (one method per step), clock and game over.
import { DT, TIMELINE, DYING_TIME, WEAPON_IDS, WEAPON_SLOTS, weaponMaxLevel, PRINCE_FIRST } from './content.js';
import { mulberry32 } from './rng.js';
import { Grid } from './grid.js';
import { createDragon, applyIntent, moveDragon } from './dragon.js';
import { createTower, stepTether, collideTower } from './tower.js';
import { stepEnemies, stepDeaths } from './enemies.js';
import { createSpawner, stepSpawner, spawnGolemIfDue } from './spawner.js';
import { createWeapon, stepWeapons, collideRing, collideBites } from './weapons.js';
import { stepBlades, collideBlades } from './saw.js';
import { collideSlashes, stepSlashes } from './claws.js';
import { stepProjectiles, collideProjectiles } from './projectiles.js';
import { stepEnemyShots, collideEnemyShots } from './enemyShots.js';
import { stepEffects, spawnEffect } from './effects.js';
import { stepGems } from './gems.js';
import { applyCard, openOffers, evolutionOf, evolve } from './levelup.js';
import { normalizeMeta } from './damage.js';
import { stepBraziers, collideBraziers, collidePickups, BRAZIER_INTERVAL_TICKS } from './braziers.js';
import { spawnMerchantIfDue, stepMerchants, merchantDeaths, openShopIfDue, MERCHANT_INTERVAL_TICKS } from './merchant.js';
import { stepShop } from './shop.js';
import { spawnPrincessIfDue, stepPrincesses, collidePrincesses, princessDeaths, PRINCESS_INTERVAL_TICKS } from './princess.js';
import { spawnPrinceIfDue } from './prince.js';

const DYING_TICKS = Math.round(DYING_TIME / DT);

// §4: a missing or partial intent is all zeros; move is clamped to length 1, aim normalised.
// `pick` is a whole number from 0 (a card, a shop offer) or -1; `reroll` and `leave` are edges.
export function normalizeIntent(intent) {
  const i = intent || {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  let moveX = num(i.moveX), moveY = num(i.moveY);
  const ml = Math.hypot(moveX, moveY);
  if (ml > 1) { moveX /= ml; moveY /= ml; }
  let aimX = num(i.aimX), aimY = num(i.aimY);
  const al = Math.hypot(aimX, aimY);
  if (al > 0) { aimX /= al; aimY /= al; }
  const pick = Number.isInteger(i.pick) && i.pick >= 0 ? i.pick : -1;
  return {
    moveX, moveY, aimX, aimY, hasAim: i.hasAim === true && al > 0, confirm: i.confirm === true, pick,
    reroll: i.reroll === true, leave: i.leave === true,
  };
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
  constructor({ seed = 1, timeline = TIMELINE, debug = false, meta } = {}) {
    this.seed = seed;
    this.debug = debug === true; // §19: debug commands in the intent are honoured only then
    this.meta = normalizeMeta(meta); // §4.1, §12.1: the armoury's per-type power and shred
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
    this.seen = []; // enemy types met this run, in the order first spawned (§17.1)
    this.seenTiers = {}; // type -> the tiers of it met this run, ascending (§8.6, §17.1)
    this.projectiles = [];
    this.enemyShots = []; // mage orbs (§8.5), apart from the player's projectiles
    this.effects = [];
    this.gems = [];
    this.miniTowers = [];
    this.slashes = []; // claw slashes, pending and playing (§10.5–10.7)
    this.blades = []; // saw blades in flight (§10.9)
    this.braziers = []; // §14.2
    this.pickups = [];
    this.brazierTimer = BRAZIER_INTERVAL_TICKS; // spawner steps until the next brazier attempt
    this.lastBomb = null; // tickCount of the last bomb pickup (read by the renderer's flash)
    this.lastFusion = null; // tickCount of the last slime fusion (§8.9)
    this.merchants = []; // §14.3, at most one
    this.merchantTimer = MERCHANT_INTERVAL_TICKS; // spawner steps until the next merchant is due
    this.shop = null; // the merchant's shop while it is open (§14.3)
    this.rerolls = 0; // level-up rerolls bought from merchants (§14)
    this.princesses = []; // §14.4, at most one
    this.princessTimer = PRINCESS_INTERVAL_TICKS; // spawner steps until the next princess is due
    this.princeNext = PRINCE_FIRST; // s: when the next prince is due (§14.5)
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

  // §5 screen shake for the renderer: `kind` is 'spawn', 'step' or 'stagger' (the golem's, §8.10).
  // At most one event per kind per tick.
  shake(kind) {
    for (const ev of this.events) if (ev.type === 'shake' && ev.kind === kind) return;
    this.events.push({ type: 'shake', kind });
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
    if (this.shop) { stepShop(this, it); return; } // §14.3, frozen too
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
  // A banked reroll (`intent.reroll`, §14.3) rolls the offers again instead.
  stepPick(intent) {
    if (intent.reroll && this.rerolls > 0) {
      this.rerolls--;
      openOffers(this);
      this.sound('powerup03');
      return;
    }
    const card = this.offers[intent.pick];
    if (!card) return;
    applyCard(this, card);
    this.pendingLevelUps--;
    this.sound('powerup');
    if (this.pendingLevelUps > 0) openOffers(this);
    else this.offers = [];
  }
  // §19 debug command, applied before step 1 of a world-advancing tick; the tick then runs
  // as usual. grant: the weapon at its top level (added if not owned and a slot is free; an
  // evolution whose weapons are all owned replaces them). jumpTo: sets the clock forward to
  // that time (never back); the spawner reads its row from the clock, nothing in between is
  // simulated.
  stepDebug(cmd) {
    if (!cmd) return;
    if (cmd.grant) {
      const w = this.weapons.find((x) => x.id === cmd.grant);
      const evo = evolutionOf(cmd.grant);
      if (w) w.level = weaponMaxLevel(cmd.grant);
      else if (evo && evo.requires.every((id) => this.weapons.some((x) => x.id === id))) evolve(this, evo);
      else if (this.weapons.length < WEAPON_SLOTS) this.weapons.push(createWeapon(cmd.grant, weaponMaxLevel(cmd.grant)));
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
  // 4. §9 enemies, then §14.2 braziers, then §14.3 the merchant, then §14.4 the princess, then §14.5 the prince.
  stepSpawner() {
    stepSpawner(this);
    stepBraziers(this);
    spawnMerchantIfDue(this);
    spawnPrincessIfDue(this);
    spawnPrinceIfDue(this);
  }
  // 5. Special timers (mage cast, summon anim), AI, move, separation, despawn, slime fusion (§8).
  stepEnemies() {
    stepEnemies(this);
    stepMerchants(this); // §14.3
    stepPrincesses(this); // §14.4
  }
  // 6. §10: cooldowns, firing, ring positions, mini towers.
  stepWeapons() { stepWeapons(this); }
  // 7. Projectiles, then saw blades, then enemy shots: move, expire by range (a blade by
  // returning to the tower).
  stepProjectiles() {
    stepProjectiles(this);
    stepBlades(this);
    stepEnemyShots(this);
  }
  // 8. Player hits vs braziers, projectile vs enemy (with procs), ring vs enemy, claw slashes
  // vs enemy (and braziers), bite vs enemy (and braziers), saw blades vs enemy, enemy vs tower,
  // enemy vs princess (§14.4), enemy shot vs dragon, dragon vs pickups (§14.2).
  stepCollisions() {
    this.grid.build(this.enemies);
    collideBraziers(this);
    collideProjectiles(this);
    collideRing(this);
    collideSlashes(this);
    collideBites(this);
    collideBlades(this);
    collideTower(this);
    collidePrincesses(this);
    collideEnemyShots(this);
    collidePickups(this);
  }
  // 9. Deaths, gems, slime split, ghost knight burn (§8.4).
  stepDeaths() {
    stepDeaths(this);
    merchantDeaths(this); // §14.3: a chest, no gem, no kill
    princessDeaths(this); // §14.4: nothing lost
  }
  // 10. §14: attract and collect gems, queue level-ups and roll offers.
  stepGems() { stepGems(this); }
  // 11. Effects, then the claw slashes' effects.
  stepEffects() {
    stepEffects(this);
    stepSlashes(this);
  }
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
    openShopIfDue(this); // §14.3, only while still in play
  }

  // Plain-data view of the state (no rng, grid or events).
  snapshot() {
    return {
      seed: this.seed, meta: this.meta, seen: this.seen, seenTiers: this.seenTiers, tickCount: this.tickCount, phase: this.phase, dyingTicks: this.dyingTicks,
      nextId: this.nextId, kills: this.kills, level: this.level, xp: this.xp,
      pendingLevelUps: this.pendingLevelUps, offers: this.offers, spawner: this.spawner,
      dragon: this.dragon, tower: this.tower, enemies: this.enemies,
      projectiles: this.projectiles, enemyShots: this.enemyShots, effects: this.effects, gems: this.gems, miniTowers: this.miniTowers, slashes: this.slashes, blades: this.blades,
      braziers: this.braziers, pickups: this.pickups, brazierTimer: this.brazierTimer, lastBomb: this.lastBomb, lastFusion: this.lastFusion,
      merchants: this.merchants, merchantTimer: this.merchantTimer, shop: this.shop, rerolls: this.rerolls,
      princesses: this.princesses, princessTimer: this.princessTimer,
      princeNext: this.princeNext,
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
