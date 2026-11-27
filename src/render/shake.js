// Screen shake (§5): render only. The sim sends `{ type: 'shake', kind }` events (the golem's
// spawn, footsteps and staggers, §8.10); the App feeds them here with the frame's time, and the
// renderer offsets the world camera (not the HUD) by `offset(now)`. Shakes add up to
// SHAKE_CAP px, each fading linearly to 0 over its time. The pattern is a fixed function of
// time (no random numbers), so the same events at the same times shake the same way.
// No DOM: tested under node.

export const SHAKES = {
  spawn: { amp: 8, time: 0.6 },
  step: { amp: 2, time: 0.15 },
  stagger: { amp: 5, time: 0.3 },
};
export const SHAKE_CAP = 10;
// The pattern's frequencies (Hz): x and y at different rates, so the offset wanders around
// the circle of radius `amplitude` instead of moving on a line.
export const SHAKE_HZ = { x: 23, y: 17 };

export class Shake {
  // enabled false (?shake=0): add() is ignored and the offset is always 0.
  constructor(enabled = true) {
    this.enabled = enabled;
    this.list = []; // { amp, start, ms }
  }

  // A shake of `kind` (a key of SHAKES) starting at `nowMs`. Unknown kinds are ignored.
  add(kind, nowMs) {
    const s = SHAKES[kind];
    if (!this.enabled || !s) return;
    this.list.push({ amp: s.amp, start: nowMs, ms: s.time * 1000 });
  }

  // The summed amplitude at `nowMs`, capped at SHAKE_CAP; drops finished shakes.
  amplitude(nowMs) {
    let a = 0, n = 0;
    for (const s of this.list) {
      const left = 1 - (nowMs - s.start) / s.ms;
      if (left <= 0) continue;
      a += s.amp * Math.min(1, left);
      this.list[n++] = s;
    }
    this.list.length = n;
    return Math.min(SHAKE_CAP, a);
  }

  // The camera offset at `nowMs`, in whole px: the amplitude times a fixed pattern in [-1, 1].
  offset(nowMs) {
    const a = this.enabled ? this.amplitude(nowMs) : 0;
    if (!(a > 0)) return { x: 0, y: 0 };
    const t = nowMs / 1000;
    return {
      x: Math.round(a * Math.sin(2 * Math.PI * SHAKE_HZ.x * t)) || 0,
      y: Math.round(a * Math.cos(2 * Math.PI * SHAKE_HZ.y * t)) || 0,
    };
  }

  clear() { this.list.length = 0; }
}
