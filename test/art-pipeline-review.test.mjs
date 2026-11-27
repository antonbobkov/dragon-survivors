// Gaps found reviewing the art pipeline: op order of `from` entries, the palette's sample set, junk after
// `key` and `frame` lines, tintStrength validation, and frame keys that cannot collide.
// Pure functions and temp files only; no external pack is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArt } from '../tools/lib/art.mjs';
import { swapFrame, tintFrame } from '../tools/lib/variants.mjs';
import { buildAtlas, parseOps, resolveManifest } from '../tools/build-atlas.mjs';
import { plainBmpFiles } from '../tools/palette.mjs';

const ART = 'key\nr #ff0000\ng #00ff00\nb #0000ff\nframe\nrgb\n';

/** A temp art root holding one art file `a.txt`. */
function withArtRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'art-review-'));
  try {
    writeFileSync(join(root, 'a.txt'), ART);
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('from: the entry\'s own ops run after its base entry\'s ops, in the ops list and in the pixels', () => {
  withArtRoot((artRoot) => {
    const manifest = {
      entries: [
        { name: 'base', art: 'a.txt', swap: 'rg' },
        { name: 'derived', from: 'base', tint: '#ff8000', tintStrength: 0.5 },
      ],
    };
    const { anims } = resolveManifest(manifest, '/unused', { artRoot });
    const [f] = anims.get('derived');
    assert.deepEqual(f.ops.map((o) => o.op), ['swap', 'tint'], 'base ops first, then the entry\'s own');
    assert.equal(f.key, 'art/a.txt:0#rg#tint=ff8000@0.5');
    const out = buildAtlas(manifest, '/unused', { artRoot });
    assert.ok(out.frameCount >= 2);
    // Pixels: swap then tint (not tint then swap) of the source frame.
    const src = parseArt(ART).frames[0];
    const right = tintFrame(swapFrame(src, [0, 1]), [255, 128, 0], 0.5);
    const wrong = swapFrame(tintFrame(src, [255, 128, 0], 0.5), [0, 1]);
    assert.notDeepEqual([...right.rgba], [...wrong.rgba], 'the test colours must tell the two orders apart');
    const applied = f.ops.reduce((d, o) => (o.op === 'swap' ? swapFrame(d, o.channels) : tintFrame(d, o.color, o.strength)), src);
    assert.deepEqual([...applied.rgba], [...right.rgba]);
  });
});

test('palette tool samples plain BMP frames only: no variants, no art, each file once, sorted', () => {
  withArtRoot((artRoot) => {
    const manifest = {
      entries: [
        { name: 'b', files: ['z/b.bmp', 'a/a.bmp'] },
        { name: 'b.dup', file: 'a/a.bmp' },
        { name: 'b.red', from: 'b', swap: 'rg' },
        { name: 'c.tint', file: 'c/c.bmp', tint: '#ff0000' },
        { name: 'c.out', file: 'd/d.bmp', outline: '#ffffff' },
        { name: 'e.swap', file: 'e/e.bmp', swap: 'gb' },
        { name: 'art', art: 'a.txt' },
      ],
    };
    const { anims } = resolveManifest(manifest, '/unused', { artRoot });
    assert.deepEqual(plainBmpFiles(anims), ['a/a.bmp', 'z/b.bmp']);
  });
});

test('art: junk after `key` or after a frame header (with or without a duration) is an error; # comments are fine', () => {
  const bad = (text, re) => assert.throws(() => parseArt(text, null, 'j.txt'), re);
  bad('key junk\nr #ff0000\nframe\nr', /j\.txt:1: unexpected "junk"/);
  bad('key\nr #ff0000\nframe 3 junk\nr', /j\.txt:3: unexpected "junk"/);
  bad('key\nr #ff0000\nframe junk\nr', /j\.txt:3: frame duration "junk"/);
  const ok = parseArt('key # the key\nr #ff0000\nframe # first\nr\nframe 4 # second\nr\n', null, 'j.txt');
  assert.deepEqual(ok.frames.map((f) => f.ticks), [6, 4]);
});

test('tintStrength: present but invalid fails the build with the entry name, with or without a tint', () => {
  for (const bad of [null, '0.5', true, NaN, 0, -0.1, 1.5, Infinity, {}, []]) {
    assert.throws(() => parseOps({ name: 'mage.red', tint: '#ff0000', tintStrength: bad }), /manifest entry "mage\.red": tintStrength/, `with tint: ${JSON.stringify(bad)}`);
    assert.throws(() => parseOps({ name: 'mage.red', tintStrength: bad }), /manifest entry "mage\.red": tintStrength without tint/, `without tint: ${JSON.stringify(bad)}`);
  }
  assert.equal(parseOps({ name: 'x', tint: '#ff0000' })[0].strength, 1, 'absent means 1');
  assert.equal(parseOps({ name: 'x', tint: '#ff0000', tintStrength: 1 })[0].strength, 1);
  assert.equal(parseOps({ name: 'x', tint: '#ff0000', tintStrength: 0.25 })[0].strength, 0.25);
  // The same through resolveManifest, as a build would see it.
  assert.throws(() => resolveManifest({ entries: [{ name: 'k', file: 'k.bmp' }, { name: 'v', from: 'k', tint: '#ff0000', tintStrength: null }] }, '/unused'), /manifest entry "v": tintStrength null/);
});

test('frame keys: a BMP, list or art path containing "#" is refused, so a key cannot equal a variant key', () => {
  const root = mkdtempSync(join(tmpdir(), 'art-review-src-'));
  try {
    mkdirSync(join(root, 'l'));
    writeFileSync(join(root, 'l', 'ok.txt'), 'x.bmp\n');
    writeFileSync(join(root, 'l', 'bad.txt'), 'x.bmp#rg\n');
    writeFileSync(join(root, 'l#1.txt'), 'x.bmp\n');
    const run = (e) => resolveManifest({ entries: [e] }, root, { artRoot: root });
    assert.throws(() => run({ name: 'a', file: 'x.bmp#rg' }), /manifest entry "a": BMP path "x\.bmp#rg" contains "#"/);
    assert.throws(() => run({ name: 'a', files: ['y.bmp', 'dir/x#1.bmp'] }), /BMP path "dir\/x#1\.bmp" contains "#"/);
    assert.throws(() => run({ name: 'a', list: 'l/bad.txt' }), /BMP path "l\/x\.bmp#rg" contains "#"/);
    assert.throws(() => run({ name: 'a', list: 'l#1.txt' }), /list path "l#1\.txt" contains "#"/);
    assert.throws(() => run({ name: 'a', art: 'x#rg.txt' }), /art path "x#rg\.txt" contains "#"/);
    // Clean paths still build, and a variant of a file never shares its key with the file itself.
    const { anims } = resolveManifest({ entries: [{ name: 'p', list: 'l/ok.txt' }, { name: 'q', from: 'p', swap: 'rg' }] }, root, { artRoot: root });
    assert.deepEqual(anims.get('p').map((f) => f.key), ['l/x.bmp']);
    assert.deepEqual(anims.get('q').map((f) => f.key), ['l/x.bmp#rg']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
