// Text pixel art (art/*.txt) and the palette file (art/palette.txt). Format: art/README.md.
// Pure functions: no file access, so tests (and a browser, if ever needed) can use them directly.

export const TRANSPARENT = '.';
export const DEFAULT_ART_TICKS = 6;

const HEX = /^#([0-9a-fA-F]{6})$/;

/** '#rrggbb' -> [r, g, b], or null when the string is not a 6-digit hex colour. */
export function parseHex(s) {
  const m = typeof s === 'string' && HEX.exec(s);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

const lines = (text) => text.replace(/^﻿/, '').split(/\r?\n/);
const isComment = (t) => t === '' || t.startsWith('#');

/**
 * Parse art/palette.txt: lines `name #rrggbb [notes...]`, `#` comment lines, blank lines.
 * Returns { colors: Map name -> [r,g,b], byHex: Map '#rrggbb' -> name, order: [name] }.
 */
export function parsePalette(text, file = 'palette.txt') {
  const colors = new Map();
  const byHex = new Map();
  lines(text).forEach((raw, i) => {
    const t = raw.trim();
    if (isComment(t)) return;
    const [name, hex] = t.split(/\s+/);
    const rgb = parseHex(hex);
    if (!rgb) throw new Error(`${file}:${i + 1}: expected "name #rrggbb", got "${t}"`);
    if (!/^[a-z][a-z0-9.-]*$/.test(name)) throw new Error(`${file}:${i + 1}: bad colour name "${name}" (lower case, digits, '.', '-')`);
    if (colors.has(name)) throw new Error(`${file}:${i + 1}: duplicate colour name "${name}"`);
    const key = toHex(rgb);
    if (byHex.has(key)) throw new Error(`${file}:${i + 1}: ${key} is already named "${byHex.get(key)}"`);
    colors.set(name, rgb);
    byHex.set(key, name);
  });
  return { colors, byHex, order: [...colors.keys()] };
}

/**
 * Parse one art file. `palette` is parsePalette's result (or null: then only hex colours work).
 * Returns { width, height, frames: [{ width, height, rgba, ticks }], warnings: [string] }.
 * Errors and warnings name the file and line.
 */
export function parseArt(text, palette = null, file = 'art.txt') {
  const key = new Map(); // char -> [r,g,b]
  const frames = []; // { ticks, rows: [string], line }
  const warnings = [];
  let section = null; // 'key' | 'frame'
  const err = (n, msg) => new Error(`${file}:${n}: ${msg}`);
  lines(text).forEach((raw, i) => {
    const n = i + 1;
    const t = raw.trim();
    if (isComment(t)) return;
    const words = t.split(/\s+/);
    const comment = (from) => {
      if (words.length > from && !words[from].startsWith('#')) throw err(n, `unexpected "${words[from]}" (comments start with #)`);
    };
    if (words[0] === 'key') {
      comment(1);
      if (frames.length) throw err(n, 'the key must come before the first frame');
      section = 'key';
      return;
    }
    if (words[0] === 'frame') {
      let ticks = DEFAULT_ART_TICKS;
      if (words.length > 1 && !words[1].startsWith('#')) {
        ticks = Number(words[1]);
        if (!Number.isInteger(ticks) || ticks < 1) throw err(n, `frame duration "${words[1]}" is not a positive integer (60 Hz ticks)`);
        comment(2);
      }
      frames.push({ ticks, rows: [], line: n });
      section = 'frame';
      return;
    }
    if (section === 'key') {
      const [ch, colour] = words;
      if ([...ch].length !== 1) throw err(n, `key "${ch}" must be a single character`);
      if (key.has(ch)) throw err(n, `key "${ch}" defined twice`);
      comment(2);
      if (colour === undefined) throw err(n, `key "${ch}" has no colour`);
      if (ch === TRANSPARENT) {
        if (colour !== 'transparent') throw err(n, `"${TRANSPARENT}" is always transparent`);
        return;
      }
      if (colour === 'transparent') throw err(n, `only "${TRANSPARENT}" is transparent`);
      let rgb = parseHex(colour);
      if (rgb) {
        if (palette && !palette.byHex.has(toHex(rgb))) warnings.push(`${file}:${n}: colour ${toHex(rgb)} (key "${ch}") is not in the palette`);
      } else {
        rgb = palette && palette.colors.get(colour);
        if (!rgb) throw err(n, `unknown colour "${colour}" (a palette name or #rrggbb)`);
      }
      if (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0) throw err(n, `pure black is the transparency key; use black (#010000)`);
      key.set(ch, rgb);
      return;
    }
    if (section === 'frame') {
      if (/\s/.test(t)) throw err(n, 'a pixel row cannot contain spaces');
      frames[frames.length - 1].rows.push({ text: t, line: n });
      return;
    }
    throw err(n, `expected "key" or "frame", got "${t}"`);
  });
  if (!frames.length) throw new Error(`${file}: no frames`);
  let width = 0, height = 0;
  const out = frames.map((f, fi) => {
    if (!f.rows.length) throw err(f.line, `frame ${fi} is empty`);
    const w = [...f.rows[0].text].length, h = f.rows.length;
    if (fi === 0) { width = w; height = h; }
    if (h !== height) throw err(f.line, `frame ${fi} is ${h} rows high, frame 0 is ${height}`);
    const rgba = new Uint8Array(w * h * 4);
    f.rows.forEach((row, y) => {
      const chars = [...row.text];
      if (chars.length !== width) throw err(row.line, `row is ${chars.length} wide, frame 0 is ${width}`);
      chars.forEach((ch, x) => {
        if (ch === TRANSPARENT) return;
        const rgb = key.get(ch);
        if (!rgb) throw err(row.line, `"${ch}" is not in the key`);
        const o = (y * w + x) * 4;
        rgba[o] = rgb[0]; rgba[o + 1] = rgb[1]; rgba[o + 2] = rgb[2]; rgba[o + 3] = 255;
      });
    });
    return { width, height, rgba, ticks: f.ticks };
  });
  return { width, height, frames: out, warnings };
}

/** Render a decoded frame back to text rows with a char per colour (debug, tests, reports). */
export function frameToText(d, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  const legend = new Map();
  const rows = [];
  for (let y = 0; y < d.height; y++) {
    let s = '';
    for (let x = 0; x < d.width; x++) {
      const o = (y * d.width + x) * 4;
      if (!d.rgba[o + 3]) { s += TRANSPARENT; continue; }
      const hex = toHex([d.rgba[o], d.rgba[o + 1], d.rgba[o + 2]]);
      if (!legend.has(hex)) legend.set(hex, chars[legend.size] ?? '?');
      s += legend.get(hex);
    }
    rows.push(s);
  }
  return { rows, legend };
}
