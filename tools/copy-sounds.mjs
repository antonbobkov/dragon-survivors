// Copies the WAVs listed in manifest.json "sounds" from the dragongame pack into assets/sounds/.
// Usage: node tools/copy-sounds.mjs [--source <dir>] [--out <repo-root>]
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, argValue, loadManifest, resolveSourceRoot } from './lib/source.mjs';

export function copySounds(manifest, sourceRoot, outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const name of manifest.sounds) {
    const src = join(sourceRoot, `${name}.wav`);
    if (!existsSync(src)) throw new Error(`missing sound ${name}.wav (looked in ${sourceRoot})`);
    copyFileSync(src, join(outDir, `${name}.wav`));
  }
  return manifest.sounds.length;
}

function main(argv) {
  const manifest = loadManifest();
  const sourceRoot = resolveSourceRoot(manifest, argv);
  if (!existsSync(sourceRoot)) {
    console.error(`copy-sounds: source folder not found: ${sourceRoot}\nUse --source <dir> or set DRAGONGAME_ASSETS.`);
    process.exit(1);
  }
  const outRoot = resolve(argValue(argv, '--out') || REPO_ROOT);
  const n = copySounds(manifest, sourceRoot, join(outRoot, 'assets', 'sounds'));
  console.log(`copied ${n} sounds -> ${join(outRoot, 'assets', 'sounds')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2));
