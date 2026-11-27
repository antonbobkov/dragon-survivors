# T-041: Pixel viewer (first step of a web pixel art viewer and editor)

**Source:** owner request · **Model:** Opus · **Depends on:** none

## Why

The owner wants a web-based, agent-friendly pixel art viewer and editor, hosted with the game on GitHub Pages at `/dragon-survivors/pixel/`. The editor will come later; this task is the viewer.

## What

1. `pixel/`: a static page (no dependencies, ES modules) that lists sprites from a source and shows the selected one animated, plus every frame as a sheet.
2. **Sources.** Default: the game's built atlas (`assets/atlas.json` and `.png`), grouped into folders by `tools/manifest.json` (`art/<dir>` for text art, `pack/<dir>` for the pack's BMPs); the generated `@t2`–`@t4` tiers are not listed, since they are the tier variants. **Open folder:** a local folder (File System Access API, falling back to `<input webkitdirectory>`) holding text art (`art/README.md` format), pack frame lists with their BMPs, loose BMP/PNG files, and PNG sheets with a `<name>.anim.json` sidecar (`{ frameWidth, frameHeight, ticks }`).
3. **View controls.** Integer scale 1–12× (plus "game", the scale the game draws it at); background grass/black/checker/grey/white; play/pause, frame step, speed; mirror; variants: plain, the manifest's tiers, and custom swap/tint/outline ops, shown as the manifest line that would make them; "compare all" shows every variant side by side; keyboard shortcuts; the URL hash keeps the sprite, scale and tier.
4. **One implementation.** The viewer imports `tools/lib/art.mjs`, `bmp.mjs`, `variants.mjs` and the new `tools/lib/sequence.mjs` (`parseSequence` moved out of `build-atlas.mjs`, which re-exports it), so live variants equal the built ones.

## Decisions already made

- The viewer is a tool and is not part of the game; the spec does not describe it. `pixel/README.md` does.
- Animation metadata stays where it already lives: ticks in text art, FANCY durations in pack frame lists; only PNG sheets need the new sidecar.

## Tests

`test/pixel.test.mjs`: frame timing, BMP decoding from a plain `Uint8Array`, live tier variants equal to the atlas's built tiers pixel for pixel, atlas folders from the real manifest, folder scanning (text art, lists, missing frames, loose images, sheets, palette fallback, the repo's `art/` scanning without warnings), filtering.
