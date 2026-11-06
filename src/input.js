// Keyboard, mouse and gamepad -> Intent (§4, §16).
// `readFrame` is pure (tested under node); `attachInput` is the thin DOM glue that
// collects a raw snapshot each frame.
import { cssToInternal } from './viewport.js';

export const STICK_DEADZONE = 0.25;

// Standard gamepad mapping.
export const PAD = { A: 0, START: 9, LEFT: 14, RIGHT: 15 };

const MOVE_KEYS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
};
const PAUSE_KEYS = ['Escape', 'KeyP'];
const CONFIRM_KEYS = ['Enter', 'NumpadEnter'];
const PICK_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };

// §19 debug keys (read always, acted on only by a debug App): F1–F4 grant a weapon at
// level 5, F5 jumps to 4:50, + / - change game speed.
export const DEBUG_GRANT_KEYS = { F1: 'fireball', F2: 'laser', F3: 'miniTower', F4: 'ring' };
export const DEBUG_JUMP_KEY = 'F5';
export const DEBUG_SPEED_KEYS = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1 };
export const DEBUG_KEYS = new Set([...Object.keys(DEBUG_GRANT_KEYS), DEBUG_JUMP_KEY, ...Object.keys(DEBUG_SPEED_KEYS)]);

// Keys whose browser default (scrolling) is suppressed.
export const CAPTURED_KEYS = new Set([
  ...Object.values(MOVE_KEYS).flat(), ...PAUSE_KEYS, ...CONFIRM_KEYS, 'Space', ...Object.keys(PICK_KEYS),
]);

export function createInputState() {
  return { device: 'kbm', padButtons: [] };
}

// A stick with a radial deadzone: zero inside it, else the raw vector clamped to length 1.
export function stick(x, y, deadzone = STICK_DEADZONE) {
  x = Number.isFinite(x) ? x : 0;
  y = Number.isFinite(y) ? y : 0;
  const m = Math.hypot(x, y);
  if (m <= deadzone) return { x: 0, y: 0, active: false };
  return m > 1 ? { x: x / m, y: y / m, active: true } : { x, y, active: true };
}

function unit(x, y) {
  const m = Math.hypot(x, y);
  return m > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
}

const anyHeld = (held, codes) => codes.some((c) => held.has(c));

// raw: {
//   held: Set of KeyboardEvent.code currently down,
//   pressed: array of codes pressed (not auto-repeat) since the last frame,
//   mouse: { x, y } in internal px, or null if it has never moved,
//   mouseMoved: bool, clicks: array of { x, y } (internal px) since the last frame,
//   pad: { axes: number[], buttons: bool[] } or null,
//   dragon: { x, y } dragon position on screen (internal px),
// }
// state: from createInputState(); updated in place (device, previous pad buttons).
// Returns { intent, device, pause, confirm, pick, nav, click, debug }; pause/confirm/pick/nav
// are edges, and so is debug: { grants: weapon ids in press order, jump: bool, speed: -1 | 0 | 1 }.
export function readFrame(raw, state) {
  const held = raw.held || new Set();
  const pressed = raw.pressed || [];
  const clicks = raw.clicks || [];
  const pad = raw.pad || null;

  // Pad edges against last frame's buttons.
  const prev = state.padButtons;
  const btn = (i) => !!(pad && pad.buttons[i]);
  const padEdge = (i) => btn(i) && !prev[i];
  const axes = pad ? pad.axes : [];
  const left = stick(axes[0], axes[1]);
  const right = stick(axes[2], axes[3]);
  const padActive = !!pad && (left.active || right.active || pad.buttons.some((b, i) => b && !prev[i]));
  const kbmActive = held.size > 0 || pressed.length > 0 || !!raw.mouseMoved || clicks.length > 0;
  // Last device wins; on a tie in one frame the keyboard and mouse win.
  if (padActive) state.device = 'pad';
  if (kbmActive) state.device = 'kbm';
  state.padButtons = pad ? pad.buttons.map(Boolean) : [];

  let moveX = 0, moveY = 0, aimX = 0, aimY = 0, hasAim = false;
  if (state.device === 'pad') {
    moveX = left.x; moveY = left.y;
    if (right.active) { const a = unit(right.x, right.y); aimX = a.x; aimY = a.y; hasAim = true; }
  } else {
    const m = unit(
      (anyHeld(held, MOVE_KEYS.right) ? 1 : 0) - (anyHeld(held, MOVE_KEYS.left) ? 1 : 0),
      (anyHeld(held, MOVE_KEYS.down) ? 1 : 0) - (anyHeld(held, MOVE_KEYS.up) ? 1 : 0),
    );
    moveX = m.x; moveY = m.y;
    if (raw.mouse && raw.dragon) {
      const a = unit(raw.mouse.x - raw.dragon.x, raw.mouse.y - raw.dragon.y);
      if (a.x !== 0 || a.y !== 0) { aimX = a.x; aimY = a.y; hasAim = true; }
    }
  }

  const pause = pressed.some((c) => PAUSE_KEYS.includes(c)) || padEdge(PAD.START);
  const confirm = pressed.some((c) => CONFIRM_KEYS.includes(c)) || padEdge(PAD.A);
  let pick = -1;
  for (const c of pressed) if (c in PICK_KEYS) pick = PICK_KEYS[c];
  const nav = (padEdge(PAD.RIGHT) ? 1 : 0) - (padEdge(PAD.LEFT) ? 1 : 0);
  const click = clicks.length ? clicks[clicks.length - 1] : null;
  const debug = { grants: [], jump: false, speed: 0 };
  for (const c of pressed) {
    if (c in DEBUG_GRANT_KEYS) debug.grants.push(DEBUG_GRANT_KEYS[c]);
    if (c === DEBUG_JUMP_KEY) debug.jump = true;
    if (c in DEBUG_SPEED_KEYS) debug.speed += DEBUG_SPEED_KEYS[c];
  }

  return {
    intent: { moveX, moveY, aimX, aimY, hasAim, confirm, pick },
    device: state.device, pause, confirm, pick, nav, click, debug,
  };
}

// First connected gamepad as plain data, or null.
export function padSnapshot(nav) {
  const pads = nav && nav.getGamepads ? nav.getGamepads() : [];
  for (const p of pads || []) {
    if (p && p.connected) {
      return { axes: Array.from(p.axes), buttons: Array.from(p.buttons, (b) => b.pressed || b.value > 0.5) };
    }
  }
  return null;
}

// DOM glue. Returns { poll(dragonScreenPos) -> raw snapshot, onGesture(fn) }. With
// `debug`, the debug keys' browser defaults (help, reload) are suppressed too.
export function attachInput(canvas, win, { debug = false } = {}) {
  const held = new Set();
  let pressed = [];
  let clicks = [];
  let mouse = null;
  let mouseMoved = false;
  const gestureFns = [];
  const gesture = () => { for (const fn of gestureFns) fn(); };

  win.addEventListener('keydown', (e) => {
    if (CAPTURED_KEYS.has(e.code) || (debug && DEBUG_KEYS.has(e.code))) e.preventDefault();
    held.add(e.code);
    if (!e.repeat) pressed.push(e.code);
    gesture();
  });
  win.addEventListener('keyup', (e) => { held.delete(e.code); });
  win.addEventListener('blur', () => { held.clear(); });
  win.addEventListener('mousemove', (e) => {
    mouse = cssToInternal(e.clientX, e.clientY, canvas.getBoundingClientRect());
    mouseMoved = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const p = cssToInternal(e.clientX, e.clientY, canvas.getBoundingClientRect());
    mouse = p;
    clicks.push(p);
    gesture();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    poll(dragon) {
      const raw = { held, pressed, clicks, mouse, mouseMoved, pad: padSnapshot(win.navigator), dragon };
      pressed = [];
      clicks = [];
      mouseMoved = false;
      return raw;
    },
    onGesture(fn) { gestureFns.push(fn); },
  };
}
