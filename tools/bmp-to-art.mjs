// Prints pack BMPs (or a manifest anim) as an art file (art/README.md format), keyed with palette
// names: to study the pack's style, or to start a new sprite from an existing one.
// Usage: node tools/bmp-to-art.mjs <bmp path relative to the pack | anim name> [...] [--source <dir>]
//   node tools/bmp-to-art.mjs knight.walk
//   node tools/bmp-to-art.mjs bonus/bonusbig1.bmp bonus/bonusring1.bmp
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeBmp } from './lib/bmp.mjs';
import { parsePalette, toHex } from './lib/art.mjs';
import { ART_ROOT, PALETTE_FILE, resolveManifest, applyOps } from './build-atlas.mjs';
import { loadManifest, resolveSourceRoot } from './lib/source.mjs';

const FALLBACK = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@$%&*+=?!';

/** One key char per colour: the first free letter of its name (lower, then upper case), else a fallback. */
export function keyChars(names) {
  const used = new Set(['.', '#']);
  const out = new Map();
  for (const name of names) {
    const letters = [...name.replace(/[^a-z]/gi, '')];
    const pick = [...letters.map((c) => c.toLowerCase()), ...letters.map((c) => c.toUpperCase()), ...FALLBACK].find((c) => !used.has(c));
    used.add(pick);
    out.set(name, pick);
  }
  return out;
}

/**
 * Art-file text for decoded frames [{ width, height, rgba, ticks }]: colours in the palette are
 * keyed by name, others by #rrggbb. Frames of different sizes are padded to the largest.
 */
export function framesToArt(frames, palette, title = '') {
  const names = [];
  const nameOf = (hex) => palette.byHex.get(hex) || hex;
  for (const d of frames) {
    for (let o = 0; o < d.rgba.length; o += 4) {
      if (!d.rgba[o + 3]) continue;
      const n = nameOf(toHex([d.rgba[o], d.rgba[o + 1], d.rgba[o + 2]]));
      if (!names.includes(n)) names.push(n);
    }
  }
  const order = [...palette.order.filter((n) => names.includes(n)), ...names.filter((n) => !palette.colors.has(n))];
  const chars = keyChars(order);
  const w = Math.max(...frames.map((d) => d.width)), h = Math.max(...frames.map((d) => d.height));
  const lines = [];
  if (title) lines.push(`# ${title}`);
  lines.push('key', ...order.map((n) => `  ${chars.get(n)} ${n}`));
  for (const d of frames) {
    lines.push(`frame${d.ticks && d.ticks !== 6 ? ` ${d.ticks}` : ''}`);
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        const o = (y * d.width + x) * 4;
        row += x < d.width && y < d.height && d.rgba[o + 3] ? chars.get(nameOf(toHex([d.rgba[o], d.rgba[o + 1], d.rgba[o + 2]]))) : '.';
      }
      lines.push(row);
    }
  }
  return lines.join('\n') + '\n';
}

function main(argv) {
  const manifest = loadManifest();
  const sourceRoot = resolveSourceRoot(manifest, argv);
  const palette = parsePalette(readFileSync(join(ART_ROOT, PALETTE_FILE), 'utf8'));
  const args = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--source');
  if (!args.length) {
    console.error('usage: node tools/bmp-to-art.mjs <bmp under the pack | anim name> [...]');
    process.exit(1);
  }
  const { anims, art } = resolveManifest(manifest, sourceRoot);
  const load = (f) => {
    const p = join(sourceRoot, f.file);
    if (!existsSync(p)) throw new Error(`missing ${p}`);
    return decodeBmp(readFileSync(p));
  };
  for (const a of args) {
    let frames;
    if (anims.has(a)) {
      frames = anims.get(a).map((f) => ({ ...applyOps(f.art !== undefined ? art.get(f.art).frames[f.index] : load(f), f.ops), ticks: f.ticks }));
    } else {
      frames = [{ ...load({ file: a }), ticks: 6 }];
    }
    process.stdout.write(framesToArt(frames, palette, a) + '\n');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2));
