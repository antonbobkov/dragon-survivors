// The prince (§14.5): schedule, walk at the dragon, theft, every weapon's targeting, death and his
// gem, despawn, determinism, rendering and the art.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { spawnProjectile, explode } from '../src/sim/projectiles.js';
import { createWeapon, buffMods, collideRing } from '../src/sim/weapons.js';
import { collideSlashes } from '../src/sim/claws.js';
import { collideBlades } from '../src/sim/saw.js';
import { biteTargets } from '../src/sim/bite.js';
import { bomb } from '../src/sim/braziers.js';
import { dealDamage } from '../src/sim/damage.js';
import { PRINCE_STEAL_TICKS } from '../src/sim/prince.js';
import {
  DT, ENEMIES, ENEMY_TYPES, TIERED_ANIMS, ATLAS_NAMES, SOUND_NAMES, SPAWN_RING_RADIUS, DESPAWN_DIST, DRAGON_RADIUS,
  PRINCE_FIRST, PRINCE_INTERVAL, PRINCE_STEAL_RANGE, PRINCE_GRAB_RADIUS, PRINCE_STEAL_INTERVAL,
  PRINCE_STEAL_SOUND, PRINCE_DIE_SOUND, TOWER_RADIUS,
} from '../src/sim/content.js';
import { bestiaryRows } from '../src/render/bestiary.js';
import { createRenderer, princeOverlay, PRINCE_SACK } from '../src/render/draw.js';
import { edgeMarkers, FOE_MARKER } from '../src/render/hud.js';

const atlasJson = JSON.parse(readFileSync(new URL('../assets/atlas.json', import.meta.url), 'utf8'));
const atlas = { image: {}, frames: atlasJson.frames, anims: atlasJson.anims };
const SPEC = readFileSync(new URL('../docs/demo-spec.md', import.meta.url), 'utf8');
const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const DEF = ENEMIES.prince;
// A quiet game without weapons, merchants, princesses or a due prince, so nothing else moves.
const still = (seed = 1) => {
  const g = new Game({ seed, timeline: QUIET });
  g.weapons = [];
  g.merchantTimer = Infinity;
  g.princessTimer = Infinity;
  g.princeNext = Infinity;
  return g;
};
const run = (g, n, intent = {}) => { for (let i = 0; i < n; i++) g.tick(intent); };
const sounded = (g, name) => g.events.some((e) => e.type === 'sound' && e.name === name);
const princes = (g) => g.enemies.filter((e) => e.type === 'prince');
const gem = (g, x, y, value = 1, homing = false) => { const o = { id: g.nextId++, x, y, value, homing }; g.gems.push(o); return o; };
function scripted(values) {
  let i = 0;
  const f = () => { if (i >= values.length) throw new Error('rng drawn too often'); return values[i++]; };
  f.count = () => i;
  return f;
}

// ---- constants, spec, art ---------------------------------------------------------------

test('prince: constants match the §14.5 tables; an enemy type outside the §8 table, the bestiary and the tiers', () => {
  const sec = SPEC.slice(SPEC.indexOf('### 14.5'), SPEC.indexOf('## 15.'));
  const val = (name) => Number(sec.split('\n').find((l) => l.startsWith(`| \`${name}\``)).split('|')[2].match(/\d+(\.\d+)?/)[0]);
  assert.equal(val('PRINCE_FIRST'), PRINCE_FIRST);
  assert.equal(val('PRINCE_INTERVAL'), PRINCE_INTERVAL);
  assert.equal(val('PRINCE_STEAL_RANGE'), PRINCE_STEAL_RANGE);
  assert.equal(val('PRINCE_GRAB_RADIUS'), PRINCE_GRAB_RADIUS);
  assert.equal(val('PRINCE_STEAL_INTERVAL'), PRINCE_STEAL_INTERVAL);
  const stats = sec.split('\n').find((l) => l.startsWith('| Prince |')).split('|').slice(2, -1).map((c) => c.trim());
  assert.deepEqual(stats.slice(0, 9).map(Number),
    [DEF.hp, DEF.speed, DEF.r, DEF.dps, DEF.xp, DEF.mass, DEF.resist.fire, DEF.resist.arcane, DEF.resist.physical]);
  assert.deepEqual([DEF.hp, DEF.speed, DEF.dps, DEF.xp, DEF.mass, DEF.resist.physical], [40, 70, 0, 5, 1.5, 0.5]);
  assert.equal(PRINCE_STEAL_TICKS, 30);
  assert.ok(!ENEMY_TYPES.includes('prince'), 'not in the §8 table or the bestiary');
  assert.ok(!TIERED_ANIMS.includes('prince.walk') && !ATLAS_NAMES.includes('prince.walk@t2'), 'no tier sprites');
  assert.ok(ATLAS_NAMES.includes('prince.walk') && ATLAS_NAMES.includes('prince.die'));
  assert.ok(SOUND_NAMES.includes(PRINCE_STEAL_SOUND) && SOUND_NAMES.includes(PRINCE_DIE_SOUND));
});

test('art: the pack prince, 16 px, a 2-frame walk and a 7-frame death', () => {
  const size = (a) => atlas.anims[a].frames.map((f) => `${atlas.frames[f].w}x${atlas.frames[f].h}`);
  assert.deepEqual(size('prince.walk'), ['16x16', '16x16']);
  assert.deepEqual(atlas.anims['prince.walk'].frames, ['princess/prince0000.bmp', 'princess/prince0001.bmp']);
  assert.equal(atlas.anims['prince.die'].frames.length, 7);
  assert.ok(atlas.anims['prince.die'].frames.every((f) => f.startsWith('princess/prince_die')));
  assert.equal(atlas.anims['prince.walk@t2'], undefined);
});

// ---- schedule ------------------------------------------------------------------------------

test('spawn: the first on the tick that starts at 2:15, one draw (the angle), on the spawn ring, tier 1', () => {
  const g = still();
  g.princeNext = PRINCE_FIRST;
  g.tickCount = Math.round(PRINCE_FIRST / DT) - 1;
  g.t = g.tickCount * DT;
  g.tick({});
  assert.equal(princes(g).length, 0, 'not before 2:15');
  g.rng = scripted([0.25]);
  g.tick({});
  assert.equal(g.rng.count(), 1);
  const [p] = princes(g);
  assert.ok(p, 'one prince');
  assert.equal(g.princeNext, PRINCE_FIRST + PRINCE_INTERVAL);
  // he spawned at dragon + 560 × (0, 1) and walked one step at the dragon in the same tick
  const d = Math.hypot(p.x - g.dragon.x, p.y - g.dragon.y);
  assert.ok(Math.abs(d - (SPAWN_RING_RADIUS - DEF.speed * DT)) < 1e-6, `${d}`);
  assert.ok(Math.abs(p.x) < 1e-9 && p.y > 0);
  assert.deepEqual([p.tier, p.hp, p.maxHp, p.stolen, p.r], [1, 40, 40, 0, 12]);
  assert.equal(createEnemy(g, 'prince', 0, 0, 4).tier, 1, 'always tier 1');
});

test('spawn: on the default schedule at 2:15 and 3:55; skipped while one is alive; one at most on a debug jump', () => {
  const g = still();
  g.princeNext = PRINCE_FIRST;
  g.rng = () => 0.5;
  g.tickCount = Math.round(PRINCE_FIRST / DT);
  g.t = g.tickCount * DT;
  g.tick({});
  assert.equal(princes(g).length, 1);
  // alive at 3:55: skipped, no draw, the next one due at 5:35
  g.tickCount = Math.round((PRINCE_FIRST + PRINCE_INTERVAL) / DT);
  g.t = g.tickCount * DT;
  g.rng = scripted([]);
  g.tick({});
  assert.equal(princes(g).length, 1);
  assert.equal(g.princeNext, PRINCE_FIRST + 2 * PRINCE_INTERVAL);
  // a debug jump from 0:00 to 10:00 brings one prince, not five
  const j = new Game({ seed: 3, timeline: QUIET, debug: true });
  j.weapons = [];
  j.tick({ debug: { jumpTo: 600 } });
  assert.equal(princes(j).length, 1);
  assert.equal(j.princeNext, 635);
});

// ---- walk and theft --------------------------------------------------------------------------

test('walk: 70 px/s straight at the dragon (not the tower), facing the way he walks; he stops beside it', () => {
  const g = still();
  const p = createEnemy(g, 'prince', 300, 0);
  g.tick({});
  assert.ok(Math.abs(p.x - (300 - DEF.speed * DT)) < 1e-9 && Math.abs(p.y) < 1e-9, 'at the dragon at (0, 0), not the tower below it');
  assert.equal(p.flip, true);
  run(g, 600);
  assert.ok(Math.abs(Math.hypot(p.x, p.y) - (DEF.r + DRAGON_RADIUS)) < 1e-6, 'stands r + DRAGON_RADIUS from the dragon');
  assert.equal(g.tower.hp, g.tower.maxHp);
});

test('walk: no princess lures him; contact with the tower deals nothing', () => {
  const g = still();
  const p = createEnemy(g, 'prince', 0, 60); // on the tower at (0, 50), the dragon at (0, 0)
  g.princesses.push({ id: g.nextId++, type: 'princess', x: 40, y: 60, r: 10, hp: 20, maxHp: 20, flip: false, anim: 'princess.walk', frame: 0, frameTicks: 0 });
  const y0 = p.y;
  g.tick({});
  assert.ok(p.y < y0 && Math.abs(p.x) < 1e-9, 'straight up at the dragon, not at the princess beside him');
  run(g, 10);
  assert.ok(Math.hypot(p.x - g.tower.x, p.y - g.tower.y) < DEF.r + TOWER_RADIUS, 'still touching the tower');
  assert.equal(g.tower.hp, g.tower.maxHp);
});

test('theft: in range, every 30 ticks the nearest non-homing gem within 120 px of him goes into his sack, sound dropping', () => {
  const g = still();
  const p = createEnemy(g, 'prince', 30, 0); // in range (60) and already beside the dragon (24)
  const near = gem(g, 120, 0, 3); // 90 px from him, 120 from the dragon: not homing
  const far = gem(g, 160, 0, 7); // 130 px from him: out of his reach
  const safe = gem(g, -60, 0, 2, true); // homing: safe (2 XP: no level-up to freeze the world)
  g.rng = scripted([]);
  run(g, PRINCE_STEAL_TICKS - 1);
  assert.equal(p.stolen, 0);
  assert.equal(p.stealTimer, 1);
  g.tick({});
  assert.equal(p.stolen, 3);
  assert.ok(!g.gems.includes(near) && g.gems.includes(far));
  assert.ok(sounded(g, PRINCE_STEAL_SOUND));
  assert.equal(p.stealTimer, PRINCE_STEAL_TICKS);
  assert.ok(!g.gems.includes(safe) && g.xp === 2, 'the homing gem reached the dragon');
  run(g, PRINCE_STEAL_TICKS);
  assert.equal(p.stolen, 3, 'nothing in reach: the theft passes');
  assert.equal(g.rng.count(), 0, 'no random draws');
});

test('theft: ties go to the lower id; out of range the timer restarts', () => {
  const g = still();
  const p = createEnemy(g, 'prince', 30, 0);
  const a = gem(g, 30, 100, 2);
  gem(g, 30, -100, 5);
  run(g, PRINCE_STEAL_TICKS);
  assert.equal(p.stolen, 2);
  assert.ok(!g.gems.includes(a));
  // the dragon walks away: out of range, the timer goes back to 30
  const q = createEnemy(still(), 'prince', 0, 0);
  const h = still();
  h.enemies.push(q);
  q.x = 200; q.stealTimer = 5;
  h.tick({});
  assert.equal(q.stealTimer, PRINCE_STEAL_TICKS);
});

// ---- the player's hits --------------------------------------------------------------------

test('hits: every weapon targets and hits him like any enemy, physical at half', () => {
  const g = still();
  const p = createEnemy(g, 'prince', 50, 0);
  g.grid.build(g.enemies);
  // a fireball: full fire damage, used up, knock 4 / mass 1.5
  spawnProjectile(g, { kind: 'fireball', x: 50, y: 0, dx: 1, dy: 0, speed: 0, range: 100, r: 6, damage: 2, knock: 4, anim: 'fireball.anim' });
  g.tick({});
  assert.equal(p.hp, 38);
  assert.equal(g.projectiles.length, 0);
  // an explosion (fire 4), the ring (fire 2)
  p.x = 50; p.y = 0;
  g.grid.build(g.enemies);
  explode(g, { x: 80, y: 0, damage: 4, type: 'fire', kind: 'fireball' }, null, buffMods(g));
  assert.equal(p.hp, 34);
  const ring = createWeapon('ring', 1);
  ring.balls = [{ x: p.x, y: p.y }];
  g.weapons = [ring];
  collideRing(g);
  assert.equal(p.hp, 32);
  g.weapons = [];
  // a right-claw cone takes him as its one target: ceil(4 × 0.5) = 2
  p.x = 50; p.y = 0;
  g.grid.build(g.enemies);
  g.slashes.push({ id: g.nextId++, weapon: 'rightClaw', shape: 'cone', side: 1, dx: 1, dy: 0, w: 0, h: 0, angle: 60, reach: 80, maxTargets: 1, damage: 4, knock: 0, delay: 0, struck: false, x: 0, y: 0, hits: [], anim: 'claw.cone', frame: 0, frameTicks: 0 });
  collideSlashes(g);
  assert.deepEqual(g.slashes[0].hits, [p.id]);
  assert.equal(p.hp, 30);
  // a saw blade: ceil(5 × 0.5) = 3
  g.blades.push({ id: g.nextId++, x: p.x, y: p.y, dx: 1, dy: 0, phase: 'dwell', speed: 0, range: 0, travelled: 0, dwell: 10, r: 10, damage: 5, knock: 0, rehit: {}, anim: 'saw.spin', frame: 0, frameTicks: 0 });
  collideBlades(g);
  assert.equal(p.hp, 27);
  // the bite finds him; the bomb hits him (60 fire)
  assert.deepEqual(biteTargets(g, 0, 0, 50, 1), [p]);
  bomb(g);
  assert.ok(p.hp <= 0);
});

test('hits: a landed mini tower shoots at him', () => {
  const g = still();
  g.weapons = [createWeapon('miniTower', 1)];
  g.weapons[0].timer = 1e9; // no new lob; the landed one below shoots
  const p = createEnemy(g, 'prince', 200, 0);
  p.stealTimer = 1e9;
  g.miniTowers.push({ id: g.nextId++, x: 100, y: 0, fromX: 100, fromY: 0, lobTicks: 0, life: 600, timer: 0, anim: 'castle', frame: 0, frameTicks: 0 });
  g.tick({});
  assert.equal(g.projectiles.length, 1);
  assert.ok(g.projectiles[0].dx > 0.99, 'aimed at him');
});

// ---- death, despawn -----------------------------------------------------------------------

test('death: a kill, death01 and ohno, prince.die where he fell, one gem worth 5 + his sack', () => {
  const g = still();
  const p = createEnemy(g, 'prince', 200, 0);
  p.stolen = 17;
  dealDamage(g, p, 100, 'fire', { x: 0, y: 0 });
  g.tick({});
  assert.equal(princes(g).length, 0);
  assert.equal(g.kills, 1);
  assert.ok(sounded(g, 'death01') && sounded(g, PRINCE_DIE_SOUND));
  assert.equal(g.gems.length, 1);
  assert.equal(g.gems[0].value, 22);
  assert.ok(g.effects.some((e) => e.anim === 'prince.die'));
  // an empty sack: the bounty alone
  const h = still();
  const q = createEnemy(h, 'prince', 200, 0);
  q.hp = 0;
  h.tick({});
  assert.equal(h.gems[0].value, 5);
});

test('despawn: farther than DESPAWN_DIST from the tower he is removed with his sack, no budget refund', () => {
  const g = still();
  const p = createEnemy(g, 'prince', DESPAWN_DIST + 200, 0);
  p.stolen = 10;
  const b0 = g.spawner.budget;
  g.tick({});
  assert.equal(princes(g).length, 0);
  assert.equal(g.spawner.budget, b0);
  assert.equal(g.gems.length, 0);
  assert.equal(g.kills, 0);
});

// ---- determinism, bestiary, rendering -----------------------------------------------------

test('determinism: the same seed and intents give the same digest through a prince stealing and dying; his state is in the snapshot', () => {
  const play = () => {
    const g = new Game({ seed: 11, timeline: QUIET, debug: true });
    g.tick({ debug: { jumpTo: PRINCE_FIRST } });
    for (let i = 0; i < 40; i++) { const p = princes(g)[0]; gem(g, (p ? p.x : 0) + 10, 70, 2); }
    for (let i = 0; i < 1200; i++) g.tick({ moveX: Math.sin(i / 90), moveY: 0, aimX: 1, aimY: 0, hasAim: true, pick: 0 });
    return g;
  };
  const a = play(), b = play();
  assert.equal(a.digest(), b.digest());
  const snap = a.snapshot();
  assert.ok('princeNext' in snap);
  const p = new Game({ seed: 1, timeline: QUIET });
  createEnemy(p, 'prince', 0, 0);
  assert.ok('stolen' in p.snapshot().enemies[0] && 'stealTimer' in p.snapshot().enemies[0]);
});

test('bestiary: no card for him even once met', () => {
  const g = still();
  createEnemy(g, 'prince', 0, 0);
  assert.ok(g.seen.includes('prince'));
  assert.ok(!bestiaryRows(g).some((r) => r.type === 'prince'));
});

function fakeCtx() {
  const calls = [];
  return new Proxy({}, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
      return (...args) => { calls.push([k, ...args]); return {}; };
    },
    set(t, k, v) { calls.push(['set', k, v]); t[k] = v; return true; },
  });
}

test('render: HP bar once hurt, the sack over him with its XP, over the enemies; red edge marker off screen; nothing written', () => {
  const g = still();
  const p = createEnemy(g, 'prince', 100, 0);
  assert.deepEqual(princeOverlay(p), { hp: null, sack: 0 });
  p.hp = 20;
  p.stolen = 12;
  assert.deepEqual(princeOverlay(p), { hp: 0.5, sack: 12 });
  createEnemy(g, 'knight', 100, 40);
  const r = createRenderer({ atlas, makeCanvas: (w, h) => ({ width: w, height: h, getContext: () => fakeCtx() }) });
  const before = JSON.stringify(g.snapshot());
  const c = fakeCtx();
  r.drawWorld(c, g);
  assert.equal(JSON.stringify(g.snapshot()), before);
  const at = (anim) => { const fr = atlas.frames[atlas.anims[anim].frames[0]]; return c.calls.findIndex((x) => x[0] === 'drawImage' && x.length === 10 && x[2] === fr.x && x[3] === fr.y); };
  const text = c.calls.findIndex((x) => x[0] === 'fillText' && x[1] === '12');
  assert.ok(at('prince.walk') >= 0 && text > at('knight.walk'), 'the sack is drawn over every enemy');
  assert.ok(c.calls.some((x) => x[0] === 'set' && x[1] === 'fillStyle' && x[2] === PRINCE_SACK.color));
  // the gem at 1× (6 px) just left of the text
  assert.ok(c.calls.some((x) => x[0] === 'drawImage' && x.length === 6 && x[4] === PRINCE_SACK.gem && x[5] === PRINCE_SACK.gem));
  assert.equal(edgeMarkers(g, atlas).length, 0);
  p.x = 2000;
  const mk = edgeMarkers(g, atlas);
  assert.equal(mk.length, 1);
  assert.deepEqual([mk[0].anim, mk[0].fill, mk[0].edge], ['prince.walk', FOE_MARKER.fill, FOE_MARKER.edge]);
});
