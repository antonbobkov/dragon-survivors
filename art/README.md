# Pixel art for Dragon Survivors

Sprites the dragongame pack does not have are drawn here, as text, in the pack's style. `npm run build:assets` packs them into `assets/atlas.png` next to the pack's BMPs; the atlas is generated and committed, these files are the source. Spec: [§3.4 and §3.5](../docs/demo-spec.md#34-text-pixel-art).

## The format

One file per animation: `art/<group>/<name>.txt`.

```
# icon.example: a red gem over the bonus tray.   <- comment lines start with #
key                                               <- one character per colour
  r red                                           <- a palette name (palette.txt)
  d maroon
  Y gold
  x #ff8800                                       <- or a hex colour (warns: not in the palette)
frame                                             <- 6 ticks (60 Hz) by default
....r....
...rrd...
..rrrdd..
...rdd...
....d....
.........
.........
YY.....YY
.YYYYYYY.
frame 12                                          <- this frame lasts 12 ticks
.........
```

- `.` is always transparent. Every other character must be in the `key`.
- Every frame has the same size; every row of a frame the same width. Indentation and blank lines are ignored; spaces inside a row are not allowed.
- `key` and `frame` lines may end with `# comment`; pixel rows may not.
- Pure black `#000000` is refused: it is the pack's transparency key. The pack's own black is `black` (`#010000`).
- Errors name the file and line; a colour outside the palette is only a warning.

Register the file in [`tools/manifest.json`](../tools/manifest.json):

```json
{ "name": "icon.might", "art": "icons/might.txt" }
```

Its frames get keys `art/icons/might.txt:0`, `:1`, … and its ticks come from the file.

## Variants

Recolours are generated, never drawn: one manifest line each, derived from any earlier entry with `from` (or put the options on the source entry itself).

```json
{ "name": "knight.walk.bronze", "from": "knight.walk", "tint": "#c87533", "tintStrength": 0.6, "outline": "#a0522d" }
```

| Option | Effect |
|---|---|
| `"swap": "rg"` | swap two colour channels (the mage orb is the fireball with red and green swapped) |
| `"tint": "#rrggbb"`, `"tintStrength": 0.6` | luminance-preserving tint: each pixel moves that far towards the tint colour at its own brightness, so shading survives. Strength 1 is a monochrome of the tint |
| `"outline": "#rrggbb"` | 1 px outline around the opaque pixels (edge neighbours only); the frame grows by 2 px each way, so the sprite stays centred |

Ops always run swap, then tint, then outline (the outline is never tinted). A thin sprite (the skeleton) fills in under an outline; prefer a strength around 0.5–0.7 so the original colours still show through.

## The palette

[`palette.txt`](palette.txt) is the pack's colours, sampled by `node tools/palette.mjs` (the most common colours of every imported BMP frame; regenerating keeps the names). Use these names. The pack is a classic 16-colour-style palette: each hue in steps of `ff`, `bf`, `7f`, `3f`.

| Ramp (light → dark) | Names |
|---|---|
| greys | `white`, `cream`, `silver`, `steel`, `grey`, `charcoal`, `black` |
| reds | `red`, `red.dark`, `maroon`, `maroon.dark` |
| golds and browns | `yellow`, `gold`, `gold.dark`, `brown`, `brown.dark` |
| yellow-greens | `yellow`, `yellow.dark`, `olive` |
| greens | `green`, `green.dark` |
| blues | `cyan`, `blue`, `blue.dark`, `navy`, `navy.dark` |

## Style guide

What the pack's sprites look like (print any of them with `node tools/bmp-to-art.mjs knight.walk`, or a BMP path such as `bonus/bonusbig1.bmp`):

- **Flat, saturated colour, few shades.** A sprite uses 2 to 6 colours, mostly pure palette primaries: the slime is one green, the mage blue robe with a yellow face, the dragon two greens, the knight grey and charcoal armour with a blue shield and a yellow cross. No anti-aliasing, no gradients, no semi-transparency.
- **Side view, facing right.** The game mirrors sprites that move left. Heads and weapons point right.
- **Light from the top left.** Where a shape has shading, the lighter shade is on the top and left, the darker on the bottom and right (the sword's white edge, the knight's grey over charcoal).
- **Outlines only where the pack has them.** The pack's characters have no outline: the silhouette is the colour itself against the grass. Shapes that need an edge (the fireball's rim, the castle's mortar, the bonus tray) use a darker shade of their own colour, never black. Do not add a black outline to a sprite; tiers add a coloured one as a variant.
- **Sizes are fixed and never faked by scaling.** Standard enemies 16 × 16, the dragon 20 × 20, projectiles 8 or 12, icons 9 × 9, the golem 64 × 64. A new size is new art (the slime generations are drawn at 16, 12 and 9). The game draws every sprite at 2× (tiers at 3×), always an integer.
- **Animation.** Walks are 2 frames at 6 ticks; deaths 5–9 frames; projectiles loop 8 frames. Keep the feet on the bottom row and the body in the same place between walk frames, moving one or two pixels.
- **Icons** (9 × 9) sit on the pack's gold bonus tray: the bottom two rows are always `YY.....YY` / `.YYYYYYY.` in `gold`, the symbol fills the 9 × 7 above it (it may dip into the tray's middle). One bold shape, readable at 2× on a dark card: high contrast (`white`/`silver` metal, `yellow`/`gold` energy, `red` fire), a 2–3 px wide main stroke, and nothing finer than 1 px detail.

## Working on art

1. Draw or edit the text file (start from a pack sprite with `node tools/bmp-to-art.mjs <anim or bmp>` if it helps).
2. `npm run build:assets` (needs the pack at `sourceRoot`, `--source` or `DRAGONGAME_ASSETS`).
3. `npm run serve` and open <http://localhost:8000/tools/art-preview.html>: every anim, animating, at 2× and 4× on grass and on black. Type a name prefix (`icon.`) in the filter; tick "all frames" for a frame strip.
4. Iterate until it reads at 2× next to the pack's sprites. Commit the art file, the manifest line and the rebuilt `assets/` and `src/sim/anims.js` together. Never commit screenshots.

## What is here

| File | Anim | What |
|---|---|---|
| `icons/might.txt` | `icon.might` | Might (+damage): a sword |
| `icons/haste.txt` | `icon.haste` | Haste (−cooldown): a lightning bolt |
| `icons/duration.txt` | `icon.duration` | Duration: an hourglass |
| `icons/force.txt` | `icon.force` | Force (+knockback, poise damage): a war hammer |
| `icons/amount.txt` | `icon.amount` | Amount (+1 projectile): three fireballs |
