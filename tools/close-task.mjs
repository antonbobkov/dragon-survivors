// Close a task: move docs/work/T-NNN-*.md to docs/archive/tasks/, delete its backlog row,
// and repoint links to the work file. Usage: node tools/close-task.mjs T-001
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!/^T-\d{3}$/.test(id || '')) {
  console.error('usage: node tools/close-task.mjs T-NNN');
  process.exit(2);
}

const workDir = join(ROOT, 'docs/work');
const archiveDir = join(ROOT, 'docs/archive/tasks');
const name = readdirSync(workDir).find((f) => f.startsWith(`${id}-`) && f.endsWith('.md'));
if (!name) {
  console.error(`no work file for ${id} in docs/work/`);
  process.exit(1);
}
renameSync(join(workDir, name), join(archiveDir, name));

const backlogPath = join(ROOT, 'docs/backlog.md');
const backlog = readFileSync(backlogPath, 'utf8');
const kept = backlog.split('\n').filter((line) => !line.startsWith(`| ${id} `) && !line.startsWith(`| [${id}]`));
writeFileSync(backlogPath, kept.join('\n'));

// Repoint links from docs/work/<name> to docs/archive/tasks/<name> in every docs file.
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []);
for (const file of walk(join(ROOT, 'docs'))) {
  if (file.startsWith(join(ROOT, 'docs/archive'))) continue;
  const src = readFileSync(file, 'utf8');
  const out = src.replaceAll(`work/${name}`, `archive/tasks/${name}`);
  if (out !== src) writeFileSync(file, out);
}
console.log(`closed ${id}: ${name} archived${existsSync(join(archiveDir, name)) ? '' : ' (FAILED)'}`);
