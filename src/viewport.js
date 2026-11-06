// Pure coordinate helpers shared by input and rendering (§5, §16). No DOM.

export const VIEW_W = 960;
export const VIEW_H = 600;

// CSS scale for the canvas: the largest that fits the window, an integer when it is at least 1.
export function fitScale(winW, winH, w = VIEW_W, h = VIEW_H) {
  const s = Math.min(winW / w, winH / h);
  if (!(s > 0)) return 1;
  return s >= 1 ? Math.floor(s) : s;
}

// A point in CSS pixels (clientX/Y) to internal canvas pixels, given the canvas bounding rect.
export function cssToInternal(clientX, clientY, rect, w = VIEW_W, h = VIEW_H) {
  return {
    x: ((clientX - rect.left) * w) / rect.width,
    y: ((clientY - rect.top) * h) / rect.height,
  };
}

// Camera centred on the dragon; the offset is rounded so sprites do not shimmer.
// Screen position of a world point = world + offset.
export function cameraOffset(dragon, w = VIEW_W, h = VIEW_H) {
  return { x: Math.round(w / 2 - dragon.x), y: Math.round(h / 2 - dragon.y) };
}

// Where the dragon is on screen (its centre).
export function dragonScreen(dragon, w = VIEW_W, h = VIEW_H) {
  const o = cameraOffset(dragon, w, h);
  return { x: dragon.x + o.x, y: dragon.y + o.y };
}
