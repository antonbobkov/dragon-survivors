// Generated colour variants of decoded frames ({ width, height, rgba }), for tiers and recolours.
// Every function returns a new frame and leaves its input alone. Transparent pixels stay
// transparent (alpha 0, rgb 0); no opaque pixel ever becomes pure black, the key colour.

/** Rec. 601 luma of an [r, g, b] (0..255 each), in 0..1. */
export function luminance(r, g, b) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));

function copy(d) {
  return { width: d.width, height: d.height, rgba: new Uint8Array(d.rgba) };
}

function notKeyBlack(rgba, o) {
  if (rgba[o + 3] && !rgba[o] && !rgba[o + 1] && !rgba[o + 2]) rgba[o] = 1;
}

/** Swap two colour channels ([i, j] indexes of r, g, b) of every pixel. */
export function swapFrame(d, [i, j]) {
  const out = copy(d);
  const p = out.rgba;
  for (let o = 0; o < p.length; o += 4) {
    const v = p[o + i];
    p[o + i] = p[o + j];
    p[o + j] = v;
  }
  return out;
}

/**
 * The colour a pixel of luminance `l` takes under a full-strength tint `t` ([r,g,b]): the tint
 * scaled to that luminance, through black below the tint's own luminance and towards white above it.
 * Its luminance is `l` (before rounding), so light and shade keep their order.
 */
export function tintColor(l, t) {
  const lt = luminance(t[0], t[1], t[2]);
  if (lt <= 0) return [l * 255, l * 255, l * 255];
  if (l <= lt) return t.map((c) => c * (l / lt));
  const u = lt >= 1 ? 0 : (l - lt) / (1 - lt);
  return t.map((c) => c + (255 - c) * u);
}

/**
 * Luminance-preserving tint: each opaque pixel moves `strength` (0..1) of the way from its own
 * colour to tintColor(its luminance). strength 1 is a pure monochrome of the tint colour.
 */
export function tintFrame(d, tint, strength = 1) {
  if (!(strength >= 0 && strength <= 1)) throw new Error(`tint strength ${strength} is not in 0..1`);
  const out = copy(d);
  const p = out.rgba;
  for (let o = 0; o < p.length; o += 4) {
    if (!p[o + 3]) continue;
    const target = tintColor(luminance(p[o], p[o + 1], p[o + 2]), tint);
    for (let c = 0; c < 3; c++) p[o + c] = clampByte(p[o + c] + (target[c] - p[o + c]) * strength);
    notKeyBlack(p, o);
  }
  return out;
}

/**
 * 1 px outline: the frame grows by 1 px on every side (2 px in each dimension) so nothing is
 * clipped, and every transparent pixel that touches an opaque one edge-on (4-neighbourhood)
 * takes `color`. Opaque pixels are unchanged.
 */
export function outlineFrame(d, color) {
  const w = d.width + 2, h = d.height + 2;
  const rgba = new Uint8Array(w * h * 4);
  const src = d.rgba;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < d.width && y < d.height && src[(y * d.width + x) * 4 + 3] !== 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x - 1, sy = y - 1, o = (y * w + x) * 4;
      if (opaque(sx, sy)) {
        rgba.set(src.subarray((sy * d.width + sx) * 4, (sy * d.width + sx) * 4 + 4), o);
      } else if (opaque(sx - 1, sy) || opaque(sx + 1, sy) || opaque(sx, sy - 1) || opaque(sx, sy + 1)) {
        rgba[o] = color[0]; rgba[o + 1] = color[1]; rgba[o + 2] = color[2]; rgba[o + 3] = 255;
        notKeyBlack(rgba, o);
      }
    }
  }
  return { width: w, height: h, rgba };
}
