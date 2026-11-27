# T-042: The dragongame pack in the repo, viewable in the pixel viewer

**Source:** owner request · **Model:** Opus · **Depends on:** T-041 (merged: `pixel/`)

## Why

The owner wants every art asset of the old dragon game in the repo, to browse in the pixel viewer.

## What

1. `pack/`: the BMPs and frame lists of `antonbobkov/burn_n_turn` `assets/` (no sounds, no level files), plus the 11 frames burn_n_turn lacks (prince, royal figures) written back out of the atlas, so `build-atlas --source pack` reproduces the atlas.
2. `tools/folder-index.mjs` writes `pack/index.json` (static hosts cannot list folders); a test keeps it current.
3. The viewer gets an "Old game pack" source and `#src=pack` links; tier variants load for every source.

## Decisions already made

- `manifest.sourceRoot` is unchanged: `copy-sounds` still needs the original folder.
