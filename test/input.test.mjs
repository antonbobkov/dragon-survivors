// Intent building from keyboard/mouse/gamepad snapshots (§16) and coordinate helpers (§5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFrame, createInputState, stick, STICK_DEADZONE, PAD } from '../src/input.js';
import { cssToInternal, fitScale, cameraOffset, dragonScreen } from '../src/viewport.js';

const DRAGON = { x: 480, y: 300 };
const raw = (o = {}) => ({ held: new Set(), pressed: [], clicks: [], mouse: null, mouseMoved: false, pad: null, dragon: DRAGON, ...o });
const pad = (axes = [0, 0, 0, 0], pressed = []) => {
  const buttons = Array(17).fill(false);
  for (const i of pressed) buttons[i] = true;
  return { axes, buttons };
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('idle frame: zero intent, no edges', () => {
  const f = readFrame(raw(), createInputState());
  assert.deepEqual(f.intent, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, hasAim: false, confirm: false, pick: -1 });
  assert.equal(f.pause, false);
  assert.equal(f.click, null);
});

test('WASD and arrows move; diagonals are unit vectors; opposite keys cancel', () => {
  const s = createInputState();
  let f = readFrame(raw({ held: new Set(['KeyD']) }), s);
  assert.equal(f.intent.moveX, 1); assert.equal(f.intent.moveY, 0);
  f = readFrame(raw({ held: new Set(['ArrowUp', 'ArrowLeft']) }), s);
  close(f.intent.moveX, -Math.SQRT1_2); close(f.intent.moveY, -Math.SQRT1_2);
  f = readFrame(raw({ held: new Set(['KeyA', 'KeyD', 'KeyS']) }), s);
  assert.equal(f.intent.moveX, 0); assert.equal(f.intent.moveY, 1);
});

test('mouse aim is the unit vector from the dragon on screen, always hasAim', () => {
  const f = readFrame(raw({ mouse: { x: 480, y: 200 }, mouseMoved: true }), createInputState());
  assert.equal(f.intent.hasAim, true);
  close(f.intent.aimX, 0); close(f.intent.aimY, -1);
  const g = readFrame(raw({ mouse: { x: 580, y: 400 } }), createInputState());
  close(g.intent.aimX, Math.SQRT1_2); close(g.intent.aimY, Math.SQRT1_2);
});

test('mouse exactly on the dragon gives no aim', () => {
  const f = readFrame(raw({ mouse: { x: 480, y: 300 } }), createInputState());
  assert.equal(f.intent.hasAim, false);
});

test('edge-triggered pause, confirm and pick from key presses', () => {
  const s = createInputState();
  assert.equal(readFrame(raw({ pressed: ['Escape'] }), s).pause, true);
  assert.equal(readFrame(raw({ pressed: ['KeyP'] }), s).pause, true);
  const f = readFrame(raw({ pressed: ['Enter', 'Digit3'] }), s);
  assert.equal(f.confirm, true); assert.equal(f.intent.confirm, true);
  assert.equal(f.pick, 2); assert.equal(f.intent.pick, 2);
  // holding a key does not repeat the edge
  const h = readFrame(raw({ held: new Set(['Enter', 'Digit3']) }), s);
  assert.equal(h.confirm, false); assert.equal(h.pick, -1);
});

test('stick deadzone is radial at 0.25 and clamps to length 1', () => {
  assert.equal(STICK_DEADZONE, 0.25);
  assert.equal(stick(0.2, 0.1).active, false);
  assert.equal(stick(0.25, 0).active, false);
  const s = stick(0.3, 0);
  assert.equal(s.active, true); assert.equal(s.x, 0.3);
  const c = stick(1, 1);
  close(Math.hypot(c.x, c.y), 1);
});

test('gamepad: left stick moves, right stick aims only outside the deadzone', () => {
  const s = createInputState();
  let f = readFrame(raw({ pad: pad([0.5, 0, 0, -0.9]) }), s);
  assert.equal(f.device, 'pad');
  assert.equal(f.intent.moveX, 0.5);
  assert.equal(f.intent.hasAim, true);
  close(f.intent.aimX, 0); close(f.intent.aimY, -1);
  f = readFrame(raw({ pad: pad([0.5, 0, 0.1, 0.1]) }), s);
  assert.equal(f.intent.hasAim, false);
  assert.equal(f.intent.aimX, 0);
});

test('gamepad buttons are edge-triggered: A confirms, Start pauses, d-pad navigates', () => {
  const s = createInputState();
  let f = readFrame(raw({ pad: pad(undefined, [PAD.A, PAD.START, PAD.RIGHT]) }), s);
  assert.equal(f.confirm, true); assert.equal(f.pause, true); assert.equal(f.nav, 1);
  f = readFrame(raw({ pad: pad(undefined, [PAD.A, PAD.START, PAD.RIGHT]) }), s);
  assert.equal(f.confirm, false); assert.equal(f.pause, false); assert.equal(f.nav, 0);
  f = readFrame(raw({ pad: pad(undefined, [PAD.LEFT]) }), s);
  assert.equal(f.nav, -1);
});

test('last device wins: pad input switches away from the mouse, mouse movement switches back', () => {
  const s = createInputState();
  const mouse = { x: 600, y: 300 };
  let f = readFrame(raw({ mouse, mouseMoved: true }), s);
  assert.equal(f.device, 'kbm'); assert.equal(f.intent.hasAim, true);
  // pad stick pushed: pad wins, the resting mouse no longer aims
  f = readFrame(raw({ mouse, pad: pad([0, 0.8, 0, 0]) }), s);
  assert.equal(f.device, 'pad'); assert.equal(f.intent.hasAim, false); assert.equal(f.intent.moveY, 0.8);
  // pad idle and mouse resting: still pad
  f = readFrame(raw({ mouse, pad: pad() }), s);
  assert.equal(f.device, 'pad');
  // mouse moves: back to keyboard and mouse
  f = readFrame(raw({ mouse, mouseMoved: true, pad: pad() }), s);
  assert.equal(f.device, 'kbm'); assert.equal(f.intent.hasAim, true);
  // a held stick does not steal the device back from a held key in the same frame
  f = readFrame(raw({ held: new Set(['KeyW']), pad: pad([0.9, 0, 0, 0]) }), s);
  assert.equal(f.device, 'kbm'); assert.equal(f.intent.moveY, -1);
});

test('the last click of the frame is reported in internal pixels', () => {
  const f = readFrame(raw({ clicks: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }), createInputState());
  assert.deepEqual(f.click, { x: 3, y: 4 });
});

test('cssToInternal maps the scaled canvas rect back to 960x600', () => {
  const rect = { left: 100, top: 50, width: 1920, height: 1200 };
  assert.deepEqual(cssToInternal(100, 50, rect), { x: 0, y: 0 });
  assert.deepEqual(cssToInternal(2020, 1250, rect), { x: 960, y: 600 });
  assert.deepEqual(cssToInternal(1060, 650, rect), { x: 480, y: 300 });
  const small = { left: 0, top: 0, width: 480, height: 300 };
  assert.deepEqual(cssToInternal(240, 150, small), { x: 480, y: 300 });
});

test('fitScale: integer when the window allows, fractional below 1x', () => {
  assert.equal(fitScale(1920, 1080), 1);
  assert.equal(fitScale(1920, 1200), 2);
  assert.equal(fitScale(2000, 1300), 2);
  assert.equal(fitScale(3000, 1900), 3);
  assert.equal(fitScale(480, 600), 0.5);
  assert.equal(fitScale(0, 0), 1);
});

test('camera: integer offset centring the dragon at (480, 300)', () => {
  assert.deepEqual(cameraOffset({ x: 0, y: 0 }), { x: 480, y: 300 });
  assert.deepEqual(cameraOffset({ x: 10.4, y: -20.6 }), { x: 470, y: 321 });
  const d = { x: 123.4, y: 56.7 };
  const s = dragonScreen(d);
  assert.ok(Math.abs(s.x - 480) <= 0.5 && Math.abs(s.y - 300) <= 0.5);
});
