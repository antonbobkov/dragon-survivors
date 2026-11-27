// Pixel viewer, browser side: load a source (the game atlas or a local folder), list its sprites,
// show the selected one animated and as a sheet, at an integer scale, with live variants.
import { parsePalette } from '../tools/lib/art.mjs';
import { BG_COLORS, TILE_SIZE, grassSpeckles } from '../src/render/draw.js';
import { TIERS, screenScale } from '../src/sim/content.js';
import {
  TICK_HZ, applyVariant, atlasSprites, filterSprites, frameAt, frameStart, isPlain, scanFolder, tierPresets,
} from './lib.mjs';

const $ = (id) => document.getElementById(id);
const SCALE_MIN = 1, SCALE_MAX = 12;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

const state = {
  sourceName: '', sourceKey: 'game', reload: null, // async () => sprites
  sprites: [], shown: [], sprite: null, data: null, error: '',
  presets: [], variant: 'plain', custom: { swap: '', tint: '', tintStrength: 0.6, outline: '' },
  scale: 4, bg: 'grass', flip: false, playing: true, speed: 1, tick: 0, compare: false,
  cache: new Map(), // variant key -> [canvas]
};

// ---- loading ------------------------------------------------------------------------------

async function fetchOk(url, as) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`could not load ${url}: ${r.status}`);
  return r[as]();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function imagePixels(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, rgba: new Uint8Array(d.data.buffer) };
}

async function decodePng(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes]));
  return imagePixels(bmp);
}

let gamePalette = null;
async function fallbackPalette() {
  if (!gamePalette) gamePalette = fetchOk('../art/palette.txt', 'text').then((t) => parsePalette(t)).catch(() => null);
  return gamePalette;
}

async function loadGame() {
  const bust = `?v=${Date.now()}`;
  const [json, manifest, img] = await Promise.all([
    fetchOk('../assets/atlas.json', 'json'),
    fetchOk('../tools/manifest.json', 'json').catch(() => null),
    loadImage(`../assets/atlas.png${bust}`),
  ]);
  state.presets = tierPresets(manifest);
  return atlasSprites(json, imagePixels(img), manifest);
}

// Directory handle (File System Access API) -> path map of lazy file readers.
async function walkHandle(dir, prefix = '', out = new Map()) {
  for await (const [name, h] of dir.entries()) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (h.kind === 'directory') {
      if (!SKIP_DIRS.has(name)) await walkHandle(h, p, out);
    } else {
      out.set(p, {
        text: async () => (await h.getFile()).text(),
        bytes: async () => new Uint8Array(await (await h.getFile()).arrayBuffer()),
      });
    }
  }
  return out;
}

// <input webkitdirectory> FileList -> the same map (paths without the folder's own name).
function mapFileList(list) {
  const out = new Map();
  for (const f of list) {
    const parts = (f.webkitRelativePath || f.name).split('/');
    if (parts.length > 1) parts.shift();
    if (parts.some((p) => SKIP_DIRS.has(p))) continue;
    out.set(parts.join('/'), {
      text: () => f.text(),
      bytes: async () => new Uint8Array(await f.arrayBuffer()),
    });
  }
  return out;
}

// A folder served over HTTP with an index.json ({ files: [path] }, tools/folder-index.mjs).
async function loadServedFolder(base) {
  const { files } = await fetchOk(`${base}index.json`, 'json');
  const url = (p) => base + p.split('/').map(encodeURIComponent).join('/');
  const map = new Map(files.map((p) => [p, {
    text: () => fetchOk(url(p), 'text'),
    bytes: async () => new Uint8Array(await fetchOk(url(p), 'arrayBuffer')),
  }]));
  return scan(map);
}

async function scan(files) {
  return scanFolder(files, { decodeImage: decodePng, fallbackPalette: await fallbackPalette() });
}

// The sources a link can name (#src=…); a local folder cannot be linked.
const SOURCES = {
  game: { name: 'Game sprites', load: () => loadGame() },
  pack: { name: 'Old game pack', load: () => loadServedFolder('../pack/') },
};

function useNamed(key, keepId) {
  state.sourceKey = key;
  return useSource(SOURCES[key].name, SOURCES[key].load, keepId);
}

async function useSource(name, reload, keepId) {
  state.error = '';
  $('srcName').textContent = `${name}: loading…`;
  if (!state.presets.length) await loadPresets(); // the tiers apply to any source
  try {
    const sprites = await reload();
    state.sourceName = name;
    state.reload = reload;
    state.sprites = sprites;
    state.cache.clear();
    renderTree();
    const keep = sprites.find((s) => s.id === keepId) || state.shown[0] || null;
    await select(keep);
  } catch (e) {
    state.error = e.message || String(e);
    render();
  }
  $('srcName').textContent = `${state.sourceName} · ${state.sprites.length} sprites`;
}

async function openFolder() {
  if (window.showDirectoryPicker) {
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'pixel-viewer', mode: 'read' }); } catch { return; }
    if (!state.presets.length) await loadPresets();
    state.sourceKey = null;
    await useSource(dir.name, async () => scan(await walkHandle(dir)));
  } else {
    $('folderInput').click();
  }
}

$('folderInput').addEventListener('change', async (ev) => {
  const list = [...ev.target.files];
  if (!list.length) return;
  if (!state.presets.length) await loadPresets();
  const name = (list[0].webkitRelativePath || '').split('/')[0] || 'folder';
  const files = mapFileList(list); // a FileList cannot be re-read, so Reload shows the same files
  state.sourceKey = null;
  await useSource(name, () => scan(files));
  ev.target.value = '';
});

async function loadPresets() {
  state.presets = tierPresets(await fetchOk('../tools/manifest.json', 'json').catch(() => null));
  renderVariantButtons();
}

// ---- selection and variants ---------------------------------------------------------------

async function select(sprite) {
  state.sprite = sprite;
  state.data = null;
  state.cache.clear();
  state.error = '';
  state.tick = 0;
  document.querySelectorAll('.item').forEach((b) => b.classList.toggle('sel', b.dataset.id === sprite?.id));
  if (sprite) {
    try {
      state.data = await sprite.load();
    } catch (e) {
      state.error = e.message || String(e);
    }
    writeHash();
  }
  renderSheet();
  render();
}

function variantOps(key) {
  if (key === 'plain') return {};
  if (key === 'custom') return state.custom;
  const p = state.presets.find((x) => `t${x.tier}` === key);
  return p ? p.ops : {};
}

function variantLabel(key) {
  if (key === 'plain') return 'plain';
  if (key === 'custom') return 'custom';
  const tier = Number(key.slice(1));
  return (TIERS[tier] && TIERS[tier].name.toLowerCase()) || key;
}

const variantKeys = () => ['plain', ...state.presets.map((p) => `t${p.tier}`), 'custom'];

function canvasOf(frame) {
  const c = document.createElement('canvas');
  c.width = frame.width; c.height = frame.height;
  const img = new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

function framesFor(key) {
  const ck = key === 'custom' ? `custom:${JSON.stringify(state.custom)}` : key;
  if (!state.cache.has(ck)) {
    const ops = variantOps(key);
    state.cache.set(ck, state.data.frames.map((f) => canvasOf(isPlain(ops) ? f : applyVariant(f, ops))));
  }
  return state.cache.get(ck);
}

function opsText(ops) {
  const parts = [];
  if (ops.swap) parts.push(`"swap": "${ops.swap}"`);
  if (ops.tint) parts.push(`"tint": "${ops.tint}", "tintStrength": ${ops.tintStrength ?? 1}`);
  if (ops.outline) parts.push(`"outline": "${ops.outline}"`);
  return parts.length ? `manifest: { ${parts.join(', ')} }` : '';
}

// The scale the game draws this sprite at (enemy tiers draw bigger), when it is a game sprite.
function gameScale() {
  const s = state.sprite;
  if (!s || !s.id.startsWith('atlas:')) return null;
  const tier = /^t\d$/.test(state.variant) ? Number(state.variant.slice(1)) : 1;
  return screenScale(s.name, tier);
}

// ---- drawing ------------------------------------------------------------------------------

let grass = null;
function grassTile() {
  if (grass) return grass;
  const c = document.createElement('canvas');
  c.width = c.height = TILE_SIZE;
  const g = c.getContext('2d');
  g.fillStyle = BG_COLORS.base;
  g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  for (const s of grassSpeckles()) { g.fillStyle = s.color; g.fillRect(s.x, s.y, 2, 2); }
  return (grass = c);
}

function paintBg(g, w, h, scale) {
  const bg = state.bg;
  if (bg === 'grass') g.fillStyle = g.createPattern(grassTile(), 'repeat');
  else if (bg === 'checker') {
    const n = Math.max(4, scale * 4);
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6e6e6e';
    for (let y = 0; y < h; y += n) for (let x = (y / n) % 2 ? n : 0; x < w; x += n * 2) g.fillRect(x, y, n, n);
    return;
  } else g.fillStyle = { black: '#000', grey: '#555', white: '#fff' }[bg];
  g.fillRect(0, 0, w, h);
}

// One frame canvas drawn centred in a w×h box at an integer scale.
function blit(g, src, w, h, scale) {
  const dw = src.width * scale, dh = src.height * scale;
  const x = Math.round((w - dw) / 2), y = Math.round((h - dh) / 2);
  g.imageSmoothingEnabled = false;
  if (state.flip) {
    g.save(); g.translate(x + dw, y); g.scale(-1, 1); g.drawImage(src, 0, 0, dw, dh); g.restore();
  } else g.drawImage(src, x, y, dw, dh);
}

const PAD = 8;

function render() {
  $('error').textContent = state.error;
  $('scaleVal').textContent = `${state.scale}×`;
  $('playBtn').textContent = state.playing ? '❚❚' : '▶︎';
  const gs = gameScale();
  $('scaleGame').disabled = gs === null;
  $('scaleGame').classList.toggle('on', gs === state.scale);
  $('custom').classList.toggle('show', state.variant === 'custom');
  $('opsText').textContent = opsText(variantOps(state.variant));
  document.querySelectorAll('#variants button').forEach((b) => b.classList.toggle('on', b.dataset.key === state.variant));
  const s = state.sprite, d = state.data;
  $('title').textContent = s ? s.name : '';
  if (!s || !d) {
    $('meta').textContent = s ? '' : 'No sprite selected.';
    $('warnings').textContent = '';
    $('stage').replaceChildren();
    return;
  }
  const sizeOf = (list) => [...new Set(list.map((f) => `${f.width}×${f.height}`))].join(', ');
  const sizes = sizeOf(d.frames), shown = sizeOf(framesFor(state.variant));
  const sizeText = shown === sizes ? `${sizes} px` : `${sizes} px (${shown} with ${variantLabel(state.variant)})`;
  const total = d.ticks.reduce((a, b) => a + b, 0);
  $('meta').textContent = [
    s.source, sizeText, `${d.frames.length} frame${d.frames.length > 1 ? 's' : ''}`,
    `ticks ${d.ticks.join(' ')} (${Math.round((total / TICK_HZ) * 1000)} ms loop)`,
    gs !== null ? `in game ${gs}×` : '',
  ].filter(Boolean).join(' · ');
  $('warnings').textContent = d.warnings.join('\n');
  drawStage();
}

function drawStage() {
  const d = state.data;
  if (!d) return;
  const keys = state.compare ? variantKeys().filter((k) => k !== 'custom' || !isPlain(state.custom)) : [state.variant];
  const i = frameAt(d.ticks, state.tick);
  const stage = $('stage');
  if (stage.children.length !== keys.length || [...stage.children].some((c, n) => c.dataset.key !== keys[n])) {
    stage.replaceChildren(...keys.map((k) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.key = k;
      cell.innerHTML = '<canvas></canvas><div class="cap"></div>';
      cell.querySelector('.cap').textContent = keys.length > 1 ? variantLabel(k) : '';
      return cell;
    }));
  }
  keys.forEach((k, n) => {
    const frames = framesFor(k);
    const w = Math.max(...frames.map((f) => f.width)) * state.scale + PAD * 2;
    const h = Math.max(...frames.map((f) => f.height)) * state.scale + PAD * 2;
    const c = stage.children[n].querySelector('canvas');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    paintBg(g, w, h, state.scale);
    blit(g, frames[i], w, h, state.scale);
  });
  document.querySelectorAll('#sheet .frame').forEach((el, n) => el.classList.toggle('cur', n === i));
}

function renderSheet() {
  const sheet = $('sheet');
  const d = state.data;
  if (!d) { sheet.replaceChildren(); return; }
  const frames = framesFor(state.variant);
  const scale = Math.max(1, Math.min(state.scale, 4));
  const w = Math.max(...frames.map((f) => f.width)) * scale + 4;
  const h = Math.max(...frames.map((f) => f.height)) * scale + 4;
  sheet.replaceChildren(...frames.map((f, n) => {
    const el = document.createElement('div');
    el.className = 'frame';
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    paintBg(g, w, h, scale);
    blit(g, f, w, h, scale);
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = `${n} · ${d.ticks[n]}t`;
    el.append(c, cap);
    el.addEventListener('click', () => { state.playing = false; state.tick = frameStart(d.ticks, n); render(); });
    return el;
  }));
}

function renderTree() {
  state.shown = filterSprites(state.sprites, $('filter').value);
  const groups = new Map();
  for (const s of state.shown) {
    const k = s.path.join('/') || '.';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const tree = $('tree');
  tree.replaceChildren(...[...groups].map(([k, list]) => {
    const det = document.createElement('details');
    det.open = true;
    const sum = document.createElement('summary');
    sum.textContent = `${k} (${list.length})`;
    det.append(sum, ...list.map((s) => {
      const b = document.createElement('button');
      b.className = 'item';
      b.dataset.id = s.id;
      b.title = s.source;
      b.textContent = s.name;
      if (state.sprite && s.id === state.sprite.id) b.classList.add('sel');
      b.addEventListener('click', () => select(s));
      return b;
    }));
    return det;
  }));
  if (!state.shown.length) tree.innerHTML = '<div class="empty" style="padding:16px">No sprites match.</div>';
}

function renderVariantButtons() {
  const box = $('variants');
  box.querySelectorAll('button').forEach((b) => b.remove());
  for (const k of variantKeys()) {
    const b = document.createElement('button');
    b.dataset.key = k;
    b.textContent = variantLabel(k);
    b.addEventListener('click', () => setVariant(k));
    box.append(b);
  }
  render();
}

function setVariant(k) {
  if (k === 'custom' && state.variant !== 'custom') {
    // start the custom ops from what is on show, so a tier can be tweaked
    const from = variantOps(state.variant);
    state.custom = { swap: from.swap || '', tint: from.tint || '', tintStrength: from.tintStrength ?? 0.6, outline: from.outline || '' };
    syncCustomInputs();
  }
  state.variant = k;
  writeHash();
  renderSheet();
  render();
}

function syncCustomInputs() {
  const c = state.custom;
  $('swap').value = c.swap;
  $('tintOn').checked = !!c.tint;
  if (c.tint) $('tint').value = c.tint;
  $('strength').value = c.tintStrength;
  $('strengthVal').textContent = c.tintStrength;
  $('outlineOn').checked = !!c.outline;
  if (c.outline) $('outline').value = c.outline;
}

function readCustomInputs() {
  state.custom = {
    swap: $('swap').value,
    tint: $('tintOn').checked ? $('tint').value : '',
    tintStrength: Number($('strength').value),
    outline: $('outlineOn').checked ? $('outline').value : '',
  };
  $('strengthVal').textContent = state.custom.tintStrength;
  renderSheet();
  render();
}
for (const id of ['swap', 'tintOn', 'tint', 'strength', 'outlineOn', 'outline']) $(id).addEventListener('input', readCustomInputs);

// ---- controls -----------------------------------------------------------------------------

function setScale(s) {
  state.scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, s));
  writeHash();
  renderSheet();
  render();
}

function step(n) {
  const d = state.data;
  if (!d) return;
  state.playing = false;
  const i = (frameAt(d.ticks, state.tick) + n + d.ticks.length) % d.ticks.length;
  state.tick = frameStart(d.ticks, i);
  render();
}

function moveSelection(n) {
  const list = state.shown;
  if (!list.length) return;
  const i = list.findIndex((s) => s.id === state.sprite?.id);
  const next = list[Math.max(0, Math.min(list.length - 1, i + n))];
  select(next);
  document.querySelector(`.item[data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' });
}

$('gameBtn').addEventListener('click', () => useNamed('game'));
$('packBtn').addEventListener('click', () => useNamed('pack'));
$('folderBtn').addEventListener('click', openFolder);
$('reloadBtn').addEventListener('click', () => state.reload && useSource(state.sourceName, state.reload, state.sprite?.id));
$('filter').addEventListener('input', renderTree);
$('scaleDown').addEventListener('click', () => setScale(state.scale - 1));
$('scaleUp').addEventListener('click', () => setScale(state.scale + 1));
$('scaleGame').addEventListener('click', () => { const g = gameScale(); if (g) setScale(g); });
$('bg').addEventListener('change', (e) => { state.bg = e.target.value; renderSheet(); render(); });
$('playBtn').addEventListener('click', () => { state.playing = !state.playing; render(); });
$('prevBtn').addEventListener('click', () => step(-1));
$('nextBtn').addEventListener('click', () => step(1));
$('speed').addEventListener('change', (e) => { state.speed = Number(e.target.value); });
$('flip').addEventListener('change', (e) => { state.flip = e.target.checked; renderSheet(); render(); });
$('compare').addEventListener('change', (e) => { state.compare = e.target.checked; render(); });

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') && e.target.type !== 'checkbox') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === ' ') { state.playing = !state.playing; render(); }
  else if (k === 'ArrowLeft') step(-1);
  else if (k === 'ArrowRight') step(1);
  else if (k === 'ArrowUp') moveSelection(-1);
  else if (k === 'ArrowDown') moveSelection(1);
  else if (k === '+' || k === '=') setScale(state.scale + 1);
  else if (k === '-') setScale(state.scale - 1);
  else if (k === 'm') { $('flip').checked = state.flip = !state.flip; renderSheet(); render(); }
  else if (k === 'v') { const ks = variantKeys(); setVariant(ks[(ks.indexOf(state.variant) + 1) % ks.length]); }
  else if (k === 'r') $('reloadBtn').click();
  else return;
  e.preventDefault();
});

// ---- the clock and the URL ----------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing && state.data) {
    const before = frameAt(state.data.ticks, state.tick);
    state.tick += dt * TICK_HZ * state.speed;
    if (frameAt(state.data.ticks, state.tick) !== before) drawStage();
  }
  requestAnimationFrame(frame);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const scale = Number(p.get('scale'));
  if (Number.isInteger(scale) && scale >= SCALE_MIN && scale <= SCALE_MAX) state.scale = scale;
  if (p.get('v')) state.variant = p.get('v');
  const src = SOURCES[p.get('src')] ? p.get('src') : 'game';
  const s = p.get('s');
  return { src, id: s ? (src === 'game' ? `atlas:${s}` : `file:${s}`) : undefined };
}

function writeHash() {
  const p = new URLSearchParams();
  if (state.sourceKey && state.sourceKey !== 'game') p.set('src', state.sourceKey);
  if (state.sourceKey && state.sprite) p.set('s', state.sprite.id.replace(/^(atlas|file):/, ''));
  p.set('scale', state.scale);
  if (state.variant !== 'plain' && state.variant !== 'custom') p.set('v', state.variant);
  history.replaceState(null, '', `#${p}`);
}

const wanted = readHash();
renderVariantButtons();
await useNamed(wanted.src, wanted.id);
if (!variantKeys().includes(state.variant)) state.variant = 'plain';
renderVariantButtons();
requestAnimationFrame(frame);
