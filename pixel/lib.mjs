// Pixel viewer: sprite sources, folder scanning and variants. Pure: no DOM, no fetch, so node
// tests use it directly; app.js does the browser side (files, images, canvas).
// A frame is { width, height, rgba: Uint8Array } (the shape tools/lib/*.mjs use).
// A sprite is { id, name, path: [folder...], source, load: async () => { frames, ticks, warnings } }.
import { parseArt, parseHex, parsePalette } from '../tools/lib/art.mjs';
import { decodeBmp } from '../tools/lib/bmp.mjs';
import { DEFAULT_TICKS, parseSequence } from '../tools/lib/sequence.mjs';
import { outlineFrame, swapFrame, tintFrame } from '../tools/lib/variants.mjs';

export const TICK_HZ = 60;

/** Frame index of an anim with per-frame `ticks` after `tick` ticks, looping. */
export function frameAt(ticks, tick) {
  const total = ticks.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let t = ((Math.floor(tick) % total) + total) % total;
  for (let i = 0; i < ticks.length; i++) {
    if (t < ticks[i]) return i;
    t -= ticks[i];
  }
  return ticks.length - 1;
}

/** The tick at which frame `i` starts (so stepping to a frame keeps playback in sync). */
export function frameStart(ticks, i) {
  let t = 0;
  for (let k = 0; k < i && k < ticks.length; k++) t += ticks[k];
  return t;
}

/** Cut a w×h rect out of an RGBA image `width` px wide. */
export function sliceRgba(rgba, width, { x, y, w, h }) {
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const s = ((y + row) * width + x) * 4;
    out.set(rgba.subarray(s, s + w * 4), row * w * 4);
  }
  return { width: w, height: h, rgba: out };
}

/** decodeBmp reads with Buffer methods; give a plain Uint8Array the three it uses. */
export function asBuffer(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const b = new Uint8Array(u8.buffer, u8.byteOffset, u8.byteLength);
  b.readUInt32LE = (o) => dv.getUint32(o, true);
  b.readInt32LE = (o) => dv.getInt32(o, true);
  b.readUInt16LE = (o) => dv.getUint16(o, true);
  return b;
}

export const decodeBmpBytes = (u8) => decodeBmp(asBuffer(u8));

// ---- variants -----------------------------------------------------------------------------

const SWAPS = { rg: [0, 1], rb: [0, 2], gb: [1, 2] };

/**
 * A variant is { swap?: 'rg'|'rb'|'gb', tint?: '#rrggbb', tintStrength?: 0..1, outline?: '#rrggbb' },
 * the manifest's own ops (art/README.md "Variants"), applied as the build does: swap, tint, outline.
 */
export function applyVariant(frame, v = {}) {
  let d = frame;
  if (v.swap && SWAPS[v.swap]) d = swapFrame(d, SWAPS[v.swap]);
  const tint = v.tint && parseHex(v.tint);
  if (tint) d = tintFrame(d, tint, v.tintStrength ?? 1);
  const outline = v.outline && parseHex(v.outline);
  if (outline) d = outlineFrame(d, outline);
  return d;
}

/** True when a variant changes nothing. */
export const isPlain = (v) => !v || (!SWAPS[v.swap] && !parseHex(v.tint || '') && !parseHex(v.outline || ''));

/** The manifest's enemy tier variants as named presets: [{ tier, ops }]. */
export function tierPresets(manifest) {
  const vs = (manifest && manifest.tiers && manifest.tiers.variants) || [];
  return vs.map(({ tier, ...ops }) => ({ tier, ops }));
}

// ---- game atlas source ---------------------------------------------------------------------

const TIER_SUFFIX = /@t\d+$/;

/** Folder path of a manifest entry: art files under art/<dirs>, pack files under pack/<dir>. */
export function entryPath(e, byName) {
  const dirs = (p) => p.split('/').slice(0, -1);
  if (e.art) return ['art', ...dirs(e.art)];
  const first = e.list || e.file || (e.files && e.files[0]);
  if (first) return ['pack', ...dirs(first)];
  if (e.from && byName.has(e.from)) return entryPath(byName.get(e.from), byName);
  return ['other'];
}

/** A short "where it comes from" line for a manifest entry. */
export function entrySource(e) {
  const ops = ['swap', 'tint', 'outline'].filter((k) => e[k] !== undefined).map((k) => `${k} ${e[k]}`);
  const src = e.art ? `art/${e.art}` : e.list ? `pack ${e.list}` : e.file ? `pack ${e.file}` : e.files ? `pack ${e.files.length} files` : e.from ? `from ${e.from}` : '';
  return [src, ...ops].join(' · ');
}

/**
 * Sprites of the built game atlas. `json` is assets/atlas.json, `pixels` the atlas image's RGBA
 * and width, `manifest` tools/manifest.json (for folders and sources; optional). The generated
 * enemy tiers (`@t2`…) are left out: they are the tier variants, applied live.
 */
export function atlasSprites(json, pixels, manifest = null) {
  const entries = (manifest && manifest.entries) || [];
  const byName = new Map(entries.map((e) => [e.name, e]));
  const out = [];
  for (const name of Object.keys(json.anims)) {
    if (TIER_SUFFIX.test(name)) continue;
    const anim = json.anims[name];
    const e = byName.get(name);
    out.push({
      id: `atlas:${name}`,
      name,
      path: e ? entryPath(e, byName) : ['other'],
      source: e ? entrySource(e) : 'atlas',
      load: async () => ({
        frames: anim.frames.map((k) => sliceRgba(pixels.rgba, pixels.width, json.frames[k])),
        ticks: anim.ticks.slice(),
        warnings: [],
      }),
    });
  }
  return sortSprites(out);
}

// ---- folder source -------------------------------------------------------------------------

const ext = (p) => (p.match(/\.([^./]+)$/) || [, ''])[1].toLowerCase();
const dirOf = (p) => p.split('/').slice(0, -1);
const baseOf = (p) => p.split('/').pop();
const stem = (p) => baseOf(p).replace(/\.[^.]+$/, '');
const IMAGE = new Set(['bmp', 'png']);

/** Text art has `key` / `frame` lines; anything else is not art. */
export function isArtText(text) {
  return /^\s*(key|frame)\b/m.test(text);
}

/** A pack frame list: every token (FANCY aside) names an image. Returns the list or null. */
export function asSequence(text) {
  let list;
  try { list = parseSequence(text); } catch { return null; }
  if (!list.length || !list.every((f) => IMAGE.has(ext(f.file)))) return null;
  return list;
}

/** Normalise `a/b/../c.bmp` against a folder (array) to a path string. */
export function joinPath(dir, rel) {
  const parts = [...dir];
  for (const p of rel.replace(/\\/g, '/').split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return parts.join('/');
}

/**
 * Sidecar animation metadata for a PNG sheet `<name>.png`: `<name>.anim.json`, holding
 * { frameWidth, frameHeight, ticks?: number | number[] }. Frames run left to right, top to bottom.
 */
export function sheetRects(width, height, meta) {
  const fw = meta && meta.frameWidth > 0 ? meta.frameWidth : width;
  const fh = meta && meta.frameHeight > 0 ? meta.frameHeight : height;
  const rects = [];
  for (let y = 0; y + fh <= height; y += fh) for (let x = 0; x + fw <= width; x += fw) rects.push({ x, y, w: fw, h: fh });
  const t = meta && meta.ticks;
  const ticks = rects.map((_, i) => (Array.isArray(t) ? t[i] ?? t[t.length - 1] : t) || DEFAULT_TICKS);
  return { rects, ticks };
}

/**
 * Sprites of an opened folder. `files` maps a path relative to the folder ('a/b.txt', '/' between
 * parts) to { text(): Promise<string>, bytes(): Promise<Uint8Array> }. `decodeImage(bytes, path)`
 * turns a PNG into a frame (the browser does that). `fallbackPalette` is used by text art when the
 * folder has no palette.txt of its own. Recognised:
 *   - text art (art/README.md): one sprite per file, ticks from the file;
 *   - pack frame lists (.txt of image names, FANCY durations allowed): one sprite per list;
 *   - .bmp / .png that no list uses: one sprite each; a PNG with a `.anim.json` sidecar is a sheet.
 * Other files are ignored.
 */
export async function scanFolder(files, { decodeImage, fallbackPalette = null } = {}) {
  const paths = [...files.keys()].sort();
  const texts = new Map();
  await Promise.all(paths.filter((p) => ext(p) === 'txt').map(async (p) => texts.set(p, await files.get(p).text())));

  let palette = fallbackPalette;
  const palPath = paths.filter((p) => baseOf(p) === 'palette.txt').sort((a, b) => a.split('/').length - b.split('/').length)[0];
  if (palPath) {
    try { palette = parsePalette(texts.get(palPath), palPath); } catch { /* keep the fallback */ }
  }

  const decode = async (p) => {
    const bytes = await files.get(p).bytes();
    if (ext(p) === 'bmp') return decodeBmpBytes(bytes);
    if (!decodeImage) throw new Error(`${p}: no image decoder`);
    return decodeImage(bytes, p);
  };

  const out = [];
  const used = new Set();
  for (const p of paths) {
    if (ext(p) !== 'txt' || p === palPath) continue;
    const text = texts.get(p);
    if (isArtText(text)) {
      out.push({
        id: `file:${p}`, name: stem(p), path: dirOf(p), source: p,
        load: async () => {
          const art = parseArt(text, palette, p);
          return { frames: art.frames, ticks: art.frames.map((f) => f.ticks), warnings: art.warnings };
        },
      });
      continue;
    }
    const list = asSequence(text);
    if (!list) continue;
    const frames = list.map((f) => ({ file: joinPath(dirOf(p), f.file), ticks: f.ticks }));
    for (const f of frames) used.add(f.file);
    out.push({
      id: `file:${p}`, name: stem(p), path: dirOf(p), source: `${p} (${frames.length} frames)`,
      load: async () => {
        const warnings = [];
        const decoded = [];
        const ticks = [];
        for (const f of frames) {
          if (!files.has(f.file)) { warnings.push(`missing ${f.file}`); continue; }
          decoded.push(await decode(f.file));
          ticks.push(f.ticks);
        }
        if (!decoded.length) throw new Error(`${p}: none of its frames were found`);
        return { frames: decoded, ticks, warnings };
      },
    });
  }
  for (const p of paths) {
    if (!IMAGE.has(ext(p)) || used.has(p)) continue;
    const sidecar = joinPath(dirOf(p), `${stem(p)}.anim.json`);
    out.push({
      id: `file:${p}`, name: baseOf(p), path: dirOf(p), source: files.has(sidecar) ? `${p} + ${baseOf(sidecar)}` : p,
      load: async () => {
        const img = await decode(p);
        if (!files.has(sidecar)) return { frames: [img], ticks: [DEFAULT_TICKS], warnings: [] };
        const meta = JSON.parse(await files.get(sidecar).text());
        const { rects, ticks } = sheetRects(img.width, img.height, meta);
        return { frames: rects.map((r) => sliceRgba(img.rgba, img.width, r)), ticks, warnings: [] };
      },
    });
  }
  return sortSprites(out);
}

/** Folder order, then name. */
export function sortSprites(list) {
  return list.sort((a, b) => {
    const pa = a.path.join('/'), pb = b.path.join('/');
    return pa < pb ? -1 : pa > pb ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/** Sprites whose name, folder or source contains every word of `query` (case-insensitive). */
export function filterSprites(list, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((s) => {
    const hay = `${s.name} ${s.path.join('/')} ${s.source}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
