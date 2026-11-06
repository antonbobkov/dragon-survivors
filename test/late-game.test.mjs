// Late game (§14, §14.1): a full build is offered Repair only while the tower is below
// REPAIR_OFFER_BELOW of its HP; with nothing to offer, a level-up passes without a card and
// the world keeps running.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { createWeapon } from '../src/sim/weapons.js';
import { cardPool } from '../src/sim/levelup.js';
import {
  WEAPON_IDS, BUFF_IDS, BUFF_SLOTS, REPAIR_HP, REPAIR_OFFER_BELOW, xpToNext,
} from '../src/sim/content.js';

const QUIET = [{ t: 0, rate: 0, weights: { knight: 100 } }];
const full = () => {
  const g = new Game({ seed: 1, timeline: QUIET });
  g.weapons = WEAPON_IDS.map((id) => createWeapon(id, 5));
  g.buffs = BUFF_IDS.slice(0, BUFF_SLOTS).map((id) => ({ id, level: 3 }));
  return g;
};
const gemOnDragon = (g, value) => g.gems.push({ id: g.nextId++, x: g.dragon.x, y: g.dragon.y, value, homing: false });
const sounded = (g, name) => g.events.some((ev) => ev.type === 'sound' && ev.name === name);

test('late game: a full build is offered Repair only below REPAIR_OFFER_BELOW of max HP', () => {
  const g = full();
  g.tower.hp = REPAIR_OFFER_BELOW * g.tower.maxHp;
  assert.deepEqual(cardPool(g), []);
  g.tower.hp -= 0.001;
  assert.deepEqual(cardPool(g).map((p) => p.card.kind), ['repair']);
  // A build with anything else to offer keeps Repair in its pool at any HP.
  g.weapons[0].level = 4;
  g.tower.hp = g.tower.maxHp;
  assert.deepEqual(cardPool(g).map((p) => p.card.kind), ['weapon', 'repair']);
});

test('late game: a healthy full build levels up without a card, and the world keeps running', () => {
  const counted = () => {
    const x = full();
    const draws = { n: 0 };
    const rng = x.rng;
    x.rng = () => { draws.n++; return rng(); };
    return [x, draws];
  };
  const [g, draws] = counted();
  const [twin, twinDraws] = counted(); // the same game without the level-ups
  g.level = 25;
  gemOnDragon(g, xpToNext(25) + xpToNext(26)); // two level-ups at once
  const t0 = g.tickCount;
  g.tick({});
  twin.tick({});
  assert.equal(g.level, 27);
  assert.equal(g.pendingLevelUps, 0);
  assert.deepEqual(g.offers, []);
  assert.equal(draws.n, twinDraws.n, 'an empty pool draws no numbers');
  assert.ok(!sounded(g, 'powerup'));
  g.tick({});
  assert.equal(g.tickCount, t0 + 2, 'nothing froze the world');
});

test('late game: a hurt full build picks Repair; once healed, the rest of the queue passes', () => {
  const g = full();
  g.tower.hp = 40;
  gemOnDragon(g, xpToNext(1) + xpToNext(2) + xpToNext(3)); // three level-ups queued
  g.tick({});
  assert.equal(g.pendingLevelUps, 3);
  assert.deepEqual(g.offers, [{ kind: 'repair', id: 'repair', level: 1 }]);
  const t = g.tickCount;
  g.tick({ pick: 0 }); // 40 → 65 HP: at or above half, nothing more to offer
  assert.equal(g.tower.hp, 40 + REPAIR_HP);
  assert.equal(g.pendingLevelUps, 0);
  assert.deepEqual(g.offers, []);
  assert.equal(g.tickCount, t, 'the pick tick does not advance the world');
  g.tick({});
  assert.equal(g.tickCount, t + 1);
  assert.equal(g.level, 4);
});

test('late game: a pick that leaves the tower hurt keeps offering Repair', () => {
  const g = full();
  g.tower.hp = 10;
  gemOnDragon(g, xpToNext(1) + xpToNext(2));
  g.tick({});
  g.tick({ pick: 0 }); // 10 → 35, still below half
  assert.equal(g.pendingLevelUps, 1);
  assert.deepEqual(g.offers, [{ kind: 'repair', id: 'repair', level: 1 }]);
});
