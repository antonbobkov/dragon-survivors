// Balance instrument: plays headless Game runs with scripted bots over a pool of seeds and
// prints Markdown tables (survival time, kills, level).
//
// Usage: node tools/measure.mjs [--policy idle|aim|kite|all] [--pick naive|greedy|both] [--gem-range PX]
//                               [--seeds N] [--first-seed S] [--max-seconds T]
//                               [--timeline] [--step S] [--set k=v ...]
//
// A bot is a movement policy plus a level-up pick rule, named `<policy>+<pick>`.
// Defaults: all three policies with both pick rules, 16 seeds (1..16), 420 s cap (7:00).
// A run that reaches the cap is reported as surviving the cap (shown as ">=T"). Survival
// time is game.t at the tick the tower fell (the phase leaves 'play'). With --timeline, a
// second table per bot shows, every --step seconds (default 30), the median over seeds of
// tower HP, enemies alive, kills, spawned so far and level (a run that has fallen counts
// with its final values).
//
// Movement policies (all aim at the enemy nearest the tower, except idle):
//   idle  no input at all: the fireball fires right, no gems are collected.
//   aim   holds station 60 px above the tower; flies to gems (below).
//   kite  circles the tower at 120 px; flies to gems (below).
// Gems: when a gem lies within GEM_RANGE px of the tower, aim and kite fly to the one
// nearest the dragon instead of their own movement (a gem that has started homing follows
// the dragon by itself, so it is not chased).
//
// Pick rules (only while `game.offers` is non-empty; the pick tick does not advance time):
//   naive   card 0.
//   greedy  Repair when tower HP < 40%; else a new weapon while a slot is free; else the
//           upgrade of the highest-level weapon below 5; else a buff (upgrade an owned one
//           first, then a new one); else card 0.
//
// --set runs a what-if without editing content.js (repeatable): `rate.<row t>=<v>` sets a
// timeline row's rate (row t in seconds), `towerHp=<v>` the starting tower HP, and
// `<enemy>.<field>=<v>` a field of ENEMIES, for example `knight.dps=2` (this mutates the
// table for the rest of the process, so only the CLI does it).
import { Game } from '../src/sim/game.js';
import { DT, TIMELINE, ENEMIES } from '../src/sim/content.js';
import { pathToFileURL } from 'node:url';

const KITE_RADIUS = 120;
const STATION = { x: 0, y: -60 }; // aim's station relative to the tower (the start layout)
export const GEM_RANGE = 400; // about what is on screen around the tower
const REPAIR_BELOW = 0.4;

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

// The non-homing gem nearest the dragon among those within GEM_RANGE of the tower, or null.
export function gemTarget(game, range = GEM_RANGE) {
  const d = game.dragon, t = game.tower;
  let best = null, bestD2 = Infinity;
  for (const g of game.gems) {
    if (g.homing) continue;
    if (Math.hypot(g.x - t.x, g.y - t.y) > range) continue;
    const d2 = (g.x - d.x) ** 2 + (g.y - d.y) ** 2;
    if (d2 < bestD2) { best = g; bestD2 = d2; }
  }
  return best;
}

// Unit move toward (x, y), or zero when within `stop` px.
function toward(game, x, y, stop = 2) {
  const d = game.dragon;
  const dx = x - d.x, dy = y - d.y;
  const l = Math.hypot(dx, dy);
  return l <= stop ? { moveX: 0, moveY: 0 } : { moveX: dx / l, moveY: dy / l };
}

function kiteMove(game) {
  const d = game.dragon, t = game.tower;
  let rx = d.x - t.x, ry = d.y - t.y;
  let rl = Math.hypot(rx, ry);
  if (rl < 1e-9) { rx = 1; ry = 0; rl = 1; }
  rx /= rl; ry /= rl;
  const tx = ry, ty = -rx; // tangent, counter-clockwise on screen
  const k = Math.max(-1, Math.min(1, (KITE_RADIUS - rl) / 30));
  const mx = tx + rx * k * 2, my = ty + ry * k * 2;
  const ml = Math.hypot(mx, my);
  return { moveX: mx / ml, moveY: my / ml };
}

// Movement policies: game -> intent without `pick`.
export const POLICIES = {
  idle: () => ({}),
  aim: (game, o = {}) => {
    const gem = gemTarget(game, o.gemRange);
    const t = game.tower;
    const move = gem ? toward(game, gem.x, gem.y, 0) : toward(game, t.x + STATION.x, t.y + STATION.y);
    return { ...move, ...aimAt(game, nearestToTower(game)) };
  },
  kite: (game, o = {}) => {
    const gem = gemTarget(game, o.gemRange);
    const move = gem ? toward(game, gem.x, gem.y, 0) : kiteMove(game);
    return { ...move, ...aimAt(game, nearestToTower(game)) };
  },
};

const indexWhere = (offers, fn) => offers.findIndex(fn);

// Pick rules: game (with offers open) -> card index.
export const PICKS = {
  naive: () => 0,
  greedy: (game) => {
    const o = game.offers;
    const tw = game.tower;
    let i;
    if (tw.hp < REPAIR_BELOW * tw.maxHp && (i = indexWhere(o, (c) => c.kind === 'repair')) >= 0) return i;
    if ((i = indexWhere(o, (c) => c.kind === 'weapon' && c.level === 1)) >= 0) return i;
    let best = -1, bestLevel = -1;
    o.forEach((c, k) => { if (c.kind === 'weapon' && c.level > bestLevel) { best = k; bestLevel = c.level; } });
    if (best >= 0) return best;
    if ((i = indexWhere(o, (c) => c.kind === 'buff' && c.level > 1)) >= 0) return i;
    if ((i = indexWhere(o, (c) => c.kind === 'buff')) >= 0) return i;
    return 0;
  },
};

// The intent of bot `policy` + `pick` for one tick.
export function botIntent(game, policy, pick = 'naive', opts = {}) {
  const p = POLICIES[policy], k = PICKS[pick];
  if (!p) throw new Error(`unknown policy "${policy}"`);
  if (!k) throw new Error(`unknown pick rule "${pick}"`);
  return { ...p(game, opts), pick: game.offers.length ? k(game) : -1 };
}

// One run. Returns { seed, policy, pick, bot, survived, capped, kills, level, spawned, samples }.
export function runOne({ policy, pick = 'naive', seed, maxSeconds = 420, step = 0, timeline, towerHp, gemRange } = {}) {
  botIntent(new Game({ seed: 1 }), policy, pick); // validates the names
  const game = new Game(timeline ? { seed, timeline } : { seed });
  if (towerHp) { game.tower.hp = towerHp; game.tower.maxHp = towerHp; }
  const maxTicks = Math.round(maxSeconds / DT);
  const stepTicks = step > 0 ? Math.round(step / DT) : 0;
  const samples = [];
  const sample = () => samples.push({ t: game.t, hp: game.tower.hp, alive: game.enemies.length, kills: game.kills, spawned: game.spawner.spawned, level: game.level });
  // Ticks spent with offers open do not advance the clock; bound them so a broken pick
  // flow cannot hang the instrument.
  let guard = maxTicks * 4 + 1000;
  while (game.phase === 'play' && game.tickCount < maxTicks && guard-- > 0) {
    const before = game.tickCount;
    game.tick(botIntent(game, policy, pick, { gemRange }));
    if (stepTicks && game.tickCount !== before && game.tickCount % stepTicks === 0) sample();
  }
  const capped = game.phase === 'play';
  return {
    seed, policy, pick, bot: `${policy}+${pick}`, survived: game.t, capped, kills: game.kills, level: game.level,
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

// Summary row for one bot's runs. `golem` counts runs that reached 5:00.
export function summarize(runs, maxSeconds) {
  const ts = runs.map((r) => r.survived);
  const med = median(ts), min = Math.min(...ts), max = Math.max(...ts);
  const capT = (x) => x >= maxSeconds - DT / 2;
  return {
    policy: runs[0].bot || runs[0].policy, seeds: runs.length,
    median: med, min, max, capped: runs.filter((r) => r.capped).length,
    golem: runs.filter((r) => r.survived >= 300 - DT / 2).length,
    medianText: fmtT(med, capT(med)), minText: fmtT(min, capT(min)), maxText: fmtT(max, capT(max)),
    kills: median(runs.map((r) => r.kills)), level: median(runs.map((r) => r.level)),
  };
}

export function summaryTable(rows) {
  const out = ['| Bot | Seeds | Median s | Min s | Max s | Reached 5:00 | Reached cap | Kills (median) | Level (median) |', '|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.policy} | ${r.seeds} | ${r.medianText} | ${r.minText} | ${r.maxText} | ${r.golem} | ${r.capped} | ${r.kills} | ${r.level} |`);
  return out.join('\n');
}

// Median over seeds at each sample time; a fallen run contributes its final values.
export function timelineTable(runs, step, maxSeconds) {
  const out = [`| t s | Tower HP | Enemies alive | Kills | Spawned | Level |`, '|---|---|---|---|---|---|'];
  for (let t = step; t <= maxSeconds + 1e-9; t += step) {
    const at = runs.map((r) => {
      const s = r.samples.filter((x) => x.t <= t + 1e-9);
      const last = s[s.length - 1];
      if (last && Math.abs(last.t - t) < 1e-6) return last;
      return { hp: 0, alive: last ? last.alive : 0, kills: r.kills, spawned: r.spawned, level: r.level, fallen: true };
    });
    const fallen = at.filter((x) => x.fallen).length;
    const m = (k) => median(at.map((x) => x[k]));
    out.push(`| ${Math.round(t)} | ${m('hp').toFixed(0)} | ${m('alive')} | ${m('kills')} | ${m('spawned')}${fallen ? ` (${fallen} fallen)` : ''} | ${m('level')} |`);
    if (fallen === runs.length) break;
  }
  return out.join('\n');
}

function parseArgs(argv) {
  const o = { policy: 'all', pick: 'both', gemRange: undefined, seeds: 16, firstSeed: 1, maxSeconds: 420, timeline: false, step: 30, set: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--policy') { o.policy = v; i++; }
    else if (a === '--pick') { o.pick = v; i++; }
    else if (a === '--gem-range') { o.gemRange = Number(v); i++; }
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
  if (o.help) { console.log('node tools/measure.mjs [--policy idle|aim|kite|all] [--pick naive|greedy|both] [--gem-range PX] [--seeds N] [--first-seed S] [--max-seconds T] [--timeline] [--step S] [--set k=v ...]'); return; }
  const names = o.policy === 'all' ? Object.keys(POLICIES) : o.policy.split(',');
  const picks = o.pick === 'both' ? Object.keys(PICKS) : o.pick.split(',');
  const { timeline, towerHp } = applySets(o.set);
  const rows = [], all = {};
  const start = process.hrtime.bigint();
  for (const policy of names) {
    for (const pick of picks) {
      const runs = [];
      for (let s = 0; s < o.seeds; s++) {
        runs.push(runOne({ policy, pick, seed: o.firstSeed + s, maxSeconds: o.maxSeconds, step: o.timeline ? o.step : 0, timeline, towerHp, gemRange: o.gemRange }));
      }
      all[`${policy}+${pick}`] = runs;
      rows.push(summarize(runs, o.maxSeconds));
    }
  }
  const secs = Number(process.hrtime.bigint() - start) / 1e9;
  console.log(`Seeds ${o.firstSeed}..${o.firstSeed + o.seeds - 1}, cap ${o.maxSeconds} s${o.gemRange !== undefined ? `, gem range ${o.gemRange} px` : ''}${o.set.length ? `, set ${o.set.join(' ')}` : ''}\n`);
  console.log(summaryTable(rows));
  if (o.timeline) {
    for (const bot of Object.keys(all)) {
      console.log(`\n**${bot}** (median over seeds, every ${o.step} s)\n`);
      console.log(timelineTable(all[bot], o.step, o.maxSeconds));
    }
  }
  console.log(`\n(${secs.toFixed(1)} s wall)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
