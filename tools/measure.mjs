// Balance instrument: plays headless Game runs with scripted bot policies over a pool of
// seeds and prints Markdown tables (survival time, kills, level).
//
// Usage: node tools/measure.mjs [--policy idle|aim|kite|all] [--seeds N] [--first-seed S]
//                               [--max-seconds T] [--timeline] [--step S] [--set k=v ...]
//
// Defaults: all three policies, 16 seeds (1..16), 180 s cap. A run that reaches the cap is
// reported as surviving the cap (shown as ">=T"). Survival time is game.t at the tick the
// tower fell (the phase leaves 'play'). With --timeline, a second table per policy shows,
// every --step seconds (default 10), the median over seeds of tower HP, enemies alive,
// kills and spawned so far (a run that has fallen counts with its final values).
//
// --set runs a what-if without editing content.js (repeatable): `rate.<row t>=<v>` sets a
// timeline row's rate (row t in seconds), `towerHp=<v>` the starting tower HP, and
// `<enemy>.<field>=<v>` a field of ENEMIES, for example `knight.dps=2` (this mutates the
// table for the rest of the process, so only the CLI does it).
//
// Policies return an intent for one tick. Once level-ups exist (`game.offers` non-empty)
// every policy picks card 0, so a later task can reuse them unchanged.
import { Game } from '../src/sim/game.js';
import { DT, TIMELINE, ENEMIES } from '../src/sim/content.js';
import { pathToFileURL } from 'node:url';

const KITE_RADIUS = 120;

// Nearest live enemy to the tower (ties to the lower list index), or null.
function nearestToTower(game) {
  const t = game.tower;
  let best = null, bestD2 = Infinity;
  for (const e of game.enemies) {
    if (e.hp <= 0) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { best = e; bestD2 = d2; }
  }
  return best;
}

function aimAt(game, e) {
  if (!e) return { aimX: 0, aimY: 0, hasAim: false };
  const d = game.dragon;
  return { aimX: e.x - d.x, aimY: e.y - d.y, hasAim: true };
}

// Level-up seam: pick card 0 when offers are open, else no pick.
const pickOf = (game) => (game.offers && game.offers.length ? 0 : -1);

export const POLICIES = {
  // No move, no aim: fires in the default direction (right).
  idle: (game) => ({ pick: pickOf(game) }),
  // Stationary, aims at the enemy nearest the tower.
  aim: (game) => ({ ...aimAt(game, nearestToTower(game)), pick: pickOf(game) }),
  // Circles the tower counter-clockwise on screen at KITE_RADIUS px, aiming at the enemy
  // nearest the tower. Steering: tangent plus a radial correction toward the radius.
  kite: (game) => {
    const d = game.dragon, t = game.tower;
    let rx = d.x - t.x, ry = d.y - t.y;
    let rl = Math.hypot(rx, ry);
    if (rl < 1e-9) { rx = 1; ry = 0; rl = 1; }
    rx /= rl; ry /= rl;
    const tx = ry, ty = -rx; // tangent
    const k = Math.max(-1, Math.min(1, (KITE_RADIUS - rl) / 30));
    const mx = tx + rx * k * 2, my = ty + ry * k * 2;
    const ml = Math.hypot(mx, my);
    return { moveX: mx / ml, moveY: my / ml, ...aimAt(game, nearestToTower(game)), pick: pickOf(game) };
  },
};

// One run. Returns { seed, policy, survived, capped, kills, level, spawned, samples }.
export function runOne({ policy, seed, maxSeconds = 180, step = 0, timeline, towerHp } = {}) {
  const fn = POLICIES[policy];
  if (!fn) throw new Error(`unknown policy "${policy}"`);
  const game = new Game(timeline ? { seed, timeline } : { seed });
  if (towerHp) { game.tower.hp = towerHp; game.tower.maxHp = towerHp; }
  const maxTicks = Math.round(maxSeconds / DT);
  const stepTicks = step > 0 ? Math.round(step / DT) : 0;
  const samples = [];
  const sample = () => samples.push({ t: game.t, hp: game.tower.hp, alive: game.enemies.length, kills: game.kills, spawned: game.spawner.spawned });
  // Ticks spent with offers open do not advance the clock; bound them so a broken pick
  // flow cannot hang the instrument.
  let guard = maxTicks * 4 + 1000;
  while (game.phase === 'play' && game.tickCount < maxTicks && guard-- > 0) {
    const before = game.tickCount;
    game.tick(fn(game));
    if (stepTicks && game.tickCount !== before && game.tickCount % stepTicks === 0) sample();
  }
  const capped = game.phase === 'play';
  return {
    seed, policy, survived: game.t, capped, kills: game.kills, level: game.level,
    spawned: game.spawner.spawned, samples,
  };
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

const fmtT = (x, capped) => (capped ? '>=' : '') + x.toFixed(1);

// Summary row for one policy's runs.
export function summarize(runs, maxSeconds) {
  const ts = runs.map((r) => r.survived);
  const med = median(ts), min = Math.min(...ts), max = Math.max(...ts);
  const capT = (x) => x >= maxSeconds - DT / 2;
  return {
    policy: runs[0].policy, seeds: runs.length,
    median: med, min, max, capped: runs.filter((r) => r.capped).length,
    medianText: fmtT(med, capT(med)), minText: fmtT(min, capT(min)), maxText: fmtT(max, capT(max)),
    kills: median(runs.map((r) => r.kills)), level: median(runs.map((r) => r.level)),
  };
}

export function summaryTable(rows) {
  const out = ['| Policy | Seeds | Median s | Min s | Max s | Reached cap | Kills (median) | Level (median) |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.policy} | ${r.seeds} | ${r.medianText} | ${r.minText} | ${r.maxText} | ${r.capped} | ${r.kills} | ${r.level} |`);
  return out.join('\n');
}

// Median over seeds at each sample time; a fallen run contributes its final values.
export function timelineTable(runs, step, maxSeconds) {
  const out = [`| t s | Tower HP | Enemies alive | Kills | Spawned |`, '|---|---|---|---|---|'];
  for (let t = step; t <= maxSeconds + 1e-9; t += step) {
    const at = runs.map((r) => {
      const s = r.samples.filter((x) => x.t <= t + 1e-9);
      const last = s[s.length - 1];
      if (last && Math.abs(last.t - t) < 1e-6) return last;
      return { hp: 0, alive: last ? last.alive : 0, kills: r.kills, spawned: r.spawned, fallen: true };
    });
    const fallen = at.filter((x) => x.fallen).length;
    const m = (k) => median(at.map((x) => x[k]));
    out.push(`| ${Math.round(t)} | ${m('hp').toFixed(0)} | ${m('alive')} | ${m('kills')} | ${m('spawned')}${fallen ? ` (${fallen} fallen)` : ''} |`);
    if (fallen === runs.length) break;
  }
  return out.join('\n');
}

function parseArgs(argv) {
  const o = { policy: 'all', seeds: 16, firstSeed: 1, maxSeconds: 180, timeline: false, step: 10, set: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--policy') { o.policy = v; i++; }
    else if (a === '--seeds') { o.seeds = Number(v); i++; }
    else if (a === '--first-seed') { o.firstSeed = Number(v); i++; }
    else if (a === '--max-seconds') { o.maxSeconds = Number(v); i++; }
    else if (a === '--step') { o.step = Number(v); i++; }
    else if (a === '--set') { o.set.push(v); i++; }
    else if (a === '--timeline') o.timeline = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

// --set overrides: returns { timeline, towerHp } for runOne; enemy fields are written to ENEMIES.
export function applySets(sets) {
  let timeline, towerHp;
  for (const s of sets) {
    const m = /^([A-Za-z]+)\.?([A-Za-z0-9]*)=(-?\d+(?:\.\d+)?)$/.exec(s || '');
    if (!m) throw new Error(`bad --set "${s}"`);
    const [, a, b, v] = m;
    const x = Number(v);
    if (a === 'towerHp' && !b) towerHp = x;
    else if (a === 'rate') {
      timeline = timeline || TIMELINE.map((r) => ({ ...r }));
      const row = timeline.find((r) => r.t === Number(b));
      if (!row) throw new Error(`no timeline row at t=${b}`);
      row.rate = x;
    } else if (ENEMIES[a] && b in ENEMIES[a]) ENEMIES[a][b] = x;
    else throw new Error(`bad --set "${s}"`);
  }
  return { timeline, towerHp };
}

export function main(argv) {
  const o = parseArgs(argv);
  if (o.help) { console.log('node tools/measure.mjs [--policy idle|aim|kite|all] [--seeds N] [--first-seed S] [--max-seconds T] [--timeline] [--step S] [--set k=v ...]'); return; }
  const names = o.policy === 'all' ? Object.keys(POLICIES) : o.policy.split(',');
  const { timeline, towerHp } = applySets(o.set);
  const rows = [], all = {};
  const start = process.hrtime.bigint();
  for (const policy of names) {
    const runs = [];
    for (let s = 0; s < o.seeds; s++) {
      runs.push(runOne({ policy, seed: o.firstSeed + s, maxSeconds: o.maxSeconds, step: o.timeline ? o.step : 0, timeline, towerHp }));
    }
    all[policy] = runs;
    rows.push(summarize(runs, o.maxSeconds));
  }
  const secs = Number(process.hrtime.bigint() - start) / 1e9;
  console.log(`Seeds ${o.firstSeed}..${o.firstSeed + o.seeds - 1}, cap ${o.maxSeconds} s${o.set.length ? `, set ${o.set.join(' ')}` : ''}\n`);
  console.log(summaryTable(rows));
  if (o.timeline) {
    for (const policy of names) {
      console.log(`\n**${policy}** (median over seeds, every ${o.step} s)\n`);
      console.log(timelineTable(all[policy], o.step, o.maxSeconds));
    }
  }
  console.log(`\n(${secs.toFixed(1)} s wall)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
