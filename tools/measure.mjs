// Balance instrument: plays headless Game runs with scripted bots over a pool of seeds and
// prints Markdown tables (survival time, kills, level, what damaged the tower).
//
// Usage: node tools/measure.mjs [--policy idle|aim|kite|all] [--pick naive|greedy|both] [--gem-range PX]
//                               [--no-dodge] [--seeds N] [--first-seed S] [--max-seconds T]
//                               [--timeline] [--causes] [--step S] [--set k=v ...]
//
// A bot is a movement policy plus a level-up pick rule, named `<policy>+<pick>`.
// Defaults: all three policies with both pick rules, 16 seeds (1..16), 420 s cap (7:00).
// A run that reaches the cap is reported as surviving the cap (shown as ">=T"). Survival
// time is game.t at the tick the tower fell (the phase leaves 'play'). The summary also
// names what ended the fallen runs (the source that took the most tower HP in the last
// 30 s before the fall: an enemy type's contact, or `orb` for mage orbs) and the median
// share of ticks on which the tower moved. With --timeline, a second table per bot shows,
// every --step seconds (default 30), the median over seeds of tower HP, enemies alive,
// kills, spawned so far and level (a run that has fallen counts with its final values).
// With --causes, a third table per bot shows the mean tower HP lost per run in each --step
// window by source, and the HP repaired.
//
// The tower follows the dragon (§7.1), so a bot anchored to the tower drifts across the map
// with it. Every bot is anchored to HOME, the dragon's start point, a fixed world point:
//   idle  no input at all: stands on HOME, the fireball fires right, no gems are collected,
//         no orb is dodged. The tower rests TOWER_REST_DIST below it.
//   aim   stands on HOME and lets the tower come to rest; aims at the enemy nearest the tower.
//   kite  walks a circle of KITE_RADIUS px around HOME (inside the tether, so the tower
//         follows on a smaller circle and keeps moving); aims the same way.
// aim and kite also:
//   gems  fly to the non-homing gem nearest the dragon whenever one lies within GEM_RANGE
//         px of HOME (a gem that has started homing follows the dragon by itself), then
//         go back to their own movement;
//   dodge when a mage orb within DODGE_RANGE px will pass closer than its radius + the
//         dragon's + DODGE_MARGIN, step straight away from its path (the most imminent orb
//         first). This overrides gems and movement. --no-dodge turns it off.
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
import { DT, TIMELINE, ENEMIES, ENEMY_TYPES, DRAGON_START, DRAGON_RADIUS, TOWER_RADIUS } from '../src/sim/content.js';
import { pathToFileURL } from 'node:url';

export const HOME = { x: DRAGON_START.x, y: DRAGON_START.y };
export const KITE_RADIUS = 80;
export const GEM_RANGE = 300; // half the view height: about the gems on screen around HOME
export const DODGE_RANGE = 100;
export const DODGE_MARGIN = 4;
const REPAIR_BELOW = 0.4;
const CAUSE_WINDOW = 30; // s before a fall in which its cause is counted
export const SOURCES = [...ENEMY_TYPES, 'orb'];

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

// The non-homing gem nearest the dragon among those within `range` px of HOME, or null.
export function gemTarget(game, range = GEM_RANGE) {
  const d = game.dragon;
  let best = null, bestD2 = Infinity;
  for (const g of game.gems) {
    if (g.homing) continue;
    if (Math.hypot(g.x - HOME.x, g.y - HOME.y) > range) continue;
    const d2 = (g.x - d.x) ** 2 + (g.y - d.y) ** 2;
    if (d2 < bestD2) { best = g; bestD2 = d2; }
  }
  return best;
}

// The mage orb that threatens the dragon soonest, or null. An orb threatens when it is
// within `range` px, still flying toward its closest approach, gets there before it
// expires, and passes closer than its radius + DRAGON_RADIUS + DODGE_MARGIN.
// Returns { orb, along, mx, my }: `along` the px it still flies to the closest approach,
// (mx, my) that closest point minus the dragon.
export function orbThreat(game, range = DODGE_RANGE) {
  const d = game.dragon;
  let best = null;
  for (const o of game.enemyShots) {
    const px = o.x - d.x, py = o.y - d.y;
    if (px * px + py * py > range * range) continue;
    const along = -(px * o.dx + py * o.dy);
    if (along <= 0 || along > o.range - o.travelled) continue;
    const mx = px + o.dx * along, my = py + o.dy * along;
    if (Math.hypot(mx, my) >= o.r + DRAGON_RADIUS + DODGE_MARGIN) continue;
    if (!best || along < best.along) best = { orb: o, along, mx, my };
  }
  return best;
}

// Unit move straight away from the threat's path. A dead-on orb is sidestepped to the
// side of its path that HOME is on (the left of its flight on screen if HOME is on the line).
export function dodgeMove(game, threat) {
  const { orb, mx, my } = threat;
  const l = Math.hypot(mx, my);
  if (l > 1e-6) return { moveX: -mx / l, moveY: -my / l };
  const d = game.dragon;
  let px = orb.dy, py = -orb.dx;
  if (px * (HOME.x - d.x) + py * (HOME.y - d.y) < 0) { px = -px; py = -py; }
  return { moveX: px, moveY: py };
}

// Unit move toward (x, y), or zero when within `stop` px.
function toward(game, x, y, stop = 2) {
  const d = game.dragon;
  const dx = x - d.x, dy = y - d.y;
  const l = Math.hypot(dx, dy);
  return l <= stop ? { moveX: 0, moveY: 0 } : { moveX: dx / l, moveY: dy / l };
}

// Tangent (counter-clockwise on screen) plus a radial correction toward the circle.
function circleMove(game, cx, cy, radius) {
  const d = game.dragon;
  let rx = d.x - cx, ry = d.y - cy;
  const rl = Math.hypot(rx, ry);
  if (rl < 1e-9) { rx = 1; ry = 0; } else { rx /= rl; ry /= rl; }
  const k = Math.max(-1, Math.min(1, (radius - rl) / 20));
  const mx = ry + rx * k * 2, my = -rx + ry * k * 2;
  const ml = Math.hypot(mx, my);
  return { moveX: mx / ml, moveY: my / ml };
}

// aim and kite: dodge first, then gems, then the policy's own move.
function moving(game, o, own) {
  const threat = o.dodge === false ? null : orbThreat(game);
  if (threat) return dodgeMove(game, threat);
  const gem = gemTarget(game, o.gemRange);
  return gem ? toward(game, gem.x, gem.y, 0) : own();
}

// Movement policies: (game, opts) -> intent without `pick`.
export const POLICIES = {
  idle: () => ({}),
  aim: (game, o = {}) => ({ ...moving(game, o, () => toward(game, HOME.x, HOME.y)), ...aimAt(game, nearestToTower(game)) }),
  kite: (game, o = {}) => ({ ...moving(game, o, () => circleMove(game, HOME.x, HOME.y, KITE_RADIUS)), ...aimAt(game, nearestToTower(game)) }),
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

// Instrument only: wraps this game's collisions step to split the tower HP it takes by
// source, into whole-second buckets `lost[s][source]`. The orbs that will hit are those
// overlapping the dragon when the step starts (nothing in it moves them or the dragon);
// contact is split by the live enemies overlapping the tower afterwards (the step changes
// no position after enemy vs tower, and enemies it kills are already skipped there). The
// split is scaled to the HP actually lost, so a tower clamped at 0 adds up.
function trackDamage(game) {
  const lost = [];
  const step = game.stepCollisions.bind(game);
  game.stepCollisions = () => {
    const d = game.dragon, t = game.tower;
    let orb = 0;
    for (const o of game.enemyShots) {
      const dx = o.x - d.x, dy = o.y - d.y, rr = o.r + DRAGON_RADIUS;
      if (dx * dx + dy * dy < rr * rr) orb += o.damage;
    }
    const hp0 = t.hp;
    step();
    const drop = hp0 - t.hp;
    if (drop <= 0) return;
    const by = { orb };
    let total = orb;
    for (const e of game.enemies) {
      if (e.hp <= 0) continue;
      const rr = e.r + TOWER_RADIUS, dx = e.x - t.x, dy = e.y - t.y;
      if (dx * dx + dy * dy < rr * rr) { const v = ENEMIES[e.type].dps * DT; by[e.type] = (by[e.type] || 0) + v; total += v; }
    }
    const s = Math.floor(game.t + 1e-9);
    const b = lost[s] || (lost[s] = {});
    for (const k in by) if (by[k] > 0) b[k] = (b[k] || 0) + by[k] * drop / total;
  };
  return lost;
}

// One run. Returns { seed, policy, pick, bot, survived, capped, kills, level, spawned,
// samples, lost (per-second HP lost by source), repaired, cause (null if capped), moved }.
export function runOne({ policy, pick = 'naive', seed, maxSeconds = 420, step = 0, timeline, towerHp, gemRange, dodge } = {}) {
  botIntent(new Game({ seed: 1 }), policy, pick); // validates the names
  const game = new Game(timeline ? { seed, timeline } : { seed });
  if (towerHp) { game.tower.hp = towerHp; game.tower.maxHp = towerHp; }
  const lost = trackDamage(game);
  const maxTicks = Math.round(maxSeconds / DT);
  const stepTicks = step > 0 ? Math.round(step / DT) : 0;
  const samples = [];
  const sample = () => samples.push({ t: game.t, hp: game.tower.hp, alive: game.enemies.length, kills: game.kills, spawned: game.spawner.spawned, level: game.level });
  let repaired = 0, movedTicks = 0, worldTicks = 0;
  // Ticks spent with offers open do not advance the clock; bound them so a broken pick
  // flow cannot hang the instrument.
  let guard = maxTicks * 4 + 1000;
  const opts = { gemRange, dodge };
  while (game.phase === 'play' && game.tickCount < maxTicks && guard-- > 0) {
    const before = game.tickCount, hp0 = game.tower.hp, picking = game.offers.length > 0;
    game.tick(botIntent(game, policy, pick, opts));
    if (picking) repaired += game.tower.hp - hp0;
    if (game.tickCount !== before) {
      worldTicks++;
      if (game.tower.moved) movedTicks++;
      if (stepTicks && game.tickCount % stepTicks === 0) sample();
    }
  }
  const capped = game.phase === 'play';
  let cause = null;
  if (!capped) {
    const sum = {};
    for (let s = Math.max(0, Math.floor(game.t) - CAUSE_WINDOW); s < lost.length; s++) {
      for (const k in lost[s] || {}) sum[k] = (sum[k] || 0) + lost[s][k];
    }
    for (const k of SOURCES) if (sum[k] > 0 && (!cause || sum[k] > sum[cause])) cause = k;
  }
  return {
    seed, policy, pick, bot: `${policy}+${pick}`, survived: game.t, capped, kills: game.kills, level: game.level,
    spawned: game.spawner.spawned, samples, lost, repaired, cause, moved: worldTicks ? movedTicks / worldTicks : 0,
  };
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

const fmtT = (x, capped) => (capped ? '>=' : '') + x.toFixed(1);

// "golem 5, slime 3": what ended the fallen runs, most frequent first (ties in SOURCES order).
export function causeText(runs) {
  const n = {};
  for (const r of runs) if (r.cause) n[r.cause] = (n[r.cause] || 0) + 1;
  const keys = SOURCES.filter((k) => n[k]).sort((a, b) => n[b] - n[a]);
  return keys.length ? keys.map((k) => `${k} ${n[k]}`).join(', ') : '-';
}

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
    causes: causeText(runs), moved: median(runs.map((r) => r.moved || 0)),
  };
}

export function summaryTable(rows) {
  const out = ['| Bot | Seeds | Median s | Min s | Max s | Reached 5:00 | Reached cap | Kills (median) | Level (median) | Fall causes | Tower moving |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.policy} | ${r.seeds} | ${r.medianText} | ${r.minText} | ${r.maxText} | ${r.golem} | ${r.capped} | ${r.kills} | ${r.level} | ${r.causes} | ${Math.round(r.moved * 100)}% |`);
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

// Mean tower HP lost per run in each `step`-second window, by source; columns only for
// sources that did any damage. The last column is the mean HP repaired over the whole run.
export function causesTable(runs, step, maxSeconds) {
  const used = SOURCES.filter((k) => runs.some((r) => r.lost.some((b) => b && b[k] > 0)));
  const out = [`| Window | ${used.join(' | ')} | Total |`, `|---|${used.map(() => '---|').join('')}---|`];
  const last = Math.max(...runs.map((r) => r.survived));
  for (let a = 0; a < Math.min(maxSeconds, last + 1e-9); a += step) {
    const sum = Object.fromEntries(used.map((k) => [k, 0]));
    for (const r of runs) for (let s = a; s < a + step; s++) for (const k of used) sum[k] += (r.lost[s] && r.lost[s][k]) || 0;
    const cells = used.map((k) => (sum[k] / runs.length).toFixed(1));
    const total = used.reduce((x, k) => x + sum[k], 0) / runs.length;
    const mmss = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
    out.push(`| ${mmss(a)}–${mmss(a + step)} | ${cells.join(' | ')} | ${total.toFixed(1)} |`);
  }
  out.push(`\nRepaired (mean HP per run): ${(runs.reduce((x, r) => x + r.repaired, 0) / runs.length).toFixed(1)}`);
  return out.join('\n');
}

function parseArgs(argv) {
  const o = { policy: 'all', pick: 'both', gemRange: undefined, dodge: true, seeds: 16, firstSeed: 1, maxSeconds: 420, timeline: false, causes: false, step: 30, set: [] };
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
    else if (a === '--causes') o.causes = true;
    else if (a === '--no-dodge') o.dodge = false;
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
  if (o.help) { console.log('node tools/measure.mjs [--policy idle|aim|kite|all] [--pick naive|greedy|both] [--gem-range PX] [--no-dodge] [--seeds N] [--first-seed S] [--max-seconds T] [--timeline] [--causes] [--step S] [--set k=v ...]'); return; }
  const names = o.policy === 'all' ? Object.keys(POLICIES) : o.policy.split(',');
  const picks = o.pick === 'both' ? Object.keys(PICKS) : o.pick.split(',');
  const { timeline, towerHp } = applySets(o.set);
  const rows = [], all = {};
  const start = process.hrtime.bigint();
  for (const policy of names) {
    for (const pick of picks) {
      const runs = [];
      for (let s = 0; s < o.seeds; s++) {
        runs.push(runOne({ policy, pick, seed: o.firstSeed + s, maxSeconds: o.maxSeconds, step: o.timeline ? o.step : 0, timeline, towerHp, gemRange: o.gemRange, dodge: o.dodge }));
      }
      all[`${policy}+${pick}`] = runs;
      rows.push(summarize(runs, o.maxSeconds));
    }
  }
  const secs = Number(process.hrtime.bigint() - start) / 1e9;
  const notes = [o.gemRange !== undefined ? `gem range ${o.gemRange} px` : '', o.dodge ? '' : 'no dodge', o.set.length ? `set ${o.set.join(' ')}` : ''].filter(Boolean);
  console.log(`Seeds ${o.firstSeed}..${o.firstSeed + o.seeds - 1}, cap ${o.maxSeconds} s${notes.length ? ', ' + notes.join(', ') : ''}\n`);
  console.log(summaryTable(rows));
  for (const bot of Object.keys(all)) {
    if (o.timeline) {
      console.log(`\n**${bot}** (median over seeds, every ${o.step} s)\n`);
      console.log(timelineTable(all[bot], o.step, o.maxSeconds));
    }
    if (o.causes) {
      console.log(`\n**${bot}** tower HP lost by source (mean per run, ${o.step} s windows)\n`);
      console.log(causesTable(all[bot], o.step, o.maxSeconds));
    }
  }
  console.log(`\n(${secs.toFixed(1)} s wall)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
