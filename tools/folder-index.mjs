// Writes <dir>/index.json, the list of a folder's files, so a static host (GitHub Pages, which
// cannot list folders) can serve the folder to the pixel viewer (pixel/).
// Usage: node tools/folder-index.mjs [dir]   (default: pack)
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/source.mjs';

export const INDEX_FILE = 'index.json';

/** Every file under `dir` but the index itself, as sorted '/'-separated relative paths. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.filter((p) => p !== INDEX_FILE && !p.endsWith('/.DS_Store') && p !== '.DS_Store').sort();
}

export function indexText(dir) {
  return JSON.stringify({ files: listFiles(dir) }, null, 1) + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = resolve(REPO_ROOT, process.argv[2] || 'pack');
  writeFileSync(join(dir, INDEX_FILE), indexText(dir));
  console.log(`wrote ${relative(REPO_ROOT, join(dir, INDEX_FILE))} (${listFiles(dir).length} files)`);
}
