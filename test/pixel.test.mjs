// Pixel viewer (pixel/): the pure side. Sources, folder scanning, frame timing and variants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  frameAt, frameStart, sliceRgba, decodeBmpBytes, applyVariant, isPlain, tierPresets, atlasSprites,
  scanFolder, isArtText, asSequence, joinPath, sheetRects, filterSprites, entryPath,
} from '../pixel/lib.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root));

/** 24-bit bottom-up BMP from rows of [r,g,b], as a plain Uint8Array (what a browser has). */
function makeBmp(rows) {
  const height = rows.length, width = rows[0].length;
  const stride = Math.floor((24 * width + 31) / 32) * 4;
  const buf = new Uint8Array(54 + stride * height);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x42; buf[1] = 0x4d;
  dv.setUint32(2, buf.length, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  rows.forEach((row, y) => row.forEach(([r, g, b], x) => {
    const o = 54 + (height - 1 - y) * stride + x * 3;
    buf[o] = b; buf[o + 1] = g; buf[o + 2] = r;
  }));
  return buf;
}

/** Minimal 8-bit RGBA PNG reader (the atlas is one). */
function readPng(buf) {
  let off = 8, width = 0, height = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); assert.equal(data[8], 8); assert.equal(data[9], 6); }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4, rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const b = y ? rgba[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y ? rgba[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      rgba[y * stride + x] = (v + pred) & 255;
    }
  }
  return { width, height, rgba };
}

const fileMap = (obj) => new Map(Object.entries(obj).map(([p, v]) => [p, {
  text: async () => (typeof v === 'string' ? v : new TextDecoder().decode(v)),
  bytes: async () => (typeof v === 'string' ? new TextEncoder().encode(v) : v),
}]));

test('frameAt and frameStart follow per-frame ticks and loop', () => {
  const t = [6, 12, 2];
  assert.deepEqual([0, 5, 6, 17, 18, 19, 20, 26].map((k) => frameAt(t, k)), [0, 0, 1, 1, 2, 2, 0, 1]);
  assert.equal(frameAt(t, 6.9), 1);
  assert.equal(frameAt(t, -1), 2);
  assert.deepEqual([0, 1, 2].map((i) => frameStart(t, i)), [0, 6, 18]);
  for (let i = 0; i < 3; i++) assert.equal(frameAt(t, frameStart(t, i)), i);
});

test('sliceRgba cuts a rect', () => {
  const rgba = new Uint8Array(3 * 2 * 4).map((_, i) => i);
  const d = sliceRgba(rgba, 3, { x: 1, y: 1, w: 2, h: 1 });
  assert.deepEqual([d.width, d.height], [2, 1]);
  assert.deepEqual([...d.rgba], [16, 17, 18, 19, 20, 21, 22, 23]);
});

test('decodeBmpBytes decodes a plain Uint8Array, black is transparent', () => {
  const d = decodeBmpBytes(makeBmp([[[255, 0, 0], [0, 0, 0]]]));
  assert.deepEqual([...d.rgba], [255, 0, 0, 255, 0, 0, 0, 0]);
});

test('tier variants applied live match the built atlas pixel for pixel', () => {
  const json = JSON.parse(read('assets/atlas.json'));
  const manifest = JSON.parse(read('tools/manifest.json'));
  const png = readPng(read('assets/atlas.png'));
  const presets = tierPresets(manifest);
  assert.deepEqual(presets.map((p) => p.tier), [2, 3, 4]);
  for (const name of ['knight.walk', 'horse.walk', 'slime.walk2', 'ghost.die']) {
    for (const { tier, ops } of presets) {
      const base = json.anims[name].frames, built = json.anims[`${name}@t${tier}`].frames;
      base.forEach((k, i) => {
        const live = applyVariant(sliceRgba(png.rgba, png.width, json.frames[k]), ops);
        const want = sliceRgba(png.rgba, png.width, json.frames[built[i]]);
        assert.deepEqual([live.width, live.height], [want.width, want.height], `${name}@t${tier}:${i}`);
        assert.ok(Buffer.from(live.rgba).equals(Buffer.from(want.rgba)), `${name}@t${tier}:${i} pixels`);
      });
    }
  }
});

test('applyVariant: swap, outline growth; isPlain', () => {
  const d = { width: 1, height: 1, rgba: new Uint8Array([10, 20, 30, 255]) };
  assert.deepEqual([...applyVariant(d, { swap: 'rb' }).rgba], [30, 20, 10, 255]);
  const o = applyVariant(d, { outline: '#ff0000' });
  assert.deepEqual([o.width, o.height], [3, 3]);
  assert.deepEqual([...o.rgba.subarray(4, 8)], [255, 0, 0, 255]); // edge neighbour
  assert.equal(o.rgba[3], 0); // diagonal stays clear
  assert.ok(isPlain({}) && isPlain({ swap: '', tint: '', outline: '' }) && !isPlain({ tint: '#123456' }));
});

test('atlasSprites: tiers left out, folders from the manifest', async () => {
  const json = {
    frames: { 'a/x.bmp': { x: 0, y: 0, w: 1, h: 1 }, 'art/icons/i.txt:0': { x: 1, y: 0, w: 1, h: 1 } },
    anims: { 'k.walk': { frames: ['a/x.bmp'], ticks: [6] }, 'k.walk@t2': { frames: ['a/x.bmp'], ticks: [6] }, 'icon.i': { frames: ['art/icons/i.txt:0'], ticks: [4] }, 'k.green': { frames: ['a/x.bmp'], ticks: [6] } },
  };
  const manifest = { entries: [{ name: 'k.walk', list: 'a/k.txt' }, { name: 'icon.i', art: 'icons/i.txt' }, { name: 'k.green', from: 'k.walk', swap: 'rg' }] };
  const pixels = { width: 2, rgba: new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]) };
  const s = atlasSprites(json, pixels, manifest);
  assert.deepEqual(s.map((x) => [x.name, x.path.join('/')]), [['icon.i', 'art/icons'], ['k.green', 'pack/a'], ['k.walk', 'pack/a']]);
  assert.match(s[1].source, /from k\.walk · swap rg/);
  const d = await s[0].load();
  assert.deepEqual([...d.frames[0].rgba], [4, 5, 6, 255]);
  assert.deepEqual(d.ticks, [4]);
});

test('the real manifest puts every atlas sprite in a folder', () => {
  const json = JSON.parse(read('assets/atlas.json'));
  const manifest = JSON.parse(read('tools/manifest.json'));
  const s = atlasSprites(json, { width: 1, rgba: new Uint8Array(4) }, manifest);
  assert.ok(s.length > 50);
  assert.deepEqual(s.filter((x) => x.path[0] === 'other').map((x) => x.name), []);
  assert.ok(s.every((x) => !x.name.includes('@t')));
  const byName = new Map(manifest.entries.map((e) => [e.name, e]));
  assert.deepEqual(entryPath(byName.get('horse.walk'), byName), ['art', 'enemies']);
});

test('isArtText, asSequence, joinPath', () => {
  assert.ok(isArtText('# c\nkey\n  r red\nframe\nr\n'));
  assert.ok(!isArtText('a0.bmp a1.bmp'));
  assert.deepEqual(asSequence('FANCY\nf0.bmp 4\nf1.BMP 2').map((f) => f.ticks), [8, 4]);
  assert.equal(asSequence('just some notes'), null);
  assert.equal(asSequence(''), null);
  assert.equal(joinPath(['a', 'b'], '../c/./d.bmp'), 'a/c/d.bmp');
  assert.equal(joinPath([], 'x\\y.bmp'), 'x/y.bmp');
});

test('sheetRects: grid cut, ticks as one number or a list', () => {
  const a = sheetRects(32, 16, { frameWidth: 16, frameHeight: 16, ticks: [3, 9] });
  assert.deepEqual(a.rects.map((r) => r.x), [0, 16]);
  assert.deepEqual(a.ticks, [3, 9]);
  assert.deepEqual(sheetRects(32, 32, { frameWidth: 16, frameHeight: 16, ticks: 4 }).ticks, [4, 4, 4, 4]);
  assert.deepEqual(sheetRects(8, 8, null), { rects: [{ x: 0, y: 0, w: 8, h: 8 }], ticks: [6] });
});

test('scanFolder: text art, frame lists, loose images, sheets; other files ignored', async () => {
  const red = makeBmp([[[255, 0, 0]]]), blue = makeBmp([[[0, 0, 255]]]);
  const files = fileMap({
    'palette.txt': 'red #ff0000\n',
    'README.md': '# notes',
    'notes.txt': 'not art, not a list',
    'icons/gem.txt': 'key\n  r red\nframe 4\nr.\nframe\n.r\n',
    'knight/walk.txt': 'FANCY\nk0.bmp 3\nk1.bmp 3\nmissing.bmp 3\n',
    'knight/k0.bmp': red,
    'knight/k1.bmp': blue,
    'loose.bmp': blue,
    'sheet.png': new Uint8Array([1]),
    'sheet.anim.json': JSON.stringify({ frameWidth: 1, frameHeight: 1, ticks: 5 }),
  });
  const decodeImage = async () => ({ width: 2, height: 1, rgba: new Uint8Array([1, 1, 1, 255, 2, 2, 2, 255]) });
  const s = await scanFolder(files, { decodeImage });
  assert.deepEqual(s.map((x) => `${x.path.join('/')}/${x.name}`), ['/loose.bmp', '/sheet.png', 'icons/gem', 'knight/walk']);

  const gem = await s[2].load();
  assert.deepEqual(gem.ticks, [4, 6]);
  assert.deepEqual([...gem.frames[0].rgba.subarray(0, 4)], [255, 0, 0, 255]);

  const walk = await s[3].load();
  assert.deepEqual(walk.ticks, [6, 6]);
  assert.deepEqual(walk.frames.map((f) => [...f.rgba.subarray(0, 3)]), [[255, 0, 0], [0, 0, 255]]);
  assert.deepEqual(walk.warnings, ['missing knight/missing.bmp']);

  const sheet = await s[1].load();
  assert.equal(sheet.frames.length, 2);
  assert.deepEqual(sheet.ticks, [5, 5]);
});

test('scanFolder: text art uses the fallback palette when the folder has none; errors surface on load', async () => {
  const fallbackPalette = { colors: new Map([['red', [255, 0, 0]]]), byHex: new Map([['#ff0000', 'red']]), order: ['red'] };
  const s = await scanFolder(fileMap({ 'a.txt': 'key\n  r red\nframe\nr\n', 'b.txt': 'key\n  r nope\nframe\nr\n' }), { fallbackPalette });
  assert.equal((await s[0].load()).frames[0].rgba[0], 255);
  await assert.rejects(s[1].load(), /b\.txt:2: unknown colour "nope"/);
});

test('the repo art folder scans clean with the game palette', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const { join, relative } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('art/', root));
  const obj = {};
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else obj[relative(dir, p).split('\\').join('/')] = readFileSync(p, 'utf8'); } };
  walk(dir);
  const s = await scanFolder(fileMap(obj));
  assert.ok(s.length >= 30);
  for (const sp of s) {
    const d = await sp.load();
    assert.deepEqual(d.warnings, [], sp.name);
  }
});

test('filterSprites matches every word against name, folder and source', () => {
  const list = [{ name: 'horse.walk', path: ['art', 'enemies'], source: 'art/enemies/horse.txt' }, { name: 'knight.walk', path: ['pack', 'knight'], source: 'pack knight/knight.txt' }];
  assert.deepEqual(filterSprites(list, 'WALK enem').map((s) => s.name), ['horse.walk']);
  assert.equal(filterSprites(list, '  ').length, 2);
});
