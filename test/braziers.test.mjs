// Braziers and pickups (§14.2): spawn timing, placement (bounds, view, spacing, cap, draw
// order), breaking by every hit type, pickup rolls, heart, magnet, bomb, lifetime and blink,
// determinism, rendering and the HUD's edge markers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { spawnProjectile, explode } from '../src/sim/projectiles.js';
import { createWeapon, buffMods } from '../src/sim/weapons.js';
import {
  BRAZIER_INTERVAL_TICKS, placeBrazier, stepBraziers, collideBraziers, collidePickups, hitBraziers,
  outsideView, pickupLifeTicks, applyPickup,
} from '../src/sim/braziers.js';
import { createRenderer, pickupVisible, bombFlashAlpha, FLASH } from '../src/render/draw.js';
import { edgeMarker, edgeMarkers, MARKER, drawHud } from '../src/render/hud.js';
import { debugLines } from '../src/render/debug.js';
import {
  DT, VIEW_HALF_W, VIEW_HALF_H, BRAZIER_INTERVAL, BRAZIER_MIN_DIST, BRAZIER_MAX_DIST, BRAZIER_SPACING,
  MAX_BRAZIERS, BRAZIER_TRIES, BRAZIER_RADIUS, PICKUP_LIFE, PICKUPS, HEART_HP, BOMB_DAMAGE,
  GEM_COLLECT_RADIUS, DESPAWN_DIST, GOLEM_HP, TOWER_HP, SOUND_NAMES, ATLAS_NAMES, EXPLODE_RADIUS,
} from '../src/sim/content.js';
import { VIEW_W, VIEW_H } from '../src/viewport.js';

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
const atlas = { image: {}, frames: atlasJson.frames, anims: atlasJson.anims };
const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = (seed = 1) => { const g = new Game({ seed, timeline: QUIET }); g.weapons = []; return g; };
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(intent); };
const sounded = (g, name) => g.events.some((e) => e.type === 'sound' && e.name === name);
const brazier = (g, x, y) => { const b = { id: g.nextId++, x, y, anim: 'brazier.burn', frame: 0, frameTicks: 0 }; g.braziers.push(b); return b; };
const pickup = (g, kind, x, y, life = 1800) => { const p = { id: g.nextId++, kind, x, y, life, anim: PICKUPS[kind].anim, frame: 0, frameTicks: 0 }; g.pickups.push(p); return p; };
// An rng that plays back `values` and counts the draws.
function scripted(values) {
  let i = 0;
  const f = () => { if (i >= values.length) throw new Error('rng drawn too often'); return values[i++]; };
  f.count = () => i;
  return f;
}
// angle draw for a direction (radians) and distance draw for a distance
const ang = (a) => (((a / (2 * Math.PI)) % 1) + 1) % 1;
const dst = (d) => (d - BRAZIER_MIN_DIST) / (BRAZIER_MAX_DIST - BRAZIER_MIN_DIST);

test('braziers: constants and state', () => {
  assert.deepEqual([BRAZIER_INTERVAL, BRAZIER_MIN_DIST, BRAZIER_MAX_DIST, BRAZIER_SPACING, MAX_BRAZIERS], [25, 250, 450, 120, 4]);
  assert.equal(BRAZIER_INTERVAL_TICKS, 1500);
  assert.deepEqual([PICKUP_LIFE, HEART_HP, BOMB_DAMAGE], [30, 20, 60]);
  assert.deepEqual(Object.fromEntries(Object.entries(PICKUPS).map(([k, v]) => [k, v.weight])), { heart: 60, magnet: 25, bomb: 15 });
  assert.deepEqual([VIEW_HALF_W * 2, VIEW_HALF_H * 2], [VIEW_W, VIEW_H], 'the sim view is the screen');
  for (const s of ['dropping', 'powerup02', 'powerup03', 'explosion02']) assert.ok(SOUND_NAMES.includes(s), s);
  for (const a of ['brazier.burn', 'brazier.break', 'pickup.heart', 'pickup.magnet', 'pickup.bomb']) assert.ok(ATLAS_NAMES.includes(a), a);
  const g = new Game({ seed: 1 });
  assert.deepEqual([g.braziers, g.pickups, g.brazierTimer, g.lastBomb], [[], [], 1500, null]);
  const s = g.snapshot();
  for (const k of ['braziers', 'pickups', 'brazierTimer', 'lastBomb']) assert.ok(k in s, k);
});

test('braziers: the §14.2 tables match content.js', () => {
  const spec = readFileSync(new URL('../docs/demo-spec.md', import.meta.url), 'utf8');
  const sec = spec.slice(spec.indexOf('### 14.2'), spec.indexOf('## 15.'));
  const row = (name) => {
    const line = sec.split('\n').find((l) => l.startsWith(`| \`${name}\``));
    assert.ok(line, name);
    return line.split('|')[2];
  };
  const nums = (s) => [...s.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  assert.equal(nums(row('BRAZIER_INTERVAL'))[0], BRAZIER_INTERVAL);
  assert.deepEqual(nums(row('BRAZIER_MIN_DIST')), [BRAZIER_MIN_DIST, BRAZIER_MAX_DIST]);
  assert.equal(nums(row('BRAZIER_SPACING'))[0], BRAZIER_SPACING);
  assert.equal(nums(row('MAX_BRAZIERS'))[0], MAX_BRAZIERS);
  assert.equal(nums(row('BRAZIER_TRIES'))[0], BRAZIER_TRIES);
  assert.equal(nums(row('BRAZIER_RADIUS'))[0], BRAZIER_RADIUS);
  assert.equal(nums(row('PICKUP_LIFE'))[0], PICKUP_LIFE);
  assert.equal(nums(row('HEART_HP'))[0], HEART_HP);
  assert.equal(nums(row('BOMB_DAMAGE'))[0], BOMB_DAMAGE);
  for (const [kind, p] of Object.entries(PICKUPS)) {
    const line = sec.split('\n').find((l) => l.startsWith(`| ${p.name} |`));
    assert.ok(line, kind);
    const cells = line.split('|').map((c) => c.trim());
    assert.equal(Number(cells[2]), p.weight, kind);
    assert.equal(cells[4], `\`${p.anim}\``);
    assert.equal(cells[5], `\`${p.sound}\``);
  }
});

test('art: brazier 12×16 with 3 flicker and 4 break frames; pickups 9 wide', () => {
  const size = (name) => [...new Set(atlas.anims[name].frames.map((f) => `${atlas.frames[f].w}x${atlas.frames[f].h}`))];
  assert.deepEqual(size('brazier.burn'), ['12x16']);
  assert.deepEqual(size('brazier.break'), ['12x16']);
  assert.deepEqual(atlas.anims['brazier.burn'].ticks, [8, 8, 8]);
  assert.deepEqual(atlas.anims['brazier.break'].ticks, [5, 5, 6, 40]);
  assert.deepEqual(size('pickup.heart'), ['9x8']);
  assert.deepEqual(size('pickup.magnet'), ['9x7']);
  assert.deepEqual(size('pickup.bomb'), ['9x9']);
  assert.deepEqual(atlas.anims['pickup.bomb'].ticks, [8, 8]);
});

test('braziers: the first appears on the 1500th tick (t = 25 s), then one every 25 s, up to 4', () => {
  const g = still();
  g.princeNext = Infinity; // the prince (§14.5, due at 2:15) is an enemy; this run counts none
  run(g, BRAZIER_INTERVAL_TICKS - 1);
  assert.equal(g.braziers.length, 0);
  g.tick({});
  assert.equal(g.braziers.length, 1);
  assert.equal(g.tickCount, 1500);
  const b = g.braziers[0];
  assert.equal(b.anim, 'brazier.burn');
  run(g, BRAZIER_INTERVAL_TICKS * 5);
  assert.equal(g.braziers.length, MAX_BRAZIERS, 'capped at 4');
  assert.ok(g.braziers.includes(b), 'they stay until broken');
  for (const x of g.braziers) {
    const d = Math.hypot(x.x - g.tower.x, x.y - g.tower.y);
    assert.ok(d >= BRAZIER_MIN_DIST - 1e-9 && d <= BRAZIER_MAX_DIST + 1e-9, `distance ${d}`);
    for (const y of g.braziers) if (x !== y) assert.ok(Math.hypot(x.x - y.x, x.y - y.y) >= BRAZIER_SPACING);
  }
  assert.equal(g.enemies.length, 0, 'not enemies');
  assert.equal(g.kills, 0);
});

test('braziers: the flame loops; an attempt at the cap draws nothing and the timer restarts', () => {
  const g = still();
  for (let i = 0; i < 4; i++) brazier(g, 300 + i * 150, 0);
  g.brazierTimer = 1;
  g.rng = scripted([]);
  stepBraziers(g);
  assert.equal(g.braziers.length, 4);
  assert.equal(g.brazierTimer, 1500);
  for (let i = 0; i < 30; i++) stepBraziers(g);
  // 31 steps of a 3 × 8-tick loop: 7 ticks into frame 0 again
  assert.ok(g.braziers.every((b) => b.frame === 0 && b.frameTicks === 7), 'flicker: 8 ticks a frame, looping');
  stepBraziers(g);
  assert.ok(g.braziers.every((b) => b.frame === 1 && b.frameTicks === 0));
});

test('braziers: a brazier farther than DESPAWN_DIST from the tower is dropped silently', () => {
  const g = still();
  brazier(g, 0, g.tower.y + DESPAWN_DIST + 1);
  const near = brazier(g, 0, g.tower.y + DESPAWN_DIST - 1);
  stepBraziers(g);
  assert.deepEqual(g.braziers, [near]);
  assert.equal(g.pickups.length, 0);
});

test('placement: each try draws angle then distance; the first spaced point outside the view wins', () => {
  const g = still();
  // try 1: 260 px straight right of the tower (0, 50): inside the view; try 2: 400 px straight up: outside.
  g.rng = scripted([ang(0), dst(260), ang(-Math.PI / 2), dst(400), 0.5]);
  const p = placeBrazier(g);
  assert.equal(g.rng.count(), 4);
  assert.ok(Math.abs(p.x - 0) < 1e-9 && Math.abs(p.y - (50 - 400)) < 1e-9, JSON.stringify(p));
  assert.ok(outsideView(g, p.x, p.y));
  assert.ok(!outsideView(g, 260, 50));
});

test('placement: "outside" means the whole 24 × 32 sprite is off the 960 × 600 view', () => {
  const g = still();
  g.dragon.x = 10; g.dragon.y = -20;
  assert.ok(!outsideView(g, 10 + 480 + 12, -20));
  assert.ok(outsideView(g, 10 + 480 + 12.01, -20));
  assert.ok(!outsideView(g, 10, -20 - 300 - 16));
  assert.ok(outsideView(g, 10, -20 - 300 - 16.01));
});

test('placement: too close to a brazier is rejected; with no point outside, the first spaced one; with none, nothing', () => {
  const g = still();
  brazier(g, 0, 50 - 400 + BRAZIER_SPACING - 1); // within 120 of the straight-up point
  const tries = [];
  for (let i = 0; i < BRAZIER_TRIES; i++) tries.push(ang(-Math.PI / 2), dst(400));
  g.rng = scripted(tries);
  assert.equal(placeBrazier(g), null, 'every try too close');
  assert.equal(g.rng.count(), 2 * BRAZIER_TRIES);

  const h = still();
  brazier(h, 0, -350);
  const inView = [];
  inView.push(ang(-Math.PI / 2), dst(400)); // too close to the brazier
  inView.push(ang(0), dst(300)); // inside the view, spaced: the fallback
  for (let i = 2; i < BRAZIER_TRIES; i++) inView.push(ang(Math.PI), dst(260)); // inside, spaced
  h.rng = scripted(inView);
  const p = placeBrazier(h);
  assert.ok(Math.abs(p.x - 300) < 1e-9 && Math.abs(p.y - 50) < 1e-9, JSON.stringify(p));
  assert.equal(h.rng.count(), 2 * BRAZIER_TRIES, 'all tries are made before falling back');
});

test('placement: over many seeds and dragon positions, inside 250–450 px of the tower and nearly always just outside the view', () => {
  let outside = 0;
  const N = 400;
  for (let seed = 1; seed <= N; seed++) {
    const g = still(seed);
    const a = seed * 2.399, r = 50 + (seed % 56);
    g.dragon.x = g.tower.x + Math.cos(a) * r; g.dragon.y = g.tower.y + Math.sin(a) * r;
    const p = placeBrazier(g);
    const d = Math.hypot(p.x - g.tower.x, p.y - g.tower.y);
    assert.ok(d >= BRAZIER_MIN_DIST && d <= BRAZIER_MAX_DIST, `seed ${seed}: ${d}`);
    if (outsideView(g, p.x, p.y)) outside++;
  }
  assert.ok(outside / N > 0.95, `outside ${outside}/${N}`);
});

// ---- breaking -------------------------------------------------------------------

function broken(g, b, pickRoll) {
  assert.ok(!g.braziers.includes(b), 'removed');
  const fx = g.effects.find((e) => e.anim === 'brazier.break');
  assert.ok(fx && fx.x === b.x && fx.y === b.y, 'break effect where it stood');
  assert.ok(sounded(g, 'dropping'));
  assert.equal(g.pickups.length, 1);
  const p = g.pickups[0];
  assert.deepEqual([p.x, p.y], [b.x, b.y]);
  if (pickRoll !== undefined) assert.equal(p.kind, pickRoll);
}

test('break: a projectile overlapping a brazier breaks it and flies on, remembering nothing', () => {
  const g = still();
  const b = brazier(g, 200, 0);
  const p = spawnProjectile(g, { kind: 'fireball', x: 200 - BRAZIER_RADIUS - 6 + 0.5, y: 0, dx: 1, dy: 0, speed: 0, range: 400, r: 6, damage: 2, anim: 'fireball.anim' });
  g.rng = () => 0;
  collideBraziers(g);
  broken(g, b, 'heart');
  assert.ok(g.projectiles.includes(p));
  assert.deepEqual(p.hits, []);
  assert.equal(g.kills, 0, 'not a kill');
});

test('break: a projectile just out of reach does not break it', () => {
  const g = still();
  const b = brazier(g, 200, 0);
  spawnProjectile(g, { kind: 'fireball', x: 200 - BRAZIER_RADIUS - 6, y: 0, dx: 1, dy: 0, speed: 0, range: 400, r: 6, damage: 2, anim: 'fireball.anim' });
  collideBraziers(g);
  assert.deepEqual(g.braziers, [b]);
});

test('break: a ring fireball breaks a brazier it overlaps', () => {
  const g = still();
  g.weapons = [createWeapon('ring', 1)];
  g.tick({}); // places the balls
  const ball = g.weapons[0].balls[0];
  const b = brazier(g, ball.x + 10, ball.y);
  g.rng = () => 0.7;
  collideBraziers(g);
  broken(g, b, 'magnet');
});

test('break: an explosion breaks the braziers its circle overlaps (and not the others)', () => {
  const g = still();
  const hit = createEnemy(g, 'knight', 100, 0);
  hit.hp = 100;
  const inside = brazier(g, 100 + EXPLODE_RADIUS + BRAZIER_RADIUS - 1, 0);
  const outside = brazier(g, 100, -(EXPLODE_RADIUS + BRAZIER_RADIUS + 1));
  g.grid.build(g.enemies);
  const p = spawnProjectile(g, { kind: 'fireball', x: 100, y: 0, dx: 1, dy: 0, speed: 0, range: 400, r: 6, damage: 2, anim: 'fireball.anim' });
  g.rng = () => 0.9;
  explode(g, p, hit, buffMods(g));
  assert.deepEqual(g.braziers, [outside]);
  broken(g, inside, 'bomb');
});

test('break: a brazier in a full tick is broken by the fireball the dragon fires at it', () => {
  const g = new Game({ seed: 2, timeline: QUIET });
  const b = brazier(g, 150, 0); // straight along the default aim
  let n = 0;
  while (g.braziers.length && n++ < 60) g.tick({});
  assert.equal(g.braziers.length, 0);
  assert.ok(n < 60);
  assert.equal(g.pickups.length, 1);
  assert.deepEqual([g.pickups[0].x, g.pickups[0].y], [b.x, b.y]);
});

test('pickups: one draw picks heart 60%, magnet 25%, bomb 15%', () => {
  const cases = [[0, 'heart'], [0.5999, 'heart'], [0.6, 'magnet'], [0.8499, 'magnet'], [0.85, 'bomb'], [0.9999, 'bomb']];
  for (const [roll, kind] of cases) {
    const g = still();
    const b = brazier(g, 0, 0);
    g.rng = scripted([roll]);
    hitBraziers(g, 0, 0, 1);
    assert.equal(g.rng.count(), 1);
    assert.equal(g.pickups[0].kind, kind, `roll ${roll}`);
    assert.equal(g.pickups[0].anim, `pickup.${kind}`);
    assert.ok(!g.braziers.includes(b));
  }
});

// ---- collecting -----------------------------------------------------------------

test('pickups: collected within GEM_COLLECT_RADIUS of the dragon, never homing', () => {
  const g = still();
  g.tower.hp = 50;
  const far = pickup(g, 'heart', GEM_COLLECT_RADIUS + 0.01, 0);
  collidePickups(g);
  assert.deepEqual(g.pickups, [far]);
  assert.deepEqual([far.x, far.y], [GEM_COLLECT_RADIUS + 0.01, 0], 'does not move');
  far.x = GEM_COLLECT_RADIUS;
  collidePickups(g);
  assert.deepEqual(g.pickups, []);
  assert.equal(g.tower.hp, 50 + HEART_HP);
});

test('heart: +20 tower HP, capped at max', () => {
  const g = still();
  g.tower.hp = 90;
  applyPickup(g, 'heart');
  assert.equal(g.tower.hp, TOWER_HP);
  assert.ok(sounded(g, 'powerup02'));
  g.tower.hp = 33.5;
  applyPickup(g, 'heart');
  assert.equal(g.tower.hp, 53.5);
});

test('magnet: every gem on the ground starts homing and is collected', () => {
  const g = still();
  for (let i = 0; i < 5; i++) g.gems.push({ id: g.nextId++, x: 400 + i * 100, y: -300, value: 1, homing: false });
  pickup(g, 'magnet', 0, 0);
  g.tick({});
  assert.ok(sounded(g, 'powerup03'));
  assert.ok(g.gems.every((x) => x.homing));
  run(g, 120);
  assert.equal(g.gems.length, 0);
  assert.equal(g.xp, 5);
});

test('bomb: 60 fire through the damage function to every enemy in the view; the golem and enemies outside untouched', () => {
  const g = still();
  g.dragon.x = 100; g.dragon.y = 50;
  const knight = createEnemy(g, 'knight', 100 + VIEW_HALF_W, 50);
  const slime = createEnemy(g, 'slime', 100, 50 - VIEW_HALF_H);
  const ghost = createEnemy(g, 'ghost', 0, 0);
  const far = createEnemy(g, 'knight', 100 + VIEW_HALF_W + 0.5, 50);
  const golem = createEnemy(g, 'golem', 150, 50);
  for (const e of [knight, slime, ghost, far]) e.hp = 1000;
  applyPickup(g, 'bomb');
  assert.equal(1000 - knight.hp, 60);
  assert.equal(1000 - slime.hp, 90, 'fire weakness -0.5');
  assert.equal(1000 - ghost.hp, 45, 'fire resist 0.25');
  assert.equal(far.hp, 1000);
  assert.deepEqual([golem.hp, golem.x, golem.y], [GOLEM_HP, 150, 50]);
  assert.ok(!sounded(g, 'hit_golem'));
  assert.ok(sounded(g, 'explosion02'));
  const fx = g.effects.find((e) => e.anim === 'explosion.big');
  assert.deepEqual([fx.x, fx.y, fx.scale], [100, 50, 2]);
  assert.equal(g.lastBomb, g.tickCount);
});

test('bomb: the armoury applies, and its kills die, drop gems and count in the same tick', () => {
  const g = new Game({ seed: 1, timeline: QUIET, meta: { power: { fire: 1.5 } } });
  g.weapons = [];
  const k = createEnemy(g, 'knight', 60, -60);
  k.hp = 90;
  const live = createEnemy(g, 'knight', -60, -60);
  live.hp = 91;
  pickup(g, 'bomb', 0, 0);
  g.tick({});
  assert.equal(g.kills, 1);
  assert.deepEqual(g.enemies, [live]);
  assert.equal(live.hp, 1);
  assert.equal(g.gems.length, 1);
});

test('pickups: Duration lengthens the life of a pickup when it drops', () => {
  const g = still();
  g.buffs.push({ id: 'duration', level: 1 });
  assert.equal(pickupLifeTicks(g), 2250);
  g.buffs[0].level = 3;
  brazier(g, 300, 0);
  hitBraziers(g, 300, 0, 1);
  assert.equal(g.pickups[0].life, 3150);
  g.buffs.length = 0;
  g.tick({});
  assert.equal(g.pickups[0].life, 3149, 'read when it drops, not after');
});

test('pickups: last 30 s, counted in the collisions step', () => {
  const g = still();
  assert.equal(pickupLifeTicks(g), 1800);
  const b = brazier(g, 500, 0);
  hitBraziers(g, b.x, b.y, 1);
  const p = g.pickups[0];
  assert.equal(p.life, 1800);
  run(g, 1799);
  assert.deepEqual(g.pickups, [p]);
  assert.equal(p.life, 1);
  g.tick({});
  assert.deepEqual(g.pickups, []);
});

test('pickups: blink (drawn on alternate 8-tick steps) only in their last 5 s', () => {
  assert.ok(pickupVisible({ life: 1800 }));
  assert.ok(pickupVisible({ life: 301 }));
  const shown = [];
  for (let life = 300; life > 284; life--) shown.push(pickupVisible({ life }) ? 1 : 0);
  // shown while floor(life / 8) is even: 300..296 (37) hidden, 295..288 (36) shown, 287..285 (35) hidden
  assert.deepEqual(shown, [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0]);
});

// ---- determinism ----------------------------------------------------------------

test('determinism: same seed and intents give the same braziers, pickups and digest', () => {
  const play = () => {
    const g = new Game({ seed: 77 });
    for (let i = 0; i < 90 * 60; i++) {
      g.tower.hp = g.tower.maxHp;
      g.tick({ moveX: Math.cos(i / 150), moveY: Math.sin(i / 150), pick: 0 });
    }
    return g;
  };
  const a = play(), b = play();
  assert.equal(a.digest(), b.digest());
  assert.deepEqual(a.snapshot().braziers, b.snapshot().braziers);
  assert.deepEqual(a.snapshot().pickups, b.snapshot().pickups);
  assert.ok(a.braziers.length + a.pickups.length + a.effects.filter((e) => e.anim === 'brazier.break').length > 0);
  const before = a.digest();
  brazier(a, 1, 1);
  assert.notEqual(a.digest(), before, 'braziers are in the digest');
});

test('debug jump: a jump skips no brazier attempts (the timer counts spawner steps)', () => {
  const g = new Game({ seed: 1, timeline: QUIET, debug: true });
  g.weapons = [];
  g.tick({ debug: { jumpTo: 200 } });
  assert.equal(g.braziers.length, 0);
  assert.equal(g.brazierTimer, 1499);
});

// ---- rendering ------------------------------------------------------------------

function fakeCtx() {
  const calls = [];
  return new Proxy({}, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      return (...args) => { calls.push([k, ...args]); return {}; };
    },
    set(t, k, v) { calls.push(['set', k, v]); t[k] = v; return true; },
  });
}
const makeCanvas = (width, height) => { const ctx = fakeCtx(); return { width, height, getContext: () => ctx }; };
const rect = (anim, f) => atlas.frames[atlas.anims[anim].frames[f]];
const drawnAt = (c, fr) => c.calls.findIndex((x) => x[0] === 'drawImage' && x.length === 10 && x[2] === fr.x && x[3] === fr.y);

test('render: braziers and pickups at 2×, above the tower and below enemies; a blinking pickup hides; nothing written', () => {
  const r = createRenderer({ atlas, makeCanvas });
  const g = still();
  createEnemy(g, 'knight', 50, -50);
  const b = brazier(g, 100, -100);
  b.frame = 2;
  pickup(g, 'heart', -100, 0);
  pickup(g, 'magnet', -150, 0, 296); // blinking, hidden this tick
  const before = JSON.stringify(g.snapshot());
  const c = fakeCtx();
  r.drawWorld(c, g);
  assert.equal(JSON.stringify(g.snapshot()), before);
  const bf = rect('brazier.burn', 2), hf = rect('pickup.heart', 0);
  const ib = drawnAt(c, bf), ih = drawnAt(c, hf);
  assert.deepEqual(c.calls[ib].slice(6), [480 + 100 - bf.w, 300 - 100 - bf.h, bf.w * 2, bf.h * 2]);
  assert.ok(ih > ib && drawnAt(c, rect('castle', 0)) < ib, 'above the tower, pickups above braziers');
  assert.ok(drawnAt(c, rect('knight.walk', 0)) > ih, 'below enemies');
  assert.equal(drawnAt(c, rect('pickup.magnet', 0)), -1, 'blinking off');
});

test('render: the bomb flash fades over 24 ticks after the bomb', () => {
  const g = still();
  assert.equal(bombFlashAlpha(g), 0);
  pickup(g, 'bomb', 0, 0);
  g.tick({});
  assert.equal(bombFlashAlpha(g), FLASH.alpha);
  run(g, FLASH.ticks - 1);
  assert.ok(bombFlashAlpha(g) > 0);
  g.tick({});
  assert.equal(bombFlashAlpha(g), 0);
  const r = createRenderer({ atlas, makeCanvas });
  const c = fakeCtx();
  g.lastBomb = g.tickCount - 1;
  r.drawWorld(c, g);
  const last = c.calls.filter((x) => x[0] === 'fillRect').pop();
  assert.deepEqual(last.slice(1), [0, 0, VIEW_W, VIEW_H], 'a full-screen fill over the world');
});

test('edge marker: none while on screen; otherwise on the inset edge along the line from the centre', () => {
  const m = MARKER.margin;
  assert.equal(edgeMarker(480, 300, 12, 16), null);
  assert.equal(edgeMarker(-11, 300, 12, 16), null, 'partly on screen');
  assert.equal(edgeMarker(971, 300, 12, 16), null, 'its left edge still shows');
  assert.ok(edgeMarker(972, 300, 12, 16), 'wholly off');
  const right = edgeMarker(1000, 300, 12, 16);
  assert.deepEqual([right.x, right.y, right.angle], [960 - m, 300, 0]);
  const down = edgeMarker(480, 900, 12, 16);
  assert.deepEqual([down.x, down.y], [480, 600 - m]);
  assert.ok(Math.abs(down.angle - Math.PI / 2) < 1e-12);
  const diag = edgeMarker(480 - 1000, 300 - 1000, 12, 16); // up-left at 45°: the top edge first
  assert.ok(Math.abs(diag.y - m) < 1e-9 && Math.abs(diag.x - (480 - (300 - m))) < 1e-9, JSON.stringify(diag));
  assert.ok(Math.abs(diag.angle + 3 * Math.PI / 4) < 1e-12);
});

test('edge markers: off-screen braziers and showing pickups, in list order; drawn by the HUD without writing', () => {
  const g = still();
  brazier(g, 0, -400); // above the view
  brazier(g, 100, 0); // on screen
  pickup(g, 'bomb', 800, 0); // right of the view
  pickup(g, 'heart', -800, 0, 296); // blinking off: no marker this tick
  const ms = edgeMarkers(g, atlas);
  assert.deepEqual(ms.map((m) => m.anim), ['brazier.burn', 'pickup.bomb']);
  assert.deepEqual([ms[0].x, ms[0].y], [480, MARKER.margin]);
  const before = JSON.stringify(g.snapshot());
  drawHud(fakeCtx(), g, atlas);
  assert.equal(JSON.stringify(g.snapshot()), before);
});

test('debug: the stats count braziers and pickups', () => {
  const g = still();
  brazier(g, 0, 0);
  pickup(g, 'heart', 0, 0);
  pickup(g, 'bomb', 0, 0);
  assert.match(debugLines(g, { ticks: 1, tickMs: 0.1 }, 1).join('\n'), /braziers 1\s+pickups 2/);
});
