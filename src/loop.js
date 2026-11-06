// Fixed-step loop (§4): accumulate real time, run at most MAX_TICKS_PER_FRAME 60 Hz
// ticks per frame (the rest is dropped), render every requestAnimationFrame.
import { TICK_HZ } from './sim/content.js';

export const STEP_MS = 1000 / TICK_HZ;
export const MAX_TICKS_PER_FRAME = 4;
// §19 debug game speed: the loop runs more or fewer ticks per frame; the sim is untouched.
export const SPEEDS = [0.25, 0.5, 1, 2, 4];
const EPS = 1e-6;

export class Accumulator {
  constructor({ stepMs = STEP_MS, maxTicks = MAX_TICKS_PER_FRAME } = {}) {
    this.stepMs = stepMs;
    this.maxTicks = maxTicks;
    this.speed = 1; // game-time ms per real ms (§19 debug); the tick cap scales with it above 1
    this.reset();
  }

  reset() {
    this.last = null;
    this.acc = 0;
  }

  // Ticks to run this frame. While not `running` (title, pause, level-up screen) no
  // time is banked, so resuming never releases a burst.
  advance(nowMs, running = true) {
    if (this.last === null || !running || !Number.isFinite(nowMs)) {
      this.last = Number.isFinite(nowMs) ? nowMs : this.last;
      this.acc = 0;
      return 0;
    }
    const dt = nowMs - this.last;
    this.last = nowMs;
    if (!(dt > 0)) return 0;
    this.acc += dt * this.speed;
    let n = Math.floor((this.acc + EPS) / this.stepMs);
    this.acc -= n * this.stepMs;
    if (this.acc < 0) this.acc = 0;
    const cap = Math.ceil(this.maxTicks * Math.max(1, this.speed));
    if (n > cap) n = cap; // owed ticks beyond the cap are dropped
    return n;
  }
}

// Calls frame(timestamp) on every animation frame.
export function startLoop(requestFrame, frame) {
  const step = (ts) => {
    frame(ts);
    requestFrame(step);
  };
  requestFrame(step);
}
