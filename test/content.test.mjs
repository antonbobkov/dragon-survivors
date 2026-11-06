// content.js must match the tables in docs/demo-spec.md: change both together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/sim/content.js';
import { ANIMS } from '../src/sim/anims.js';

const SPEC = readFileSync(new URL('../docs/demo-spec.md', import.meta.url), 'utf8').split('\n');

// Rows (arrays of trimmed cells) of the first table after the heading starting with `heading`.
function tableAfter(heading) {
  let i = SPEC.findIndex((l) => l.startsWith(heading));
  assert.ok(i >= 0, `heading ${heading} not found`);
  while (!SPEC[i].startsWith('|')) i++;
  const rows = [];
  for (; i < SPEC.length && SPEC[i].startsWith('|'); i++) {
    const cells = SPEC[i].split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue;
    rows.push(cells);
  }
  return rows.slice(1); // drop the header
}
const num = (s) => parseFloat(s.replace(/[`*]/g, '').replace('−', '-'));
const pct = (s) => num(s) / 100;
const specText = SPEC.join('\n');
const specConst = (name) => {
  const m = specText.match(new RegExp('`' + name + ' = (\\d+(?:\\.\\d+)?)'));
  assert.ok(m, `${name} not found in spec`);
  return Number(m[1]);
};

test('content: dragon and tower constants match §6 and §7', () => {
  const consts = Object.fromEntries([...tableAfter('## 6. Dragon'), ...tableAfter('## 7. Tower')]
    .filter((r) => r[0].startsWith('`'))
    .map((r) => [r[0].replace(/`/g, ''), num(r[1])]));
  for (const name of ['DRAGON_SPEED', 'DRAGON_PICKUP_RADIUS', 'TOWER_HP', 'TETHER_LENGTH', 'TOWER_SPEED', 'TOWER_RADIUS']) {
    assert.equal(C[name], consts[name], name);
  }
});

test('content: inline constants match the spec text', () => {
  for (const name of ['MAX_ENEMIES', 'DESPAWN_DIST', 'MAGE_CAST_INTERVAL', 'MAX_GEMS', 'GEM_COLLECT_RADIUS']) assert.equal(C[name], specConst(name), name);
  assert.equal(C.DT, 1 / 60);
  assert.equal(C.GRID_CELL, 64);
  assert.equal(C.SPAWN_RING_RADIUS, 560);
  assert.equal(C.xpToNext(1), 8);
  assert.equal(C.xpToNext(10), 35);
});

test('content: enemy table matches §8', () => {
  const names = { Knight: 'knight', Skeleton: 'skeleton', Slime: 'slime', Mage: 'mage', 'Ghost knight': 'ghostKnight', Ghost: 'ghost', 'Mega golem': 'golem' };
  const rows = tableAfter('## 8. Enemies');
  assert.equal(rows.length, C.ENEMY_TYPES.length);
  for (const [type, hp, speed, r, dps, xp, sprite] of rows) {
    const e = C.ENEMIES[names[type]];
    assert.ok(e, type);
    assert.equal(e.hp, hp === '∞' ? Infinity : num(hp), `${type} hp`);
    assert.equal(e.speed, num(speed), `${type} speed`);
    assert.equal(e.r, num(r), `${type} r`);
    assert.equal(e.dps, num(dps), `${type} dps`);
    assert.equal(e.xp, xp === 'none' ? 0 : num(xp), `${type} xp`);
    const prefix = sprite.replace(/`/g, '');
    assert.ok(e.walk.startsWith(prefix), `${type} walk anim ${e.walk} vs sprite ${prefix}`);
  }
  assert.equal(C.ENEMIES.ghost.alpha, 0.6);
  assert.ok(C.ENEMIES.golem.immovable);
});

test('content: timeline matches §9', () => {
  const cols = ['knight', 'skeleton', 'slime', 'mage', 'ghostKnight'];
  const rows = tableAfter('## 9. Spawning');
  assert.equal(rows.length, C.TIMELINE.length);
  rows.forEach(([time, rate, ...w], i) => {
    const [m, s] = time.split(':').map(Number);
    const row = C.TIMELINE[i];
    assert.equal(row.t, m * 60 + s);
    assert.equal(row.rate, num(rate));
    assert.equal(Boolean(row.golem), rate.includes('golem'));
    assert.deepEqual(Object.keys(row.weights), cols);
    cols.forEach((c, j) => assert.equal(row.weights[c], num(w[j]), `${time} ${c}`));
  });
});

test('content: weapon tables match §10', () => {
  const sections = { fireball: '### 10.1', laser: '### 10.2', miniTower: '### 10.3', ring: '### 10.4' };
  for (const [id, heading] of Object.entries(sections)) {
    const i = SPEC.findIndex((l) => l.startsWith(heading));
    let h = i; while (!SPEC[h].startsWith('|')) h++;
    const header = SPEC[h].split('|').slice(1, -1).map((c) => c.trim());
    const rows = tableAfter(heading);
    assert.equal(rows.length, 5, id);
    rows.forEach((row, lvl) => {
      assert.equal(num(row[0]), lvl + 1);
      header.slice(1).forEach((col, j) => assert.equal(C.WEAPONS[id].levels[lvl][col], num(row[j + 1]), `${id} L${lvl + 1} ${col}`));
      assert.equal(Object.keys(C.WEAPONS[id].levels[lvl]).length, header.length - 1, `${id} L${lvl + 1} extra columns`);
    });
  }
  assert.deepEqual(C.WEAPON_IDS, Object.keys(C.WEAPONS));
});

test('content: buffs match §11', () => {
  const names = { Damage: 'damage', Cooldown: 'cooldown', Area: 'area', 'Projectile speed': 'speed', 'Explode chance': 'explode', 'Split chance': 'split', 'Pierce chance': 'pierce' };
  const rows = tableAfter('## 11. Buffs');
  assert.equal(rows.length, C.BUFF_IDS.length);
  for (const [name, icon, l1, l2, l3] of rows) {
    const b = C.BUFFS[names[name]];
    assert.ok(b, name);
    assert.equal(b.icon, icon.replace(/`/g, ''));
    [l1, l2, l3].forEach((v, i) => assert.ok(Math.abs(b.levels[i] - pct(v)) < 1e-12, `${name} L${i + 1}`));
  }
  assert.deepEqual(Object.keys(C.PROJECTILE_KINDS), ['fireball', 'laser'], 'mini-tower shots are fireballs (§10.3)');
  assert.deepEqual(C.PROJECTILE_KINDS.laser, { explode: false, split: false, pierce: true }, '§12: lasers only pierce');
});

test('content: ATLAS_NAMES lists every §3.3 atlas name and every anim content refers to', () => {
  const manifest = new Set();
  for (const [names] of tableAfter('### 3.3')) {
    for (const m of names.matchAll(/`([^`]+)`/g)) if (m[1] !== 'gem') manifest.add(m[1]);
  }
  assert.deepEqual([...C.ATLAS_NAMES].sort(), [...manifest].sort());
  const used = [];
  for (const e of Object.values(C.ENEMIES)) used.push(e.walk, e.die, e.summon, e.split, e.spell);
  for (const w of Object.values(C.WEAPONS)) used.push(w.anim, w.bigAnim);
  used.push(C.EXPLOSION_ANIM);
  for (const b of Object.values(C.BUFFS)) used.push(b.icon);
  used.push('dragon.dir', 'castle.destroy');
  for (const a of used.filter(Boolean)) assert.ok(C.ATLAS_NAMES.includes(a), a);
});

test('content: every generated anim is a listed atlas name, and the sim core anims exist', () => {
  for (const name of Object.keys(ANIMS)) assert.ok(C.ATLAS_NAMES.includes(name), name);
  // Anims the sim core advances today (the rest are checked against atlas.json by npm run check).
  for (const name of ['knight.walk', 'knight.die', 'fireball.anim', 'fireball.big', 'explosion.small', 'castle.destroy']) {
    assert.ok(ANIMS[name], name);
  }
});

test('content: sound names match §3.3', () => {
  const line = SPEC.find((l) => l.startsWith('Sounds copied as-is'));
  const names = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual(C.SOUND_NAMES, names);
});
