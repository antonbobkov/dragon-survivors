import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/sim/grid.js';
import { mulberry32 } from '../src/sim/rng.js';

function randomItems(rng, n, spread) {
  const items = [];
  for (let i = 0; i < n; i++) items.push({ id: i, x: (rng() - 0.5) * spread, y: (rng() - 0.5) * spread, r: 8 + rng() * 6 });
  return items;
}

test('grid: nearby returns every item within the radius (brute force check)', () => {
  const rng = mulberry32(3);
  const items = randomItems(rng, 500, 2000);
  const grid = new Grid(64);
  grid.build(items);
  for (let q = 0; q < 300; q++) {
    const x = (rng() - 0.5) * 2200, y = (rng() - 0.5) * 2200, radius = rng() * 200;
    const got = new Set(grid.nearby(x, y, radius).map((e) => e.id));
    for (const e of items) {
      if (Math.hypot(e.x - x, e.y - y) <= radius) assert.ok(got.has(e.id), `missed ${e.id} at query ${q}`);
    }
  }
});

test('grid: candidates come only from nearby cells and contain no duplicates', () => {
  const rng = mulberry32(4);
  const items = randomItems(rng, 300, 3000);
  const grid = new Grid(64);
  grid.build(items);
  const got = grid.nearby(0, 0, 30);
  assert.equal(new Set(got).size, got.length);
  for (const e of got) assert.ok(Math.abs(e.x) < 30 + 64 && Math.abs(e.y) < 30 + 64);
});

test('grid: rebuilding drops old items and tracks the largest radius', () => {
  const grid = new Grid(64);
  grid.build([{ x: 10, y: 10, r: 56 }]);
  assert.equal(grid.maxR, 56);
  grid.build([{ x: 500, y: 500, r: 12 }]);
  assert.equal(grid.maxR, 12);
  assert.equal(grid.nearby(10, 10, 20).length, 0);
  assert.equal(grid.nearby(500, 500, 1).length, 1);
});

test('grid: negative coordinates and cell borders', () => {
  const grid = new Grid(64);
  const items = [{ x: -1, y: -1, r: 1 }, { x: 0, y: 0, r: 1 }, { x: -64, y: 63.9, r: 1 }, { x: -64.1, y: -128, r: 1 }];
  grid.build(items);
  for (const e of items) assert.ok(grid.nearby(e.x, e.y, 0).includes(e));
  const near = grid.nearby(-0.5, -0.5, 1);
  assert.ok(near.includes(items[0]) && near.includes(items[1]) && !near.includes(items[3]));
});
