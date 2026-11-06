// Static checks: syntax, sim purity, atlas names, docs links, conflict markers.
// Usage: node tools/check.mjs   (exit code 1 on any failure)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => existsSync(join(ROOT, f)));

// 1. syntax
for (const f of files.filter((f) => /\.(m?js)$/.test(f))) {
  try {
    execFileSync(process.execPath, ['--check', join(ROOT, f)], { stdio: 'pipe' });
  } catch (e) {
    fail('syntax', `${f}: ${String(e.stderr).split('\n').slice(0, 5).join(' ')}`);
  }
}

// 2. sim purity
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const FORBIDDEN = ['window', 'document', 'Date', 'performance', 'requestAnimationFrame', 'localStorage', 'navigator'];
for (const f of files.filter((f) => f.startsWith('src/sim/') && f.endsWith('.js'))) {
  const src = stripComments(readFileSync(join(ROOT, f), 'utf8'));
  for (const word of FORBIDDEN) {
    if (new RegExp(`\\b${word}\\b`).test(src)) fail('sim-purity', `${f} uses ${word}`);
  }
  if (/Math\.random\b/.test(src)) fail('sim-purity', `${f} uses Math.random (use game.rng)`);
  for (const m of src.matchAll(/(?:import|export)[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1] || m[2];
    const target = resolve(ROOT, dirname(f), spec);
    if (!spec.startsWith('.') || !target.startsWith(join(ROOT, 'src', 'sim') + sep)) {
      fail('sim-purity', `${f} imports ${spec} from outside src/sim/`);
    }
  }
}

// 3. atlas names
const contentPath = join(ROOT, 'src/sim/content.js');
const atlasPath = join(ROOT, 'assets/atlas.json');
if (existsSync(contentPath) && existsSync(atlasPath)) {
  const content = await import(pathToFileURL(contentPath).href);
  if (!Array.isArray(content.ATLAS_NAMES)) {
    fail('atlas', 'src/sim/content.js does not export ATLAS_NAMES');
  } else {
    const atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
    for (const name of content.ATLAS_NAMES) {
      if (!(atlas.anims && atlas.anims[name])) fail('atlas', `atlas.json has no anim "${name}"`);
    }
  }
}

// 4. docs links
const mdFiles = files.filter((f) => f.endsWith('.md') && (f.startsWith('docs/') || !f.includes('/')));
for (const f of mdFiles) {
  const src = readFileSync(join(ROOT, f), 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of src.matchAll(/\]\(([^)\s]+)\)/g)) {
    const link = m[1].split('#')[0];
    if (!link || /^[a-z]+:/i.test(link)) continue;
    const target = resolve(ROOT, dirname(f), decodeURIComponent(link));
    if (!existsSync(target)) fail('docs-links', `${f} -> ${m[1]} (${relative(ROOT, target)} missing)`);
  }
}

// 5. conflict markers
for (const f of files.filter((f) => /\.(m?js|md|json|html|css|yml|txt)$/.test(f))) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  if (/^(<{7}|>{7}|={7})( |$)/m.test(src)) fail('conflict', `${f} contains a conflict marker`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n${failures.length} check failure(s)`);
  process.exit(1);
}
console.log(`checks ok (${files.length} files)`);
