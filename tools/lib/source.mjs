// Shared helpers for the asset tools: manifest loading and source-root resolution.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MANIFEST_PATH = join(REPO_ROOT, 'tools', 'manifest.json');

export function loadManifest(path = MANIFEST_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Value of `--name <v>` or `--name=<v>` in argv, or undefined. */
export function argValue(argv, name) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(`${name}=`)) return argv[i].slice(name.length + 1);
  }
  return undefined;
}

/** `--source <dir>` wins, then the DRAGONGAME_ASSETS env var, then manifest.sourceRoot. */
export function resolveSourceRoot(manifest, argv = [], env = process.env) {
  return argValue(argv, '--source') || env.DRAGONGAME_ASSETS || manifest.sourceRoot;
}
