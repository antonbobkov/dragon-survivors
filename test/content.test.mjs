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
  for (const name of ['DRAGON_SPEED', 'DRAGON_PICKUP_RADIUS', 'FACING_DEADZONE', 'DRAGON_RADIUS', 'TOWER_HP', 'TETHER_LENGTH', 'TOWER_FOLLOW_SPEED', 'TOWER_REST_DIST', 'TOWER_RADIUS']) {
    assert.equal(C[name], consts[name], name);
  }
});

test('content: the golem constants match §8.10', () => {
  const consts = Object.fromEntries(tableAfter('### 8.10').map((r) => [r[0].replace(/`/g, ''), num(r[1])]));
  const names = ['GOLEM_POISE', 'GOLEM_POISE_GROWTH', 'GOLEM_POISE_DECAY', 'GOLEM_STAGGER_DIST', 'GOLEM_STAGGER_TIME', 'GOLEM_STAGGER_HOLD', 'GOLEM_SHOVE_DIST', 'GOLEM_SHOVE_INTERVAL', 'GOLEM_STEP_RANGE'];
  assert.deepEqual(Object.keys(consts).sort(), [...names].sort());
  for (const name of names) assert.equal(C[name], consts[name], name);
  assert.deepEqual(C.GOLEM_STEP_FRAMES, [3, 6]);
  assert.ok(specText.includes('frame 3 or 6 of `golem.walk`'));
  assert.ok(C.GOLEM_STEP_FRAMES.every((f) => f < ANIMS['golem.walk'].ticks.length));
});

test('content: inline constants match the spec text', () => {
  for (const name of ['MAX_ENEMIES', 'DESPAWN_DIST', 'MAGE_CAST_INTERVAL', 'MAX_GEMS', 'GEM_COLLECT_RADIUS', 'REPAIR_OFFER_BELOW', 'EXPLODE_KNOCK']) assert.equal(C[name], specConst(name), name);
  assert.equal(C.GOLEM_KNOCKBACK, undefined, 'the golem has poise, not a fixed knockback (§8.10)');
  assert.equal(C.DT, 1 / 60);
  assert.equal(C.GRID_CELL, 64);
  assert.equal(C.SPAWN_RING_RADIUS, 560);
  const xp = specText.match(/`xpToNext\(level\) = (\d+) \+ (\d+) × level` \(level 1 needs (\d+), level 10 needs (\d+)\)/);
  assert.ok(xp, 'xpToNext formula in §14');
  const [a, b, at1, at10] = xp.slice(1).map(Number);
  for (let l = 1; l <= 60; l++) assert.equal(C.xpToNext(l), a + b * l, `xpToNext(${l})`);
  assert.equal(C.xpToNext(1), at1);
  assert.equal(C.xpToNext(10), at10);
});

test('content: mage orb constants match §8.5', () => {
  const rows = tableAfter('### 8.5');
  const consts = Object.fromEntries(rows.filter((r) => r[0].startsWith('`')).map((r) => [r[0].replace(/`/g, ''), num(r[1])]));
  for (const name of ['MAGE_ORB_RANGE', 'MAGE_ORB_INTERVAL', 'MAGE_ORB_SPEED', 'MAGE_ORB_DAMAGE']) assert.equal(C[name], consts[name], name);
  const orb = rows.find((r) => r[0] === 'Orb')[1];
  assert.equal(orb, `radius ${C.MAGE_ORB_R} px, flies ${C.MAGE_ORB_TRAVEL} px, sprite \`${C.MAGE_ORB_ANIM}\`, hit sound \`${C.MAGE_ORB_SOUND}\``);
  assert.ok(C.SOUND_NAMES.includes(C.MAGE_ORB_SOUND));
});

test('content: enemy table matches §8', () => {
  const names = { Knight: 'knight', Skeleton: 'skeleton', Slime: 'slime', Megaslime: 'megaslime', Mage: 'mage', 'Ghost knight': 'ghostKnight', Ghost: 'ghost', Horse: 'horse', 'Mounted knight': 'mountedKnight', 'Mega golem': 'golem' };
  const rows = tableAfter('## 8. Enemies');
  assert.equal(rows.length, C.ENEMY_TYPES.length);
  assert.deepEqual(rows.map((r) => names[r[0]]), C.ENEMY_TYPES, 'ENEMY_TYPES in table order (the bestiary order, §17.1)');
  for (const [type, hp, speed, r, dps, xp, mass, fire, arcane, physical, sprite] of rows) {
    const e = C.ENEMIES[names[type]];
    assert.ok(e, type);
    assert.deepEqual(e.resist, { fire: num(fire), arcane: num(arcane), physical: num(physical) }, `${type} resistances (§8, §12.1)`);
    for (const t of C.DAMAGE_TYPES) assert.ok(e.resist[t] >= C.RESIST_MIN && e.resist[t] <= 1, `${type} ${t} in [-0.5, 1]`);
    // A slime's HP and radius are three numbers, gen 0 / 1 / 2 (§8.4); the megaslime's HP and XP
    // come from its fusion (§8.9): `4 × fused` and `fused`.
    const many = (cell) => cell.split('/').map(num);
    if (e.gens) {
      assert.deepEqual(e.gens.map((g) => g.hp), many(hp), `${type} hp per generation`);
      assert.deepEqual(e.gens.map((g) => g.r), many(r), `${type} r per generation`);
    }
    if (e.fused) {
      assert.equal(hp, `${C.MEGASLIME_HP_FACTOR} × fused`, `${type} hp`);
      assert.equal(xp, 'fused', `${type} xp`);
      assert.deepEqual([e.hp, e.xp], [null, null]);
    } else {
      assert.equal(e.hp, hp === '∞' ? Infinity : num(hp), `${type} hp`);
      assert.equal(e.xp, xp === 'none' ? 0 : num(xp), `${type} xp`);
    }
    assert.equal(e.speed, num(speed), `${type} speed`);
    assert.equal(e.r, num(r), `${type} r`);
    assert.equal(e.dps, num(dps), `${type} dps`);
    assert.equal(e.mass, mass === 'none' ? null : num(mass), `${type} mass (§8.7)`);
    if (mass !== 'none') assert.ok(e.mass > 0, `${type} mass > 0`);
    const prefix = sprite.replace(/`/g, '');
    assert.ok(e.walk.startsWith(prefix), `${type} walk anim ${e.walk} vs sprite ${prefix}`);
  }
  assert.equal(C.ENEMIES.ghost.alpha, 0.6);
  assert.ok(C.ENEMIES.golem.immovable);
});

test('content: timeline matches §9', () => {
  const cols = ['knight', 'skeleton', 'slime', 'mage', 'ghostKnight', 'mountedKnight'];
  const rows = tableAfter('## 9. Spawning');
  assert.equal(rows.length, C.TIMELINE.length);
  rows.forEach(([time, rate, ...cells], i) => {
    // The last column is the stampede (§8.8): `every N s, min–max` or `–`.
    const st = cells.pop();
    const w = cells;
    const [m, s] = time.split(':').map(Number);
    const row = C.TIMELINE[i];
    assert.equal(row.t, m * 60 + s);
    assert.equal(row.rate, num(rate));
    assert.equal(Boolean(row.golem), rate.includes('golem'));
    assert.deepEqual(Object.keys(row.weights), cols);
    cols.forEach((c, j) => assert.equal(row.weights[c], num(w[j]), `${time} ${c}`));
    // Tier weights (§8.6): Plain, Bronze, Silver, Gold; `–` when the row has none.
    const tw = w.slice(cols.length);
    assert.equal(tw.length, C.TIER_IDS.length, `${time} tier columns`);
    if (tw.every((c) => c === '–')) assert.equal(row.tiers, undefined, `${time} has no tier weights`);
    else C.TIER_IDS.forEach((t, j) => assert.equal(row.tiers[t], num(tw[j]), `${time} tier ${t}`));
    if (st === '–') assert.equal(row.stampede, undefined, `${time} has no stampede`);
    else {
      const m = /^every (\d+) s, (\d+)–(\d+)$/.exec(st);
      assert.ok(m, `${time} stampede cell "${st}"`);
      assert.deepEqual(row.stampede, { every: Number(m[1]), min: Number(m[2]), max: Number(m[3]) }, `${time} stampede`);
    }
  });
});

test('content: stages match §9.1', () => {
  const rows = tableAfter('### 9.1');
  const staged = C.TIMELINE.filter((r) => r.stage);
  assert.equal(rows.length, staged.length);
  rows.forEach(([stage, starts], i) => {
    const [m, s] = starts.split(':').map(Number);
    assert.equal(stage, `${i + 1} ${staged[i].stage}`);
    assert.equal(staged[i].t, m * 60 + s, stage);
  });
  assert.equal(C.BANNER_TIME, Number(specText.match(/`BANNER_TIME = (\d+(?:\.\d+)?)` s/)[1]));
  assert.equal(C.BANNER_FADE, Number(specText.match(/`BANNER_FADE = (\d+(?:\.\d+)?)` s/)[1]));
  const sp = tableAfter('### 8.8').find((r) => r[0] === '`STAMPEDE_SPACING`');
  assert.equal(C.STAMPEDE_SPACING, num(sp[1]));
});

test('content: tier table matches §8.6', () => {
  const rows = tableAfter('### 8.6');
  assert.equal(rows.length, C.TIER_IDS.length);
  rows.forEach(([tier, name, , , scale, hp, dps, xp, speed, radius], i) => {
    const t = C.TIERS[C.TIER_IDS[i]];
    assert.equal(num(tier), C.TIER_IDS[i]);
    assert.equal(name.toLowerCase(), t.name.toLowerCase());
    assert.equal(num(scale), t.scale, `${name} scale`);
    for (const [k, v] of [['hp', hp], ['dps', dps], ['xp', xp], ['speed', speed], ['r', radius]]) {
      assert.equal(num(v.replace('×', '')), t[k], `${name} ${k}`);
    }
    assert.ok(Number.isInteger(t.scale), 'integer screen scales only');
  });
});

test('content: weapon tables match §10', () => {
  const sections = { fireball: '### 10.1', laser: '### 10.2', miniTower: '### 10.3', ring: '### 10.4', leftClaw: '### 10.5', rightClaw: '### 10.6', dualClaw: '### 10.7', bite: '### 10.8', saw: '### 10.9' };
  for (const [id, heading] of Object.entries(sections)) {
    const i = SPEC.findIndex((l) => l.startsWith(heading));
    let h = i; while (!SPEC[h].startsWith('|')) h++;
    const header = SPEC[h].split('|').slice(1, -1).map((c) => c.trim());
    const rows = tableAfter(heading);
    assert.equal(rows.length, C.WEAPONS[id].evolution ? 1 : C.WEAPON_MAX_LEVEL, id);
    assert.equal(C.weaponMaxLevel(id), rows.length, `${id} top level`);
    rows.forEach((row, lvl) => {
      assert.equal(num(row[0]), lvl + 1);
      header.slice(1).forEach((col, j) => assert.equal(C.WEAPONS[id].levels[lvl][col], num(row[j + 1]), `${id} L${lvl + 1} ${col}`));
      assert.equal(Object.keys(C.WEAPONS[id].levels[lvl]).length, header.length - 1, `${id} L${lvl + 1} extra columns`);
    });
  }
  assert.deepEqual(C.WEAPON_IDS, Object.keys(C.WEAPONS));
  // knock per weapon (§10 intro, §8.7)
  const knockNames = { Fireball: 'fireball', Laser: 'laser', 'Mini tower (its shots)': 'miniTower', Ring: 'ring', 'Left claw': 'leftClaw', 'Right claw': 'rightClaw', 'Dual claw': 'dualClaw', Bite: 'bite', 'Saw blade': 'saw' };
  const knocks = tableAfter('## 10. Weapons');
  assert.equal(knocks.length, C.WEAPON_IDS.length);
  for (const [name, k] of knocks) assert.equal(C.WEAPONS[knockNames[name]].knock, num(k), `${name} knock`);
  assert.equal(C.WEAPONS.fireball.spreadStep, Number(specText.match(/`spreadStep = (\d+)°`/)[1]), 'fireball spreadStep (§10.1)');
});

test('content: buffs match §11, affinity matches §12', () => {
  const rows = tableAfter('## 11. Buffs');
  assert.deepEqual(rows.map((r) => r[0]), C.BUFF_IDS.map((id) => C.BUFFS[id].name), 'names and pool order (§14.1)');
  for (const [name, icon, l1, l2, l3] of rows) {
    const b = Object.values(C.BUFFS).find((x) => x.name === name);
    assert.equal(b.icon, icon.replace(/`/g, ''));
    // Amount's values are counts (+1), every other a percentage
    [l1, l2, l3].forEach((v, i) => assert.ok(Math.abs(b.levels[i] - (b.kind === 'count' ? num(v) : pct(v))) < 1e-12, `${name} L${i + 1}`));
  }
  const aff = tableAfter('**Affinity.**');
  assert.deepEqual(aff.map((r) => r[0]), ['Explode', 'Split', 'Pierce']);
  for (const [name, fire, arcane] of aff) {
    const b = Object.values(C.BUFFS).find((x) => x.name === name);
    const lvl = (c) => (c === 'never' ? undefined : num(c.replace('L', '')));
    assert.deepEqual(b.affinity, Object.fromEntries([['fire', lvl(fire)], ['arcane', lvl(arcane)]].filter(([, v]) => v !== undefined)), `${name} affinity`);
  }
  assert.deepEqual(Object.keys(C.PROJECTILE_KINDS), ['fireball', 'laser'], 'mini-tower shots are fireballs (§10.3)');
  assert.deepEqual(C.PROJECTILE_KINDS.laser, { type: 'arcane' }, 'procs follow the damage type (§12)');
});

test('content: ATLAS_NAMES lists every §3.3 atlas name and every anim content refers to', () => {
  const manifest = new Set();
  for (const [names] of tableAfter('### 3.3')) {
    for (const m of names.matchAll(/`([^`]+)`/g)) if (m[1] !== 'gem') manifest.add(m[1]);
  }
  // Art drawn ahead of its feature (manifest `art` / `from` entries) may wait to be listed until used.
  const entries = JSON.parse(readFileSync(new URL('../tools/manifest.json', import.meta.url), 'utf8')).entries;
  const ahead = new Set(entries.filter((e) => e.art || e.from).map((e) => e.name));
  // Tier variants (§3.3's tier row, §8.6) are named `<anim>@t<tier>` after a tiered anim.
  const tierName = (n) => { const m = /^(.+)@t(\d)$/.exec(n); return m && C.TIERED_ANIMS.includes(m[1]) && C.TIER_IDS.includes(Number(m[2])) && m[2] !== '1'; };
  for (const n of C.ATLAS_NAMES) assert.ok(manifest.has(n) || tierName(n), `${n} is not in spec §3.3`);
  assert.equal(C.ATLAS_NAMES.filter(tierName).length, C.TIERED_ANIMS.length * (C.TIER_IDS.length - 1), 'every tiered anim at every tier above 1');
  for (const n of manifest) assert.ok(C.ATLAS_NAMES.includes(n) || ahead.has(n), `${n} is missing from ATLAS_NAMES`);
  assert.equal(new Set(C.ATLAS_NAMES).size, C.ATLAS_NAMES.length, 'no duplicates');
  const used = [];
  for (const e of Object.values(C.ENEMIES)) used.push(e.walk, e.die, e.summon, e.split, e.spell);
  for (const w of Object.values(C.WEAPONS)) used.push(w.anim, w.bigAnim);
  used.push(C.EXPLOSION_ANIM, ...Object.values(C.EXPLOSION_ANIMS), C.MAGE_ORB_ANIM);
  for (const b of Object.values(C.BUFFS)) used.push(b.icon);
  used.push(C.DRAGON_ANIM, 'castle.destroy');
  for (const a of used.filter(Boolean)) assert.ok(C.ATLAS_NAMES.includes(a), a);
});

test('content: every generated anim is a listed atlas name, and the sim core anims exist', () => {
  // Art drawn or generated ahead of its feature (manifest `art` / `from` entries) joins ATLAS_NAMES
  // when the game starts using it; every pack import must already be listed.
  const manifest = JSON.parse(readFileSync(new URL('../tools/manifest.json', import.meta.url), 'utf8'));
  const ahead = new Set(manifest.entries.filter((e) => e.art || e.from).map((e) => e.name));
  for (const name of Object.keys(ANIMS)) assert.ok(C.ATLAS_NAMES.includes(name) || ahead.has(name), name);
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
