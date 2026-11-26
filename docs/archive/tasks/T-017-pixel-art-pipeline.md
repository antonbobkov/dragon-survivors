# T-017: Pixel-art pipeline and the new buff icons

**Source:** [strategy-depth design](../../../reports/designs/2026-11-26-strategy-depth-design.md) §6, §10; owner instruction "if art assets are missing, create new pixel art" · **Model:** Opus · **Depends on:** nothing open

## Why

Most of the new features (horses, mounted knights, smaller slimes, claws, bite, saw blade, braziers, pickups, new icons) have no art in the dragongame pack. The owner wants **new pixel art in the pack's style**, not placeholders. Tiers (§6) also need generated colour variants of existing art. This task builds the pipeline every later art task uses, and draws the first real pieces: the buff icons T-019 needs.

## What

1. **Source format** under `art/` (in this repo, committed): one text file per animation, `art/<group>/<name>.txt`, holding a palette key and one or more frames of equal size as character grids. You design the exact format; requirements:
   - `.` (or another single char) is transparent; every other char maps to a palette colour.
   - Frames separated clearly; optional per-frame tick durations (60 Hz ticks, default 6).
   - Comments allowed. Human-editable in a text editor, diff-friendly.
   - Documented in `art/README.md` with a tiny example.
2. **Palette:** `art/palette.txt`, sampled from the pack's BMPs (a script `tools/palette.mjs` that counts colours over the imported frames and writes the most common ~32 with names). Art should use these colours; the build **warns** (does not fail) on a colour outside the palette.
3. **Build:** `tools/build-atlas.mjs` reads manifest entries of a new form, e.g. `{ "name": "icon.might", "art": "icons/might.txt" }`, next to the BMP entries; frames go into the same atlas; `anims.js` regenerates as today. Frame keys must not collide with BMP keys (e.g. prefix `art/`).
4. **Variants** (for tiers, T-021): manifest options that derive frames from an existing entry's frames: `"tint": "#rrggbb"` with a strength (luminance-preserving colour multiply, so shading survives) and `"outline": "#rrggbb"` (a 1 px outline around opaque pixels, growing the frame by 2 px each way so nothing is clipped). Combinable with the existing `"swap": "rg"`. Test both on synthetic frames.
5. **Art style guide** in `art/README.md`: side view, facing right, black = transparent in BMPs / `.` in text, sizes (16 px standard enemies, 9 × 9 icons), 2-frame walks, light from the top-left, 1 px dark outline only where the pack's sprites have one, no anti-aliasing, palette colours only. Look at the pack's sprites (decode a few and print them as text, as earlier tasks did) and describe what you see; later art tasks follow this guide.
6. **First art:** the buff icons the design's §3 needs that the pack lacks: `icon.might`, `icon.haste`, `icon.duration`, `icon.force`, `icon.amount` (9 × 9, matching the existing `bonus/*1.bmp` icons' look: render a few of those as text first). Reuse pack icons where one already fits (say which: e.g. `bonus/bonusbig1.bmp` for Might is fine if it reads as damage) and draw only the rest. Register every icon in the manifest; do not wire them into the game (T-019 does).
7. **Viewer:** `?art=1` on the page (or a small `tools/art-preview.html`) that shows every atlas anim at 2× and 4× with its name, animating, on grass and on black, so the owner and later tasks can eyeball art. Keep it out of the game flow.

## Decisions already made

- Art files are source; the atlas stays generated and committed (as today).
- Never scale existing sprites to fake a new size (owner: pixel art does not scale).
- Variants are generated, not hand-drawn, so changing a tier colour is one manifest edit.

## Spec sections to read (whole)

§3 (asset pipeline), §5 (sprite scale), §17 (HUD icons), §20 (atlas tests).

## Tests

Parser (frames, palette, transparency, durations, errors with line numbers); variant transforms (tint keeps luminance order, outline grows by 2 and only borders opaque pixels, combination order); build from art entries into the atlas; committed atlas contains every manifest name; palette warning path.

## Must not

Change game behaviour. Another agent (T-018) changes the sim and adds a stats panel in parallel: stay out of `src/sim/` (except the generated `anims.js`) and `src/render/` (except, if you choose that route, a separate art-preview entry that the game does not load). Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; `npm run build:assets` builds BMP and art entries; `art/README.md` with the format and style guide; the new icons in the atlas and visible in the viewer; spec §3 describes the art pipeline as plain spec text; commit `T-017: …` with `Closes: T-017`.
