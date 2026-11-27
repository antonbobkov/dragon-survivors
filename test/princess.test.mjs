// The princess (§14.4): schedule and spawn, the walk to the tower, the rescue, the lure, contact
// damage, no player hits, her death, determinism, the bots, rendering and the art.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy, stepEnemies } from '../src/sim/enemies.js';
import { spawnProjectile, explode } from '../src/sim/projectiles.js';
import { createWeapon, buffMods, collideRing } from '../src/sim/weapons.js';
import { collideSlashes } from '../src/sim/claws.js';
import { collideBlades } from '../src/sim/saw.js';
import { bomb } from '../src/sim/braziers.js';
import { createPrincess, spawnPrincessIfDue, lureOf, PRINCESS_INTERVAL_TICKS } from '../src/sim/princess.js';
import {
  DT, CHARACTERS, ENEMIES, TIERS, PRINCESS_INTERVAL, PRINCESS_LURE, PRINCESS_TOWER_HP, PRINCESS_SPARKLE_SCALE,
  SPAWN_RING_RADIUS, DESPAWN_DIST, TOWER_HP, TOWER_RADIUS, CONTACT_INSET, ENEMY_TYPES, ATLAS_NAMES, SOUND_NAMES,
} from '../src/sim/content.js';
import { createRenderer, PRINCESS_BAR, princessBarFrac } from '../src/render/draw.js';
import { edgeMarkers, PRINCESS_MARKER, MARKER } from '../src/render/hud.js';
import { botIntent } from '../tools/measure.mjs';

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
const atlas = { image: {}, frames: atlasJson.frames, anims: atlasJson.anims };
const manifest = JSON.parse(readFileSync(new URL('../tools/manifest.json', import.meta.url), 'utf8'));
const SPEC = readFileSync(new URL('../docs/demo-spec.md', import.meta.url), 'utf8');
const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = (seed = 1) => { const g = new Game({ seed, timeline: QUIET }); g.weapons = []; return g; };
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(intent); };
const sounded = (g, name) => g.events.some((e) => e.type === 'sound' && e.name === name);
const DEF = CHARACTERS.princess;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function scripted(values) {
  let i = 0;
  const f = () => { if (i >= values.length) throw new Error('rng drawn too often'); return values[i++]; };
  f.count = () => i;
  return f;
}
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

// ---- constants, spec and art --------------------------------------------------------

test('princess: constants match the §14.4 tables; atlas names and sounds listed; not an enemy type', () => {
  const sec = SPEC.slice(SPEC.indexOf('### 14.4'), SPEC.indexOf('## 15.'));
  assert.ok(sec.length > 0);
  const row = (name) => sec.split('\n').find((l) => l.startsWith(`| \`${name}\``));
  const val = (l) => Number(l.split('|')[2].match(/\d+(\.\d+)?/)[0]);
  assert.equal(val(row('PRINCESS_INTERVAL')), PRINCESS_INTERVAL);
  assert.equal(val(row('PRINCESS_LURE')), PRINCESS_LURE);
  assert.equal(val(row('PRINCESS_TOWER_HP')), PRINCESS_TOWER_HP);
  const stats = sec.split('\n').find((l) => l.startsWith('| Princess |')).split('|').slice(2, 5).map((c) => Number(c.trim()));
  assert.deepEqual(stats, [DEF.hp, DEF.speed, DEF.r]);
  assert.deepEqual([PRINCESS_INTERVAL, PRINCESS_LURE, PRINCESS_TOWER_HP, PRINCESS_SPARKLE_SCALE], [120, 160, 25, 2]);
  assert.equal(PRINCESS_INTERVAL_TICKS, 7200);
  assert.ok(!ENEMY_TYPES.includes('princess'), 'not an enemy, so no bestiary card');
  for (const a of ['princess.walk', 'princess.die', 'princess.sparkle']) assert.ok(ATLAS_NAMES.includes(a), a);
  for (const s of [DEF.arriveSound, DEF.dieSound]) {
    assert.ok(SOUND_NAMES.includes(s), s);
    assert.ok(manifest.sounds.includes(s), s);
  }
  assert.deepEqual([DEF.arriveSound, DEF.dieSound], ['princess_arrive', 'princess_capture']);
});

test('art: the pack princess (16 px, 2-frame walk, 7-frame death); the drawn sparkle 15×15, 5 frames', () => {
  const size = (a) => atlas.anims[a].frames.map((f) => `${atlas.frames[f].w}x${atlas.frames[f].h}`);
  assert.deepEqual(atlas.anims['princess.walk'].frames, ['princess/princess0000.bmp', 'princess/princess0001.bmp']);
  assert.deepEqual(size('princess.walk'), ['16x16', '16x16']);
  assert.deepEqual(atlas.anims['princess.die'].frames, [0, 1, 2, 3, 4, 5, 6].map((i) => `princess/princess_die000${i}.bmp`));
  assert.deepEqual(size('princess.sparkle'), Array(5).fill('15x15'));
  assert.deepEqual(atlas.anims['princess.sparkle'].ticks, [4, 4, 5, 6, 8]);
});

// ---- schedule and spawn -------------------------------------------------------------

test('spawn: the first princess on tick 7200 (2:00), one draw (the side), on the spawn ring, walking from that tick', () => {
  const g = still();
  run(g, PRINCESS_INTERVAL_TICKS - 1);
  assert.equal(g.princesses.length, 0);
  assert.equal(g.princessTimer, 1);
  g.merchants.length = 0;
  const d = { x: g.dragon.x, y: g.dragon.y }, t = { x: g.tower.x, y: g.tower.y };
  g.rng = scripted([0.5]); // straight left of the dragon
  g.tick({});
  assert.equal(g.rng.count(), 1);
  assert.equal(g.princessTimer, PRINCESS_INTERVAL_TICKS);
  assert.equal(g.princesses.length, 1);
  const p = g.princesses[0];
  const sx = d.x - SPAWN_RING_RADIUS, sy = d.y + Math.sin(Math.PI) * SPAWN_RING_RADIUS;
  const ux = t.x - sx, uy = t.y - sy, ul = Math.hypot(ux, uy);
  assert.ok(near(p.x, sx + (ux / ul) * DEF.speed * DT) && near(p.y, sy + (uy / ul) * DEF.speed * DT), 'walked once toward the tower');
  assert.deepEqual([p.type, p.hp, p.maxHp, p.r, p.flip, p.anim], ['princess', 20, 20, 10, false, 'princess.walk']);
  assert.equal(g.enemies.length, 0, 'not an enemy');
  assert.ok(!g.seen.includes('princess'));
});

test('spawn: one at a time (a due princess while one is about draws nothing), then the next 120 s of steps later', () => {
  const g = still();
  createPrincess(g, 300, 300);
  g.princessTimer = 1;
  g.rng = scripted([]);
  spawnPrincessIfDue(g);
  assert.deepEqual([g.princesses.length, g.princessTimer], [1, PRINCESS_INTERVAL_TICKS]);
  g.princesses.length = 0;
  for (let i = 0; i < PRINCESS_INTERVAL_TICKS - 1; i++) spawnPrincessIfDue(g);
  assert.equal(g.princesses.length, 0);
  g.rng = scripted([0]);
  spawnPrincessIfDue(g);
  assert.equal(g.princesses.length, 1);
  assert.ok(near(g.princesses[0].x, g.dragon.x + SPAWN_RING_RADIUS) && near(g.princesses[0].y, g.dragon.y));
  assert.equal(g.princesses[0].flip, true, 'the tower is to her left');
});

test('spawn: the timer counts steps, so a debug jump neither skips nor adds princesses', () => {
  const g = new Game({ seed: 1, timeline: QUIET, debug: true });
  g.weapons = [];
  g.tick({ debug: { jumpTo: 250 } });
  assert.equal(g.princesses.length, 0);
  assert.equal(g.princessTimer, PRINCESS_INTERVAL_TICKS - 1);
});

// ---- walk, rescue, despawn ------------------------------------------------------------

test('walk: 40 px/s straight at the tower, re-aimed at it as it moves; she faces the way she walks', () => {
  const g = still();
  const p = createPrincess(g, -300, 50);
  g.tick({});
  assert.ok(near(p.x, -300 + DEF.speed * DT) && near(p.y, 50));
  assert.equal(p.flip, false);
  assert.equal(p.frameTicks, 1, 'the walk advances');
  // the dragon walks down; the tower follows it (step 3) and she turns after it (step 5)
  for (let i = 0; i < 120; i++) g.tick({ moveX: 0, moveY: 1 });
  const t = g.tower;
  const x0 = p.x, y0 = p.y;
  g.tick({ moveX: 0, moveY: 1 });
  const dx = t.x - x0, dy = t.y - y0;
  const mx = p.x - x0, my = p.y - y0;
  assert.ok(near(Math.hypot(mx, my), DEF.speed * DT, 1e-6));
  assert.ok(Math.abs(mx * dy - my * dx) < 1e-9, 'along the line to where the tower stands this tick');
  assert.ok(dy > 0 && my > 0, 'turned after the tower');
  const q = createPrincess(g, g.tower.x + 300, g.tower.y);
  g.tick({});
  assert.equal(q.flip, true, 'walking left');
});

test('rescue: on touching the tower she is removed, max HP +25 and a full heal, sound and sparkle; again +25', () => {
  const g = still();
  g.tower.hp = 40;
  const t = g.tower;
  const p = createPrincess(g, t.x + DEF.r + TOWER_RADIUS + 0.5, t.y);
  g.tick({});
  assert.ok(!g.princesses.includes(p));
  assert.deepEqual([t.maxHp, t.hp], [TOWER_HP + PRINCESS_TOWER_HP, TOWER_HP + PRINCESS_TOWER_HP]);
  assert.ok(sounded(g, 'princess_arrive'));
  const fx = g.effects.find((e) => e.anim === 'princess.sparkle');
  assert.ok(fx && fx.x === t.x && fx.y === t.y && fx.scale === PRINCESS_SPARKLE_SCALE);
  assert.equal(g.kills, 0);
  createPrincess(g, t.x, t.y + DEF.r + TOWER_RADIUS + 0.3);
  g.tick({});
  assert.deepEqual([t.maxHp, t.hp], [150, 150]);
  // just short of contact she walks on
  const q = createPrincess(g, t.x + DEF.r + TOWER_RADIUS + DEF.speed * DT + 0.01, t.y);
  g.tick({});
  assert.ok(g.princesses.includes(q));
});

test('despawn: a princess farther than DESPAWN_DIST from the tower is removed silently', () => {
  const g = still();
  const p = createPrincess(g, g.tower.x + DESPAWN_DIST + 0.5 + DEF.speed * DT, g.tower.y);
  g.tick({});
  assert.ok(!g.princesses.includes(p));
  assert.ok(!sounded(g, 'princess_capture') && !sounded(g, 'princess_arrive'));
  assert.equal(g.tower.maxHp, TOWER_HP);
  assert.equal(g.effects.length, 0);
});

// ---- the lure ---------------------------------------------------------------------------

test('lure: an enemy within 160 px of her walks at her; beyond, at the tower; it stops at her contact range', () => {
  const g = still();
  const p = createPrincess(g, 400, 0);
  const a = createEnemy(g, 'knight', 400, 159);
  const b = createEnemy(g, 'knight', 400, -161);
  const sp = ENEMIES.knight.speed * DT;
  stepEnemies(g);
  assert.ok(near(a.x, 400) && near(a.y, 159 - sp), 'straight at her');
  const t = g.tower, l = Math.hypot(t.x - 400, t.y + 161);
  assert.ok(near(b.x, 400 + ((t.x - 400) / l) * sp) && near(b.y, -161 + ((t.y + 161) / l) * sp), 'at the tower');
  assert.equal(lureOf(g, a), p);
  assert.equal(lureOf(g, b), null);
  // contact range: r + her r − 1
  const c = createEnemy(g, 'knight', 400 + ENEMIES.knight.r + DEF.r - CONTACT_INSET + 0.1, 0);
  stepEnemies(g);
  assert.ok(near(c.x, 400 + ENEMIES.knight.r + DEF.r - CONTACT_INSET) && near(c.y, 0), 'stops at contact range');
  assert.equal(c.flip, true, 'faces her');
  // a dead princess lures no one
  p.hp = 0;
  assert.equal(lureOf(g, a), null);
});

test('lure: the nearest princess wins; the golem keeps the tower and a horse keeps its line', () => {
  const g = still();
  const p1 = createPrincess(g, 400, 0);
  const p2 = createPrincess(g, 400, 100);
  const k = createEnemy(g, 'knight', 400, 60);
  assert.equal(lureOf(g, k), p2);
  const gol = createEnemy(g, 'golem', 450, 0);
  const h = createEnemy(g, 'horse', 400, -50);
  const [hx, hy] = [h.dx, h.dy];
  const gx = gol.x, gy = gol.y;
  stepEnemies(g);
  const t = g.tower, l = Math.hypot(t.x - gx, t.y - gy);
  assert.ok(near(gol.x, gx + ((t.x - gx) / l) * ENEMIES.golem.speed * DT, 1e-6), 'the golem walks at the tower');
  assert.deepEqual([h.dx, h.dy], [hx, hy]);
  assert.ok(near(h.x, 400 + hx * ENEMIES.horse.speed * DT, 1e-6), 'the horse runs on');
  assert.ok(p1);
});

// ---- contact damage and no player hits ------------------------------------------------------

test('contact: enemies overlapping her deal DPS × tier × DT (the golem too), never below 0; a megaslime nothing', () => {
  const g = still();
  const p = createPrincess(g, 400, 0);
  createEnemy(g, 'knight', 400, 15);
  createEnemy(g, 'skeleton', 385, 0, 2);
  g.grid.build(g.enemies);
  const hp0 = p.hp;
  g.stepCollisions();
  assert.ok(near(hp0 - p.hp, (ENEMIES.knight.dps + ENEMIES.skeleton.dps * TIERS[2].dps) * DT));
  assert.equal(g.tower.hp, TOWER_HP, 'the tower is untouched');
  const q = createPrincess(g, -400, 0);
  const m = createEnemy(g, 'megaslime', -400, 20);
  m.hp = 50;
  g.stepCollisions();
  assert.equal(q.hp, DEF.hp, 'the megaslime is harmless');
  const r = createPrincess(g, 0, 600);
  createEnemy(g, 'golem', 0, 650);
  r.hp = 0.1;
  g.stepCollisions();
  assert.equal(r.hp, 0, 'the golem hurts her, never below 0');
});

test('no player hit touches her: fireballs pass, explosions, the ring, a claw slash, a saw blade and the bomb leave her whole', () => {
  const g = still();
  g.buffs = [{ id: 'explode', level: 3 }, { id: 'split', level: 3 }, { id: 'pierce', level: 3 }];
  const p = createPrincess(g, 100, 0);
  const shot = spawnProjectile(g, { kind: 'fireball', x: 100, y: 0, dx: 1, dy: 0, speed: 0, range: 100, r: 6, damage: 2, anim: 'fireball.anim' });
  g.rng = scripted([]);
  p.x = 100; p.y = 0;
  g.stepCollisions();
  assert.ok(g.projectiles.includes(shot), 'not used up on her');
  assert.equal(g.rng.count(), 0, 'no proc rolled');
  explode(g, { x: p.x, y: p.y, damage: 40, type: 'fire', kind: 'fireball' }, null, buffMods(g));
  const ring = createWeapon('ring', 5);
  ring.balls = [{ x: p.x, y: p.y }];
  g.weapons = [ring];
  collideRing(g);
  g.slashes.push({ id: g.nextId++, weapon: 'leftClaw', shape: 'rect', side: 1, dx: 0, dy: 0, w: 300, h: 100, angle: 0, reach: 0, maxTargets: 0, damage: 40, knock: 50, delay: 0, struck: false, x: 0, y: 0, hits: [], anim: 'claw.swipe', frame: 0, frameTicks: 0 });
  collideSlashes(g);
  g.blades.push({ id: g.nextId++, x: p.x, y: p.y, dx: 1, dy: 0, phase: 'dwell', speed: 0, range: 0, travelled: 0, dwell: 10, r: 20, damage: 50, knock: 0, rehit: {}, anim: 'saw.spin', frame: 0, frameTicks: 0 });
  collideBlades(g);
  bomb(g);
  assert.equal(p.hp, DEF.hp);
  assert.deepEqual([p.x, p.y], [100, 0], 'never pushed');
  // the dragon's own weapons fire at her for a while
  const h = still();
  h.weapons = [createWeapon('fireball', 5), createWeapon('bite', 5), createWeapon('leftClaw', 5)];
  const q = createPrincess(h, 30, 0);
  for (let i = 0; i < 30; i++) { q.x = 30; q.y = 0; h.tick({ aimX: 1, aimY: 0, hasAim: true }); }
  assert.equal(q.hp, DEF.hp);
});

// ---- death ------------------------------------------------------------------------------

test('death: at 0 HP she plays her death where she fell, sound princess_capture; nothing else is lost', () => {
  const g = still();
  const p = createPrincess(g, 300, 0);
  p.flip = true;
  createEnemy(g, 'golem', 300, 40);
  p.hp = 0.2;
  const gems = g.gems.length, kills = g.kills;
  g.tick({});
  assert.ok(!g.princesses.includes(p));
  assert.ok(sounded(g, 'princess_capture'));
  const fx = g.effects.find((e) => e.anim === 'princess.die');
  assert.ok(fx && near(fx.x, p.x) && near(fx.y, p.y) && fx.flip === true);
  assert.deepEqual([g.gems.length, g.kills, g.tower.maxHp, g.tower.hp], [gems, kills, TOWER_HP, TOWER_HP]);
  assert.ok(!sounded(g, 'princess_arrive'));
});

// ---- determinism, snapshot, bots ------------------------------------------------------------

test('determinism: the same seed and intents give the same digest through princesses; her state is in the snapshot', () => {
  const play = () => {
    const g = new Game({ seed: 5 });
    for (let i = 0; i < 60 * 150 && g.phase === 'play'; i++) {
      g.tower.hp = g.tower.maxHp; // keep the run going to the princess
      const a = (i / 600) * Math.PI;
      g.tick({ moveX: Math.cos(a), moveY: Math.sin(a), pick: g.offers.length ? 0 : -1, leave: true });
    }
    return g;
  };
  const a = play(), b = play();
  assert.ok(a.t >= 125, 'reached the first princess');
  assert.equal(a.digest(), b.digest());
  const s = a.snapshot();
  for (const k of ['princesses', 'princessTimer']) assert.ok(k in s, k);
  const c = new Game({ seed: 5 });
  const d0 = c.digest();
  c.princessTimer = 5;
  assert.notEqual(c.digest(), d0);
});

test('measure bots ignore her: the same intent with or without a princess about', () => {
  const g = still();
  createEnemy(g, 'knight', 200, 100);
  for (const bot of [['aim', 'greedy'], ['kite', 'greedy']]) {
    const before = botIntent(g, ...bot);
    createPrincess(g, 100, 80);
    assert.deepEqual(botIntent(g, ...bot), before);
    g.princesses.length = 0;
  }
});

// ---- rendering ----------------------------------------------------------------------------

test('render: drawn after the enemies with an HP bar always shown; magenta edge marker off screen; nothing written', () => {
  const g = still();
  const p = createPrincess(g, 100, 0);
  createEnemy(g, 'knight', 100, 20);
  assert.equal(princessBarFrac(p), 1);
  p.hp = 5;
  assert.equal(princessBarFrac(p), 0.25);
  const r = createRenderer({ atlas, makeCanvas: (w, h) => ({ width: w, height: h, getContext: () => fakeCtx() }) });
  const before = JSON.stringify(g.snapshot());
  const c = fakeCtx();
  r.drawWorld(c, g);
  assert.equal(JSON.stringify(g.snapshot()), before);
  const at = (anim) => { const fr = atlas.frames[atlas.anims[anim].frames[0]]; return c.calls.findIndex((x) => x[0] === 'drawImage' && x.length === 10 && x[2] === fr.x && x[3] === fr.y); };
  assert.ok(at('knight.walk') >= 0 && at('knight.walk') < at('princess.walk'), 'over the enemies');
  const fills = c.calls.filter((x) => x[0] === 'fillRect');
  assert.ok(fills.some((x) => x[3] === PRINCESS_BAR.w && x[4] === PRINCESS_BAR.h), 'bar back');
  assert.ok(fills.some((x) => x[3] === Math.round(PRINCESS_BAR.w * 0.25) && x[4] === PRINCESS_BAR.h), 'bar fill');
  assert.equal(edgeMarkers(g, atlas).length, 0);
  p.x = -2000;
  const mk = edgeMarkers(g, atlas);
  assert.equal(mk.length, 1);
  assert.deepEqual([mk[0].anim, mk[0].fill, mk[0].edge], ['princess.walk', PRINCESS_MARKER.fill, PRINCESS_MARKER.edge]);
  assert.notEqual(PRINCESS_MARKER.fill, MARKER.fill);
});
