// Slimes (§8.4, §8.9): three generations that split twice, and the megaslime fusion; their art
// (§3.3) and bestiary cards (§17.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/sim/game.js';
import { createEnemy, fuseSlimes, stepEnemies } from '../src/sim/enemies.js';
import { dealDamage } from '../src/sim/damage.js';
import { animLength } from '../src/sim/effects.js';
import {
  ENEMIES, ENEMY_TYPES, SLIME_GENS, SLIME_FUSE_COUNT, SLIME_FUSE_SIZE, SLIME_FUSE_RADIUS, SLIME_FUSE_INTERVAL,
  MEGASLIME_HP_FACTOR, TIERS, TIERED_ANIMS, ATLAS_NAMES, tierHp, DT,
} from '../src/sim/content.js';
import { bestiaryRows, bestiaryLayout, spriteTopMax, BESTIARY } from '../src/render/bestiary.js';
import { SPRITE_SCALE } from '../src/render/draw.js';

const ROOT = new URL('../', import.meta.url);
const SPEC = readFileSync(new URL('docs/demo-spec.md', ROOT), 'utf8').split('\n');
const atlas = JSON.parse(readFileSync(new URL('assets/atlas.json', ROOT), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('tools/manifest.json', ROOT), 'utf8'));

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const still = (seed = 1) => {
  const g = new Game({ seed, timeline: QUIET });
  g.weapons = [];
  return g;
};
const run = (g, n) => { for (let i = 0; i < n; i++) g.tick({}); };
const ofType = (g, type) => g.enemies.filter((e) => e.type === type);
const kill = (g, e) => { e.hp = 0; g.stepDeaths(); };
const noRng = (g) => { g.rng = () => { throw new Error('no random draws'); }; };

// Rows of the first table (indented or not) after the line starting with `start`.
function tableAfter(start) {
  let i = SPEC.findIndex((l) => l.trim().startsWith(start));
  assert.ok(i >= 0, start);
  while (!SPEC[i].trim().startsWith('|')) i++;
  const rows = [];
  for (; i < SPEC.length && SPEC[i].trim().startsWith('|'); i++) {
    const cells = SPEC[i].trim().split('|').slice(1, -1).map((c) => c.trim());
    if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
  }
  return rows.slice(1);
}

// ---- generations (§8.4) --------------------------------------------------------------

test('slime generations: content matches the §8.4 table (walk, HP, radius, death, child offset)', () => {
  const rows = tableAfter('- **Slime generations.**');
  assert.equal(rows.length, SLIME_GENS.length);
  rows.forEach(([gen, walk, hp, r, death, offset], i) => {
    const g = SLIME_GENS[i];
    assert.equal(Number(gen), i);
    assert.ok(walk.startsWith('`' + g.walk + '`'), walk);
    assert.deepEqual([Number(hp), Number(r)], [g.hp, g.r], `gen ${i}`);
    if (g.split) {
      assert.equal(death, `splits, \`${g.split}\``);
      assert.equal(offset, `±${g.offset} px`);
    } else {
      assert.equal(death, `dies, \`${g.die}\``);
      assert.equal(offset, 'none');
    }
  });
  assert.deepEqual([SLIME_GENS[0].hp, SLIME_GENS[0].r, SLIME_GENS[0].walk, SLIME_GENS[0].split], [ENEMIES.slime.hp, ENEMIES.slime.r, ENEMIES.slime.walk, ENEMIES.slime.split]);
});

test('slime split: gen-1 children appear ±15 px across the path, with gen 2 HP, radius, walk and maxHp', () => {
  const g = still();
  const p = createEnemy(g, 'slime', 0, 300);
  kill(g, p);
  const [a] = ofType(g, 'slime');
  a.x = 0; // straight below the tower: the path is vertical
  kill(g, a);
  const kids = ofType(g, 'slime').filter((e) => e.gen === 2);
  // the tower is straight above the gen-1 parent, so the offsets are along x
  assert.deepEqual(kids.map((k) => [k.x, k.y, k.hp, k.maxHp, k.r, k.anim]), [[15, 300, 1, 1, 7, 'slime.walk2'], [-15, 300, 1, 1, 7, 'slime.walk2']]);
  assert.deepEqual(g.effects.map((f) => [f.anim, f.x]), [['slime.split', 0], ['slime.split1', 0]]);
  kill(g, kids[0]);
  assert.equal(ofType(g, 'slime').length, 2, 'a gen-2 slime does not split');
  assert.equal(g.effects.at(-1).anim, 'slime.die2');
  assert.equal(g.gems.length, 3, 'every generation drops its own gem');
});

test('slime split: one spawned slime is 11 HP and 7 kills at tier 1; a gold one keeps its tier to the end', () => {
  const g = still();
  kill(g, createEnemy(g, 'slime', 0, 400, 4));
  let hp = tierHp(3, 4);
  for (let gen = 1; gen <= 2; gen++) {
    const kids = ofType(g, 'slime');
    assert.ok(kids.every((k) => k.gen === gen && k.tier === 4 && k.r === SLIME_GENS[gen].r * TIERS[4].r));
    hp += kids.reduce((a, k) => a + k.hp, 0);
    for (const k of kids) kill(g, k);
  }
  assert.equal(g.kills, 7);
  assert.equal(hp, tierHp(3, 4) + 2 * tierHp(2, 4) + 4 * tierHp(1, 4));
  assert.deepEqual(g.effects.map((f) => f.tier), Array(7).fill(4));
  assert.equal(3 + 2 * 2 + 4 * 1, 11);
});

// ---- fusion (§8.9) --------------------------------------------------------------------

test('fusion: constants match the §8.9 table', () => {
  const rows = Object.fromEntries(tableAfter('### 8.9').map(([k, v]) => [k.replace(/`/g, ''), parseFloat(v)]));
  assert.deepEqual(rows, {
    SLIME_FUSE_COUNT, SLIME_FUSE_SIZE, SLIME_FUSE_RADIUS, SLIME_FUSE_INTERVAL, MEGASLIME_HP_FACTOR,
  });
  assert.deepEqual([SLIME_FUSE_COUNT, SLIME_FUSE_SIZE, SLIME_FUSE_RADIUS, SLIME_FUSE_INTERVAL, MEGASLIME_HP_FACTOR], [100, 12, 80, 1, 4]);
  const m = ENEMIES.megaslime;
  assert.deepEqual([m.speed, m.r, m.dps, m.mass, m.resist], [15, 28, 0, 4, ENEMIES.slime.resist]);
});

// A 5 × 5 square of slimes 25 px apart centred on (cx, cy) (its centre is the only slime with all
// 24 others within 80 px), then `far` slimes on a 100 px grid around (0, -700) (no neighbours).
function flood(g, far, cx = 0, cy = 600) {
  const square = [];
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) square.push(createEnemy(g, 'slime', cx + i * 25, cy + j * 25));
  const grid = [];
  for (let k = 0; k < far; k++) grid.push(createEnemy(g, 'slime', -400 + (k % 9) * 100, -1100 + Math.floor(k / 9) * 100));
  return { square, grid, centre: square[12] };
}

test('fusion: none at 100 slimes, one at 101: the 12 nearest the densest (ties by lower id) fuse at their centroid', () => {
  const g = still();
  flood(g, 75);
  assert.equal(ofType(g, 'slime').length, 100);
  noRng(g);
  assert.equal(fuseSlimes(g), null, 'exactly 100 is not more than SLIME_FUSE_COUNT');
  assert.equal(g.lastFusion, null);

  const h = still();
  const { square, centre } = flood(h, 76);
  // give the square mixed tiers and some damage
  square[6].tier = 3; square[7].hp = 1;
  const before = h.enemies.slice();
  noRng(h);
  const m = fuseSlimes(h);
  assert.ok(m);
  // distance 0: the centre; 25: 4; 35.4: 4; 50: 4 of which the 3 lowest ids fuse
  const at = (i, j) => square[(j + 2) * 5 + (i + 2)];
  const expected = [centre, at(0, -1), at(-1, 0), at(1, 0), at(0, 1), at(-1, -1), at(1, -1), at(-1, 1), at(1, 1), at(0, -2), at(-2, 0), at(2, 0)];
  const fused = before.filter((e) => !h.enemies.includes(e));
  assert.deepEqual(fused.map((e) => e.id).sort((a, b) => a - b), expected.map((e) => e.id).sort((a, b) => a - b));
  assert.ok(h.enemies.includes(at(0, 2)), 'the fourth slime at 50 px (highest id) stays');
  assert.equal(ofType(h, 'slime').length, 101 - SLIME_FUSE_SIZE);
  assert.deepEqual(h.enemies.slice(0, -1), before.filter((e) => !fused.includes(e)), 'the others keep their order');
  assert.equal(h.enemies.at(-1), m, 'the megaslime is appended');
  const cx = expected.reduce((a, e) => a + e.x, 0) / 12, cy = expected.reduce((a, e) => a + e.y, 0) / 12;
  assert.ok(Math.abs(m.x - cx) < 1e-9 && Math.abs(m.y - cy) < 1e-9);
  const hpSum = expected.reduce((a, e) => a + e.hp, 0);
  assert.equal(hpSum, 11 * 3 + 1, 'the HP left is what counts');
  assert.deepEqual([m.type, m.tier, m.hp, m.maxHp, m.xp, m.r, m.anim, m.frame],
    ['megaslime', 3, MEGASLIME_HP_FACTOR * hpSum, MEGASLIME_HP_FACTOR * hpSum, 11 * 1 + 1 * TIERS[3].xp, 28 * TIERS[3].r, 'megaslime.fuse', 0]);
  assert.equal(m.flip, false, 'the tower is not to its left');
  assert.deepEqual([h.kills, h.gems.length, h.effects.length], [0, 0, 0], 'fusing is silent: no kill, gem or effect');
  assert.equal(h.lastFusion, h.tickCount);
  assert.ok(h.seen.includes('megaslime'));
});

test('fusion: at most once per second while the flood lasts', () => {
  const g = still();
  flood(g, 76 + 30); // 131 slimes
  noRng(g);
  assert.ok(fuseSlimes(g));
  assert.equal(ofType(g, 'slime').length, 119);
  assert.equal(fuseSlimes(g), null, 'not twice in a tick');
  g.tickCount += Math.round(SLIME_FUSE_INTERVAL / DT) - 1;
  assert.equal(fuseSlimes(g), null, '59 ticks later: still waiting');
  g.tickCount += 1;
  assert.ok(fuseSlimes(g), '60 ticks later');
  g.tickCount += 60;
  assert.ok(fuseSlimes(g));
  assert.equal(ofType(g, 'slime').length, 131 - 3 * 12);
  g.tickCount += 60;
  assert.equal(fuseSlimes(g), null, '95 slimes: the flood is over');
  assert.equal(ofType(g, 'megaslime').length, 3);
});

test('fusion: runs in the enemies step of a tick; the megaslime fuses for 24 ticks, then walks at 15 px/s', () => {
  const g = still();
  flood(g, 76);
  stepEnemies(g);
  assert.equal(ofType(g, 'megaslime').length, 1);
  const h = still();
  flood(h, 76);
  h.tick({});
  const [m] = ofType(h, 'megaslime');
  assert.ok(m);
  assert.equal(h.lastFusion, 0, 'the tickCount of the tick it fused on');
  h.enemies = [m]; // alone, so separation does not push it
  assert.equal(animLength('megaslime.fuse'), 24);
  const x0 = m.x, y0 = m.y;
  run(h, 24);
  assert.deepEqual([m.x, m.y, m.anim], [x0, y0, 'megaslime.walk'], 'still while it fuses, then walking');
  const d0 = Math.hypot(h.tower.x - m.x, h.tower.y - m.y);
  run(h, 60);
  const d1 = Math.hypot(h.tower.x - m.x, h.tower.y - m.y);
  assert.ok(Math.abs(d0 - d1 - 15) < 1.5, `walked ${d0 - d1} px in 1 s`);
});

test('fusion: the megaslime never damages the tower, soaks hits through slime resistances and dies without splitting', () => {
  const g = still();
  const m = createEnemy(g, 'megaslime', 0, 120, 2);
  m.hp = m.maxHp = 400; m.xp = 9;
  run(g, 60 * 20);
  assert.ok(Math.hypot(m.x - g.tower.x, m.y - g.tower.y) < m.r + 26, 'it reached the tower');
  assert.equal(g.tower.hp, g.tower.maxHp, 'contact DPS 0');
  assert.equal(dealDamage(g, m, 2, 'fire', { x: m.x, y: m.y + 1 }), 3, 'weak to fire');
  assert.equal(dealDamage(g, m, 4, 'physical', { x: m.x, y: m.y + 1 }), 2, 'resists physical');
  m.hp = 0;
  g.stepDeaths();
  assert.equal(g.enemies.length, 0, 'no split');
  assert.deepEqual([g.kills, g.effects.at(-1).anim, g.effects.at(-1).tier, g.gems[0].value], [1, 'megaslime.die', 2, 9]);
  const h = still();
  kill(h, createEnemy(h, 'megaslime', 0, 300));
  assert.equal(h.gems.length, 0, 'made outside a fusion: no gem');
});

test('fusion: deterministic, with lastFusion in the snapshot', () => {
  const play = () => {
    const g = new Game({ seed: 7, timeline: QUIET });
    flood(g, 90);
    for (let i = 0; i < 150; i++) g.tick({});
    return g;
  };
  const a = play(), b = play();
  assert.equal(a.digest(), b.digest());
  assert.ok(ofType(a, 'megaslime').length >= 1);
  assert.equal(a.snapshot().lastFusion, a.lastFusion);
  const c = play();
  c.lastFusion = null;
  assert.notEqual(c.digest(), a.digest(), 'lastFusion is part of the digest');
});

// ---- art and bestiary ----------------------------------------------------------------------

test('art: gen 1 12×12 and gen 2 9×9 drawn, megaslime 32×32 from the pack; every slime anim has tier variants', () => {
  const info = (anim) => {
    const a = atlas.anims[anim];
    const f = atlas.frames[a.frames[0]];
    return [f.w, f.h, a.ticks];
  };
  assert.deepEqual(info('slime.walk1'), [12, 12, [6, 6, 6, 6]]);
  assert.deepEqual(info('slime.split1'), [12, 12, [8, 20, 4, 4, 4, 4]]);
  assert.deepEqual(info('slime.walk2'), [9, 9, [6, 6, 6, 6]]);
  assert.deepEqual(info('slime.die2'), [9, 9, [6, 6, 6, 6, 6]]);
  assert.deepEqual(info('megaslime.walk').slice(0, 2), [32, 32]);
  assert.equal(atlas.anims['megaslime.walk'].frames.length, 18);
  assert.equal(atlas.anims['megaslime.die'].frames.length, 7);
  assert.deepEqual(info('megaslime.fuse'), [32, 32, [8, 4, 4, 4, 4]]);
  const slimeAnims = ['slime.walk', 'slime.die', 'slime.split', 'slime.walk1', 'slime.split1', 'slime.walk2', 'slime.die2', 'megaslime.walk', 'megaslime.die', 'megaslime.fuse'];
  for (const a of slimeAnims) {
    assert.ok(TIERED_ANIMS.includes(a) && manifest.tiers.anims.includes(a) && ATLAS_NAMES.includes(a), a);
    for (const t of [2, 3, 4]) {
      const [w, h, ticks] = info(`${a}@t${t}`);
      const [pw, ph, pticks] = info(a);
      assert.deepEqual([w, h, ticks], [pw + 2, ph + 2, pticks], `${a}@t${t}`);
    }
  }
});

test('bestiary: 10 cards fit; the slime lists its three sizes, the megaslime its fusion; its sprite clears the pips', () => {
  assert.equal(ENEMY_TYPES.length, 10);
  assert.equal(ENEMY_TYPES.indexOf('megaslime'), ENEMY_TYPES.indexOf('slime') + 1, 'in §8 table order, after the slime');
  const rects = bestiaryLayout(ENEMY_TYPES.length);
  assert.ok(rects.every((r) => r.y + r.h <= BESTIARY.bottom));
  const g = still();
  createEnemy(g, 'slime', 0, 300);
  createEnemy(g, 'megaslime', 0, 300);
  const rows = bestiaryRows(g);
  assert.deepEqual(rows.find((r) => r.type === 'slime').stats, ['HP 3/2/1  XP 1', 'SPD 35  DPS 8', 'MASS 0.8']);
  const m = rows.find((r) => r.type === 'megaslime');
  assert.deepEqual([m.name, m.stats], ['Megaslime', [`HP ${MEGASLIME_HP_FACTOR}×sum  XP sum`, 'SPD 15  DPS 0', 'MASS 4']]);
  assert.deepEqual(m.resists.map((r) => r.label), ['weak 50%', '0%', 'resist 50%']);
  const f = atlas.frames[atlas.anims['megaslime.walk'].frames[0]];
  const c = rects[ENEMY_TYPES.indexOf('megaslime')];
  const dh = f.h * SPRITE_SCALE;
  const top = Math.min(Math.round(c.y + (c.h - dh) / 2), spriteTopMax(c, dh));
  assert.ok(top + dh <= c.y + c.h - BESTIARY.pipBottom - BESTIARY.pip - 1, 'ends above the pips\' black edge');
  assert.ok(top >= c.y, 'inside the card');
  // a 16 px sprite stays centred
  assert.equal(Math.min(Math.round(c.y + (c.h - 32) / 2), spriteTopMax(c, 32)), Math.round(c.y + (c.h - 32) / 2));
});
