// Process invariants: every open backlog row has a work file, and every work file has a row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const backlog = readFileSync(new URL('../docs/backlog.md', import.meta.url), 'utf8');
const rows = [...backlog.matchAll(/^\| (T-\d{3}) \|.*\| ([\w ]+) \|$/gm)].map((m) => ({ id: m[1], status: m[2] }));
const work = readdirSync(new URL('../docs/work/', import.meta.url)).filter((f) => /^T-\d{3}-.*\.md$/.test(f));

test('backlog ids are unique', () => {
  const ids = rows.map((r) => r.id);
  assert.deepEqual(ids, [...new Set(ids)]);
});

test('every open backlog row has a work file', () => {
  for (const { id, status } of rows) {
    if (status === 'planned') continue;
    assert.ok(work.some((f) => f.startsWith(`${id}-`)), `${id} has no docs/work/ file`);
  }
});

test('every work file has a backlog row', () => {
  for (const f of work) {
    const id = f.slice(0, 5);
    assert.ok(rows.some((r) => r.id === id), `${f} has no backlog row`);
  }
});
