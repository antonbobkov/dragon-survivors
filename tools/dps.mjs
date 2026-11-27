// Damage calculator: what can a build kill at each point of the run? (spec §20, tools/dps.md)
//
// Usage: node tools/dps.mjs [--near N | --view-time S] [--min-near N] [--radius PX]
//                           [--levels L1,L2,...] [--seeds N] [--beam N] [--trivial X]
//        node tools/dps.mjs --check [--weapon ID] [--seconds S] [--seed N] [--verbose]
//
// Everything is read from src/sim/content.js; a new weapon needs only an entry in MODELS.
// Default mode prints, as Markdown: the assumptions; per minute (0:30 … 5:00) the incoming
// HP per second (pressure), the floor (median DPS of naive builds at the measured level) and
// the ceiling (best allocation of the same level-ups, beam search) with their ratio to the
// pressure; a per-stage summary; and the weapons ranked per role. --check measures every
// weapon in the real sim against dummies and exits 1 when a model is off by more than 15%.
//
// THE FIELD. Every model works in a "field": enemies spread as a Poisson process of density
// `rho` (per px²) inside a disk of radius `R` around the dragon (nothing outside it), all of
// radius `r` (the mix's presence-weighted mean), with the tower TOWER_REST_DIST below the
// dragon. Enemies stand still (no walking, no knockback): a hit's geometry is the overlap of
// a shape with a static crowd. Aimed weapons (fireball, laser, right claw) and mini-tower
// shots aim at the enemy nearest their origin, as the bots do, so an aimed shot hits its
// target (at the Poisson nearest-neighbour distance 1/(2√rho)) and finds nothing closer.
//
// THE MODELS (per weapon, at a level and a buff loadout; all rates in hits per second):
// - Projectiles (fireball, laser, mini-tower shots, split children): a projectile of radius
//   r_p sweeps a corridor 2(r_p + r) wide, so random hits come as a Poisson process of rate
//   rho·2(r_p + r) per px of path, the path being its range cut at the field's edge. Each hit
//   rolls the procs its damage type allows (§12 affinity, from the real procChance): Explode
//   adds rho × (area of the explosion circle, radius 60·Area + r, inside the field) hits;
//   Split adds two gen+1 children at ±45° with the range left (gen ≥ 2 cannot split); Pierce
//   lets the projectile go on, so the chain beyond a point survives with p^(hits so far).
//   The expectation is integrated numerically (Gauss–Legendre over the hit position, exact
//   geometry for children and the field's edge), not simulated.
// - Fireball fan / parallel lasers: a shot whose lateral offset from the aimed line at the
//   target distance is below r_p + r hits the target; the others fly as random shots.
// - Mini tower: steady state of lobs every cooldown·Haste, each standing min(duration·
//   Duration, (maxActive + Amount)·cooldown − 0.5 s lob) and shooting every fireRate·Haste
//   while a target is within 300 px (shots counted on the sim's own timer pattern). A shot is
//   the dragon's fireball at the fireball's current level, aimed at the enemy nearest the
//   mini tower (which lands ~94 px from the dragon on average).
// - Ring: for an enemy at radius orbit·Area + δ, the balls' passes are simulated tick by tick
//   with the per-enemy rehit timer (`count + Amount` balls, `spin`, ball radius 6), then
//   integrated over the annulus: rho × ∫ hits/s × 2π(orbit + δ) dδ.
// - Left claw / dual claw rectangles: each rectangle (w, h × Area) hits rho × its area grown
//   by r (w·h + 2(w + h)·r + π r²); sides × (1 + Amount) rectangles per volley.
// - Right claw / dual claw cone: aimed at the nearest enemy; if that one is within reach·Area
//   + r the cone hits it plus min(Poisson(rho × cone area grown by r), maxTargets + Amount − 1)
//   others.
// - Bite: min(Poisson(rho·π(reach·Area + r)²), 1 + Amount) targets per bite; a bite with no
//   target is counted as lost (in a crowd it rarely waits). The execute (×2 below 30% HP) is
//   applied in the kill maths (hits to kill), not in raw damage.
// - Saw blade: the blade's path is replayed tick by tick (out at speed·Velocity to range·
//   Velocity, dwell·Duration, back to the tower) and every enemy position in its corridor is
//   integrated with the per-blade rehit (0.4 s); count + Amount blades per volley.
// - Mage orbs, braziers, pickups and knockback are not modelled; the golem is not a target
//   (it takes no damage).
//
// RESISTANCES, TIERS, OVERKILL. Raw damage per hit is ceil(base × Might) (buffDamage), then
// the damage function's ceil(× (1 − r)) per enemy type (damageTaken). The calculator's DPS is
// "effective": HP removed, i.e. for each body (a type at a tier; slimes split into their
// generations, a ghost knight into its ghost, a mage adds its summoned skeletons) a hit
// removes hp / ceil(hp / damage), so overkill is lost (the bite's execute shortens the hits
// to kill). Hits land on bodies in proportion to their presence (spawn rate × HP).
//
// PER MINUTE. Pressure = Σ spawn rate × body HP (tiers' HP multipliers included; stampede
// horses at their average rate). The crowd near the dragon is N = max(--min-near, spawn rate
// × --view-time) enemies (the enemies that arrive within that many seconds) in a disk of
// --radius px. Level at each minute: LEVEL_CURVE (measured, below) or --levels.
import { pathToFileURL } from 'node:url';
import {
  DT, WEAPONS, WEAPON_IDS, BUFFS, BUFF_IDS, ENEMIES, TIERS, TIMELINE, SLIME_GENS, MAGE_SUMMON_COUNT,
  EXPLODE_RADIUS, SPLIT_ANGLE, SPLIT_MAX_GEN, TOWER_REST_DIST, WEAPON_SLOTS, BUFF_SLOTS, BUFF_MAX_LEVEL,
  EVOLUTIONS, STAMPEDE_TYPE, FACING_DEADZONE, tierHp, weaponMaxLevel,
} from '../src/sim/content.js';
import { buffMods, buffDamage, procChance, fireballShot, createWeapon } from '../src/sim/weapons.js';
import { damageTaken } from '../src/sim/damage.js';
import { rateAt, rowIndexAt, stageAt } from '../src/sim/spawner.js';
import { rollOffers, applyCard } from '../src/sim/levelup.js';
import { Game } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { mulberry32 } from '../src/sim/rng.js';

const EPS = 1e-9;
const DEG = Math.PI / 180;

// ---- assumptions (printed with every report) ------------------------------------------

// Median level of the naive bots (aim+naive and kite+naive, seeds 1..48) still standing at each
// time, measured on this build (main at 6e6be02) with a scratch probe over tools/measure.mjs
// runs. After 2:30 only 3–10 runs per bot were still standing, so later points are thin; the
// greedy bots' survivors levelled within ±3 of these. Override with --levels.
export const LEVEL_CURVE = { 30: 1, 60: 1, 90: 4, 120: 9, 150: 14, 180: 23, 210: 32, 240: 41, 270: 49, 300: 60 };
export const MINUTES = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300];
export const DEFAULTS = {
  viewTime: 6, // s: the crowd near the dragon is the enemies that arrive in this long
  minNear: 5, // never fewer than this many enemies near the dragon
  radius: 350, // px: the crowd's disk around the dragon (about the view: 960×600)
  seeds: 64, // naive builds drawn per minute for the floor
  beam: 48, // beam width of the ceiling search
  trivial: 3, // a floor above this × pressure is flagged trivial
  mageSummons: 1, // casts per mage before it dies (each summons MAGE_SUMMON_COUNT skeletons)
};
export const CHECK_TOLERANCE = 0.15;

// ---- small maths ------------------------------------------------------------------------

// Gauss–Legendre nodes on [0, 1] (8 points).
const GL = (() => {
  const x = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
    0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
  const w = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
    0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
  return x.map((xi, i) => ({ u: (xi + 1) / 2, w: w[i] / 2 }));
})();

// E[min(N, k)] for N ~ Poisson(mu).
export function poissonMinMean(mu, k) {
  if (!(mu > 0) || k <= 0) return 0;
  let p = Math.exp(-mu), cdf = 0, sum = 0;
  for (let j = 0; j < k; j++) { cdf += p; sum += 1 - cdf; p *= mu / (j + 1); }
  return sum; // Σ_{j=1..k} P(N >= j)
}

// Area of the intersection of a disk of radius a centred d from the centre of a disk of radius R.
export function lensArea(a, d, R) {
  if (!Number.isFinite(R)) return Math.PI * a * a;
  if (d >= a + R) return 0;
  if (d <= Math.abs(R - a)) return Math.PI * Math.min(a, R) ** 2;
  const c1 = Math.max(-1, Math.min(1, (d * d + a * a - R * R) / (2 * d * a)));
  const c2 = Math.max(-1, Math.min(1, (d * d + R * R - a * a) / (2 * d * R)));
  const k = (-d + a + R) * (d + a - R) * (d - a + R) * (d + a + R);
  return a * a * Math.acos(c1) + R * R * Math.acos(c2) - 0.5 * Math.sqrt(Math.max(0, k));
}

// Distance from a point d from the field's centre, heading at angle psi to the outward
// radial, to the field's edge.
function edgeDist(d, psi, R) {
  if (!Number.isFinite(R)) return Infinity;
  if (d >= R) return 0;
  const s = Math.sin(psi);
  return -d * Math.cos(psi) + Math.sqrt(Math.max(0, R * R - d * d * s * s));
}

// Poisson nearest-neighbour distance (the aim target of an aimed weapon), capped at the field.
export function aimDistance(F) {
  return F.rho > 0 ? Math.min(0.5 / Math.sqrt(F.rho), F.R) : Infinity;
}

// Shots fired by a timer started at 0 over `ticks` steps, period `period` s: the sim's pattern
// (fire at timer <= 0, then timer += period - DT, else timer -= DT).
export function shotsIn(ticks, period) {
  let timer = 0, n = 0;
  for (let i = 0; i < ticks; i++) {
    if (timer > EPS) timer -= DT;
    else { n++; timer += period - DT; }
  }
  return n;
}

// ---- projectiles ----------------------------------------------------------------------

// Expected hits of one projectile segment and everything it spawns, in field F.
// P: { r, explode, split, pierce, exR } (chances already through the affinity).
// seg: { d, psi, rem, gen, aim, empty, startMass }: start `d` px from the field centre,
// heading at `psi` to the radial; `rem` px of range left; `aim`: distance of a guaranteed
// target on the line (nothing random before it); `empty`: no random hits before this
// distance; `startMass`: enemies already overlapping the first collision point (children).
// Returns { direct, explode } expected hit counts.
export function projectileHits(P, F, seg) {
  const s = P.r + F.r;
  const lam = F.rho * 2 * s;
  const U = Math.max(0, Math.min(seg.rem, edgeDist(seg.d, seg.psi, F.R)));
  const p = P.pierce;
  const k = lam * (1 - p);
  const out = { direct: 0, explode: 0 };
  const cos = Math.cos(seg.psi), sin = Math.sin(seg.psi);
  // Nothing is nearer the shooter than its target, so explosions miss an empty disk: around the
  // field centre (`seg.hole`, a shot from the dragon, for every explosion of the shot and its
  // children) or, at the aimed hit only, around the start (`local`, a mini-tower shot).
  const exA = P.exR + F.r;
  const atHit = (x, local = 0) => {
    const hx = seg.d + x * cos, hy = x * sin;
    const dh = Math.hypot(hx, hy);
    let area = 0;
    if (P.explode > 0) {
      const hole = seg.hole > 0 ? lensArea(seg.hole, dh, exA) : local > 0 ? lensArea(local, local, exA) : 0;
      area = Math.max(0, lensArea(exA, dh, F.R) - hole);
    }
    const v = { direct: 1, explode: P.explode * F.rho * area };
    if (seg.gen < SPLIT_MAX_GEN && P.split > 0) {
      const radial = dh > EPS ? Math.atan2(hy, hx) : seg.psi;
      for (const sg of [-1, 1]) {
        const c = projectileHits(P, F, {
          d: dh, psi: seg.psi + sg * SPLIT_ANGLE * DEG - radial, rem: seg.rem - x, gen: seg.gen + 1,
          aim: null, empty: 0, startMass: true, hole: seg.hole,
        });
        v.direct += P.split * c.direct;
        v.explode += P.split * c.explode;
      }
    }
    return v;
  };
  // Random hits on [a, U] given the chain is alive at a with probability `alive`.
  const randomPart = (a, alive) => {
    if (!(lam > 0) || U <= a + EPS) return;
    const L = U - a;
    const m = k > 0 ? 1 - Math.exp(-k * L) : 0;
    const mass = k > 0 ? alive * (lam / k) * m : alive * lam * L;
    for (const q of GL) {
      const x = k > 0 ? a - Math.log(1 - q.u * m) / k : a + q.u * L;
      const v = atHit(Math.max(0, x));
      out.direct += mass * q.w * v.direct;
      out.explode += mass * q.w * v.explode;
    }
  };
  if (seg.aim !== null && seg.aim !== undefined) {
    if (seg.aim > U) return out; // the target is out of reach; nothing is closer
    const v = atHit(seg.aim, seg.aim);
    out.direct += v.direct;
    out.explode += v.explode;
    randomPart(seg.aim, p);
  } else {
    const a = seg.startMass ? -Math.PI * s / 4 : (seg.empty || 0); // rear half-disk as path
    randomPart(a, 1);
  }
  return out;
}

// The projectile parameters of a shot (fireballShot-like stats) under buff mods.
function procParams(shot, mods) {
  return {
    r: shot.r, exR: EXPLODE_RADIUS * mods.area,
    explode: procChance(mods, 'explode', shot.type),
    split: procChance(mods, 'split', shot.type),
    pierce: procChance(mods, 'pierce', shot.type),
  };
}

// The distance from a point to its nearest enemy (Rayleigh in a Poisson field), as quadrature
// points { d, w }; d is Infinity where the nearest is beyond `limit` (no target).
export function nearestQuantiles(F, limit = F.R) {
  if (!(F.rho > 0)) return [{ d: Infinity, w: 1 }];
  return GL.map((q) => {
    const d = Math.sqrt(-Math.log(1 - q.u) / (F.rho * Math.PI));
    return { d: d <= limit ? d : Infinity, w: q.w };
  });
}

// One shot from the dragon aimed at the nearest enemy, averaged over that enemy's distance.
// `lat(d)` is the shot's lateral offset from the aim line at distance d: below r_p + r it hits
// the target, otherwise it flies on as a random shot through the empty disk.
function dragonShot(P, F, range, lat) {
  const out = { direct: 0, explode: 0 };
  for (const { d, w } of nearestQuantiles(F)) {
    if (!Number.isFinite(d)) continue;
    const aimed = lat(d) < P.r + F.r;
    const h = projectileHits(P, F, { d: 0, psi: 0, rem: range, gen: 0, aim: aimed ? d : null, empty: aimed ? 0 : d, hole: d });
    out.direct += w * h.direct;
    out.explode += w * h.explode;
  }
  return out;
}

// ---- weapon models ----------------------------------------------------------------------
// A model maps (level, mods, field, ctx) to hit streams: [{ rate (hits/s), base (damage before
// Might), type, execute? }]. `uses` lists the buffs that change its hit rates (the cache key).
// `single` gives the streams against one lone target where the weapon reaches it best.

const SINGLE_R = 12; // a lone target's radius (a knight)
const SINGLE_D = 60; // its distance from the dragon (inside every melee reach)

function fireballFan(L, mods) {
  const def = WEAPONS.fireball;
  const n = L.count + mods.amount;
  const step = L.count > 1 ? L.spread / (L.count - 1) : def.spreadStep;
  const spread = (mods.amount > 0 ? step * (n - 1) : L.spread) * DEG;
  return Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1)));
}

const fireballModel = {
  uses: ['haste', 'area', 'velocity', 'amount', 'explode', 'split', 'pierce'],
  crowd(level, mods, F) {
    const L = WEAPONS.fireball.levels[level - 1];
    const shot = fireballShot(level, mods);
    const P = procParams(shot, mods);
    let direct = 0, explode = 0;
    for (const a of fireballFan(L, mods)) {
      const h = dragonShot(P, F, shot.range, (d) => Math.abs(d * Math.sin(a)));
      direct += h.direct; explode += h.explode;
    }
    const per = 1 / (L.cooldown * mods.cooldown);
    return [{ rate: direct * per, base: L.damage, type: shot.type }, { rate: explode * per, base: L.damage, type: shot.type, explosion: true }];
  },
  single(level, mods) {
    const L = WEAPONS.fireball.levels[level - 1];
    const shot = fireballShot(level, mods);
    const n = fireballFan(L, mods).filter((a) => SINGLE_D * Math.abs(Math.sin(a)) < shot.r + SINGLE_R).length;
    return [{ rate: n / (L.cooldown * mods.cooldown), base: L.damage, type: shot.type }];
  },
};

function laserOffsets(L, mods) {
  const n = L.count + mods.amount;
  return Array.from({ length: n }, (_, i) => Math.abs(WEAPONS.laser.offset * (n - 1 - 2 * i)));
}
function laserShot(level, mods) {
  const def = WEAPONS.laser;
  const L = def.levels[level - 1];
  return { type: def.type, r: (level >= def.bigFrom ? def.bigR : def.r) * mods.area, range: L.range * mods.speed };
}

const laserModel = {
  uses: ['haste', 'area', 'velocity', 'amount', 'explode', 'pierce'],
  crowd(level, mods, F) {
    const L = WEAPONS.laser.levels[level - 1];
    const shot = laserShot(level, mods);
    const P = procParams(shot, mods);
    let direct = 0, explode = 0;
    for (const off of laserOffsets(L, mods)) {
      const h = dragonShot(P, F, shot.range, () => off);
      direct += h.direct; explode += h.explode;
    }
    const per = 1 / (L.cooldown * mods.cooldown);
    return [{ rate: direct * per, base: L.damage, type: shot.type }, { rate: explode * per, base: L.damage, type: shot.type, explosion: true }];
  },
  single(level, mods) {
    const L = WEAPONS.laser.levels[level - 1];
    const shot = laserShot(level, mods);
    const n = laserOffsets(L, mods).filter((o) => o < shot.r + SINGLE_R).length;
    return [{ rate: n / (L.cooldown * mods.cooldown), base: L.damage, type: shot.type }];
  },
};

const LOB_TICKS = Math.round(WEAPONS.miniTower.lobTime / DT);
// Mean distance from the dragon of a mini tower: lobbed lobDist px from the tower (which
// rests TOWER_REST_DIST from the dragon) in a uniformly random direction.
const MINI_DIST = (() => {
  let s = 0;
  const n = 360;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * 2 * Math.PI;
    s += Math.hypot(WEAPONS.miniTower.lobDist * Math.cos(a), TOWER_REST_DIST + WEAPONS.miniTower.lobDist * Math.sin(a));
  }
  return s / n;
})();

// Shots per second of the mini towers in steady state (with a target always in range).
export function miniTowerShotRate(level, mods) {
  const L = WEAPONS.miniTower.levels[level - 1];
  const C = L.cooldown * mods.cooldown;
  const M = L.maxActive + mods.amount;
  const life = Math.min(Math.round((L.duration * mods.duration) / DT), Math.round((M * C) / DT) - LOB_TICKS);
  return Math.max(0, shotsIn(Math.max(0, life), L.fireRate * mods.cooldown)) / C;
}

const miniTowerModel = {
  uses: ['haste', 'area', 'velocity', 'duration', 'amount', 'explode', 'split', 'pierce'],
  usesFireball: true,
  crowd(level, mods, F, ctx) {
    const fb = ctx.fireballLevel || 1;
    const shot = fireballShot(fb, mods);
    const P = procParams(shot, mods);
    // aimed at the enemy nearest the mini tower; with none within targetRadius it does not fire
    const h = { direct: 0, explode: 0 };
    for (const { d, w } of nearestQuantiles(F, WEAPONS.miniTower.targetRadius)) {
      if (!Number.isFinite(d)) continue;
      const x = projectileHits(P, F, { d: MINI_DIST, psi: Math.PI / 2, rem: shot.range, gen: 0, aim: d });
      h.direct += w * x.direct;
      h.explode += w * x.explode;
    }
    const rate = miniTowerShotRate(level, mods);
    const base = WEAPONS.fireball.levels[fb - 1].damage;
    return [{ rate: h.direct * rate, base, type: shot.type }, { rate: h.explode * rate, base, type: shot.type, explosion: true }];
  },
  single(level, mods, ctx) {
    const fb = ctx.fireballLevel || 1;
    return [{ rate: miniTowerShotRate(level, mods), base: WEAPONS.fireball.levels[fb - 1].damage, type: 'fire' }];
  },
};

// Hits per second on one enemy at radius orbit + delta from the dragon (the ring's passes
// replayed tick by tick with the per-enemy rehit timer).
function ringRate(n, orbit, spinDeg, rehitTicks, s, delta, phase) {
  const T = 3600;
  const er = orbit + delta;
  const ex = er * Math.cos(phase), ey = er * Math.sin(phase);
  let next = 0, hits = 0, angle = 0;
  const dA = spinDeg * DEG * DT;
  for (let t = 1; t <= T; t++) {
    angle = (angle + dA) % (2 * Math.PI);
    if (t < next) continue;
    for (let i = 0; i < n; i++) {
      const a = angle + (i * 2 * Math.PI) / n;
      const dx = ex - orbit * Math.cos(a), dy = ey - orbit * Math.sin(a);
      if (dx * dx + dy * dy < s * s) { hits++; next = t + rehitTicks; break; }
    }
  }
  return hits / (T * DT);
}

const ringModel = {
  uses: ['area', 'amount'],
  crowd(level, mods, F) {
    const def = WEAPONS.ring;
    const L = def.levels[level - 1];
    const n = L.count + mods.amount;
    const O = L.orbit * mods.area;
    const s = def.r + F.r;
    const rehit = Math.round(L.rehit / DT);
    const K = 24;
    let hits = 0;
    for (let j = 0; j < K; j++) {
      const delta = -s + (2 * s * (j + 0.5)) / K;
      if (O + delta <= 0) continue;
      const rate = ringRate(n, O, L.spin, rehit, s, delta, 0.7 + j * 2.39996);
      hits += rate * 2 * Math.PI * (O + delta) * (2 * s / K);
    }
    return [{ rate: F.rho * hits, base: L.damage, type: def.type }];
  },
  single(level, mods) {
    const def = WEAPONS.ring;
    const L = def.levels[level - 1];
    const rate = ringRate(L.count + mods.amount, L.orbit * mods.area, L.spin, Math.round(L.rehit / DT), def.r + SINGLE_R, 0, 0.7);
    return [{ rate, base: L.damage, type: def.type }];
  },
};

// Cone (sector, angle in degrees, radius R) grown by r: its area.
export function coneArea(angleDeg, R, r) {
  const th = angleDeg * DEG;
  return (th * R * R) / 2 + (2 + th) * R * r + Math.PI * r * r;
}
// Rectangle w × h grown by r: its area.
export function rectArea(w, h, r) {
  return w * h + 2 * (w + h) * r + Math.PI * r * r;
}

// Does a circle (x, y, r) overlap the rectangle [0, w] × [−h/2, h/2]?
function circleOverRect(x, y, r, w, h) {
  const px = Math.min(Math.max(x, 0), w), py = Math.min(Math.max(y, -h / 2), h / 2);
  return (x - px) ** 2 + (y - py) ** 2 < r * r;
}

// Expected enemies hit by one rectangle on the side the dragon faces, when a still dragon
// faces its aim at the nearest enemy (§6.3: when |aimX| >= FACING_DEADZONE; otherwise it keeps
// its last facing, here either side): the nearest itself when it overlaps the rectangle, plus
// the field outside the empty disk around the dragon (nothing is nearer than the nearest).
export function facingRectHits(w, h, r, rho) {
  if (!(rho > 0)) return 0;
  const A = rectArea(w, h, r);
  const K = 72, J = 24;
  let sum = 0;
  for (const { d, w: wq } of nearestQuantiles({ rho, R: Infinity })) {
    let inside = 0, empty = 0;
    for (let k = 0; k < K; k++) {
      const th = ((k + 0.5) / K) * 2 * Math.PI;
      const x = d * Math.cos(th), y = d * Math.sin(th);
      inside += Math.abs(Math.cos(th)) >= FACING_DEADZONE
        ? (circleOverRect(Math.abs(x), y, r, w, h) ? 1 : 0)
        : ((circleOverRect(x, y, r, w, h) ? 0.5 : 0) + (circleOverRect(-x, y, r, w, h) ? 0.5 : 0));
      for (let j = 0; j < J; j++) { // the empty disk's area inside the grown rectangle (polar grid)
        const rr = d * Math.sqrt((j + 0.5) / J);
        if (circleOverRect(rr * Math.cos(th), rr * Math.sin(th), r, w, h)) empty += (Math.PI * d * d) / (K * J);
      }
    }
    sum += wq * (inside / K + rho * Math.max(0, A - empty));
  }
  return sum;
}

function clawModelFor(id) {
  return {
    uses: ['haste', 'area', 'amount'],
    crowd(level, mods, F) {
      const def = WEAPONS[id];
      const L = def.levels[level - 1];
      let hits = 0;
      if (L.width) {
        const w = L.width * mods.area, h = L.height * mods.area;
        // both sides: a fixed region; one side: the side the dragon faces, toward its aim
        hits += L.sides === 2
          ? 2 * (1 + mods.amount) * F.rho * rectArea(w, h, F.r)
          : (1 + mods.amount) * facingRectHits(w, h, F.r, F.rho);
      }
      if (L.reach) {
        const R = L.reach * mods.area;
        const k = L.maxTargets + mods.amount;
        const pT = 1 - Math.exp(-F.rho * Math.PI * (R + F.r) ** 2); // the nearest is in reach
        hits += pT * (1 + poissonMinMean(F.rho * coneArea(L.angle, R, F.r), k - 1));
      }
      return [{ rate: hits / (L.cooldown * mods.cooldown), base: L.damage, type: def.type }];
    },
    single(level, mods) {
      const def = WEAPONS[id];
      const L = def.levels[level - 1];
      const hits = (L.width ? 1 + mods.amount : 0) + (L.reach ? 1 : 0);
      return [{ rate: hits / (L.cooldown * mods.cooldown), base: L.damage, type: def.type }];
    },
  };
}

const biteModel = {
  uses: ['haste', 'area', 'amount'],
  crowd(level, mods, F) {
    const def = WEAPONS.bite;
    const L = def.levels[level - 1];
    const mu = F.rho * Math.PI * (L.reach * mods.area + F.r) ** 2;
    const hits = poissonMinMean(mu, 1 + mods.amount);
    return [{ rate: hits / (L.cooldown * mods.cooldown), base: L.damage, type: def.type, execute: true }];
  },
  single(level, mods) {
    const def = WEAPONS.bite;
    const L = def.levels[level - 1];
    return [{ rate: 1 / (L.cooldown * mods.cooldown), base: L.damage, type: def.type, execute: true }];
  },
};

// The along-path position of a saw blade at each collisions step of its life (§10.9).
export function sawPath(range, speed, dwellTicks) {
  const pos = [];
  const step = speed * DT;
  let x = 0, phase = 'out', dwell = dwellTicks;
  for (let guard = 0; guard < 1e5; guard++) {
    if (phase === 'out') {
      const s = Math.min(step, range - x);
      x += s;
      if (x >= range - EPS) phase = 'dwell';
    } else if (phase === 'dwell') {
      if (--dwell <= 0) phase = 'back';
    } else {
      if (x <= step) break;
      x -= step;
    }
    pos.push(x);
  }
  return pos;
}

const SAW_REHIT = Math.round(WEAPONS.saw.rehit / DT);
// Hits of one blade on an enemy at (ex along the path, ey across it).
function sawHitsAt(path, ex, ey, s) {
  let next = 0, hits = 0;
  const s2 = s * s - ey * ey;
  if (s2 <= 0) return 0;
  for (let i = 0; i < path.length; i++) {
    if (i < next) continue;
    const dx = path[i] - ex;
    if (dx * dx < s2) { hits++; next = i + SAW_REHIT; }
  }
  return hits;
}

function sawBlade(level, mods) {
  const L = WEAPONS.saw.levels[level - 1];
  return {
    L, r: L.r * mods.area, path: sawPath(L.range * mods.speed, L.speed * mods.speed, Math.round((L.dwell * mods.duration) / DT)),
    range: L.range * mods.speed,
  };
}

const sawModel = {
  uses: ['haste', 'area', 'velocity', 'duration', 'amount'],
  crowd(level, mods, F) {
    const { L, r, path, range } = sawBlade(level, mods);
    const s = r + F.r;
    const h = 2; // px grid
    let hits = 0;
    for (let ey = h / 2; ey < s; ey += h) {
      for (let ex = -s + h / 2; ex < range + s; ex += h) {
        // the field is centred on the dragon, the path starts at the tower TOWER_REST_DIST behind it
        if (Number.isFinite(F.R) && Math.hypot(ey, ex - TOWER_REST_DIST) > F.R) continue;
        hits += 2 * sawHitsAt(path, ex, ey, s) * h * h;
      }
    }
    const blades = L.count + mods.amount;
    return [{ rate: (F.rho * hits * blades) / (L.cooldown * mods.cooldown), base: L.damage, type: WEAPONS.saw.type }];
  },
  single(level, mods) {
    const { L, r, path, range } = sawBlade(level, mods);
    const n = L.count + mods.amount;
    const x = range / 2;
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * WEAPONS.saw.fanStep * DEG;
      hits += sawHitsAt(path, x * Math.cos(a), x * Math.sin(a), r + SINGLE_R);
    }
    return [{ rate: hits / (L.cooldown * mods.cooldown), base: L.damage, type: WEAPONS.saw.type }];
  },
};

export const MODELS = {
  fireball: fireballModel,
  laser: laserModel,
  miniTower: miniTowerModel,
  ring: ringModel,
  leftClaw: clawModelFor('leftClaw'),
  rightClaw: clawModelFor('rightClaw'),
  dualClaw: clawModelFor('dualClaw'),
  bite: biteModel,
  saw: sawModel,
};

// ---- builds and damage ----------------------------------------------------------------

// A build: { weapons: [{ id, level }], buffs: [{ id, level }] }. Mods as the sim reads them.
export const modsOf = (build) => buffMods({ buffs: build.buffs });
const fireballLevelOf = (build) => (build.weapons.find((w) => w.id === 'fireball') || { level: 1 }).level;

// The hit streams of weapon `id` at `level` in field F with build mods (cached in `cache` when
// given: the key holds the buffs the model uses, so Might never splits it).
export function weaponStreams(id, level, mods, F, ctx = {}, cache = null, buffs = []) {
  const model = MODELS[id];
  if (!model) throw new Error(`no damage model for weapon "${id}"`);
  let key = null;
  if (cache) {
    key = `${id}|${level}|${model.uses.map((u) => (buffs.find((b) => b.id === u) || { level: 0 }).level).join('')}|${model.usesFireball ? ctx.fireballLevel : ''}`;
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const out = model.crowd(level, mods, F, ctx);
  if (cache) cache.set(key, out);
  return out;
}

// Hits to kill a body of `hp` with raw hit `damage` of `type` at resistance r: the damage
// function's rounding, and the bite's execute when `execute`.
export function hitsToKill(hp, damage, r, execute = false) {
  if (!execute) {
    const d = damageTaken(damage, r);
    return d > 0 ? Math.ceil(hp / d - EPS) : Infinity;
  }
  const def = WEAPONS.bite;
  let h = hp, n = 0;
  const d1 = damageTaken(damage, r), d2 = damageTaken(damage * def.executeMult, r);
  if (!(d1 > 0)) return Infinity;
  while (h > 0 && n < 1e6) { h -= h < def.execute * hp ? d2 : d1; n++; }
  return n;
}

// HP a hit removes from a body, averaged over the field's mix (overkill lost).
export function effectivePerHit(F, damage, type, execute = false) {
  let s = 0;
  for (const b of F.mix) {
    const r = ENEMIES[b.type].resist[type] || 0;
    if (!Number.isFinite(b.hp)) { s += b.w * damageTaken(damage, r); continue; }
    const k = hitsToKill(b.hp, damage, r, execute);
    s += Number.isFinite(k) ? (b.w * b.hp) / k : 0;
  }
  return s;
}

// Effective DPS of a build in field F (HP removed per second).
export function buildDps(build, F, cache = null) {
  const mods = modsOf(build);
  const ctx = { fireballLevel: fireballLevelOf(build) };
  let dps = 0;
  const per = {};
  for (const w of build.weapons) {
    let d = 0;
    for (const s of weaponStreams(w.id, w.level, mods, F, ctx, cache, build.buffs)) {
      if (s.rate > 0) d += s.rate * effectivePerHit(F, buffDamage(s.base, mods), s.type, s.execute && !s.explosion);
    }
    per[w.id] = d;
    dps += d;
  }
  return { dps, per };
}

// Raw DPS (no overkill) of one weapon against one enemy type, as the --check dummies take it.
export function rawDps(streams, mods, enemyType) {
  let d = 0;
  for (const s of streams) d += s.rate * damageTaken(buffDamage(s.base, mods), ENEMIES[enemyType].resist[s.type] || 0);
  return d;
}

// ---- the timeline: bodies, pressure, the field per minute -----------------------------------

// The bodies one spawn of `type` brings (its family): slime generations, the ghost a ghost
// knight leaves, the skeletons a mage summons.
function family(type, mageSummons) {
  if (type === 'slime') return SLIME_GENS.map((g, i) => ({ type, count: 2 ** i, hp: g.hp, r: g.r }));
  const d = ENEMIES[type];
  const out = [{ type, count: 1, hp: d.hp, r: d.r }];
  if (type === 'ghostKnight') out.push({ type: 'ghost', count: 1, hp: ENEMIES.ghost.hp, r: ENEMIES.ghost.r });
  if (type === 'mage') out.push({ type: 'skeleton', count: mageSummons * MAGE_SUMMON_COUNT, hp: ENEMIES.skeleton.hp, r: ENEMIES.skeleton.r });
  return out;
}

const tierShares = (row) => {
  if (!row.tiers) return [[1, 1]];
  const tot = Object.values(row.tiers).reduce((a, b) => a + b, 0);
  return tot > 0 ? Object.entries(row.tiers).filter(([, w]) => w > 0).map(([t, w]) => [Number(t), w / tot]) : [[1, 1]];
};

// Bodies per second at time t: [{ type, tier, rate, hp, r }], from the timeline row (weights,
// tiers, interpolated rate) and its stampedes (average horses per second).
export function bodiesAt(t, opts = {}, timeline = TIMELINE) {
  const o = { ...DEFAULTS, ...opts };
  const row = timeline[rowIndexAt(timeline, t)];
  const rate = rateAt(timeline, t);
  const tot = Object.values(row.weights).reduce((a, b) => a + b, 0);
  const out = [];
  const add = (type, tier, rt, hp, r) => {
    if (rt <= 0) return;
    out.push({ type, tier, rate: rt, hp: tierHp(hp, tier), r: r * TIERS[tier].r });
  };
  for (const [type, w] of Object.entries(row.weights)) {
    if (!(w > 0) || !(tot > 0)) continue;
    for (const [tier, ts] of tierShares(row)) {
      for (const b of family(type, o.mageSummons)) add(b.type, tier, rate * (w / tot) * ts * b.count, b.hp, b.r);
    }
  }
  if (row.stampede) {
    const per = (row.stampede.min + row.stampede.max) / 2 / row.stampede.every;
    for (const [tier, ts] of tierShares(row)) add(STAMPEDE_TYPE, tier, per * ts, ENEMIES[STAMPEDE_TYPE].hp, ENEMIES[STAMPEDE_TYPE].r);
  }
  return { rate, row, bodies: out };
}

// The minute's situation: pressure (HP/s) and the field near the dragon.
export function minuteAt(t, opts = {}, timeline = TIMELINE) {
  const o = { ...DEFAULTS, ...opts };
  const { rate, bodies } = bodiesAt(t, o, timeline);
  const pressure = bodies.reduce((a, b) => a + b.rate * b.hp, 0);
  const presence = bodies.map((b) => b.rate * b.hp);
  const tot = presence.reduce((a, b) => a + b, 0) || 1;
  const mix = bodies.map((b, i) => ({ type: b.type, tier: b.tier, hp: b.hp, w: presence[i] / tot }));
  const r = bodies.reduce((a, b, i) => a + (presence[i] / tot) * b.r, 0) || ENEMIES.knight.r;
  const near = o.near !== undefined ? o.near : Math.max(o.minNear, rate * o.viewTime);
  const F = { rho: near / (Math.PI * o.radius * o.radius), r, R: o.radius, mix, near };
  const stage = stageAt(timeline, t);
  return { t, rate, pressure, F, stage: stage ? stage.name : '', bodies };
}

// ---- floor and ceiling ----------------------------------------------------------------

const cloneBuild = (b) => ({ weapons: b.weapons.map((w) => ({ ...w })), buffs: b.buffs.map((x) => ({ ...x })) });
export const START_BUILD = { weapons: [{ id: 'fireball', level: 1 }], buffs: [] };
export const buildKey = (b) => [...b.weapons.map((w) => `${w.id}${w.level}`).sort(), '|', ...b.buffs.map((x) => `${x.id}${x.level}`).sort()].join(' ');
export const buildText = (b) => `${b.weapons.map((w) => `${w.id} ${w.level}`).join(', ')}${b.buffs.length ? ' · ' + b.buffs.map((x) => `${x.id} ${x.level}`).join(', ') : ''}`;

// The build a naive player (card 0 of every offer, as the naive bot) has after `picks`
// level-ups, drawn with the real card pool (§14.1) from seed `seed`.
export function naiveBuild(picks, seed) {
  const g = { weapons: [createWeapon('fireball', 1)], buffs: [], tower: { hp: 100, maxHp: 100 }, rng: mulberry32(seed) };
  for (let i = 0; i < picks; i++) {
    const offers = rollOffers(g);
    if (!offers.length) break;
    applyCard(g, offers[0]);
  }
  return { weapons: g.weapons.map((w) => ({ id: w.id, level: w.level })), buffs: g.buffs.map((b) => ({ id: b.id, level: b.level })) };
}

// Every build one level-up away (the cards a pick could add, Repair aside: it adds no damage).
export function nextBuilds(b) {
  const out = [];
  const evolved = EVOLUTIONS.filter((e) => b.weapons.some((w) => w.id === e.result)).flatMap((e) => e.requires);
  for (const id of WEAPON_IDS) {
    if (WEAPONS[id].evolution || evolved.includes(id)) continue;
    const i = b.weapons.findIndex((w) => w.id === id);
    if (i >= 0) {
      if (b.weapons[i].level < weaponMaxLevel(id)) { const n = cloneBuild(b); n.weapons[i].level++; out.push(n); }
    } else if (b.weapons.length < WEAPON_SLOTS) { const n = cloneBuild(b); n.weapons.push({ id, level: 1 }); out.push(n); }
  }
  for (const evo of EVOLUTIONS) {
    if (b.weapons.some((w) => w.id === evo.result)) continue;
    if (!evo.requires.every((id) => b.weapons.some((w) => w.id === id && w.level >= weaponMaxLevel(id)))) continue;
    const n = cloneBuild(b);
    const at = n.weapons.findIndex((w) => evo.requires.includes(w.id));
    const rest = n.weapons.filter((w) => !evo.requires.includes(w.id));
    rest.splice(at, 0, { id: evo.result, level: weaponMaxLevel(evo.result) });
    n.weapons = rest;
    out.push(n);
  }
  for (const id of BUFF_IDS) {
    const i = b.buffs.findIndex((x) => x.id === id);
    if (i >= 0) {
      if (b.buffs[i].level < BUFF_MAX_LEVEL) { const n = cloneBuild(b); n.buffs[i].level++; out.push(n); }
    } else if (b.buffs.length < BUFF_SLOTS) { const n = cloneBuild(b); n.buffs.push({ id, level: 1 }); out.push(n); }
  }
  return out;
}

// The best build reachable in `picks` level-ups for field F: a beam search (width `beam`) on
// effective DPS, one pick at a time; a state with no card left keeps its build.
export function ceilingBuild(picks, F, beam = DEFAULTS.beam, cache = new Map()) {
  let states = [{ b: START_BUILD, dps: buildDps(START_BUILD, F, cache).dps }];
  for (let i = 0; i < picks; i++) {
    const seen = new Map();
    for (const s of states) {
      const nexts = nextBuilds(s.b);
      if (!nexts.length) { seen.set(buildKey(s.b), s); continue; }
      for (const n of nexts) {
        const k = buildKey(n);
        if (!seen.has(k)) seen.set(k, { b: n, dps: buildDps(n, F, cache).dps });
      }
    }
    states = [...seen.values()].sort((a, b) => b.dps - a.dps).slice(0, beam);
  }
  return states[0];
}

export function levelAt(t, levels = LEVEL_CURVE) {
  if (levels[t] !== undefined) return levels[t];
  const ks = Object.keys(levels).map(Number).sort((a, b) => a - b);
  let lo = ks[0], hi = ks[ks.length - 1];
  for (const k of ks) { if (k <= t) lo = k; if (k >= t) { hi = k; break; } }
  return hi === lo ? levels[lo] : Math.round(levels[lo] + (levels[hi] - levels[lo]) * (t - lo) / (hi - lo));
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

// One row of the per-minute table.
export function minuteRow(t, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const m = minuteAt(t, o);
  const level = levelAt(t, o.levels || LEVEL_CURVE);
  const picks = Math.max(0, level - 1);
  const cache = new Map();
  const naive = [];
  for (let s = 1; s <= o.seeds; s++) {
    const b = naiveBuild(picks, s);
    naive.push({ b, dps: buildDps(b, m.F, cache).dps });
  }
  naive.sort((a, b) => a.dps - b.dps);
  const floor = naive[Math.floor((naive.length - 1) / 2)];
  const ceil = ceilingBuild(picks, m.F, o.beam, cache);
  const ceilPer = buildDps(ceil.b, m.F, cache).per;
  const flag = ceil.dps < m.pressure ? 'unwinnable' : floor.dps > o.trivial * m.pressure ? 'trivial' : '';
  return { ...m, level, picks, floor, ceil, ceilPer, floorMedian: median(naive.map((x) => x.dps)), flag };
}

// ---- report ---------------------------------------------------------------------------

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '–');

export function assumptionsText(o) {
  return [
    `- Crowd near the dragon: ${o.near !== undefined ? `${o.near} enemies` : `max(${o.minNear}, spawn rate × ${o.viewTime} s) enemies`} as a Poisson field in a disk of ${o.radius} px around it; enemies stand still; the tower ${TOWER_REST_DIST} px from the dragon.`,
    `- Aimed weapons and mini-tower shots aim at the enemy nearest their origin (Poisson nearest-neighbour distance).`,
    `- Mix: hits land on bodies (a type at a tier; slime generations, the ghost of a ghost knight and ${o.mageSummons} cast of ${MAGE_SUMMON_COUNT} skeletons per mage counted) in proportion to spawn rate × HP; overkill is lost (HP / hits to kill).`,
    `- Levels: ${o.levels ? 'given' : 'LEVEL_CURVE (median level of naive bots still standing, seeds 1..48)'}; floor = median effective DPS of ${o.seeds} naive builds (card 0 of the real pool); ceiling = beam search (width ${o.beam}) over the same number of level-ups.`,
    `- Not modelled: knockback, mage orbs, braziers and pickups, the golem (not a target), movement of the dragon and the crowd.`,
  ].join('\n');
}

export function minuteTable(rows) {
  const out = ['| t | Stage | Spawn/s | Pressure HP/s | Near | Level | Floor DPS | Ceiling DPS | Floor / P | Ceiling / P | Flag | Ceiling build |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    out.push(`| ${mmss(r.t)} | ${r.stage} | ${f2(r.rate)} | ${f1(r.pressure)} | ${f1(r.F.near)} | ${r.level} | ${f1(r.floor.dps)} | ${f1(r.ceil.dps)} | ${f2(r.floor.dps / r.pressure)} | ${f2(r.ceil.dps / r.pressure)} | ${r.flag} | ${buildText(r.ceil.b)} |`);
  }
  return out.join('\n');
}

export function stageTable(rows) {
  const out = ['| Stage | Minutes | Pressure HP/s | Worst floor / P | Worst ceiling / P | Ceiling DPS by weapon (last minute) |', '|---|---|---|---|---|---|'];
  const by = new Map();
  for (const r of rows) { const k = r.stage || '-'; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  for (const [stage, rs] of by) {
    const last = rs[rs.length - 1];
    const per = Object.entries(last.ceilPer).sort((a, b) => b[1] - a[1]).map(([id, d]) => `${id} ${d.toFixed(0)}`).join(', ');
    out.push(`| ${stage} | ${rs.map((r) => mmss(r.t)).join(', ')} | ${rs.map((r) => f1(r.pressure)).join(', ')} | ${f2(Math.min(...rs.map((r) => r.floor.dps / r.pressure)))} | ${f2(Math.min(...rs.map((r) => r.ceil.dps / r.pressure)))} | ${per} |`);
  }
  return out.join('\n');
}

// Weapons per role at L1 and their top level, no buffs: single target (one knight-sized
// target where the weapon reaches it, raw damage) and crowd (effective DPS in each stage's
// mid-minute field).
export function rankingTable(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const mids = [30, 90, 150, 210, 270].map((t) => minuteAt(t, o));
  const mods = modsOf({ buffs: [] });
  const rows = [];
  for (const id of WEAPON_IDS) {
    for (const level of [...new Set([1, weaponMaxLevel(id)])]) {
      const ctx = { fireballLevel: id === 'miniTower' ? level : 1 };
      const single = MODELS[id].single(level, mods, ctx).reduce((a, s) => a + s.rate * buffDamage(s.base, mods), 0);
      const crowd = mids.map((m) => buildDps({ weapons: [{ id, level }], buffs: [] }, m.F).dps);
      // the mini tower's shots are the fireball's: rank it with the fireball at the same level
      rows.push({ id, level, single, crowd });
    }
  }
  rows.sort((a, b) => b.crowd[3] - a.crowd[3]);
  const out = [`| Weapon | L | Single target DPS | ${mids.map((m) => `Crowd ${m.stage} (${mmss(m.t)})`).join(' | ')} |`, `|---|---|---|${mids.map(() => '---|').join('')}`];
  for (const r of rows) out.push(`| ${r.id} | ${r.level} | ${f1(r.single)} | ${r.crowd.map(f1).join(' | ')} |`);
  return out.join('\n');
}

// ---- --check: the models against the real sim ------------------------------------------

const QUIET = [{ t: 0, rate: 0, weights: { knight: 1 } }];
const DUMMY_HP = 1e9;

// The check's cases: every weapon at L1 and its top level, with no buffs and with a typical
// buff set, in a crowd; projectile weapons also with a heavy proc set and in a sparse field;
// a few against resistant dummies.
export const CHECK_BUFFS = {
  none: [],
  stat: [{ id: 'might', level: 2 }, { id: 'haste', level: 1 }, { id: 'area', level: 1 }, { id: 'amount', level: 1 }],
  proc: [{ id: 'explode', level: 3 }, { id: 'split', level: 2 }, { id: 'pierce', level: 3 }, { id: 'velocity', level: 1 }],
  reach: [{ id: 'velocity', level: 2 }, { id: 'duration', level: 2 }, { id: 'area', level: 2 }, { id: 'haste', level: 2 }],
};
export const CHECK_RHO = { crowd: 1 / 2500, sparse: 1 / 15000 };

export function checkCases() {
  const cases = [];
  for (const id of WEAPON_IDS) {
    for (const level of [...new Set([1, weaponMaxLevel(id)])]) {
      for (const set of ['none', 'stat']) cases.push({ weapon: id, level, set, density: 'crowd', dummy: 'horse' });
      if (['fireball', 'laser', 'miniTower'].includes(id)) {
        cases.push({ weapon: id, level, set: 'proc', density: 'crowd', dummy: 'horse' });
        cases.push({ weapon: id, level, set: 'none', density: 'sparse', dummy: 'horse' });
      }
      if (['saw', 'miniTower'].includes(id)) cases.push({ weapon: id, level, set: 'reach', density: 'crowd', dummy: 'horse' });
    }
  }
  cases.push({ weapon: 'fireball', level: 1, set: 'none', density: 'crowd', dummy: 'slime' });
  cases.push({ weapon: 'laser', level: 1, set: 'none', density: 'crowd', dummy: 'mage' });
  cases.push({ weapon: 'leftClaw', level: 1, set: 'none', density: 'crowd', dummy: 'knight' });
  return cases;
}

// Runs one case in the real sim: a game with no spawns, only the weapon (and the buffs), the
// dragon standing still at the centre of a disk of dummies (the type, HP 1e9, held in place:
// they never walk and are put back after any knockback) aiming at the nearest dummy, as the
// models assume. The dummies are redrawn (new ones, uniformly in the disk) every `reshuffle`
// s so the result averages over many layouts; each layout's first `settle` s are not counted,
// since fresh dummies carry no rehit timers (the models are steady states). Damage per second
// over `seconds` of counted time, after `warm` s.
export const CHECK_RUN = { seconds: 300, warm: 10, reshuffle: 3, settle: 1, radius: 400 };
export function runCheck(c, opts = {}) {
  const { seconds, warm, reshuffle, settle, radius, seed = 1 } = { ...CHECK_RUN, ...opts };
  const rho = CHECK_RHO[c.density];
  const n = Math.round(rho * Math.PI * radius * radius);
  const game = new Game({ seed, timeline: QUIET });
  game.weapons = [createWeapon(c.weapon, c.level)];
  game.buffs = CHECK_BUFFS[c.set].map((b) => ({ ...b }));
  game.tower.hp = game.tower.maxHp = 1e12;
  game.stepEnemies = () => {}; // the dummies do not walk, separate or despawn
  const lr = mulberry32(seed * 7919 + 17);
  let homes = [];
  const place = () => {
    game.enemies = [];
    homes = [];
    for (let i = 0; i < n; i++) {
      const rr = radius * Math.sqrt(lr()), a = lr() * 2 * Math.PI;
      const e = createEnemy(game, c.dummy, rr * Math.cos(a), rr * Math.sin(a));
      e.hp = e.maxHp = DUMMY_HP;
      homes.push([e.x, e.y]);
    }
  };
  const dealt = () => game.enemies.reduce((a, e) => a + (DUMMY_HP - e.hp), 0);
  const skip = Math.round(settle / DT), warmTicks = Math.round(warm / DT), countTicks = Math.round(seconds / DT);
  // A layout lasts reshuffle × [0.5, 1.5) s at random, so the counted windows never lock in
  // phase with a weapon's cooldown.
  let sum = 0, counted = 0, ticks = 0;
  while (counted < countTicks) {
    place();
    const len = skip + Math.max(1, Math.round((reshuffle * (0.5 + lr()) - settle) / DT));
    let d0 = 0;
    for (let tick = 0; tick < len; tick++) {
      if (tick === skip) d0 = dealt();
      const d = game.dragon;
      let best = null, bd = Infinity;
      for (const e of game.enemies) { const q = (e.x - d.x) ** 2 + (e.y - d.y) ** 2; if (q < bd) { bd = q; best = e; } }
      game.tick(best ? { aimX: best.x - d.x, aimY: best.y - d.y, hasAim: true } : {});
      for (let i = 0; i < game.enemies.length; i++) { game.enemies[i].x = homes[i][0]; game.enemies[i].y = homes[i][1]; }
    }
    if (ticks >= warmTicks) { sum += dealt() - d0; counted += len - skip; }
    ticks += len;
  }
  const measured = sum / (counted * DT);
  const F = { rho: n / (Math.PI * radius * radius), r: ENEMIES[c.dummy].r, R: radius, mix: [{ type: c.dummy, hp: Infinity, w: 1 }] };
  const mods = modsOf({ buffs: CHECK_BUFFS[c.set] });
  const model = rawDps(MODELS[c.weapon].crowd(c.level, mods, F, { fireballLevel: 1 }), mods, c.dummy);
  return { ...c, measured, model, err: model > 0 ? measured / model - 1 : (measured > 0 ? Infinity : 0) };
}

export function checkTable(results) {
  const out = ['| Weapon | L | Buffs | Field | Dummy | Model DPS | Measured DPS | Error | OK |', '|---|---|---|---|---|---|---|---|---|'];
  for (const r of results) out.push(`| ${r.weapon} | ${r.level} | ${r.set} | ${r.density} | ${r.dummy} | ${f2(r.model)} | ${f2(r.measured)} | ${(r.err * 100).toFixed(1)}% | ${Math.abs(r.err) <= CHECK_TOLERANCE ? 'yes' : '**NO**'} |`);
  return out.join('\n');
}

// ---- CLI ------------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { ...DEFAULTS, check: false, weapon: null, seconds: CHECK_RUN.seconds, reshuffle: CHECK_RUN.reshuffle, settle: CHECK_RUN.settle, seed: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    const num = () => { i++; const x = Number(v); if (!Number.isFinite(x)) throw new Error(`bad value for ${a}: ${v}`); return x; };
    if (a === '--check') o.check = true;
    else if (a === '--weapon') { o.weapon = v; i++; }
    else if (a === '--seconds') o.seconds = num();
    else if (a === '--seed') o.seed = num();
    else if (a === '--reshuffle') o.reshuffle = num();
    else if (a === '--settle') o.settle = num();
    else if (a === '--near') o.near = num();
    else if (a === '--min-near') o.minNear = num();
    else if (a === '--view-time') o.viewTime = num();
    else if (a === '--radius') o.radius = num();
    else if (a === '--seeds') o.seeds = num();
    else if (a === '--beam') o.beam = num();
    else if (a === '--trivial') o.trivial = num();
    else if (a === '--levels') {
      i++;
      const ls = String(v).split(',').map(Number);
      if (ls.length !== MINUTES.length || ls.some((x) => !(x >= 1))) throw new Error(`--levels wants ${MINUTES.length} levels (${MINUTES.map(mmss).join(', ')})`);
      o.levels = Object.fromEntries(MINUTES.map((t, k) => [t, ls[k]]));
    } else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

export function main(argv) {
  const o = parseArgs(argv);
  if (o.help) {
    console.log('node tools/dps.mjs [--near N | --view-time S] [--min-near N] [--radius PX] [--levels L1,..,L10] [--seeds N] [--beam N] [--trivial X]\nnode tools/dps.mjs --check [--weapon ID] [--seconds S] [--seed N]');
    return 0;
  }
  const start = process.hrtime.bigint();
  if (o.check) {
    const cases = checkCases().filter((c) => !o.weapon || c.weapon === o.weapon);
    if (!cases.length) throw new Error(`no check cases for weapon "${o.weapon}"`);
    const results = cases.map((c) => runCheck(c, { seconds: o.seconds, seed: o.seed, reshuffle: o.reshuffle, settle: o.settle }));
    console.log(`Model vs real sim: dummies (HP 1e9, held in place) in a ${CHECK_RUN.radius} px disk around a still dragon that aims at the nearest; crowd 1 per ${1 / CHECK_RHO.crowd} px², sparse 1 per ${1 / CHECK_RHO.sparse} px². Dummies redrawn every ${o.reshuffle} s, the first ${o.settle} s of each layout not counted; ${o.seconds} s counted per case after ${CHECK_RUN.warm} s warm-up; seed ${o.seed}. Tolerance ±${CHECK_TOLERANCE * 100}%.\n`);
    console.log(checkTable(results));
    const bad = results.filter((r) => !(Math.abs(r.err) <= CHECK_TOLERANCE));
    console.log(`\n${results.length - bad.length}/${results.length} within ±${CHECK_TOLERANCE * 100}% (${(Number(process.hrtime.bigint() - start) / 1e9).toFixed(1)} s wall)`);
    if (bad.length) console.log(`Off: ${bad.map((r) => `${r.weapon} L${r.level} ${r.set} ${r.density} ${r.dummy} (${(r.err * 100).toFixed(1)}%)`).join('; ')}`);
    return bad.length ? 1 : 0;
  }
  const rows = MINUTES.map((t) => minuteRow(t, o));
  console.log('## Assumptions\n');
  console.log(assumptionsText(o));
  console.log('\n## Per minute\n');
  console.log(minuteTable(rows));
  console.log('\n## Per stage\n');
  console.log(stageTable(rows));
  console.log('\n## Weapons per role (no buffs)\n');
  console.log(rankingTable(o));
  console.log(`\n(${(Number(process.hrtime.bigint() - start) / 1e9).toFixed(1)} s wall)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 2; }
}
