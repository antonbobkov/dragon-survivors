# T-NEW: Import the ghost's death anim

**Source:** found while writing the sim core (content tables) · **Model:** Sonnet · **Depends on:** T-001

## Why

§8 says the ghost "dies normally", but §3.3 imported no death anim for it. The original pack has one: `ghostnight/ghost_burn.txt` (frames 14–23 of the ghost knight sheet). The spec's §3.3 table now lists it as `ghost.die`, and `content.js` names it in `ENEMIES.ghost.die` and `ATLAS_NAMES`.

## What

- Add `{ "name": "ghost.die", "list": "ghostnight/ghost_burn.txt" }` to `tools/manifest.json`.
- Rerun `npm run build:assets`; commit the new `assets/atlas.json`, `assets/atlas.png` and the regenerated `src/sim/anims.js`.

## Done means

`npm run check` passes its atlas-names check with `ghost.die` present in `assets/atlas.json`, and `ANIMS['ghost.die']` exists.
