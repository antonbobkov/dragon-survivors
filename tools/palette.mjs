// Samples the dragongame pack's palette into art/palette.txt: counts the opaque colours of every
// BMP frame the manifest imports (recoloured variants and art excluded) and keeps the most common.
// Names already in art/palette.txt are kept (matched by colour); new colours get `c.rrggbb`.
// Usage: node tools/palette.mjs [--source <dir>] [--count 32] [--min 5] [--out <file>]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeBmp } from './lib/bmp.mjs';
import { parsePalette, toHex } from './lib/art.mjs';
import { ART_ROOT, PALETTE_FILE, resolveManifest } from './build-atlas.mjs';
import { argValue, loadManifest, resolveSourceRoot } from './lib/source.mjs';

/**
 * Count opaque colours over decoded frames. Returns [{ hex, pixels, frames }], most pixels first
 * (ties: more frames, then hex), so the order is stable.
 */
export function countColors(decodedFrames) {
  const pixels = new Map(), frames = new Map();
  for (const d of decodedFrames) {
    const seen = new Set();
    for (let o = 0; o < d.rgba.length; o += 4) {
      if (!d.rgba[o + 3]) continue;
      const hex = toHex([d.rgba[o], d.rgba[o + 1], d.rgba[o + 2]]);
      pixels.set(hex, (pixels.get(hex) || 0) + 1);
      seen.add(hex);
    }
    for (const h of seen) frames.set(h, (frames.get(h) || 0) + 1);
  }
  return [...pixels].map(([hex, n]) => ({ hex, pixels: n, frames: frames.get(hex) }))
    .sort((a, b) => b.pixels - a.pixels || b.frames - a.frames || (a.hex < b.hex ? -1 : 1));
}

/** The palette file text: the top `count` colours with at least `min` pixels, named from `names` (hex -> name). */
export function formatPalette(counted, { count = 32, min = 5, names = new Map(), frameTotal = 0 } = {}) {
  const kept = counted.filter((c) => c.pixels >= min).slice(0, count);
  const rows = kept.map((c) => [names.get(c.hex) || `c.${c.hex.slice(1)}`, c.hex, String(c.pixels), String(c.frames)]);
  const width = Math.max(4, ...rows.map((r) => r[0].length)) + 2;
  return [
    '# The dragongame pack palette: the most common opaque colours of the imported BMP frames.',
    `# Sampled by tools/palette.mjs over ${frameTotal} frames (top ${count}, at least ${min} pixels).`,
    '# Regenerating keeps the names (matched by colour); rename freely. Art keys use these names.',
    '#',
    `# ${'name'.padEnd(width - 2)}hex       pixels  frames`,
    ...rows.map(([n, h, p, f]) => `${n.padEnd(width)}${h}   ${p.padStart(6)}  ${f.padStart(6)}`),
  ].join('\n') + '\n';
}

/** The sorted BMP paths the palette is sampled from: BMP frames with no colour op (variants and art excluded). */
export function plainBmpFiles(anims) {
  const files = new Set();
  for (const frames of anims.values()) {
    for (const f of frames) if (f.file && !f.ops.length) files.add(f.file);
  }
  return [...files].sort();
}

function main(argv) {
  const manifest = loadManifest();
  const sourceRoot = resolveSourceRoot(manifest, argv);
  if (!existsSync(sourceRoot)) {
    console.error(`palette: source folder not found: ${sourceRoot}\nUse --source <dir> or set DRAGONGAME_ASSETS.`);
    process.exit(1);
  }
  const out = resolve(argValue(argv, '--out') || join(ART_ROOT, PALETTE_FILE));
  const count = Number(argValue(argv, '--count') || 32);
  const min = Number(argValue(argv, '--min') || 5);
  const files = plainBmpFiles(resolveManifest(manifest, sourceRoot).anims);
  const decoded = files.map((f) => decodeBmp(readFileSync(join(sourceRoot, f))));
  const names = new Map();
  if (existsSync(out)) for (const [hex, name] of parsePalette(readFileSync(out, 'utf8')).byHex) names.set(hex, name);
  const text = formatPalette(countColors(decoded), { count, min, names, frameTotal: decoded.length });
  writeFileSync(out, text);
  console.log(`palette: ${text.split('\n').filter((l) => l && !l.startsWith('#')).length} colours from ${decoded.length} frames -> ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2));
