// Art preview page (tools/art-preview.html): every atlas anim at 2×, 3× and 4×, on grass and on black,
// animating at its own tick durations. Not part of the game; served next to it as a static page.
import { BG_COLORS, TILE_SIZE, grassSpeckles } from '../src/render/draw.js';

export const SCALES = [2, 3, 4]; // 2× the game scale, 3× the silver and gold tiers (§8.6)
export const TICK_HZ = 60;

/** Frame index of an anim with per-frame `ticks` after `tick` ticks, looping. */
export function frameAt(ticks, tick) {
  const total = ticks.reduce((a, b) => a + b, 0);
  let t = ((tick % total) + total) % total;
  for (let i = 0; i < ticks.length; i++) {
    if (t < ticks[i]) return i;
    t -= ticks[i];
  }
  return ticks.length - 1;
}

/** Group anim names by their prefix before the first '.', in name order. */
export function groupNames(names) {
  const groups = new Map();
  for (const n of [...names].sort()) {
    const g = n.includes('.') ? n.slice(0, n.indexOf('.')) : n;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(n);
  }
  return groups;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function grassTile() {
  const c = document.createElement('canvas');
  c.width = c.height = TILE_SIZE;
  const g = c.getContext('2d');
  g.fillStyle = BG_COLORS.base;
  g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  for (const s of grassSpeckles()) {
    g.fillStyle = s.color;
    g.fillRect(s.x, s.y, 2, 2);
  }
  return c;
}

async function start() {
  const [json, image] = await Promise.all([
    fetch('../assets/atlas.json').then((r) => {
      if (!r.ok) throw new Error(`could not load ../assets/atlas.json: ${r.status}`);
      return r.json();
    }),
    loadImage('../assets/atlas.png'),
  ]);
  const tile = grassTile();
  const main = document.getElementById('main');
  const cards = [];
  for (const [group, names] of groupNames(Object.keys(json.anims))) {
    const h = document.createElement('h2');
    h.textContent = group;
    const box = document.createElement('div');
    box.className = 'group';
    main.append(h, box);
    const section = { h, box, cards: [] };
    for (const name of names) {
      const anim = json.anims[name];
      const rects = anim.frames.map((f) => json.frames[f]);
      const w = Math.max(...rects.map((r) => r.w)), hgt = Math.max(...rects.map((r) => r.h));
      const card = document.createElement('div');
      card.className = 'card';
      const sizes = [...new Set(rects.map((r) => `${r.w}×${r.h}`))].join(', ');
      card.innerHTML = `<div class="name"></div><div class="meta"></div><div class="cells"></div><div class="strip hidden"></div>`;
      card.querySelector('.name').textContent = name;
      card.querySelector('.meta').textContent = `${sizes} px · ${anim.frames.length} frame${anim.frames.length > 1 ? 's' : ''} · ticks ${anim.ticks.join(' ')}`;
      const views = [];
      for (const bg of ['grass', 'black']) {
        for (const s of SCALES) {
          const c = document.createElement('canvas');
          const pad = 4;
          c.width = w * s + pad * 2;
          c.height = hgt * s + pad * 2;
          card.querySelector('.cells').append(c);
          views.push({ c, g: c.getContext('2d'), s, bg });
        }
      }
      const strip = document.createElement('canvas');
      strip.width = anim.frames.length * (w * 2 + 4) + 4;
      strip.height = hgt * 2 + 8;
      card.querySelector('.strip').append(strip);
      box.append(card);
      const entry = { name, anim, rects, views, card, strip, frame: -1 };
      cards.push(entry);
      section.cards.push(entry);
      drawStrip(entry);
    }
    sectionsOf.push(section);
  }

  function paintBg(g, c, bg) {
    if (bg === 'grass') {
      g.fillStyle = g.createPattern(tile, 'repeat');
    } else {
      g.fillStyle = '#000';
    }
    g.fillRect(0, 0, c.width, c.height);
  }

  function blit(g, r, cx, cy, s) {
    g.imageSmoothingEnabled = false;
    const dw = r.w * s, dh = r.h * s;
    g.drawImage(image, r.x, r.y, r.w, r.h, Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);
  }

  function drawStrip(e) {
    const g = e.strip.getContext('2d');
    paintBg(g, e.strip, 'grass');
    const cw = Math.max(...e.rects.map((r) => r.w)) * 2 + 4;
    e.rects.forEach((r, i) => blit(g, r, 4 + i * cw + (cw - 4) / 2, e.strip.height / 2, 2));
  }

  const filter = document.getElementById('filter');
  const framesBox = document.getElementById('frames');
  const pauseBox = document.getElementById('pause');
  const summary = document.getElementById('summary');
  function applyFilter() {
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    for (const sec of sectionsOf) {
      let any = false;
      for (const e of sec.cards) {
        const on = !q || e.name.toLowerCase().includes(q);
        e.card.classList.toggle('hidden', !on);
        e.card.querySelector('.strip').classList.toggle('hidden', !framesBox.checked);
        if (on) { any = true; shown++; }
      }
      sec.h.classList.toggle('hidden', !any);
      sec.box.classList.toggle('hidden', !any);
    }
    summary.textContent = `${shown} of ${cards.length} anims`;
  }
  filter.addEventListener('input', applyFilter);
  framesBox.addEventListener('change', applyFilter);
  applyFilter();

  let tick = 0, last = performance.now(), acc = 0;
  function frameLoop(now) {
    if (!pauseBox.checked) {
      acc += now - last;
      const n = Math.floor(acc / (1000 / TICK_HZ));
      acc -= n * (1000 / TICK_HZ);
      tick += Math.min(n, 8);
    }
    last = now;
    for (const e of cards) {
      if (e.card.classList.contains('hidden')) continue;
      const f = frameAt(e.anim.ticks, tick);
      if (f === e.frame) continue;
      e.frame = f;
      for (const v of e.views) {
        paintBg(v.g, v.c, v.bg);
        blit(v.g, e.rects[f], v.c.width / 2, v.c.height / 2, v.s);
      }
    }
    requestAnimationFrame(frameLoop);
  }
  requestAnimationFrame(frameLoop);
}

const sectionsOf = [];
if (typeof document !== 'undefined') {
  start().catch((err) => {
    document.getElementById('error').textContent = `${err.message}\nServe the repo root (npm run serve) and open /tools/art-preview.html.`;
  });
}
