// Gold and the armoury (§13.1): the purse, rank costs, buying and refunding, the mapping of
// ranks to the sim's `meta` (§4.1), and a storage wrapper. No DOM: the browser hands in
// `localStorage` (or nothing), and tests hand in fakes. The sim never sees any of this except
// the `meta` it is built with.
import { DAMAGE_TYPES } from './sim/content.js';

export const ARMOURY_KEY = 'dragon-survivors.armoury.v1';
export const TRACKS = ['power', 'shred'];
export const MAX_RANK = 5;
export const POWER_PER_RANK = 0.08; // ×(1 + 0.08 × rank) damage of that type
export const SHRED_PER_RANK = 0.1; // −0.1 × rank off every enemy's resistance to that type
export const SCORE_PER_GOLD = 20;

// Gold earned by a run: floor(score / 20).
export function goldFor(score) {
  return Number.isFinite(score) && score > 0 ? Math.floor(score / SCORE_PER_GOLD) : 0;
}

// The price of rank n (buying it from rank n − 1): 20 × n².
export function rankCost(n) {
  return 20 * n * n;
}

// Everything paid for ranks 1..n of one track.
export function spentOn(n) {
  let s = 0;
  for (let i = 1; i <= n; i++) s += rankCost(i);
  return s;
}

export function emptyRanks() {
  const ranks = {};
  for (const track of TRACKS) {
    ranks[track] = {};
    for (const t of DAMAGE_TYPES) ranks[track][t] = 0;
  }
  return ranks;
}

export function freshPurse() {
  return { gold: 0, ranks: emptyRanks() };
}

// A purse from untrusted data (storage): gold a non-negative integer, every rank an integer
// in [0, MAX_RANK]; anything else reads 0.
export function normalizePurse(data) {
  const d = data && typeof data === 'object' ? data : {};
  const g = Number(d.gold);
  const purse = { gold: Number.isFinite(g) && g > 0 ? Math.floor(g) : 0, ranks: emptyRanks() };
  for (const track of TRACKS) {
    const src = d.ranks && typeof d.ranks === 'object' ? d.ranks[track] : null;
    for (const t of DAMAGE_TYPES) {
      const r = src && typeof src === 'object' ? Number(src[t]) : 0;
      purse.ranks[track][t] = Number.isFinite(r) ? Math.max(0, Math.min(MAX_RANK, Math.floor(r))) : 0;
    }
  }
  return purse;
}

// Total gold spent on every rank owned.
export function totalSpent(purse) {
  let s = 0;
  for (const track of TRACKS) for (const t of DAMAGE_TYPES) s += spentOn(purse.ranks[track][t]);
  return s;
}

// The cost of the next rank of `track` for `type`, or null at MAX_RANK.
export function nextCost(purse, track, type) {
  const r = purse.ranks[track][type];
  return r >= MAX_RANK ? null : rankCost(r + 1);
}

export function canBuy(purse, track, type) {
  const c = nextCost(purse, track, type);
  return c !== null && purse.gold >= c;
}

// A new purse with the next rank bought, or null when it is maxed or unaffordable.
export function buy(purse, track, type) {
  if (!canBuy(purse, track, type)) return null;
  const next = normalizePurse(purse);
  next.gold -= rankCost(purse.ranks[track][type] + 1);
  next.ranks[track][type] += 1;
  return next;
}

// A new purse with every rank sold back for what it cost.
export function refundAll(purse) {
  return { gold: purse.gold + totalSpent(purse), ranks: emptyRanks() };
}

export function addGold(purse, gold) {
  return { gold: purse.gold + Math.max(0, Math.floor(gold) || 0), ranks: normalizePurse(purse).ranks };
}

// Ranks -> the sim's `meta` (§4.1): power = 1 + 0.08 × rank, shred = 0.1 × rank.
export function metaFromRanks(ranks) {
  const r = normalizePurse({ ranks }).ranks;
  const meta = { power: {}, shred: {} };
  for (const t of DAMAGE_TYPES) {
    meta.power[t] = 1 + POWER_PER_RANK * r.power[t];
    meta.shred[t] = SHRED_PER_RANK * r.shred[t];
  }
  return meta;
}

// Persistence. `getStorage()` returns a Storage-like object ({ getItem, setItem }) or throws
// (browsers throw on `localStorage` itself when site data is blocked). Every read and write is
// wrapped: on any failure `load` gives a fresh purse and `save` returns false, so the game plays
// on with a purse that lasts until the page is closed.
export function createStore(getStorage) {
  const storage = () => {
    try { return getStorage ? getStorage() : null; } catch { return null; }
  };
  return {
    load() {
      try {
        const s = storage();
        const raw = s ? s.getItem(ARMOURY_KEY) : null;
        return raw ? normalizePurse(JSON.parse(raw)) : freshPurse();
      } catch {
        return freshPurse();
      }
    },
    save(purse) {
      try {
        const s = storage();
        if (!s) return false;
        s.setItem(ARMOURY_KEY, JSON.stringify(normalizePurse(purse)));
        return true;
      } catch {
        return false;
      }
    },
  };
}

// The text of a track for one type: `effect` what one rank does, `now` what the ranks owned do.
export function trackText(track, typeName, rank) {
  const name = typeName.toLowerCase();
  const none = rank > 0 ? null : 'none';
  if (track === 'power') {
    return { effect: `+${Math.round(POWER_PER_RANK * 100)}% ${name} damage per rank`, now: none ?? `+${Math.round(POWER_PER_RANK * 100 * rank)}% damage` };
  }
  return { effect: `-${Math.round(SHRED_PER_RANK * 100)}% enemy ${name} resist per rank`, now: none ?? `-${Math.round(SHRED_PER_RANK * 100 * rank)}% resist` };
}
