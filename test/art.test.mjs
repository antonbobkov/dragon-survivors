// Text pixel art pipeline: art format, palette, variants (tint, outline), art entries in the build,
// the committed icons, and the art preview's helpers. None of these tests needs the external pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { parseArt, parsePalette, parseHex, toHex, frameToText } from '../tools/lib/art.mjs';
import { luminance, tintFrame, tintColor, outlineFrame, swapFrame } from '../tools/lib/variants.mjs';
import { buildAtlas, resolveManifest, parseOps, applyOps, spacedJson } from '../tools/build-atlas.mjs';
import { countColors, formatPalette } from '../tools/palette.mjs';
import { frameAt, groupNames } from '../tools/art-preview.mjs';
import { framesToArt, keyChars } from '../tools/bmp-to-art.mjs';

const ROOT = new URL('..', import.meta.url);
const path = (p) => new URL(p, ROOT);
const read = (p) => readFileSync(path(p), 'utf8');
const manifest = JSON.parse(read('tools/manifest.json'));
const atlas = JSON.parse(read('assets/atlas.json'));
const palette = parsePalette(read('art/palette.txt'), 'art/palette.txt');

const PAL = parsePalette('# test palette\nred #ff0000\ngold #ffbf00  some notes\n\nblack #010000\n');

/** Minimal PNG reader for the committed atlas (filters 0-4). */
function readPng(buf) {
  let off = 8, w = 0, h = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(off + 8); h = buf.readUInt32BE(off + 12); }
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * 4, out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      const a = i >= 4 ? out[y * stride + i - 4] : 0, b = y ? out[(y - 1) * stride + i] : 0, c = i >= 4 && y ? out[(y - 1) * stride + i - 4] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + i] = (v + p) & 0xff;
    }
  }
  return { width: w, height: h, rgba: out };
}

/** The pixels of atlas frame `key` as a decoded frame. */
function atlasFrame(png, json, key) {
  const r = json.frames[key];
  const rgba = new Uint8Array(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) rgba.set(png.rgba.subarray(((r.y + y) * png.width + r.x) * 4, ((r.y + y) * png.width + r.x + r.w) * 4), y * r.w * 4);
  return { width: r.w, height: r.h, rgba };
}

const pixel = (d, x, y) => [...d.rgba.subarray((y * d.width + x) * 4, (y * d.width + x) * 4 + 4)];

/** A decoded frame from rows of chars: '.' transparent, others looked up in `colors`. */
function frame(rows, colors) {
  const w = rows[0].length, h = rows.length, rgba = new Uint8Array(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    rgba.set([...colors[ch], 255], (y * w + x) * 4);
  }));
  return { width: w, height: h, rgba };
}

// ---------- palette file ----------

test('palette: names, hex, notes and comments; lookups both ways', () => {
  assert.deepEqual(PAL.order, ['red', 'gold', 'black']);
  assert.deepEqual(PAL.colors.get('gold'), [255, 191, 0]);
  assert.equal(PAL.byHex.get('#010000'), 'black');
  assert.deepEqual(parseHex('#A0a0A4'), [160, 160, 164]);
  assert.equal(parseHex('a0a0a4'), null);
  assert.equal(toHex([1, 2, 255]), '#0102ff');
});

test('palette: errors name the line', () => {
  assert.throws(() => parsePalette('red #ff0000\nred #00ff00', 'p.txt'), /p\.txt:2: duplicate colour name "red"/);
  assert.throws(() => parsePalette('red #ff0000\ncrimson #FF0000', 'p.txt'), /p\.txt:2: #ff0000 is already named "red"/);
  assert.throws(() => parsePalette('\nred ff0000', 'p.txt'), /p\.txt:2: expected "name #rrggbb"/);
  assert.throws(() => parsePalette('Red #ff0000', 'p.txt'), /p\.txt:1: bad colour name/);
});

test('palette tool: counts colours by pixels, keeps names by colour, drops rare colours, round-trips', () => {
  const a = frame(['rrg', 'r.b'], { r: [255, 0, 0], g: [0, 255, 0], b: [0, 0, 255] });
  const b = frame(['rr', 'gg'], { r: [255, 0, 0], g: [0, 255, 0] });
  const counted = countColors([a, b]);
  assert.deepEqual(counted.map((c) => [c.hex, c.pixels, c.frames]), [['#ff0000', 5, 2], ['#00ff00', 3, 2], ['#0000ff', 1, 1]]);
  const text = formatPalette(counted, { min: 2, names: new Map([['#ff0000', 'red']]), frameTotal: 2 });
  const back = parsePalette(text);
  assert.deepEqual(back.order, ['red', 'c.00ff00'], 'blue has 1 pixel < min 2; green gets an automatic name');
  assert.deepEqual(formatPalette(counted, { count: 1 }).split('\n').filter((l) => l && !l.startsWith('#')).length, 1);
});

test('committed palette: the pack colours, named, no pure black', () => {
  assert.ok(palette.order.length >= 20 && palette.order.length <= 32, `${palette.order.length} colours`);
  for (const name of ['red', 'gold', 'gold.dark', 'brown', 'yellow', 'white', 'silver', 'grey', 'cyan', 'green', 'blue', 'black']) {
    assert.ok(palette.colors.has(name), `palette has ${name}`);
  }
  assert.ok(!palette.byHex.has('#000000'));
  for (const name of palette.order) assert.ok(!name.startsWith('c.'), `${name}: give every colour a name`);
});

// ---------- art format ----------

const ART = `# a comment
key            # comment after a header
  . transparent
  r red
  g gold       # palette name
  x #123456    # a colour outside the palette

frame
r.g
.x.
frame 12       # held for 12 ticks
g.r
rrr
`;

test('art: frames, key by palette name or hex, transparency, default and explicit ticks', () => {
  const a = parseArt(ART, PAL, 'a.txt');
  assert.equal(a.width, 3);
  assert.equal(a.height, 2);
  assert.deepEqual(a.frames.map((f) => f.ticks), [6, 12]);
  const f0 = a.frames[0];
  assert.deepEqual(pixel(f0, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(f0, 1, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(f0, 2, 0), [255, 191, 0, 255]);
  assert.deepEqual(pixel(f0, 1, 1), [0x12, 0x34, 0x56, 255]);
  assert.deepEqual(frameToText(a.frames[1]).rows, ['A.B', 'BBB']);
});

test('art: CRLF, a BOM, indentation and blank lines are fine', () => {
  const a = parseArt('﻿key\r\n  r red\r\n\r\nframe 3\r\n  r.\r\n  .r\r\n', PAL);
  assert.deepEqual(frameToText(a.frames[0]).rows, ['A.', '.A']);
  assert.equal(a.frames[0].ticks, 3);
});

test('art: a hex colour outside the palette is a warning, not an error', () => {
  const a = parseArt(ART, PAL, 'a.txt');
  assert.deepEqual(a.warnings, ['a.txt:6: colour #123456 (key "x") is not in the palette']);
  assert.deepEqual(parseArt('key\nr #ff0000\nframe\nr', PAL).warnings, [], 'a hex colour that is in the palette is fine');
});

test('art: errors name the file and line', () => {
  const bad = (text, re) => assert.throws(() => parseArt(text, PAL, 'b.txt'), re);
  bad('key\nr red\nframe\nr.\nrz', /b\.txt:5: "z" is not in the key/);
  bad('key\nr red\nframe\nr.\nr', /b\.txt:5: row is 1 wide, frame 0 is 2/);
  bad('key\nr red\nframe\nr\nframe\nr\nr', /b\.txt:5: frame 1 is 2 rows high, frame 0 is 1/);
  bad('key\nr red\nframe 0\nr', /b\.txt:3: frame duration "0"/);
  bad('key\nr red\nframe 1.5\nr', /b\.txt:3: frame duration "1\.5"/);
  bad('key\nr crimson\nframe\nr', /b\.txt:2: unknown colour "crimson"/);
  bad('key\nr red\nr gold\nframe\nr', /b\.txt:3: key "r" defined twice/);
  bad('key\nrr red\nframe\nr', /b\.txt:2: key "rr" must be a single character/);
  bad('key\nk #000000\nframe\nk', /b\.txt:2: pure black is the transparency key/);
  bad('key\n. red\nframe\nr', /b\.txt:2: "\." is always transparent/);
  bad('key\nr red\nframe\nr\nkey', /b\.txt:5: the key must come before the first frame/);
  bad('key\nr red\nframe\nr r', /b\.txt:4: a pixel row cannot contain spaces/);
  bad('r red', /b\.txt:1: expected "key" or "frame"/);
  bad('key\nr red\nframe\nframe\nr', /b\.txt:3: frame 0 is empty/);
  bad('key\nr red extra\nframe\nr', /b\.txt:2: unexpected "extra"/);
  bad('key\nr red\n', /b\.txt: no frames/);
});

test('art: without a palette only hex colours work, with no warnings', () => {
  assert.deepEqual(parseArt('key\nr #ff0000\nframe\nr', null).warnings, []);
  assert.throws(() => parseArt('key\nr red\nframe\nr', null), /unknown colour "red"/);
});

// ---------- variants ----------

const RAMP = { a: [255, 255, 255], b: [191, 191, 191], c: [255, 0, 0], d: [127, 127, 127], e: [0, 0, 255], f: [63, 31, 0], g: [1, 0, 0] };

test('tint: keeps the luminance order of every colour (shading survives), at any strength', () => {
  const src = frame(['abcdefg'], RAMP);
  const order = (d) => [...Array(d.width).keys()].map((x) => { const [r, g, b] = pixel(d, x, 0); return luminance(r, g, b); });
  const before = order(src);
  for (const tint of [[205, 127, 50], [200, 216, 255], [255, 215, 0], [255, 0, 0]]) {
    for (const s of [0.3, 0.6, 1]) {
      const after = order(tintFrame(src, tint, s));
      for (let i = 0; i < before.length; i++) {
        for (let j = 0; j < before.length; j++) {
          if (before[i] > before[j] + 0.01) assert.ok(after[i] >= after[j], `tint ${tint} @${s}: ${i} brighter than ${j} before, not after`);
        }
        assert.ok(Math.abs(after[i] - before[i]) < 0.01, `tint ${tint} @${s}: luminance of ${i} moved ${before[i]} -> ${after[i]}`);
      }
    }
  }
});

test('tint: full strength is the tint colour scaled to each luminance; transparent stays transparent; never key black', () => {
  const t = [255, 191, 0];
  assert.deepEqual(tintColor(luminance(...t), t).map(Math.round), t, 'a pixel as bright as the tint becomes the tint');
  assert.deepEqual(tintColor(1, t).map(Math.round), [255, 255, 255]);
  assert.deepEqual(tintColor(0, t).map(Math.round), [0, 0, 0]);
  const src = frame(['g.a'], RAMP);
  const out = tintFrame(src, t, 1);
  assert.deepEqual(pixel(out, 1, 0), [0, 0, 0, 0]);
  assert.notDeepEqual(pixel(out, 0, 0).slice(0, 3), [0, 0, 0], 'a near-black pixel must not become the key colour');
  assert.equal(pixel(out, 0, 0)[3], 255);
  assert.deepEqual([...tintFrame(src, t, 0).rgba], [...src.rgba], 'strength 0 changes nothing');
  assert.deepEqual([...src.rgba], [...frame(['g.a'], RAMP).rgba], 'the input is not modified');
  assert.throws(() => tintFrame(src, t, 1.5), /strength/);
});

test('outline: grows the frame by 2 px, borders opaque pixels edge-on only, keeps every original pixel', () => {
  const src = frame(['a..', '...', '..c'], RAMP);
  const out = outlineFrame(src, [205, 127, 50]);
  assert.equal(out.width, 5);
  assert.equal(out.height, 5);
  assert.deepEqual(frameToText(out).rows, [
    '.A...',
    'ABA..',
    '.A.A.',
    '..ACA',
    '...A.',
  ]); // A = outline, B = a, C = c; diagonal neighbours (0,0), (2,2), (4,4) are not outlined
  assert.deepEqual(pixel(out, 1, 1), [...RAMP.a, 255]);
  assert.deepEqual(pixel(out, 3, 3), [...RAMP.c, 255]);
  assert.deepEqual(pixel(out, 0, 1), [205, 127, 50, 255]);
  // every outline pixel touches an opaque source pixel edge-on; no opaque source pixel was replaced
  const solid = outlineFrame(frame(['aa', 'aa'], RAMP), [1, 2, 3]);
  assert.deepEqual(frameToText(solid).rows, ['.AA.', 'ABBA', 'ABBA', '.AA.']);
});

test('variants: ops run swap, then tint, then outline, whatever the field order; keys carry every op', () => {
  const ops = parseOps({ name: 'x', outline: '#CD7F32', tint: '#c8d8ff', tintStrength: 0.6, swap: 'rg' });
  assert.deepEqual(ops.map((o) => o.op), ['swap', 'tint', 'outline']);
  assert.equal(ops.map((o) => o.suffix).join(''), '#rg#tint=c8d8ff@0.6#outline=cd7f32');
  const src = frame(['cd'], RAMP);
  const manual = outlineFrame(tintFrame(swapFrame(src, [0, 1]), [200, 216, 255], 0.6), [205, 127, 50]);
  assert.deepEqual([...applyOps(src, ops).rgba], [...manual.rgba]);
  const otherOrder = tintFrame(outlineFrame(swapFrame(src, [0, 1]), [205, 127, 50]), [200, 216, 255], 0.6);
  assert.notDeepEqual([...applyOps(src, ops).rgba], [...otherOrder.rgba], 'tinting after the outline would tint the outline too');
  assert.equal(parseOps({ name: 'y', tint: '#ffd700' })[0].strength, 1);
  assert.deepEqual(parseOps({ name: 'z' }), []);
});

test('variants: manifest validation', () => {
  const bad = (e, re) => assert.throws(() => resolveManifest({ entries: [{ name: 'k', files: ['k.bmp'] }, e] }, '/unused', { artRoot: '/unused' }), re);
  bad({ name: 'a', from: 'k', tint: 'gold' }, /bad tint "gold"/);
  bad({ name: 'a', from: 'k', tint: '#ffd700', tintStrength: 0 }, /tintStrength 0 is not in \(0, 1\]/);
  bad({ name: 'a', from: 'k', tintStrength: 0.5 }, /tintStrength without tint/);
  bad({ name: 'a', from: 'k', outline: '#000000' }, /outline cannot be pure black/);
  bad({ name: 'a', from: 'nope' }, /from "nope" is not an earlier entry/);
  bad({ name: 'a', from: 'k', file: 'x.bmp' }, /exactly one/);
  bad({ name: 'a', from: 'k', tnit: '#ffffff' }, /unknown field "tnit"/);
  bad({ name: 'a', file: 'art/x.bmp' }, /collide with art keys/);
  bad({ name: 'a', art: 'missing.txt' }, /missing art file art\/missing\.txt/);
});

// ---------- build ----------

test('build: art entries and generated variants go into the atlas next to BMP-free entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'art-build-'));
  try {
    mkdirSync(join(root, 'icons'));
    writeFileSync(join(root, 'palette.txt'), 'red #ff0000\ngold #ffbf00\n');
    writeFileSync(join(root, 'icons', 'x.txt'), 'key\nr red\ng gold\nq #123456\nframe 4\nrg\nq.\nframe\ng.\n.r\n');
    const m = { entries: [
      { name: 'x', art: 'icons/x.txt' },
      { name: 'x.gold', from: 'x', tint: '#ffd700', tintStrength: 0.5, outline: '#ffd700' },
      { name: 'x.swap', art: 'icons/x.txt', swap: 'rb' },
    ] };
    const out = buildAtlas(m, '/no-pack-needed', { artRoot: root });
    assert.deepEqual(out.warnings, ['art/icons/x.txt:4: colour #123456 (key "q") is not in the palette']);
    const json = JSON.parse(out.atlasJson);
    assert.deepEqual(json.anims.x, { frames: ['art/icons/x.txt:0', 'art/icons/x.txt:1'], ticks: [4, 6] });
    assert.deepEqual(json.anims['x.gold'].frames, ['art/icons/x.txt:0#tint=ffd700@0.5#outline=ffd700', 'art/icons/x.txt:1#tint=ffd700@0.5#outline=ffd700']);
    assert.deepEqual(json.anims['x.gold'].ticks, [4, 6]);
    assert.deepEqual(json.anims['x.swap'].frames, ['art/icons/x.txt:0#rb', 'art/icons/x.txt:1#rb']);
    assert.deepEqual([json.frames['art/icons/x.txt:0'].w, json.frames['art/icons/x.txt:0'].h], [2, 2]);
    assert.deepEqual([json.frames['art/icons/x.txt:0#tint=ffd700@0.5#outline=ffd700'].w, json.frames['art/icons/x.txt:0#tint=ffd700@0.5#outline=ffd700'].h], [4, 4]);
    const png = readPng(out.png);
    assert.deepEqual(pixel(atlasFrame(png, json, 'art/icons/x.txt:0'), 1, 0), [255, 191, 0, 255]);
    assert.deepEqual(pixel(atlasFrame(png, json, 'art/icons/x.txt:0#rb'), 0, 0), [0, 0, 255, 255]);
    assert.deepEqual(pixel(atlasFrame(png, json, 'art/icons/x.txt:0#tint=ffd700@0.5#outline=ffd700'), 0, 1), [255, 215, 0, 255]);
    assert.match(out.animsJs, /'x\.gold': \{ ticks: \[4, 6\] \}/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('build: atlas.json keeps strings intact while spacing separators', () => {
  assert.equal(spacedJson({ frames: ['a/b.txt:0', 'c,d'], ticks: [1, 2] }), '{"frames": ["a/b.txt:0", "c,d"], "ticks": [1, 2]}');
  assert.equal(spacedJson({ k: 'say \\"a:b\\"' }), '{"k": "say \\\\\\"a:b\\\\\\""}');
});

// ---------- committed art ----------

const artEntries = manifest.entries.filter((e) => e.art);

test('committed art: every file under art/ parses against the palette with no warnings, and is in the manifest', () => {
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(path(`art/${dir}`), { withFileTypes: true })) {
      if (f.isDirectory()) walk(`${dir}${f.name}/`);
      else if (f.name.endsWith('.txt') && `${dir}${f.name}` !== 'palette.txt') files.push(`${dir}${f.name}`);
    }
  };
  walk('');
  assert.ok(files.length >= 5);
  for (const f of files) {
    const a = parseArt(read(`art/${f}`), palette, `art/${f}`);
    assert.deepEqual(a.warnings, [], f);
    assert.ok(artEntries.some((e) => e.art === f), `art/${f} is not used by any manifest entry`);
  }
});

test('committed atlas: art frames are exactly the art files, pixel for pixel', () => {
  const png = readPng(readFileSync(path('assets/atlas.png')));
  for (const e of artEntries) {
    const a = parseArt(read(`art/${e.art}`), palette, e.art);
    const anim = atlas.anims[e.name];
    assert.ok(anim, `${e.name} missing from atlas.json`);
    assert.deepEqual(anim.ticks, a.frames.map((f) => f.ticks), e.name);
    const ops = parseOps(e);
    anim.frames.forEach((key, i) => {
      assert.ok(key.startsWith('art/'), key);
      const want = applyOps(a.frames[i], ops), got = atlasFrame(png, atlas, key);
      assert.deepEqual([got.width, got.height], [want.width, want.height], key);
      assert.ok(Buffer.from(got.rgba).equals(Buffer.from(want.rgba)), `${key}: atlas pixels differ from the art file`);
    });
  }
});

test('new buff icons: 9×9, in the manifest as art, the pack tray on the bottom two rows', () => {
  const tray = ['YY.....YY', '.YYYYYYY.'];
  for (const name of ['might', 'haste', 'duration', 'force', 'amount']) {
    const e = manifest.entries.find((x) => x.name === `icon.${name}`);
    assert.deepEqual(e, { name: `icon.${name}`, art: `icons/${name}.txt` });
    const a = parseArt(read(`art/icons/${name}.txt`), palette);
    assert.deepEqual([a.width, a.height, a.frames.length], [9, 9, 1], name);
    const rows = frameToText(a.frames[0]).rows;
    // the tray is gold in every bonus icon of the pack
    const gold = a.frames[0];
    const isGold = (x, y) => pixel(gold, x, y).join() === '255,191,0,255';
    tray.forEach((row, dy) => [...row].forEach((ch, x) => {
      if (ch === 'Y') assert.ok(isGold(x, 7 + dy), `${name}: tray pixel (${x}, ${7 + dy}) is not gold`);
    }));
    assert.ok(rows.slice(0, 7).join('').replace(/\./g, '').length >= 10, `${name}: the symbol is too sparse`);
  }
});

test('bmp-to-art: frames print as an art file that parses back to the same pixels', () => {
  const a = frame(['rg.', '.xr'], { r: [255, 0, 0], g: [255, 191, 0], x: [0x12, 0x34, 0x56] });
  const b = frame(['g..', '...'], { g: [255, 191, 0] });
  const text = framesToArt([{ ...a, ticks: 6 }, { ...b, ticks: 9 }], PAL, 'test');
  assert.match(text, /^# test\nkey\n {2}r red\n {2}g gold\n {2}\S #123456\nframe\n/);
  const back = parseArt(text, PAL);
  assert.deepEqual(back.frames.map((f) => f.ticks), [6, 9]);
  assert.deepEqual([...back.frames[0].rgba], [...a.rgba]);
  assert.deepEqual([...back.frames[1].rgba], [...b.rgba]);
  assert.deepEqual([...keyChars(['red', 'red.dark', 'gold', 'grey'])].map(([, c]) => c).join(''), 'regy', 'first free letter of the name');
  assert.deepEqual([...keyChars(['ab', 'ab.x', 'ab.y', 'ba'])].map(([, c]) => c).join(''), 'abyB', 'then upper case');
});

// ---------- art preview ----------

test('art preview: frameAt loops over per-frame ticks; groupNames groups by prefix', () => {
  assert.deepEqual([0, 5, 6, 7, 26, 27, 28].map((t) => frameAt([6, 20, 2], t)), [0, 0, 1, 1, 2, 2, 0]);
  assert.equal(frameAt([6], 12345), 0);
  assert.deepEqual([...groupNames(['icon.b', 'castle', 'icon.a', 'knight.walk'])], [['castle', ['castle']], ['icon', ['icon.a', 'icon.b']], ['knight', ['knight.walk']]]);
});

test('art preview page loads its module and no game file loads it', () => {
  assert.match(read('tools/art-preview.html'), /<script type="module" src="art-preview\.mjs"><\/script>/);
  assert.doesNotMatch(read('index.html'), /art-preview/);
  assert.doesNotMatch(read('src/main.js'), /art-preview/);
});
