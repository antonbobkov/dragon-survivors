# The dragongame pack

Every sprite of the original dragon game: the `assets/` BMPs and frame lists of [antonbobkov/burn_n_turn](https://github.com/antonbobkov/burn_n_turn) (commit `a609aa8`), copied so the [pixel viewer](../pixel/README.md) can show all of them ("Old game pack"). The sounds and the old game's level files are not copied.

- 250 of the frames the game's atlas uses are here unchanged and match it pixel for pixel. The 11 frames burn_n_turn lacks (`princess/prince*.bmp`, `castle/royal_figure_*.bmp`) and their lists (`princess/prince.txt`, `prince_die.txt`) were written back out of `assets/atlas.png`, so `node tools/build-atlas.mjs --source pack` rebuilds the atlas with identical pixels, frames and timings.
- Frame lists are `.txt` files of BMP names, one frame each at 6 ticks; a leading `FANCY` gives `name N` pairs with N in 30 Hz ticks. Pure black is transparent.
- `index.json` lists the files for static hosting; run `node tools/folder-index.mjs` after adding or removing any (a test checks it).
- `npm run build:assets` still reads `sourceRoot` in `tools/manifest.json` by default, because the sounds are not here.
