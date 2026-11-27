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

### Enemy tiers

The bronze, silver and gold enemies ([§8.6](../docs/demo-spec.md#86-tiers)) are not listed one by one: the manifest's `tiers` block names the enemy anims once and the three tier variants once, and the build makes `<anim>@t2`, `@t3` and `@t4` of each (78 anims). A new enemy anim gets its tiers by joining `tiers.anims` (a test checks the list against `content.js`).

| Tier | Tint | Strength | Outline | Why |
|---|---|---|---|---|
| bronze | `#c86428` | 0.6 | `#d8702c` | copper: warm and mid-bright, so it stands off the dark green grass and away from gold |
| silver | `#b0c8f0` | 0.6 | `#a0b4d8` | cold pale blue; the outline is a shade darker than the tinted body so pale sprites (skeleton, ghost knight) keep their detail |
| gold | `#ffd000` | 0.7 | `#f8c000` | the brightest and most saturated, read at a glance; slightly stronger so grey armour turns gold |

The outlines are the pips' colours in the bestiary. Check a change on grass for every enemy: filter the art preview by `@t` (silver and gold are 3× in game).

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
- **Sizes are fixed and never faked by scaling.** Standard enemies 16 × 16, the horse 20 × 14, the mounted knight 22 × 22, the dragon 20 × 20, projectiles 8 or 12, icons 9 × 9, the golem 64 × 64. A new size is new art (the slime generations are drawn at 16, 12 and 9). The game draws every sprite at 2× (silver and gold tiers at 3×; the mounted knight at 3×, 4× at silver and gold), always an integer.
- **Animation.** Walks are 2 frames at 6 ticks; deaths 5–9 frames; projectiles loop 8 frames. Keep the feet on the bottom row and the body in the same place between walk frames, moving one or two pixels.
- **Icons** (9 × 9) sit on the pack's gold bonus tray: the bottom two rows are always `YY.....YY` / `.YYYYYYY.` in `gold`, the symbol fills the 9 × 7 above it (it may dip into the tray's middle). One bold shape, readable at 2× on a dark card: high contrast (`white`/`silver` metal, `yellow`/`gold` energy, `red` fire), a 2–3 px wide main stroke, and nothing finer than 1 px detail.

## Working on art

1. Draw or edit the text file (start from a pack sprite with `node tools/bmp-to-art.mjs <anim or bmp>` if it helps).
2. `npm run build:assets` (needs the pack at `sourceRoot`, `--source` or `DRAGONGAME_ASSETS`).
3. `npm run serve` and open <http://localhost:8000/pixel/> (the [pixel viewer](../pixel/README.md): one sprite at a time, any scale, tiers and custom variants; it can also open this folder directly and re-read it after an edit) or <http://localhost:8000/tools/art-preview.html>: every anim, animating, at 2×, 3× and 4× on grass and on black. Type a name prefix (`icon.`, or `@t` for the enemy tiers) in the filter; tick "all frames" for a frame strip.
4. Iterate until it reads at 2× next to the pack's sprites. Commit the art file, the manifest line and the rebuilt `assets/` and `src/sim/anims.js` together. Never commit screenshots.

## What is here

| File | Anim | What |
|---|---|---|
| `icons/might.txt` | `icon.might` | Might (+damage): a sword |
| `icons/haste.txt` | `icon.haste` | Haste (−cooldown): a lightning bolt |
| `icons/duration.txt` | `icon.duration` | Duration: an hourglass |
| `icons/force.txt` | `icon.force` | Force (+knockback, poise damage): a war hammer |
| `icons/amount.txt` | `icon.amount` | Amount (+1 projectile): three fireballs |
| `world/brazier.txt` | `brazier.burn` | 12 × 16 iron brazier, 3-frame fire flicker (the pack's `burn` fire colours: red, gold, yellow, a cream core) |
| `world/brazier-break.txt` | `brazier.break` | 4 frames: the fire flares into sparks, the bowl splits and falls under white smoke, the halves lie by the stand (the last frame holds 40 ticks) |
| `pickups/heart.txt` | `pickup.heart` | 9 × 8 red heart, cream glint, dark red shade |
| `pickups/magnet.txt` | `pickup.magnet` | 9 × 7 red horseshoe magnet with steel tips |
| `pickups/bomb.txt` | `pickup.bomb` | 9 × 9 iron bomb, wide grey and silver lit side so it reads on grass, 2-frame fuse spark |
| `icons/leftclaw.txt` | `icon.leftclaw` | Left claw: three white claw scratches, 2 px gaps so they read as marks, not a striped band |
| `icons/rightclaw.txt` | `icon.rightclaw` | Right claw: a green dragon hand, three white talons fanned right like its cone |
| `icons/dualclaw.txt` | `icon.dualclaw` | Dual claw: two scratches crossed, white and red |
| `effects/swipe.txt` | `claw.swipe` | 56 × 18 rectangle slash: three bowed white and silver streaks from the left edge (the dragon's centre); strike, full, fading far end (3, 4, 5 ticks) |
| `effects/cone.txt`, `cone22.txt`, `cone45.txt` | `claw.cone`, `claw.cone22`, `claw.cone45` | 40 × 40 cone slash: three white and silver claw arcs fanned around 0°, 22.5° and 45° from the apex (0, 20), (0, 6), (0, 0); near, out, fading (3, 4, 5 ticks). The game turns them by quarter turns and mirrors the 22.5° one across its diagonal for 16 directions, so no pixel leaves the grid |
| `enemies/horse.txt` | `horse.walk` | 20 × 14 chestnut horse, 2-frame gallop: legs stretched fore and aft, then gathered under the belly; the head and tail bob a pixel |
| `enemies/horse-die.txt` | `horse.die` | 5 frames: red spatter, the forelegs buckle, it lies on its side, the hide burns to cream bones (the last frame holds 12 ticks) |
| `enemies/mounted-knight.txt` | `mounted.walk` | 22 × 22: the pack's knight, rider's helm, visor, mail and blue shield copied from `knight.walk`, on the chestnut horse under a blue saddle cloth with a yellow hem; a cream lance held upright with a red pennant that flaps. Drawn at 3× in game (4× at silver and gold) |
| `enemies/mounted-knight-die.txt` | `mounted.die` | 6 frames: struck, the horse stumbles and the lance tips forward, the rider is thrown off the back, both lie on the ground, then burn to bones with the shield gone dark, as the knight's does |
| `icons/bite.txt` | `icon.bite` | Bite: red jaws from the side, open to the right, two white fangs above interlocking with two below |
| `icons/saw.txt` | `icon.saw` | Saw blade: a toothed steel disc, charcoal hub, lit from the top left |
| `effects/jaws.txt` | `bite.jaws` | 16 × 16 bite on the target: red jaws hinged on the left, 2 px bands climbing in 2 px steps; wide open, closing, shut with the fangs interlocked (4, 3, 8 ticks). Mirrored in game when the target is left of the dragon |
| `effects/saw.txt` | `saw.spin` | 12 × 12 saw blade, 4 frames of 2 ticks: eight hooked white teeth turning a quarter tooth (11.25°) clockwise per frame around a silver disc whose glint stays on the top left, so it spins without canvas rotation. Generated from a disc and a sawtooth profile, then kept as text |
| `enemies/slime-small.txt` | `slime.walk1` | 12 × 12 gen-1 slime: the pack's 16 px slime redrawn smaller (one `green`, 2 px `black` eyes set to the right, a nub on top, side arms), the same 4-frame hop: squat with arms out, then stretched a pixel or two with the arms flapping down and up |
| `enemies/slime-small-split.txt` | `slime.split1` | 6 frames (8, 20, 4, 4, 4, 4 ticks): as the pack's `slime.split`, an empty frame, a 2-row puddle, then it wells up into the gen-1 slime |
| `enemies/slime-tiny.txt` | `slime.walk2` | 9 × 9 gen-2 slime: the same creature at its smallest, 1 px eyes (as the pack's own growing slime has), the same hop |
| `enemies/slime-tiny-die.txt` | `slime.die2` | 5 frames: as the pack's `slime.die`, red runs down into it, it bursts into red, dark red and maroon splatter, the drops scatter and fade |
| `pickups/chest.txt` | `pickup.chest` | 12 × 10 chest dropped by a robbed merchant: `gold.dark` wood with `brown` shade (as the horse, so it does not sink into the grass) under a domed lid with a `gold` lit top, two silver bands, a yellow lock |
| `world/bubble.txt` | `merchant.bubble` | 9 × 8 white speech bubble with a yellow coin (`gold.dark` rim), silver shade, the tail at the bottom left; drawn over a merchant who will trade |
| `icons/reroll.txt` | `icon.reroll` | Reroll: a white die showing three, silver shade on the right and bottom |
| `effects/sparkle.txt` | `princess.sparkle` | 15 × 15 rescue sparkle over the tower, 5 frames (4, 4, 5, 6, 8 ticks): a white and yellow star flares at the centre, bursts into four small yellow stars on the diagonals with gold sparks on the axes, the sparks drift out and fade. Drawn at 4× so it reads over the 60 px castle |

World objects and pickups are drawn at 2× like everything else; dark objects (the bomb) need a broad lit side in `grey`/`silver`, because `charcoal` alone vanishes on the dark grass.

The horse is `gold.dark` with `brown` shade, not `brown`: `brown` has about the grass's own brightness and the body would sink into it. A `gold` line along the back and neck is the lit top edge, `brown.dark` the mane, tail and hooves. The slime generations are the pack's slime redrawn, never downscaled: keep the silhouette (nub, body, arms), the eyes on the right and the hop, and drop rows and columns evenly; at 9 px the eyes become single pixels. The mounted knight's rider reuses the pack knight's pixels and keys (charcoal, silver, grey, blue, yellow), so the two read as the same army.
