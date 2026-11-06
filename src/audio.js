// Web Audio playback (§18): voice cap and per-sound minimum interval.
// `Throttle` is pure (tested with a fake clock); `createAudio` is the Web Audio glue.

export const MAX_VOICES = 16;
export const MIN_INTERVAL = 0.05; // s between two starts of the same sound
export const MASTER_VOLUME = 0.6; // *unmeasured*

export class Throttle {
  constructor({ maxVoices = MAX_VOICES, minInterval = MIN_INTERVAL } = {}) {
    this.maxVoices = maxVoices;
    this.minInterval = minInterval;
    this.lastStart = new Map(); // name -> time of the last start
    this.voiceEnds = []; // end times of the voices still playing
  }

  // Whether `name` may start at time `now` (seconds); if so, records a voice lasting `duration` s.
  tryStart(name, now, duration) {
    this.voiceEnds = this.voiceEnds.filter((end) => end > now);
    const last = this.lastStart.get(name);
    if (last !== undefined && now - last < this.minInterval) return false;
    if (this.voiceEnds.length >= this.maxVoices) return false;
    this.lastStart.set(name, now);
    this.voiceEnds.push(now + Math.max(0, duration));
    return true;
  }
}

// ctx: an AudioContext; buffers: { name: AudioBuffer }.
export function createAudio(ctx, buffers) {
  const throttle = new Throttle();
  let master = null;
  if (ctx) {
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
  }
  return {
    play(name, { volume = 1 } = {}) {
      const buf = buffers[name];
      if (!ctx || !buf || ctx.state !== 'running') return false;
      if (!throttle.tryStart(name, ctx.currentTime, buf.duration)) return false;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(master);
      src.start();
      return true;
    },
    // Browsers start the context suspended until a user gesture.
    resume() {
      if (ctx && ctx.state === 'suspended') return ctx.resume().catch(() => {});
      return Promise.resolve();
    },
  };
}
