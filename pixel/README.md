# Pixel viewer

A browser viewer for the game's sprites and any folder of pixel art: the first step towards a web pixel art editor. Static files, no dependencies; it shares the art pipeline's code (`tools/lib/`), so what it shows is what the build makes.

- **Online:** <https://antonbobkov.github.io/dragon-survivors/pixel/> (GitHub Pages serves the repo from `main`).
- **Locally:** `npm run serve`, then <http://localhost:8000/pixel/>.

## Sources

- **Game sprites** (default): the built atlas, `assets/atlas.json` and `atlas.png`, in folders from `tools/manifest.json` (`art/…` for this repo's text art, `pack/…` for the dragongame pack). Run `npm run build:assets` after changing art, then press Reload.
- **Open folder…**: any local folder, for example this repo's `art/` or the dragongame pack. Chrome and Edge open it in place, so Reload re-reads the files after an edit; other browsers upload a copy. It reads:

| Files | Sprite |
|---|---|
| text art `.txt` ([format](../art/README.md)) | one per file, frame ticks from the file; palette names from a `palette.txt` in the folder, else the game's |
| pack frame list `.txt` (image names, optionally `FANCY` with durations) | one per list, its BMPs in order |
| `.bmp` / `.png` that no list uses | one per image (BMP black is transparent) |
| `.png` with `<name>.anim.json` | a sheet: `{ "frameWidth": 16, "frameHeight": 16, "ticks": 6 }` (`ticks` a number or one per frame), frames left to right, top to bottom |

Everything else is ignored, and so are `.git` and `node_modules`.

## View

- The preview plays at the sprite's own durations (60 Hz ticks). The sheet below shows every frame with its ticks; click one to hold it.
- **Scale** is always a whole number, 1–12×; **game** sets the scale the game draws the sprite at (2×; 3× for silver and gold, more for the mounted knight).
- **Variants:** plain, the enemy tiers from the manifest (bronze, silver, gold), or custom swap, tint and outline. The bar shows the manifest line for the variant on show. **Compare all** shows every variant side by side.
- Keys: space play/pause · ← → frame · ↑ ↓ sprite · + − scale · m mirror · v next variant · r reload.
- The URL keeps the game sprite, the scale and the tier, so a link opens the same view.

## Code

- `lib.mjs`: sources, folder scanning, frame timing and variants. Pure, tested by `test/pixel.test.mjs` under node.
- `app.js`: the page (files, images, canvas, controls).
