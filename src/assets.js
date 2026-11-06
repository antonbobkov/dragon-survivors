// Loads the atlas image, atlas.json and every sound (§3.3).
import { SOUND_NAMES } from './sim/content.js';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url}: ${res.status}`);
  return res.json();
}

// A missing or undecodable sound is reported and skipped, never fatal.
async function loadSound(ctx, name) {
  const url = `assets/sounds/${name}.wav`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.arrayBuffer();
    return await ctx.decodeAudioData(data);
  } catch (err) {
    console.warn(`sound ${url} not loaded:`, err);
    return null;
  }
}

// Returns { atlas: { image, frames, anims }, sounds: { name: AudioBuffer } }.
export async function loadAssets(ctx) {
  const [image, json] = await Promise.all([loadImage('assets/atlas.png'), loadJson('assets/atlas.json')]);
  const sounds = {};
  if (ctx) {
    const bufs = await Promise.all(SOUND_NAMES.map((n) => loadSound(ctx, n)));
    SOUND_NAMES.forEach((n, i) => { if (bufs[i]) sounds[n] = bufs[i]; });
  }
  return { atlas: { image, frames: json.frames, anims: json.anims }, sounds };
}
