// Asset pipeline: BMP decoder, PNG writer, packer, sequence parser, and the committed outputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { decodeBmp } from '../tools/lib/bmp.mjs';
import { crc32, encodePng, pngSize } from '../tools/lib/png.mjs';
import { packShelves, parseSequence, formatAnimsJs } from '../tools/build-atlas.mjs';
import { ANIMS } from '../src/sim/anims.js';

const ROOT = new URL('..', import.meta.url);
const path = (p) => new URL(p, ROOT);
const manifest = JSON.parse(readFileSync(path('tools/manifest.json'), 'utf8'));
const atlas = JSON.parse(readFileSync(path('assets/atlas.json'), 'utf8'));
const atlasPng = readFileSync(path('assets/atlas.png'));

// ---------- helpers: synthetic BMPs, PNG reader ----------

/** Build a BMP. pixels: rows listed top to bottom, each [r,g,b]; or palette indexes when `palette` is given. */
function makeBmp({ width, height, bits, rows, palette, topDown = false }) {
  const stride = Math.floor((bits * width + 31) / 32) * 4;
  const palBytes = palette ? palette.length * 4 : 0;
  const dataOffset = 54 + palBytes;
  const buf = Buffer.alloc(dataOffset + stride * height, 0xee); // 0xee padding bytes must be ignored
  buf.write('BM', 0, 'latin1');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(dataOffset, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(topDown ? -height : height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(bits, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(palette ? palette.length : 0, 46);
  (palette || []).forEach(([r, g, b], i) => buf.writeUInt32LE((b | (g << 8) | (r << 16)) >>> 0, 54 + i * 4));
  for (let y = 0; y < height; y++) {
    const fileRow = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const o = dataOffset + fileRow * stride;
      const px = rows[y][x];
      if (bits === 24) { buf[o + x * 3] = px[2]; buf[o + x * 3 + 1] = px[1]; buf[o + x * 3 + 2] = px[0]; }
      else buf[o + x] = px;
    }
  }
  return buf;
}

/** Parse a PNG, verify every chunk CRC, inflate and unfilter. Returns { width, height, rgba }. */
function readPng(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let off = 8, ihdr = null;
  const idat = [];
  let sawIend = false;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    assert.equal(buf.readUInt32BE(off + 8 + len), crc32(buf.subarray(off + 4, off + 8 + len)), `bad CRC in ${type}`);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') sawIend = true;
    off += 12 + len;
  }
  assert.ok(ihdr && sawIend && idat.length, 'IHDR, IDAT and IEND must all be present');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  assert.equal(ihdr[8], 8);
  assert.equal(ihdr[9], 6);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  assert.equal(raw.length, (stride + 1) * height);
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      const a = i >= 4 ? out[y * stride + i - 4] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= 4 && y > 0 ? out[(y - 1) * stride + i - 4] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else assert.equal(f, 0, `unknown PNG filter ${f}`);
      out[y * stride + i] = (v + p) & 0xff;
    }
  }
  return { width, height, rgba: out };
}

// ---------- BMP decoder ----------

const RED = [255, 0, 0], GREEN = [0, 255, 0], BLUE = [0, 0, 255], BLACK = [0, 0, 0], WHITE = [250, 250, 250], GREY = [1, 2, 3];
const px = (c, a = 255) => [...c, a];

test('BMP: 24-bit, width 3 (row padding), bottom-up, black key becomes alpha 0', () => {
  const rows = [[RED, GREEN, BLUE], [BLACK, WHITE, GREY]];
  const d = decodeBmp(makeBmp({ width: 3, height: 2, bits: 24, rows }));
  assert.equal(d.width, 3);
  assert.equal(d.height, 2);
  assert.deepEqual([...d.rgba], [
    ...px(RED), ...px(GREEN), ...px(BLUE),
    ...px(BLACK, 0), ...px(WHITE), ...px(GREY), // (1,2,3) is not the key: opaque
  ]);
});

test('BMP: 24-bit top-down (negative height)', () => {
  const rows = [[RED, GREEN, BLUE], [BLACK, WHITE, GREY]];
  const d = decodeBmp(makeBmp({ width: 3, height: 2, bits: 24, rows, topDown: true }));
  assert.equal(d.height, 2);
  assert.deepEqual([...d.rgba.subarray(0, 4)], px(RED));
  assert.deepEqual([...d.rgba.subarray(12, 16)], px(BLACK, 0));
});

test('BMP: 8-bit palette (width 5, padding) maps colours and keys black', () => {
  const palette = [BLACK, RED, GREEN, BLUE];
  const rows = [[1, 2, 3, 0, 1], [0, 0, 3, 2, 1]];
  const d = decodeBmp(makeBmp({ width: 5, height: 2, bits: 8, rows, palette }));
  const at = (x, y) => [...d.rgba.subarray((y * 5 + x) * 4, (y * 5 + x) * 4 + 4)];
  assert.deepEqual(at(0, 0), px(RED));
  assert.deepEqual(at(1, 0), px(GREEN));
  assert.deepEqual(at(2, 0), px(BLUE));
  assert.deepEqual(at(3, 0), px(BLACK, 0));
  assert.deepEqual(at(0, 1), px(BLACK, 0));
  assert.deepEqual(at(4, 1), px(RED));
});

test('BMP: rejects unsupported and truncated files', () => {
  assert.throws(() => decodeBmp(Buffer.from('not a bmp at all, definitely not, no way, none whatsoever at all')), /not a BMP/);
  const ok = makeBmp({ width: 3, height: 2, bits: 24, rows: [[RED, RED, RED], [RED, RED, RED]] });
  assert.throws(() => decodeBmp(ok.subarray(0, ok.length - 4)), /truncated/);
  const bad = Buffer.from(ok);
  bad.writeUInt16LE(16, 28);
  assert.throws(() => decodeBmp(bad), /bit depth/);
});

// ---------- PNG writer ----------

test('PNG: crc32 matches the standard check value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('PNG: write, parse chunks, check CRCs, inflate, unfilter, compare pixels', () => {
  const w = 7, h = 5;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37 + (i >> 3)) & 0xff;
  const png = encodePng(w, h, rgba);
  assert.deepEqual(pngSize(png), { width: w, height: h });
  const back = readPng(png);
  assert.equal(back.width, w);
  assert.equal(back.height, h);
  assert.deepEqual(back.rgba, rgba);
  assert.throws(() => encodePng(2, 2, new Uint8Array(3)), /wrong length/);
});

// ---------- sequence parser ----------

test('parseSequence: CRLF, blank lines, trailing spaces, missing final newline, several names per line', () => {
  const text = 'a0.bmp\r\na1.bmp \r\n\r\n  \r\na2.bmp';
  assert.deepEqual(parseSequence(text).map((f) => f.file), ['a0.bmp', 'a1.bmp', 'a2.bmp']);
  assert.deepEqual(parseSequence(text).map((f) => f.ticks), [6, 6, 6]);
  assert.deepEqual(parseSequence('1.bmp 2.bmp').map((f) => f.file), ['1.bmp', '2.bmp']);
  assert.deepEqual(parseSequence('x.bmp\r\n\r\n\r\n').map((f) => f.file), ['x.bmp']);
});

test('parseSequence: FANCY durations are doubled to 60 Hz ticks', () => {
  const r = parseSequence('FANCY\r\nf0.bmp 4\r\nf1.bmp 10 \r\nf2.bmp 2');
  assert.deepEqual(r, [{ file: 'f0.bmp', ticks: 8 }, { file: 'f1.bmp', ticks: 20 }, { file: 'f2.bmp', ticks: 4 }]);
  assert.throws(() => parseSequence('FANCY\nf0.bmp'), /odd/);
  assert.throws(() => parseSequence('FANCY\nf0.bmp x'), /not a positive integer/);
});

// ---------- packer ----------

test('packShelves: no overlap (including padding), inside the atlas, deterministic', () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const rects = Array.from({ length: 120 }, (_, i) => ({ key: `r${i}`, w: 1 + rnd(64), h: 1 + rnd(64) }));
  const a = packShelves(rects, 256, 1);
  const b = packShelves([...rects].reverse(), 256, 1);
  for (const r of rects) assert.deepEqual(a.placed.get(r.key), b.placed.get(r.key), 'placement must not depend on input order');
  const list = [...a.placed.values()];
  assert.equal(list.length, rects.length);
  for (const r of list) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= a.width && r.y + r.h <= a.height, 'inside the atlas');
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i], q = list[j];
      const apart = p.x + p.w + 1 <= q.x || q.x + q.w + 1 <= p.x || p.y + p.h + 1 <= q.y || q.y + q.h + 1 <= p.y;
      assert.ok(apart, `rects ${i} and ${j} overlap or touch`);
    }
  }
  assert.throws(() => packShelves([{ key: 'wide', w: 300, h: 4 }], 256, 1), /wider/);
});

// ---------- committed outputs ----------

test('atlas.json: every manifest name is an anim, every anim frame is a frame, ticks line up', () => {
  for (const e of manifest.entries) assert.ok(atlas.anims[e.name], `anim ${e.name} missing from atlas.json`);
  assert.equal(Object.keys(atlas.anims).length, manifest.entries.length);
  for (const [name, a] of Object.entries(atlas.anims)) {
    assert.ok(a.frames.length > 0, `${name} has no frames`);
    assert.equal(a.ticks.length, a.frames.length, `${name}: ticks.length !== frames.length`);
    for (const t of a.ticks) assert.ok(Number.isInteger(t) && t > 0, `${name}: bad tick ${t}`);
    for (const f of a.frames) assert.ok(atlas.frames[f], `${name}: frame ${f} missing`);
  }
});

test('atlas.json: every frame rect is inside atlas.png and frames do not overlap', () => {
  const { width, height } = pngSize(atlasPng);
  const rects = Object.entries(atlas.frames);
  for (const [k, r] of rects) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0, `${k}: bad rect`);
    assert.ok(r.x + r.w <= width && r.y + r.h <= height, `${k}: outside ${width}x${height}`);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const p = rects[i][1], q = rects[j][1];
      assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${rects[i][0]} overlaps ${rects[j][0]}`);
    }
  }
});

test('atlas.png decodes; pixels are fully opaque or fully transparent, and no opaque pixel is key black', () => {
  const png = readPng(atlasPng);
  assert.equal(png.width, pngSize(atlasPng).width);
  for (let i = 0; i < png.rgba.length; i += 4) {
    const [r, g, b, a] = [png.rgba[i], png.rgba[i + 1], png.rgba[i + 2], png.rgba[i + 3]];
    assert.ok(a === 0 || a === 255);
    if (a === 255) assert.ok(r || g || b, 'opaque black pixel: key colour was not removed');
  }
});

test('sprite sizes match spec §3.3', () => {
  const size = (name) => {
    const sizes = new Set(atlas.anims[name].frames.map((f) => `${atlas.frames[f].w}x${atlas.frames[f].h}`));
    assert.equal(sizes.size, 1, `${name} has mixed frame sizes`);
    return [...sizes][0];
  };
  const expected = {
    'dragon.dir': '25x25', 'knight.walk': '16x16', 'golem.walk': '64x64', 'golem.die': '64x64',
    'fireball.anim': '8x8', 'fireball.big': '12x12', 'laser.dir': '8x8', 'laser.bigdir': '12x12',
    castle: '30x30', 'explosion.small': '30x30', 'explosion.big': '57x57', 'explosion.laser': '45x45',
    'explosion.laserbig': '64x64', burn: '16x16', 'icon.nuke': '9x9',
  };
  for (const [name, s] of Object.entries(expected)) assert.equal(size(name), s, name);
});

test('anims.js ticks equal atlas.json ticks for every name', () => {
  assert.deepEqual(Object.keys(ANIMS), Object.keys(atlas.anims).sort());
  for (const [name, a] of Object.entries(atlas.anims)) assert.deepEqual(ANIMS[name].ticks, a.ticks, name);
});

test('anims.js is exactly what the generator writes for atlas.json', () => {
  assert.equal(readFileSync(path('src/sim/anims.js'), 'utf8'), formatAnimsJs(atlas.anims));
});

test('direction sheets have exactly 16 frames', () => {
  for (const name of ['dragon.dir', 'laser.dir', 'laser.bigdir']) assert.equal(atlas.anims[name].frames.length, 16, name);
});

test('tick defaults: plain lists 6, singles [6], FANCY doubled', () => {
  assert.deepEqual(atlas.anims['castle'].ticks, [6]);
  assert.deepEqual(atlas.anims['icon.ring'].ticks, [6]);
  assert.deepEqual(atlas.anims['knight.walk'].ticks, [6, 6]);
  assert.deepEqual(atlas.anims['slime.split'].ticks, [8, 20, 4, 4, 4, 4, 4]);
  assert.deepEqual(atlas.anims['ghost.burn'].ticks, Array(11).fill(2));
});

test('spec §3.3 names are all in the manifest (except gem), and the sounds match', () => {
  const spec = readFileSync(path('docs/demo-spec.md'), 'utf8');
  const section = spec.slice(spec.indexOf('### 3.3'), spec.indexOf('## 4.'));
  const names = [];
  for (const row of section.split('\n').filter((l) => l.startsWith('| `'))) {
    for (const m of row.split('|')[1].matchAll(/`([^`]+)`/g)) names.push(m[1]);
  }
  assert.ok(names.length >= 36, `parsed only ${names.length} names from the spec table`);
  const have = new Set(manifest.entries.map((e) => e.name));
  for (const n of names.filter((n) => n !== 'gem')) assert.ok(have.has(n), `spec name ${n} missing from manifest`);
  for (const n of have) assert.ok(names.includes(n), `manifest name ${n} is not in spec §3.3`);
  const soundLine = section.split('\n').find((l) => l.startsWith('Sounds copied'));
  const sounds = [...soundLine.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual(manifest.sounds, sounds);
  for (const s of sounds) {
    const wav = readFileSync(path(`assets/sounds/${s}.wav`));
    assert.equal(wav.toString('latin1', 0, 4), 'RIFF', `${s}.wav is not a RIFF file`);
    assert.equal(wav.toString('latin1', 8, 12), 'WAVE');
  }
});

// ---------- rebuild from the source pack (skipped without it) ----------

test('rebuilding from the source pack reproduces the committed outputs', (t) => {
  const source = process.env.DRAGONGAME_ASSETS || manifest.sourceRoot;
  if (!existsSync(source)) return t.skip(`source pack not found: ${source}`);
  const out = mkdtempSync(join(tmpdir(), 'atlas-test-'));
  try {
    const run = (script) => execFileSync(process.execPath, [fileURLToPath(new URL(`../tools/${script}`, import.meta.url)), '--source', source, '--out', out], { stdio: 'pipe' });
    run('build-atlas.mjs');
    run('copy-sounds.mjs');
    assert.equal(readFileSync(join(out, 'assets/atlas.json'), 'utf8'), readFileSync(path('assets/atlas.json'), 'utf8'));
    assert.equal(readFileSync(join(out, 'src/sim/anims.js'), 'utf8'), readFileSync(path('src/sim/anims.js'), 'utf8'));
    // Compare pixels, not PNG bytes: deflate output may differ between zlib versions.
    const fresh = readPng(readFileSync(join(out, 'assets/atlas.png')));
    const committed = readPng(atlasPng);
    assert.equal(fresh.width, committed.width);
    assert.equal(fresh.height, committed.height);
    assert.ok(Buffer.from(fresh.rgba).equals(Buffer.from(committed.rgba)), 'atlas pixels differ');
    for (const s of manifest.sounds) {
      assert.ok(readFileSync(join(out, `assets/sounds/${s}.wav`)).equals(readFileSync(path(`assets/sounds/${s}.wav`))), `${s}.wav differs`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
