# Dragon Survivors demo: implementation spec

**Written:** 2026-11-06 · **Builds on:** [demo-design.md](00-vision/demo-design.md) · **Engine:** plain JavaScript, HTML canvas, no framework

This document is the authority for the demo. If code and spec disagree, the code is wrong. Numbers marked *unmeasured* were set by judgement and may change after play-testing; change the spec when you change the number.

---

## 1. Goals and constraints

- A 5-minute run that feels like Vampire Survivors with the dragon-and-tower twist.
- Runs in a desktop browser from static files. No bundler, no framework, no npm runtime dependencies. ES modules loaded by `index.html`.
- Reuses the dragongame sprites and sounds unchanged, converted once by a build script. Sprites the pack lacks are drawn as new pixel art in its style (§3.4).
- Keyboard + mouse and gamepad both work from day one.
- Game logic is headless and deterministic so it can run under `node --test` without a DOM.

Change from the high-level design: the dragon does **not** body-block enemies. It passes over them and never collides with them. The player's job is to kill, kite, and collect gems. The tower is the only thing enemies touch; the one thing that hits the dragon is a mage's orb, and that damage goes to the tower (§8.5).

---

## 2. Project layout

```
dragon-survivors/
  index.html              canvas + script tag, nothing else
  src/
    main.js               load assets, build the App, start the loop (DOM glue only)
    app.js                screen flow (title, armoury, play, pause, game over, Retry) and ticking; no DOM
    armoury.js            gold, the purse and its ranks, rank costs, ranks -> meta, storage wrapper (§13.1); no DOM
    loop.js               fixed-step accumulator + requestAnimationFrame driver
    input.js              keyboard, mouse, gamepad -> Intent
    viewport.js           canvas fit, CSS -> internal pixels, camera offset; no DOM
    assets.js             atlas image + atlas.json + decoded sounds
    audio.js              Web Audio playback with a voice cap
    render/
      draw.js             world rendering (background, entities, effects)
      hud.js              timer, tower HP bar, XP bar, weapon/buff icons
      screens.js          title, pause, level-up cards, the merchant's shop, game over
      armoury.js          armoury screen (§13.1)
      bestiary.js         enemy stats panel (§17.1)
      debug.js            debug overlay: collision circles, loop and entity stats (§19)
      shake.js            screen shake from the sim's shake events (§5.1); no DOM
    sim/                  no DOM, no canvas, no Date. Pure state + tick.
      game.js             Game state, tick order, run timeline
      rng.js              seeded PRNG (mulberry32)
      content.js          data tables: enemies, weapons, buffs, timeline
      anims.js            generated: per-frame tick durations of every atlas anim
      dragon.js
      tower.js
      enemies.js          AI, movement, separation, death behaviours
      golem.js            the mega golem: poise and stagger, the tower shove, footsteps (§8.10)
    enemyShots.js       mage orbs: firing, movement, hits on the dragon
      spawner.js
      weapons.js          cooldowns, firing, ring, mini tower
      claws.js            claw slashes: volleys, shapes, strikes (§10.5–10.7)
      bite.js             the bite: targets, execute, strikes (§10.8)
      saw.js              saw blades: volleys, flight out, dwell and back, hits (§10.9)
      projectiles.js      movement, hits, procs
      damage.js           damage types, resistances, the damage function (§12.1)
      effects.js          one-shot animations (explosions, deaths)
      gems.js             XP gems, attraction, pickup
      braziers.js         braziers and their pickups (§14.2)
      merchant.js         the merchant: schedule, route, trading count, hits, death and chest (§14.3)
      shop.js             the merchant's shop: offers, prices, picks (§14.3)
      levelup.js          card pool, offers, applying picks
      grid.js             spatial hash
  assets/
    atlas.png, atlas.json
    sounds/*.wav
  art/                    new pixel art drawn for this game, as text (§3.4)
    README.md             the art format and the style guide
    palette.txt           the pack's colours, named
    <group>/<name>.txt    one file per animation
  tools/
    build-atlas.mjs       BMP + art -> atlas.png + atlas.json (Node, no deps)
    manifest.json         which dragongame sequences and art files to import, under which names
    palette.mjs           samples the pack's colours into art/palette.txt
    bmp-to-art.mjs        prints pack BMPs or atlas anims as art files (to study or start from)
    art-preview.html/.mjs every atlas anim, animated, at 2×, 3× and 4× on grass and black (not loaded by the game)
    copy-sounds.mjs
    measure.mjs           balance instrument: headless bot runs over a seed pool, Markdown tables
    dps.mjs, dps.md       damage calculator: per-weapon damage models, floor/ceiling vs pressure per minute, --check against the sim
  test/
    *.test.mjs            node --test
  docs/
```

Serve with any static server (`python -m http.server` or `npx serve`). The only build step is `node tools/build-atlas.mjs`, which reads `E:\code\dragongame\assets` (path set in `manifest.json`) and this repo's `art/`, and writes into `assets/`, plus `node tools/copy-sounds.mjs` for the WAVs. `npm run build:assets` runs both. The outputs are committed, so the game and the tests never need the pack.

### 2.1 Tick order

`Game.tick(intent)` runs these in order, every tick (while level-up offers or the merchant's shop are open none of them runs, §14, §14.3):

1. Apply intent: dragon velocity and aim direction.
2. Move the dragon.
3. Tower: follow the dragon, then the tether (§7.1).
4. Spawner: add enemies for this tick (§9), then a horse stampede when one is due (§8.8), then braziers: flicker, drop far ones, place a new one when due (§14.2), then a merchant when one is due (§14.3).
5. Enemies: special timers (mage cast, mage orb, summon anim, the golem's poise, stagger and shove timer, §8.10), AI target, move (the golem's footsteps), separation, despawn, then slime fusion (§8.9). Then merchants: flee, stand by the dragon and count the trade, or walk; far ones are removed (§14.3).
6. Weapons: count queued claw slashes down, advance cooldowns, fire (claws queue their slashes, the tower launches saw blades; the bite only counts its cooldown down), spin the ring, run mini towers.
7. Projectiles, then saw blades (out, dwell, back; removed at the tower), then enemy shots (mage orbs): move, expire by range.
8. Collisions: player hits vs braziers (projectiles, then ring fireballs, then saw blades), projectile vs enemy (with procs; an explosion also breaks the braziers it overlaps), ring vs enemy, claw slashes vs enemy (a slash also breaks the braziers it overlaps), bite vs enemy (a bite also breaks the braziers in its reach), saw blades vs enemy, enemy vs tower (contact damage, then the golem's shove, §8.10), enemy shot vs dragon, dragon vs pickups (collect, apply, count lifetimes down, §14.2). Every hit on an enemy goes through the damage function (§12.1); the player's hits on the merchant come in the same passes, after each pass's enemies (§14.3).
9. Deaths: play death animations, drop gems, split slimes, start ghost knight burns; then a dead merchant drops his chest (§14.3).
10. Gems: attract and collect, add XP, queue level-ups and roll the offers.
11. Effects: advance one-shot animations, remove finished ones; a finished ghost burn becomes a ghost. Then struck claw slashes advance their effect and finished ones are removed.
12. Clock: advance `t`, spawn the golem at 5:00 (with its screen shake), check tower HP for game over; then, still in play, a merchant stood by long enough opens his shop (§14.3).

---

## 3. Asset pipeline

### 3.1 Source format

- Sprites are `.bmp`, 24-bit or 8-bit palette, bottom-up rows. Transparency key is pure black `(0,0,0)`, as in the original (`AddTransparent(Color(0,0,0))`).
- A sequence is a `.txt` file listing one bmp filename per line (paths relative to the txt). The optional first line `FANCY` switches to `filename N` where N is the frame's duration in game ticks at 30 ticks per second.
- A few files list several names on one line separated by spaces (`dragon/walk.txt`). Split on whitespace.

### 3.2 Build script

`tools/build-atlas.mjs`:

1. Reads `manifest.json`: a list of entries like `{ "name": "knight.walk", "list": "knight/knight.txt" }` for sequences `{ "name": "castle", "file": "castle/castle0000.bmp" }` for single frames, and `{ "name": "explosion.big", "files": [...] }` for numbered BMP ranges that have no `.txt`. Frame keys are the source path relative to the source root, with forward slashes; a frame used by several anims is packed once. Two more sources: `{ "name": "icon.might", "art": "icons/might.txt" }` reads a text pixel-art file under `art/` (§3.4), its frame keys `art/<path>:<index>` (`art/icons/might.txt:0`), which never meet a BMP path; and `{ "name": "knight.walk.gold", "from": "knight.walk", ... }` reuses the frames and ticks of an earlier entry so a variant can be derived from it. Each entry has exactly one source; an unknown field is an error. Any entry may add colour variants (§3.5): `"swap"`, `"tint"` with `"tintStrength"`, `"outline"`. An entry with `"swap": "rg"` (any two different channels of `r`, `g`, `b`) swaps those colour channels of every pixel after decoding. Every variant op appends a suffix to the frame keys (`#rg`, `#tint=rrggbb@s`, `#outline=rrggbb`), so a recoloured frame is packed apart from the original. The source root is `sourceRoot` in the manifest, overridden by `--source <dir>` or the `DRAGONGAME_ASSETS` environment variable. The manifest also lists the `sounds` to copy. Its `tiers` block, `{ "anims": [...], "variants": [{ "tier": 2, "tint": ..., "tintStrength": ..., "outline": ... }, ...] }`, generates the enemy tier sprites (§8.6): for every listed anim (an earlier entry) and every variant, a `from` entry named `<anim>@t<tier>` with the variant's ops, appended after the written entries; a variant's `tier` is a whole number above 1, each at most once, and its other fields are those of a variant (§3.5).
2. Decodes each BMP with its own decoder (handles `biBitCount` 8 and 24, bottom-up rows, and top-down rows when the height is negative, 4-byte row padding) and sets the key colour to alpha 0. Parses each art file (§3.4). Then applies the entry's variant ops (§3.5), always in the order swap, tint, outline; a `from` entry applies its own ops after those of the entry it derives from. Art colours outside `art/palette.txt` print a warning; every other problem (unknown colour, ragged rows, bad durations, a bad variant field) fails the build with the file and line.
3. Packs all unique frames into one PNG with a shelf packer (fixed width 512 px, height grows, tallest frames first) and 1px padding. Writes the PNG using Node's built-in `zlib` (no library).
4. Writes `atlas.json`:

```json
{
  "frames": { "knight/knight0000.bmp": { "x": 0, "y": 0, "w": 16, "h": 16 } },
  "anims":  { "knight.walk": { "frames": ["knight/knight0000.bmp", "knight/knight0001.bmp"], "ticks": [6, 6] } }
}
```

`ticks` are per-frame durations in **60 Hz ticks** (the sim rate, §4). Plain lists get a default of 6 ticks per frame (the original advanced most animations every 3 of its 30 Hz ticks). FANCY durations are doubled. Single-frame entries get `ticks: [6]`. Art frames take the durations written in their file (default 6). `atlas.json` puts a space after each `:` and `,` outside strings only, so frame keys keep their exact spelling.

5. Writes `src/sim/anims.js`, `export const ANIMS = { name: { ticks: [...] } }`, sorted by name: the same `ticks` as `atlas.json`, so the sim can advance and finish animations without reading files. It is generated and committed; never edit it by hand.

### 3.3 Manifest (what the demo imports)

| Atlas name | Source | Notes |
|---|---|---|
| `dragon.walk` | `dragon/walk.txt` | 20px, 2-frame walk, faces right (§6.3) |
| `knight.walk`, `knight.die` | `knight/knight.txt`, `knight/die.txt` | 16px |
| `skelly.walk`, `skelly.die`, `skelly.summon` | `skelly/skelly.txt`, `skelly/die.txt`, `skelly/summon.txt` | summon plays when a mage spawns them |
| `slime.walk`, `slime.die`, `slime.split` | `slime/slime_walk.txt`, `slime/slime_die.txt`, `slime/slime_reproduce.txt` | 16px, the gen-0 slime (§8.4): one `green` with `black` eyes, a 4-frame squash-and-stretch hop; `split` is the pack's `reproduce`, a puddle that wells up into a slime (8, 20, 4, 4, 4, 4, 4 ticks). `die` is unused (a gen-0 slime always splits) but imported for later |
| `slime.walk1`, `slime.split1`, `slime.walk2`, `slime.die2` | `art/enemies/slime-small.txt`, `art/enemies/slime-small-split.txt`, `art/enemies/slime-tiny.txt`, `art/enemies/slime-tiny-die.txt` | drawn for this game (§3.4): the gen-1 slime at 12×12 and the gen-2 slime at 9×9, the pack's slime drawn smaller, never scaled: the same `green` body with a nub on top and side arms, the same 4-frame hop (the arms out, then flapping down and up as it stretches), 2 px `black` eyes at gen 1, 1 px eyes at gen 2. `split1` is the pack's split at 12 px (a puddle welling up, 8, 20, 4, 4, 4, 4 ticks); `die2` the pack's die at 9 px, 5 frames: red runs into it, it bursts into red and maroon splatter, the drops scatter and fade |
| `megaslime.walk`, `megaslime.die`, `megaslime.fuse` | `slime/mega_slime_walk.txt`, `slime/mega_slime_die.txt`, `slime/mega_slime_reproduce.txt` | 32px, the pack's magenta megaslime (§8.9): an 18-frame hop; the die is 7 frames, it collapses into black remains; `fuse` is the pack's `reproduce`, a puddle that swells into the megaslime (8, 4, 4, 4, 4 ticks), played by a new megaslime before it walks |
| `mage.walk`, `mage.die`, `mage.spell` | `mage/mage.txt`, `mage/die.txt`, `mage/spell.txt` | |
| `ghost.knight`, `ghost.burn`, `ghost.ghost`, `ghost.die` | `ghostnight/ghost_knight.txt`, `ghostnight/ghost_knight_burn.txt`, `ghostnight/ghost.txt`, `ghostnight/ghost_burn.txt` | burn = death-to-ghost transition; `ghost.die` = the ghost's own death |
| `golem.walk`, `golem.die` | `golem/golem.txt`, `golem/golem_death.txt` | 64px. `golem/golem.txt` lists `golem_death0000..0006`, as the original does. `die` unused in the demo (golem is unkillable) but imported for later |
| `fireball.anim` | `fireball/fireball.txt` | 8px, 8-frame looping animation |
| `fireball.big` | `fireball/fireball_15.txt` | 12px, 8-frame looping animation. (`fireball/big_fireball.txt` lists `1.bmp 2.bmp`, a 20px block that is not a fireball; it is not imported.) |
| `orb.green` | `fireball/fireball.txt` with `"swap": "rg"` | 8px, the fireball with red and green swapped: the mage orb (§8.5) |
| `laser.dir` | `fireball/laser.txt` | 8px, **16 directions** |
| `laser.bigdir` | `fireball/laser_15.txt` | 12px, 16 directions |
| `castle` | `castle/castle0000.bmp` | 30px. Tower and mini tower |
| `castle.destroy` | `castle/destroy_castle.txt` | tower death |
| `royal.prince`, `royal.princess` | `castle/royal_figure_prince.bmp`, `castle/royal_figure_princess.bmp` | 2×5px. Minion carriers (§7.3) |
| `explosion.small`, `explosion.big` | `explosion/explosion.txt`, `explosion/explosion_big0000..0005.bmp` | 30px, 57px. `explosion.big` is the Explode proc (§12); `explosion.small` is unused in the demo (hits spawn no effect, §10) but imported for later |
| `explosion.laser`, `explosion.laserbig` | `explosion/laser_explosion0000..0005.bmp`, `explosion/laser_explosion_even_bigger_good_with_sparks0000..0005.bmp` | 45px, 64px. `explosion.laser` is an arcane explosion (a laser with Explode L3, §12); `explosion.laserbig` is unused in the demo but imported for later |
| `burn` | `burn/burn.txt` | 16px, reserved |
| `brazier.burn`, `brazier.break` | `art/world/brazier.txt`, `art/world/brazier-break.txt` | drawn for this game (§3.4), 12×16: an iron brazier on a stand with the pack's red, gold, yellow and cream fire, 3 flicker frames of 8 ticks; the break is 4 frames (5, 5, 6, 40 ticks): the fire flares into sparks, the bowl splits and falls under a white puff, the halves lie by the stand (§14.2) |
| `horse.walk`, `horse.die` | `art/enemies/horse.txt`, `art/enemies/horse-die.txt` | drawn for this game (§3.4), 20×14, facing right: a chestnut (`gold.dark`) horse with a `gold` lit back and a `brown.dark` mane, tail and hooves. The walk is a 2-frame gallop (legs stretched, then gathered); the die is 5 frames (6, 6, 6, 6, 12 ticks): struck with red spatter, the forelegs buckle, it falls on its side, the hide burns to cream bones like the pack's knight (§8.8) |
| `mounted.walk`, `mounted.die` | `art/enemies/mounted-knight.txt`, `art/enemies/mounted-knight-die.txt` | drawn for this game, 22×22, facing right: the pack's knight (charcoal helm, silver visor, grey mail, blue shield with a yellow cross) on the chestnut horse under a blue saddle cloth with a yellow hem, a cream lance held up with a red pennant that flaps between the 2 gallop frames. The die is 6 frames (6 ticks each, the last 12): struck, the horse stumbles and the lance tips, the rider is thrown off the back, both fall, then burn to bones, the shield going dark as the knight's does |
| `pickup.heart`, `pickup.magnet`, `pickup.bomb` | `art/pickups/heart.txt`, `art/pickups/magnet.txt`, `art/pickups/bomb.txt` | drawn for this game, 9×8, 9×7 and 9×9: a red heart with a cream glint, a red horseshoe magnet with steel tips, an iron bomb under a steel cap whose fuse spark flickers (2 frames of 8 ticks) (§14.2) |
| `icon.laser`, `icon.explode`, `icon.split`, `icon.ring`, `icon.speed`, `icon.big`, `icon.multi`, `icon.nuke` | `bonus/bonuslaser1.bmp`, `bonus/bonusexplosion1.bmp`, `bonus/bonussplit1.bmp`, `bonus/bonusring1.bmp`, `bonus/bonusspeed1.bmp`, `bonus/bonusbig1.bmp`, `bonus/bonusmulti1.bmp`, `bonus/bonusnuke1.bmp` | level-up card icons, roughly 9px. `icon.big` (a gold medallion on the tray) is the shop's Any card offer (§14.3); `icon.multi` is unused in the demo (Haste has its own icon) but imported for later |
| `icon.might`, `icon.haste`, `icon.duration`, `icon.force`, `icon.amount` | `art/icons/might.txt`, `art/icons/haste.txt`, `art/icons/duration.txt`, `art/icons/force.txt`, `art/icons/amount.txt` | drawn for this game (§3.4), 9×9, the pack's bonus tray under a sword, a lightning bolt, an hourglass, a war hammer and three fireballs. Icons of the buffs Might, Haste, Duration, Force and Amount (§11) |
| `icon.leftclaw`, `icon.rightclaw`, `icon.dualclaw` | `art/icons/leftclaw.txt`, `art/icons/rightclaw.txt`, `art/icons/dualclaw.txt` | drawn for this game, 9×9 on the bonus tray: three white claw scratches; a green dragon hand with three white talons fanned to the right; two crossed scratches, white and red. Icons of the left, right and dual claw (§10.5–10.7) |
| `claw.swipe` | `art/effects/swipe.txt` | drawn for this game, 56×18, 3 frames (3, 4, 5 ticks): three bowed white and silver claw streaks running right from the left edge; strike, full swipe, fading far end. The rectangle slash (§10.5) |
| `claw.cone`, `claw.cone22`, `claw.cone45` | `art/effects/cone.txt`, `art/effects/cone22.txt`, `art/effects/cone45.txt` | drawn for this game, 40×40, 3 frames (3, 4, 5 ticks): three white and silver claw arcs fanned around 0°, 22.5° and 45° (clockwise on screen from right) from an apex at (0, 20), (0, 6) and (0, 0); near, reaching out, fading. The cone slash (§10.6), turned for 16 directions (§5) |
| `icon.bite`, `icon.saw` | `art/icons/bite.txt`, `art/icons/saw.txt` | drawn for this game, 9×9 on the bonus tray: red jaws seen from the side, open to the right, two white fangs above interlocking with two below; a toothed steel disc with a charcoal hub. Icons of the bite and the saw blade (§10.8–10.9) |
| `bite.jaws` | `art/effects/jaws.txt` | drawn for this game, 16×16, 3 frames (4, 3, 8 ticks): red jaws in side view, hinged on the left, wide open, closing, shut with white fangs interlocked. The bite's effect on its target (§10.8), mirrored when the target is left of the dragon |
| `merchant.walk`, `merchant.die` | `trader/trader.txt`, `trader/die.txt` | 16px, the pack's trader, facing right: a man in brown pulling a cart of yellow goods; a 2-frame walk, and a 7-frame death in which he and the cart burn red to embers (§14.3) |
| `merchant.bubble`, `pickup.chest`, `icon.reroll` | `art/world/bubble.txt`, `art/pickups/chest.txt`, `art/icons/reroll.txt` | drawn for this game (§3.4): a 9×8 white speech bubble with a yellow coin, its tail at the bottom left, shown over a merchant who will trade; a 12×10 chest, `gold.dark` wood with `brown` shade under a domed lid with a `gold` lit top, two silver bands and a yellow lock, the robbed merchant's drop; a 9×9 white die showing three on the bonus tray, the reroll (§14.3) |
| `saw.spin` | `art/effects/saw.txt` | drawn for this game, 12×12, 4 frames of 2 ticks, looping: a silver saw blade with eight hooked white teeth, a white glint at the top left and a charcoal hub; each frame turns the teeth a quarter tooth (11.25°) clockwise, the light staying put. The saw blade (§10.9) |
| Tier sprites (§8.6) | the manifest's `tiers` block | named `<anim>@t2`, `<anim>@t3` and `<anim>@t4` after every anim of every enemy type except the golem (walk, die, summon, split, spell, burn, and the anims of the slime's later generations), recoloured and outlined per tier (§8.6): bronze tint `#c86428` at 0.6 with outline `#d8702c`, silver tint `#b0c8f0` at 0.6 with outline `#a0b4d8`, gold tint `#ffd000` at 0.7 with outline `#f8c000`. 2 px larger than the plain frame each way |
| `gem` | none, drawn procedurally | 6px diamond, two colours |

Sounds copied as-is from the pack root: `shoot01`, `laser01`, `explosion01`, `explosion02`, `death01`, `death02`, `pickup`, `powerup`, `hit_golem`, `megaslime_hit`, `slime_poke`, `destroy_castle_sound`, `start_game`, `ohno`, `win_level_2`, `dropping`, `powerup02`, `powerup03`, `screech`.

### 3.4 Text pixel art

Sprites the pack lacks are drawn for this game as text under `art/`, in the pack's style, and built into the same atlas. Existing sprites are never rescaled to fake a new size: a new size is new art. [`art/README.md`](../art/README.md) holds the format and the style guide; in short:

- One file per animation, `art/<group>/<name>.txt`. Lines starting with `#` are comments; `key` and `frame` headers may carry a trailing `# comment`.
- A `key` block maps single characters to colours: a name from `art/palette.txt` or `#rrggbb`. `.` is always transparent. Pure black `#000000` is refused (it is the pack's transparency key; the pack's own black is `black`, `#010000`).
- Then one or more `frame [ticks]` blocks of pixel rows, every frame the same size, every row the same width. `ticks` is the frame's duration in 60 Hz ticks, default 6.
- `art/palette.txt` lists the pack's colours with names: `tools/palette.mjs` counts the opaque colours of every BMP frame the manifest imports (variants excluded) and keeps the 32 most common with at least 5 pixels (26 colours), keeping existing names by colour. Art uses palette colours; a `#rrggbb` outside the palette is a build warning, not an error.
- The style: side view facing right (sprites are mirrored in game), flat colours with no anti-aliasing and no semi-transparency, light from the top left, a dark outline only where the pack's sprites have one (most have none), 16 px standard enemies, 2-frame walks, 9×9 icons on the pack's gold bonus tray.

`tools/art-preview.html`, served with the rest of the repo, shows every atlas anim animating at 2×, 3× and 4× (2× is the game scale, 3× that of the silver and gold tiers, §8.6), on grass and on black, with a name filter and a frame strip; the game never loads it.

### 3.5 Variants

Variants are generated at build time from existing frames, so changing a colour is one manifest edit. Ops run in this order:

1. **Swap** (`"swap": "rg"`): swaps two colour channels of every pixel.
2. **Tint** (`"tint": "#rrggbb"`, `"tintStrength"` in (0, 1], default 1): luminance-preserving. Each opaque pixel of luminance `l` (Rec. 601) has a target colour: the tint scaled to `l`, running from black through the tint (at the tint's own luminance) to white. The pixel moves `tintStrength` of the way from its colour to that target. Luminance is kept (up to rounding), so light and shade keep their order and the sprite stays readable.
3. **Outline** (`"outline": "#rrggbb"`): the frame grows by 1 px on every side (2 px in each dimension, so nothing is clipped and the sprite stays centred) and every transparent pixel that touches an opaque pixel edge-on takes the outline colour. Diagonal neighbours are not outlined.

No op turns a transparent pixel opaque except the outline, and no op produces an opaque pure black pixel (it becomes `#010000`).

---

## 4. Loop and timing

- **Sim tick:** fixed 60 Hz (`DT = 1/60`). All speeds in this spec are world pixels per second; the sim multiplies by `DT`.
- `loop.js` accumulates real time, runs up to 4 ticks per frame (clamps if the tab was hidden), then renders. No interpolation in the demo.
- When pause is open, ticks stop; the renderer still draws. While the level-up screen or the merchant's shop is open the loop keeps calling `tick`, but the sim itself freezes the world (§14, §14.3), so picks travel in the intent stream.
- Precisely: each animation frame adds the time since the previous frame to an accumulator and runs `floor(acc / (1000/60 ms))` ticks, keeping the remainder. If more than 4 are owed, 4 run and the rest are dropped (not banked), so a stall or a hidden tab never fast-forwards. The first frame runs none. While ticks are stopped (title, pause) no time is banked, and starting or resuming a run begins with an empty accumulator.
- Intents are built once per frame. The edge fields `confirm`, `pick`, `reroll` and `leave` are held until the next tick runs and given to that tick only, so a frame that runs no tick (high refresh rates) loses no press. Every tick of a frame gets the frame's move and aim.
- After each tick the browser plays that tick's `game.events` sounds and starts its screen shakes (§5.1); they are cleared by the next tick.
- `Game.tick(intent)` is the only entry point into the sim. `intent` is `{ moveX, moveY, aimX, aimY, hasAim, confirm, pick, reroll, leave }` with move and aim as unit vectors or zero, `pick` a whole number from 0 (a card, a shop offer or a card in the shop's list) or −1 for none, `reroll` and `leave` booleans (§14, §14.3), plus an optional `debug` command (§19).
- All randomness goes through `game.rng` (mulberry32, seed passed to the `Game` constructor). Tests pass a fixed seed.

### 4.1 Sim state

The sim's state is plain data on the `Game` object. The loop and the renderer read it and never write it (the loop only calls `tick`).

- **Construction:** `new Game({ seed, timeline, debug, meta })`. `timeline` defaults to the §9 table in `content.js`; tests may pass their own rows. `debug` (default false) makes the sim honour `intent.debug` (§19). `meta` is the out-of-game armoury's effect on the run (§13.1), per damage type: `{ power: { fire, arcane, physical }, shred: { fire, arcane, physical } }`, where `power` multiplies the damage of that type and `shred` is taken off every enemy's resistance to it (§12.1). Any part may be left out; a missing, non-finite, zero or negative power reads 1 (power is always positive, so the at-least-1 rule of §12.1 holds) and a missing or non-finite shred reads 0, so a run without `meta` is a run with neutral `meta`. It is stored normalised as `game.meta` (all six numbers present), never changes during a run, and is part of the snapshot.
- **RNG:** `game.rng` is a plain function returning a float in `[0, 1)`. Every random draw calls `game.rng()` at the point of use, never a reference cached at construction, so a test can replace it (`game.rng = () => 0`).
- **Units and clock:** positions in world px, speeds in px/s, `DT = 1/60`. `game.tickCount` is an integer and `game.t = tickCount × DT` seconds, so time never drifts.
- **Intent:** exactly the shape in §4. A missing, partial or non-finite field reads as 0, `false` or `-1` (`pick`; also any `pick` that is not a whole number from 0); `hasAim`, `confirm`, `reroll` and `leave` are true only when they are `true`. A move vector longer than 1 is normalised; a non-zero aim is normalised; `hasAim` is false when the aim is zero. The sim ignores `confirm`; `pick` and `reroll` are read only while level-up offers are open (§14), `pick` and `leave` while the shop is open (§14.3). The loop turns a gamepad A press on the level-up screen into the `pick` of the highlighted card.
- **Phases:** `game.phase` is `'play' | 'dying' | 'over'`. In the clock step, when tower HP is 0, the phase becomes `'dying'`, a `castle.destroy` effect spawns at the tower and sound `destroy_castle_sound` plays. During `'dying'` only effects advance; the clock, enemies, dragon and weapons are frozen. After 2 s (120 ticks) the phase becomes `'over'`. `tick()` in `'over'` changes nothing except clearing `events`. Title, pause, the level-up screen and the shop screen are the loop's business, not phases.
- **Events:** `game.events` is cleared at the start of every tick. Systems push `{ type: 'sound', name }`, at most one per sound name per tick; the browser plays them. The golem's spawn, footsteps and staggers push `{ type: 'shake', kind }` with `kind` `spawn`, `step` or `stagger` (§8.10), at most one per kind per tick; the browser turns them into screen shake (§5.1). Events are output, not state.
- **Ids:** every enemy, projectile, enemy shot, effect, gem, mini tower, claw slash, saw blade, brazier, pickup and merchant gets its `id` from one counter, `game.nextId`.
- **Start:** the dragon at (0, 0), the tower at (0, `TOWER_REST_DIST`) = (0, 40), below the dragon and at rest (§7.1), so nothing moves before the first input.
- **Run counters:** `game.kills` (0), `game.level` (1), `game.xp` (0), `game.pendingLevelUps` (0), `game.offers` (`[]`, the level-up cards on show, §14), `game.weapons` (`[{ id: 'fireball', level: 1, timer: 0 }]`, `timer` = seconds until the weapon next fires), `game.buffs` (`[]`, entries `{ id, level }` in the order gained), `game.gems` (`[]`), `game.miniTowers` (`[]`), `game.slashes` (`[]`, claw slashes, §10.5), `game.blades` (`[]`, saw blades, §10.9), `game.enemyShots` (`[]`, mage orbs, §8.5), `game.braziers` and `game.pickups` (`[]`, §14.2), `game.brazierTimer` (1500, spawner steps until the next brazier attempt), `game.lastBomb` (`null`, the `tickCount` of the tick the last bomb pickup went off, read by the renderer's flash), `game.lastFusion` (`null`, the `tickCount` of the last slime fusion, §8.9), `game.merchants` (`[]`, at most one, §14.3), `game.merchantTimer` (5400, spawner steps until the next merchant is due), `game.shop` (`null`, the merchant's shop while it is open), `game.rerolls` (0, level-up rerolls bought from merchants), `game.spawner` (`{ budget, spawned, golem, stampedes, nextStampede }`: `spawned` counts budget spawns, `golem` is true once the golem has spawned, `stampedes` counts the horse stampedes so far and `nextStampede` (s, starts at 0) is when the next one is due, §8.8), `game.seen` (`[]`, the enemy types met this run in the order first met: a type is added when the first enemy of that type is created, by the spawner, a summon, a slime split, a rising ghost or the golem; read by the bestiary, §17.1), `game.seenTiers` (`{}`, per enemy type the tiers of it met this run, ascending, added as enemies are created, §8.6; read by the bestiary). `game.score()` = `floor(t) + kills`.

| Entity | Fields |
|---|---|
| every drawable | `x, y, anim, frame, frameTicks` |
| `game.dragon` | `aimX, aimY` (unit fire direction), `moveX, moveY`, `aimed` (an aim has ever been given), `flip` (facing left, §6.3); `anim` is `dragon.walk` |
| `game.tower` | `hp, maxHp`, `moved` (the tower moved this tick, §7.1); `anim` is `castle` |
| `game.enemies[]` | `id, type, tier, r, hp, maxHp, gen, flip, alpha`. `tier` is 1–4 (§8.6). `maxHp` is the HP it was created with (after its tier; a slime child's that of its generation, a megaslime's that of its fusion), read by the bite's execute (§10.8). `gen` is a slime's generation, 0–2 (§8.4), 0 for every other enemy. `type` is a key of `ENEMIES` in `content.js`: `knight`, `skeleton`, `slime`, `megaslime`, `mage`, `ghostKnight`, `ghost`, `horse`, `mountedKnight`, `golem`. Mages also have `castTimer` (§8.4) and `orbTimer` (§8.5); horses have `dx, dy`, the unit direction of their run (§8.8); a megaslime has `xp`, its gem's value (§8.9); the golem has `unkillable` and `procImmune` set to true and `hp = GOLEM_HP = 1e9`, a finite stand-in for ∞, and `poise, poiseHit, staggers, stagger, staggerDx, staggerDy, shoveTimer` (§8.10) |
| `game.projectiles[]` | `id, kind, type, dx, dy` (unit), `speed, r, damage, knock, range, travelled, hits` (ids of enemies hit, at most 8), `gen, dirFrame` (for 16-direction sprites). `kind` is `fireball` (mini-tower shots included, §10.3) or `laser`; `type` is its damage type (§12.1); `knock` its knock after Force (§8.7) |
| `game.enemyShots[]` | `id, kind, dx, dy` (unit), `speed, r, damage, range, travelled`. `kind` is `orb` (§8.5). Kept apart from `game.projectiles`: no player weapon touches them |
| `game.effects[]` | `id, scale, alpha, flip, tier, hold, life, done`. `scale` multiplies the standard 2× sprite scale; `tier` is the tier of the enemy whose death it shows (1 for every other effect), drawn as in §8.6; `life` (ticks, usually 0) is a minimum length: the effect holds its last frame until `life` ticks have passed |
| `game.gems[]` | `id, x, y, value, homing` (§14) |
| `game.miniTowers[]` | `id, x, y` (landing point), `fromX, fromY` (where the lob started), `lobTicks` (ticks of flight left), `life` (ticks left after landing), `timer` (seconds to the next shot) (§10.3) |
| `game.slashes[]` | `id, weapon` (the claw's id), `shape` (`rect` or `cone`), `side` (rect: 1 right, −1 left), `dx, dy` (cone: unit direction), `w, h` (rect px), `angle, reach, maxTargets` (cone), `damage, knock` (after Might and Force), `delay` (ticks until it strikes), `struck`, `x, y` (the dragon's centre when it struck), `hits` (ids of the enemies it hit); `anim` is `claw.swipe` or `claw.cone` (§10.5–10.6) |
| `game.blades[]` | `id, dx, dy` (unit, outward), `phase` (`out`, `dwell` or `back`), `speed, range, travelled, dwell` (ticks left to spin), `r, damage, knock` (after the buffs), `rehit` (enemy id → `tickCount` from which this blade may hit it again); `anim` is `saw.spin` (§10.9) |
| `game.braziers[]` | `id, x, y`; `anim` is `brazier.burn` (§14.2) |
| `game.pickups[]` | `id, kind, x, y, life` (ticks left); `kind` is `heart`, `magnet`, `bomb` or `chest`, `anim` its `pickup.<kind>` (§14.2, §14.3) |
| `game.merchants[]` | `id, type` (`merchant`), `dx, dy` (unit, his route), `r, hp, maxHp, flee` (ticks left fleeing), `trade` (ticks the dragon has stood by him), `willTrade, procImmune` (true), `flip`; `anim` is `merchant.walk` (§14.3) |
| `game.shop` | `merchant` (his id), `page` (`main` or `cards`), `cards` (the cards for sale on the `cards` page) (§14.3) |
| ring weapon | also `angle` (radians), `balls` (`[{ x, y }]`, the fireball positions this tick), `rehit` (enemy id → `tickCount` from which it may be hit again), and its own `anim, frame, frameTicks` (§10.4) |

- **Animation:** `anim` is an atlas anim name, `frame` the frame index, `frameTicks` the ticks already spent on that frame; frame durations come from `ANIMS` in `anims.js`. Looping anims (walks, projectiles) wrap. A non-looping anim finishes once its last frame has been shown for its full duration and then stays on that frame. An effect is removed in the effects step of the tick its anim finishes, unless it has `hold` (the `castle.destroy` effect holds, so the ruin stays on screen).
- **Digest:** `game.digest()` is an 8-hex-digit FNV-1a hash of a canonical JSON of `game.snapshot()` (sorted keys, numbers rounded to 1e-6; events, the rng and the grid excluded). Same seed and same intents give the same digest.

---

## 5. World, camera, rendering

- **Internal resolution:** 960×600, matching the original. The canvas is scaled to fit the window with CSS (`image-rendering: pixelated`), keeping the aspect ratio: the scale is `min(windowW / 960, windowH / 600)`, rounded down to an integer when it is at least 1, fractional below 1. The page background is near-black and the canvas is centred.
- **Sprite scale:** every sprite is drawn at **2×** source size (a 16px knight is 32px on screen), except silver and gold enemies and their death effects at **3×** (§8.6), and the mounted knight, drawn bigger: **3×** (its 22px art is 66px on screen), **4×** at silver and gold (§8.6); screen scales are always whole numbers. Horses are 20×14 art at 2× (40×28 px). World coordinates are internal screen pixels, so all radii below are in those units.
- **World:** unbounded plane. No terrain in the demo. The camera is centred on the dragon: a world point is drawn at `world + offset` with `offset = (round(480 − dragon.x), round(300 − dragon.y))`, an integer so sprites do not shimmer. Sprites are drawn centred on the entity position, at integer screen pixels.
- **Background:** a 64×64 grass tile generated once at startup into an offscreen canvas (dark green base, 28 lighter or darker 2×2 px speckles), tiled with the camera offset. The speckles come from the tile's own `mulberry32` with a fixed seed, never from `game.rng`, so drawing cannot change a run. A faint darker ring (2 px, black at 18% alpha) of radius `TETHER_LENGTH` around the tower makes the tether rule readable.
- **Gem:** drawn procedurally as a 6×6 px diamond, a blue edge around a pale cyan core, at 2× (12 px on screen), centred on the gem.
- **Draw order:** background, gems, tower, mini towers, braziers, pickups (a blinking one only on its shown steps, §14.2), merchants (§14.3), enemies sorted by y, ring fireballs, saw blades, projectiles, enemy shots (mage orbs), dragon, claw slashes, effects (the bite's jaws among them), the bomb flash (§14.2), HUD, then any screen (title, pause, level-up, shop, game over) over a 60% black overlay. Enemies are sorted by y then id in a copy owned by the renderer; the game's enemy list is never reordered, because its order is part of the sim.
- **Sprites:** `scale` and `alpha` of effects and enemies apply as given (`scale` multiplies the 2×). An enemy or effect of tier 2–4 draws its anim's tier sprite `<anim>@t<tier>` (the plain anim if the atlas has no such sprite), with the same `frame`. Every enemy and effect is drawn at the screen scale of its anim and tier (§8.6; times an effect's `scale`): its type's scale (2, or 3 for the mounted knight's anims) times the tier's screen scale over 2, rounded down to a whole number; `flip` mirrors around the sprite's centre. Projectiles whose anim is a 16-direction sheet (`laser.dir`, `laser.bigdir`) draw frame `dirFrame`; others draw `frame`. Enemy shots draw `frame` of their anim. The dragon draws `frame` of `dragon.walk`, mirrored when `flip`. Ring fireballs draw the ring weapon's `frame` at each of its `balls`. A saw blade draws `frame` of `saw.spin` at 2× at its position (the sprite spins by frame, never by canvas rotation); its hit radius is `r`, which the sprite only approximates (`?debug=1` draws it). A mini tower in flight is drawn on the straight line from `(fromX, fromY)` to `(x, y)` at progress `p = 1 − lobTicks / 30`, raised by `sin(p × π) × 30` px; a landed one at `(x, y)`.
- **Claw slashes** (§10.5–10.6): only struck ones, at the dragon's current centre (the claws are the dragon's, so the effect moves with it), `frame` of their anim, at a whole screen scale `k`: the integer nearest the slash's size over the sprite's (a rectangle's `w` over 56, a cone's `reach` over 40), halves rounding down, at least 1 (110 px and 140 px rectangles draw at 2×, an Area-scaled 168 px one at 3×). The sprite keeps its own size, so the effect only approximates the hitbox; `?debug=1` draws the hitbox (§19). A rectangle draws `claw.swipe` with its left edge on the dragon's centre, mirrored when `side` is −1. A cone takes the nearest of 16 directions (22.5° steps, clockwise from right): index `i = round(atan2(dy, dx) / 22.5°) mod 16`, base `b = i mod 4` and quarter turns `q = floor(i / 4)`; it draws `claw.cone`, `claw.cone22` or `claw.cone45` for `b` 0, 1, 2, and `claw.cone22` mirrored across its diagonal (x ↔ y, so 22.5° becomes 67.5°) for `b` 3, turned `q` quarter turns clockwise about its apex, which sits on the dragon's centre. Quarter turns and the diagonal mirror keep every pixel on the screen grid.
- **Facing:** enemies flip horizontally when moving left (`ctx.scale(-1, 1)`). The dragon flips the same way when facing left (§6.3).
- `draw.js` reads the game state and never writes it. Animation indices live in the entity (`anim`, `frame`, `frameTicks`) and advance during the tick, so rendering is stateless.

### 5.1 Screen shake

The golem shakes the screen: its arrival, its footsteps near the dragon and its staggers (§8.10). Shake is render only: the sim sends `shake` events (§4.1) and never reads the shake back.

| Kind | Sent when | Amplitude | Time |
|---|---|---|---|
| `spawn` | the golem spawns | 8 px | 0.6 s |
| `step` | a golem footstep within `GOLEM_STEP_RANGE` (400 px) of the dragon | 2 px | 0.15 s |
| `stagger` | the golem staggers | 5 px | 0.3 s |

- **Shakes** (`render/shake.js`, held by the App): after each tick the App starts a shake for each of the tick's `shake` events, at that frame's time. A shake's amplitude falls linearly from its full value to 0 over its time, in real time, so a shake keeps fading while the game is paused or on the level-up screen. Shakes add up; the sum `A` is capped at `SHAKE_CAP = 10` px.
- **Offset:** `(round(A × sin(2π × 23 × t)), round(A × cos(2π × 17 × t)))` px, with `t` the frame's time in seconds: a fixed pattern of time, so it draws no random numbers, and whole pixels, so sprites do not shimmer. It is added to the camera offset of the whole world (background, tether ring, entities, effects and the debug overlay's world shapes); the HUD, the screens and the bomb flash, which covers the screen, do not move. Mouse aim (§6.2) uses the unshaken camera.
- **Off:** the page option `?shake=0` turns it off: the App ignores the events and the offset is always 0.
- All shake numbers *unmeasured*.

---

## 6. Dragon

| Constant | Value |
|---|---|
| `DRAGON_SPEED` | 87 px/s *unmeasured* |
| `DRAGON_PICKUP_RADIUS` | 48 px *unmeasured* |
| `FACING_DEADZONE` | 0.3 *unmeasured* |
| `DRAGON_RADIUS` | 12 px *unmeasured*, collision circle for mage orbs (§8.5) |
| Collision with enemies | none |
| HP | none (cannot die); an orb that hits it damages the tower (§8.5) |

### 6.1 Movement
Velocity = `move × DRAGON_SPEED`. Instant acceleration.

### 6.2 Aim
`aim` comes from the right stick, or from the mouse position relative to the dragon on screen. When `hasAim` is false (stick centred), aimed weapons fire in the **last aim direction**, and if there never was one, in the movement direction. Aimed weapons never stall for lack of input.

Precisely: an intent with `hasAim` and a non-zero aim sets the fire direction and marks the dragon as aimed. Until the first such intent, the fire direction follows the movement direction and keeps the last one when the dragon stops; before any aim or movement it is right, (1, 0). Once aimed, movement never changes the fire direction.

### 6.3 Facing and walk animation
The dragon walks. `dragon.walk` is a 2-frame walk (6 ticks per frame) drawn facing right; `flip` mirrors it to face left.

- **Facing,** set in step 1 after the aim: while the move is clearly horizontal (`|moveX| ≥ FACING_DEADZONE`) the dragon faces the way it moves (`flip = moveX < 0`); otherwise, if the fire direction is clearly horizontal (`|aimX| ≥ FACING_DEADZONE`), it faces that way (`flip = aimX < 0`); otherwise (moving or aiming roughly up or down) it keeps its last facing, so stick noise around straight up or down never flickers it. It starts facing right, as the default fire direction does.
- **Walk,** in step 2: on a tick when the dragon moves (`moveX` or `moveY ≠ 0`) its walk anim advances one tick and loops; on a tick when it stands still it shows frame 0 with `frameTicks` 0, so every walk starts from frame 0.
- There is no bob: the sprite is drawn at the dragon's position.

---

## 7. Tower and tether

| Constant | Value |
|---|---|
| `TOWER_HP` | 100 *unmeasured* |
| `TETHER_LENGTH` | 105 px *unmeasured* |
| `TOWER_FOLLOW_SPEED` | 60 px/s *unmeasured*, below dragon speed so the tower lags and the tether still matters |
| `TOWER_REST_DIST` | 50 px *unmeasured*, where the follow stops; the 2× dragon (40 px) and the castle (60 px) just touch when one is straight above the other |
| `TOWER_RADIUS` | 26 px, collision circle for enemies |
| Sprite | `castle` at 2× = 60 px |

### 7.1 Follow and tether
The tower always trails the dragon. Each tick, in this order:

1. **Follow.** If `dist(tower, dragon) > TOWER_REST_DIST`, the tower walks straight toward the dragon by `TOWER_FOLLOW_SPEED × DT`, but never closer than `TOWER_REST_DIST` (clamp, never overshoot). A distance within 1e-6 px of `TOWER_REST_DIST` counts as at rest, so rounding never makes a resting tower creep.
2. **Tether.** If the distance is then still above `TETHER_LENGTH`, the tower is dragged: it moves along the line to the dragon until the distance is exactly `TETHER_LENGTH`.

So a dragon walking away faster than the follow speed opens the gap until the tether is tight and then drags the tower at its own speed; once the dragon stops, the tower walks up to the rest distance and stops. `tower.moved` is true on a tick when either step moved the tower, false otherwise; the golem's shove (step 8) also sets it. The tower never moves except toward the dragon and when the golem shoves it (§8.10).

### 7.2 Damage
Enemies whose circle overlaps the tower circle deal `contactDps × DT` each tick (continuous, not per hit), `contactDps` being the type's DPS times its tier's multiplier (§8.6). A mage orb that hits the dragon takes `MAGE_ORB_DAMAGE` from the tower at once (§8.5). When HP reaches 0 the run ends (§13). Tower HP does not regenerate; the Repair card restores 25. HP never goes below 0.

Circles overlap when the distance between centres is less than the sum of the radii. An enemy walking at the tower stops advancing once its centre is `r + TOWER_RADIUS − 1` px from the tower's (1 px inside contact range, *unmeasured*), so it keeps dealing damage without walking into the tower. Enemies never push the tower, except the golem's shove (§8.10); when the tower follows or is dragged into enemies they simply overlap it.

### 7.3 Visual
Draw the castle with a 4 px HP bar above it: 40 px wide, 4 px above the sprite's top edge, red fill on a dark red back, proportional to `hp / maxHp`. Once the phase is `'dying'` the castle and its bar are not drawn; the `castle.destroy` effect takes their place. **Minion carriers:** while the tower is moving, the two tiny figures `royal.prince` and `royal.princess` (the pack has two) walk at its base, the minions carrying it: drawn at `tower + (∓14, 26)` px, flipped to face left when the dragon is left of the tower, each bobbing up 1 px on alternate 8-tick steps of `tickCount`, out of phase with each other. The tower counts as moving when `tower.moved` is true (§7.1), so the carriers show while it follows and while it is dragged. Visual only, derived from state by the renderer (*unmeasured*).

---

## 8. Enemies

All enemies target the **tower**: desired velocity = `normalize(tower − self) × speed`; the horse alone runs straight instead (§8.8). Each enemy is a circle. They play `walk` while alive and `die` on death; a dying enemy becomes an effect and stops colliding.

An enemy whose HP drops to 0 or below stops being hit at once and is removed in the deaths step: `kills` goes up by one, sound `death01` plays, it drops its gem, and a non-colliding effect plays its `die` anim at its position with the same `flip` and `alpha`. The specials below replace the effect where they say so. The ghost's `die` anim is `ghost.die`.

`flip` is true while the enemy's x-velocity toward the tower is negative and keeps its last value when the enemy stands still.

| Type | HP | Speed px/s | Radius | Contact DPS | XP | Mass | Fire | Arcane | Physical | Sprite | Special |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Knight | 3 | 27.5 | 12 | 2 | 1 | 1 | 0 | 0 | 0.25 | `knight` | none |
| Skeleton | 1 | 45 | 10 | 6 | 1 | 0.7 | 0 | 0.25 | −0.5 | `skelly` | none (a summoned one first plays `skelly.summon`, §8.4) |
| Slime | 3 / 2 / 1 | 35 | 12 / 9 / 7 | 4 *unmeasured* | 1 | 0.8 | −0.5 | 0 | 0.5 | `slime` | three sizes, gen 0, 1 and 2, each its own art (16, 12 and 9 px); HP and radius per generation. On death a gen-0 or gen-1 slime splits into 2 of the next generation and plays its split instead of `die`; a gen-2 slime dies (§8.4). Above 100 slimes they fuse into megaslimes (§8.9). |
| Megaslime | 4 × fused | 15 | 28 | 0 | fused | 4 | −0.5 | 0 | 0.5 | `megaslime` | comes only from a slime fusion (§8.9): HP 4 × the fused slimes' HP, XP their sum. Harmless: walks at the tower and soaks shots and fire. Dies with `megaslime.die`, no split. |
| Mage | 4 | 20 | 12 | 5 | 5 | 1 | 0 | 0.5 | −0.25 | `mage` | every `MAGE_CAST_INTERVAL = 8 s` since spawn it stops for 1 s (`spell` anim) and spawns 4 skeletons in a 40 px ring around itself, each playing `skelly.summon` once before walking. Will not cast within 80 px of the tower (§8.4). Fires a green orb at the dragon every 3 s while within 320 px of it (§8.5). |
| Ghost knight | 10 | 27.5 | 12 | 10 | 2 | 1 | 0 | 0 | 0.25 | `ghost.knight` | on death plays `ghost.burn` once (0.5 s, not collidable), then becomes a **Ghost** (§8.4). |
| Ghost | 2 | 36 | 10 | 8 | 1 | 0.6 | 0.25 | −0.5 | 0.75 | `ghost.ghost` | drawn at 60% alpha. Dies normally. |
| Horse | 2 | 120 | 10 | 4 | 1 | 0.5 | 0 | 0 | 0 | `horse` | comes only in **stampedes** (§8.8), never from the spawn budget: runs in a straight line through where the tower was and on past it, faster than the dragon, so it is zoned, not chased. Despawned without a refund. |
| Mounted knight | 30 | 60 | 16 | 15 | 8 | 2 | 0.25 | −0.25 | 0.5 | `mounted` | walks at the tower like a knight. Drawn bigger: 3× (§5). Armoured: wants arcane. |
| Mega golem | ∞ | 75 | 56 | 40 | none | none | 0 | 0 | 0 | `golem` | §13. Takes no damage. A hit never pushes it: its knock builds poise, and at 60 poise (× 1.5 after each stagger) it staggers, pushed 40 px away from the dragon (§8.10). Shoves the tower once a second on contact. Immune to procs. |

All numbers *unmeasured*. Fire, Arcane and Physical are the type's resistances to those damage types (§12.1): below 0 a weakness (−0.5 takes ×1.5), above 0 a resistance (0.5 takes half), 1 immune. A slime's row holds for all three generations; where it has three numbers they are gen 0, 1 and 2. A megaslime's HP and XP are set by its fusion (§8.9). The golem has no resistances; it takes no damage from any type. The table is tier 1; tiers scale HP, speed, radius, DPS and XP (§8.6). Mass divides the knockback of every hit (§8.7): below 1 an enemy is light and flies further, above 1 heavy; the golem has no mass: a hit's knock builds its poise instead (§8.10).

### 8.1 Separation
Enemies push apart so they do not stack. For each enemy, query the grid for neighbours within `r1 + r2` and move away by half the overlap along the separating axis. Cap at 6 neighbours per enemy per tick. The golem is immovable in separation; others move around it.

All enemies move first, then separation runs once over the enemy list in order, each enemy reading its neighbours' current positions. The 6 neighbours are the first 6 overlapping ones in grid order. Against an immovable neighbour an enemy moves the whole overlap, since the neighbour will not move its half. Two enemies at exactly the same point separate along x, the lower id to the left.

### 8.2 Cap
`MAX_ENEMIES = 400`. The spawner does not spawn above the cap, and a mage summons only as many skeletons as fit under it. Enemies that continue one that just died (the two slime children, the ghost after a burn), a megaslime (it replaces 12 slimes, §8.9) and the golem are always added, so the count can pass the cap by those; the spawner then waits until it is below again. The golem counts toward the cap like any enemy. The cap exists for performance, not design. While the cap is reached the budget does not bank up: it is clamped to at most 1, so freeing slots never releases a burst.

### 8.3 Despawn
An enemy farther than `DESPAWN_DIST = 1400 px` from the tower is removed silently and its spawn budget refunded, so kiting cannot starve the horde. The check runs at the end of the enemies step; the refund adds 1 to the budget, so the enemy reappears on the ring on the next spawner step. A despawn is not a kill and drops no gem. The golem is never despawned. A horse is despawned the same way but refunds nothing: stampedes are not budget spawns (§8.8).

### 8.4 Specials

Specials run in the enemies step before the enemy walks; a busy enemy (a casting mage, a summoning skeleton) does not walk that tick but still takes part in separation and can be hit.

- **Slime generations.** A slime has a generation `gen`, 0 when spawned. Each generation is a size with its own pixel art (never a scaled sprite), HP and radius at tier 1 (scaled by the tier like any enemy's, §8.6), all *unmeasured*:

  | Gen | Walk | HP | Radius | On death | Children at |
  |---|---|---|---|---|---|
  | 0 | `slime.walk` (16 px) | 3 | 12 | splits, `slime.split` | ±20 px |
  | 1 | `slime.walk1` (12 px) | 2 | 9 | splits, `slime.split1` | ±15 px |
  | 2 | `slime.walk2` (9 px) | 1 | 7 | dies, `slime.die2` | none |

- **Slime split.** When a gen-0 or gen-1 slime dies it counts as a kill, plays `death01` and drops its gem like any enemy, but its effect is its generation's split (with its `flip`, `alpha` and tier) instead of a die. Two slimes of the next generation and the parent's tier, with that generation's HP, radius and walk, appear in the deaths step. With `u` the unit direction from the parent to the tower (`(0, 1)` if the parent is at the tower centre) and `d` the parent generation's child offset (20 px for gen 0, 15 px for gen 1, the art's size ratio), the first appears at `parent + d × (−u.y, u.x)` and the second at `parent − d × (−u.y, u.x)`, so they flank its path. They inherit nothing else (the tier aside) and drop their own gems when killed. A gen-2 slime does not split: it dies like any enemy with the effect `slime.die2`. So one spawned slime becomes at most 7 slimes: 3 + 2 × 2 + 4 × 1 = 11 HP and 7 gems at tier 1.
- **Mage cast.** A mage's `castTimer` counts enemies steps since it spawned, or since its last cast started. When it reaches `MAGE_CAST_INTERVAL` (480 ticks) the timer restarts at 0 and a cast starts, unless the mage's centre is less than 80 px from the tower's centre at that moment: then the cast is skipped and the mage walks on. A cast lasts 60 ticks (1 s) counting the tick it starts; the mage stands still and loops `mage.spell`. At the end of its last cast tick it returns to `mage.walk` and summons 4 skeletons of its own tier 40 px from its centre, at 45°, 135°, 225° and 315° from its direction toward the tower, so it walks on between the front two. Casts therefore start every 8 s; the 1 s cast is part of the 8 s. The summon has no sound (`death02` is not used).
- **Summoned skeletons** start on `skelly.summon` frame 0. They join the enemy list at once (separation, collisions, the cap) but first act on the next tick. While `skelly.summon` plays they do not walk; they can be hit and damaged and they do touch the tower. On the tick the anim ends they switch to `skelly.walk` and walk from the next tick on.
- **Ghost knight burn.** A dying ghost knight counts as a kill, plays `death01` and drops its gem; its effect is `ghost.burn` with its `flip`, `alpha` and tier and `life` 30 ticks (0.5 s): the anim is 22 ticks long and holds its last frame for the rest. The burn is an effect, so it is not hit and does not touch the tower. In the effects step of the tick it finishes, the burn is removed and a ghost appears at its position with its `flip` and tier, so the ghost has the ghost knight's tier. The ghost is added even when the cap is full. No ghost rises once the phase is no longer `'play'`.
- **Golem.** It spawns with `hp = GOLEM_HP` and `unkillable`; it never dies and never despawns. A hit takes nothing off its HP (the damage function deals it 0, §12.1), which stays `GOLEM_HP`, and sound `hit_golem` plays. A hit never pushes it; the hit's knock builds its poise, and enough poise staggers it (§8.10), which is its special: a staggering golem does not walk. `procImmune` marks it as immune to procs (§12). It is immovable in separation (§8.1), deals 40 DPS on contact (§7.2) and shoves the tower once a second while it touches it (§8.10).

### 8.5 Mage orbs

Mages shoot slow green orbs at the dragon, so dodging matters. The dragon cannot die, so an orb that hits it damages the **tower** instead.

| Constant | Value |
|---|---|
| `MAGE_ORB_RANGE` | 320 px, the mage fires only while the dragon is this close *unmeasured* |
| `MAGE_ORB_INTERVAL` | 3 s between shots *unmeasured* |
| `MAGE_ORB_SPEED` | 110 px/s, faster than the dragon, slow enough to sidestep *unmeasured* |
| `MAGE_ORB_DAMAGE` | 5 tower HP per hit *unmeasured* |
| Orb | radius 6 px, flies 400 px, sprite `orb.green`, hit sound `slime_poke` |

- **Timer.** A mage's `orbTimer` is the number of enemies steps until it may fire. When the mage spawns it is set to `floor(game.rng() × 180)`, a random offset in `[0, 180)` ticks (`[0, MAGE_ORB_INTERVAL)`), so a pack of mages does not fire in volleys. This is the orbs' only random draw; no other enemy draws one.
- **Firing,** in the enemies step, after the mage's cast logic (§8.4) and before it walks. Only while the mage's centre is at most `MAGE_ORB_RANGE` from the dragon's: `orbTimer` goes down by one if it is above 0 (casting or not), and when it is 0 and the mage is not casting this tick (no tick of a cast, its first and last included) it fires one orb and `orbTimer` restarts at 180 (3 s). Out of range the timer holds, so a pack of mages that walks into range together still fires staggered by its spawn offsets; a mage whose timer is already 0 fires on its first step in range. Firing never stops the mage walking.
- **Orb.** An orb starts at the mage's centre and flies in a straight line toward the dragon's position at the moment of firing (no lead; `(0, 1)` if they coincide), at `MAGE_ORB_SPEED`. It is a `{ kind: 'orb' }` entry of `game.enemyShots`, drawn above enemies and projectiles and below the dragon. In step 7, after the player's projectiles, it moves, expires once it has travelled 400 px, and its anim loops.
- **Hit,** in step 8 after enemy vs tower: an orb whose circle overlaps the dragon's (`DRAGON_RADIUS`) is removed and the tower loses `MAGE_ORB_DAMAGE` HP (never below 0); sound `slime_poke`. Orbs ignore enemies and the tower itself; player projectiles and the ring do not touch them. An orb in flight outlives the mage that fired it. A tower brought to 0 by an orb ends the run like any other damage (§13).

### 8.6 Tiers

Any enemy but the golem comes in four tiers: one sprite serves the whole run, and its colour, outline and size say how dangerous it is. All multipliers *unmeasured*.

| Tier | Name | Tint | Outline | Screen scale | HP | DPS | XP | Speed | Radius |
|---|---|---|---|---|---|---|---|---|---|
| 1 | plain | none | none | 2 | ×1 | ×1 | ×1 | ×1 | ×1 |
| 2 | bronze | warm copper | 1 px copper | 2 | ×2.5 | ×1.25 | ×2 | ×1 | ×1 |
| 3 | silver | cold pale blue | 1 px pale steel | 3 | ×6 | ×1.5 | ×4 | ×0.9 | ×1.5 |
| 4 | gold | gold | 1 px gold | 3 | ×15 | ×2 | ×8 | ×0.8 | ×1.5 |

- **State.** Every enemy has `tier` (1–4), set when it is created and never changed. The spawner draws it from the timeline's tier weights (§9), once per stampede for all its horses (§8.8); a summoned skeleton has its mage's tier, a slime child its parent's, a megaslime the highest tier among the slimes it fused (§8.9), and a ghost the tier of the ghost knight it rose from (§8.4). The golem is always tier 1, whatever it is created with.
- **Multipliers** apply to the type's §8 numbers (each slime generation's HP and radius included; a megaslime's HP and XP come from its fusion and are not multiplied again, §8.9): HP is `ceil(HP × multiplier)` (a bronze knight has 8; every hit deals whole damage, §12.1, so rounding up kills on the same hit as the exact product), the speed and the radius are multiplied as they are, contact DPS is multiplied where it is dealt (§7.2), and the gem is worth the type's XP times the tier's (§14). Resistances, mage orbs (§8.5) and every timer are the same at every tier.
- **Sprites.** The tier sprites are generated from the plain ones at build time (§3.3, §3.5): each tier's tint (luminance-preserving, so the shading survives), then a 1 px outline in the tier's colour, which also fills thin sprites' gaps. `<anim>@t<tier>` exists for every anim of every enemy type but the golem, with the plain anim's frame durations, so `frame` and `frameTicks` mean the same at every tier. The sim keeps the plain anim names in `anim`; the renderer draws the tier's sprite at the tier's screen scale (§5), always a whole multiple of the source pixels. The table's screen scale is that of a standard 2× type; a type drawn bigger scales by the same ratio, rounded down to a whole number: the mounted knight is 3× at tiers 1 and 2 and 4× (not 4.5×) at tiers 3 and 4, so its silver and gold still read as bigger. Death effects (`die`, every slime generation's split and die, `ghost.burn`) and a megaslime's fusion carry the enemy's tier and are drawn the same way.
- **The bestiary** shows the tiers met per type and the multipliers (§17.1).

### 8.7 Knockback

Hits push enemies back, so a build can hold a crowd off the tower. Every weapon has a `knock` in px (§10), an explosion has `EXPLODE_KNOCK = 10`, and every enemy type a `mass` (§8 table).

- A hit with knock `k` pushes the enemy it hits `k × (1 + force) / mass` px, with `force` the Force buff's value (+50% per level, 0 without it, §11), straight away from the hit's source: the projectile's position, the ring fireball, or the explosion centre; along `(0, 1)` when the source is at the enemy's centre. A mass of 1 takes the knock as it is.
- The push is applied in the damage function (§12.1) right after the damage, at once. It is a displacement, not a velocity: one hit moves an enemy exactly that far, never more, and nothing carries over to later ticks. Separation (§8.1) sorts out any overlap on the next enemies step.
- A killing hit pushes nothing: the enemy dies, drops its gem and plays its death where it was hit.
- The knock is read with the other stats: a projectile carries `knock × (1 + force)` from the moment it is fired (§11), and its split children inherit it; the ring's and an explosion's are read at the hit.
- Mass is the type's at every tier (§8.6): a gold knight is pushed as far as a plain one.
- The golem has no mass and a hit never pushes it: the hit's knock after Force builds its poise instead, and enough poise staggers it (§8.10).
- Knockback draws no random numbers. Every knock and mass is *unmeasured*.

### 8.8 Horse stampedes

Horses are the one threat you cannot chase: faster than the dragon, they come in a line from one side and run straight through where the tower was. The answer is to move the tower out of the line, or to hold a wall of fire across it.

| Constant | Value |
|---|---|
| `STAMPEDE_SPACING` | 24 px between neighbouring horses in the line *unmeasured* |
| Schedule and size | the timeline's Stampede column (§9) *unmeasured* |

- **Schedule.** A timeline row may have a stampede: one every `every` s, each of `min`–`max` horses. `game.spawner.nextStampede` starts at 0. In the spawner step, after the budget spawns (§9), if the current row (the one whose weights apply) has a stampede and `t ≥ nextStampede`, one stampede spawns, `stampedes` goes up by one and `nextStampede` moves on by the row's `every` until it is above `t`. So the first stampede comes on the first tick of the first row that has them, the next ones every `every` s on a fixed grid, and a debug jump (§19) skips the ones in between instead of releasing them at once. A row without a stampede spawns none; a timeline without any draws no extra random number.
- **Draws,** from `game.rng`, in this order: the horse count `n = min + floor(rng × (max − min + 1))`; the tier from the row's tier weights (§8.6), **only when the row has tier weights** (one draw per stampede: all its horses share it); the angle `a = rng × 2π`.
- **Line.** Its centre `c` is on the spawn ring, `dragon + 560 px × (cos a, sin a)`, just outside the view. The run direction `u` is the unit vector from `c` to the tower's position at that moment (`(0, 1)` if they coincide). Horse `i` (0 to `n − 1`) appears at `c + (i − (n − 1) / 2) × STAMPEDE_SPACING × (−u.y, u.x)`: a line across the run, centred on the line through the tower. The horses are created in that order while the enemies are under the cap (§8.2); the rest of the line is not spawned. A horse's `flip` is `u.x < 0`, and its `dx, dy` are `u`.
- **Run.** In the enemies step a horse moves `speed × DT` (its tier's speed, §8.6) along `(dx, dy)`, never turning and never stopping: not at the tower, which it crosses, nor after it. It has no special and draws nothing. Separation (§8.1) and knockback (§8.7) push it like any enemy but never change its direction. While it overlaps the tower it deals its contact DPS (§7.2), so a line crossing the tower costs it a few HP per horse that hits.
- **End.** A horse farther than `DESPAWN_DIST` from the tower is removed like any despawn (§8.3) but refunds no budget. Killed, it dies like any enemy (`horse.die`, its gem, a kill).
- A horse created otherwise (a test) runs toward the tower as it is when created.


### 8.9 Slime fusion

When the field floods with slimes, a dozen of them fuse into one megaslime that soaks up shots and fire and hurts nothing.

| Constant | Value |
|---|---|
| `SLIME_FUSE_COUNT` | 100: fusion runs only while more slimes than this are alive *unmeasured* |
| `SLIME_FUSE_SIZE` | 12 slimes per fusion *unmeasured* |
| `SLIME_FUSE_RADIUS` | 80 px, the neighbourhood that finds the densest slime *unmeasured* |
| `SLIME_FUSE_INTERVAL` | 1 s: at most one fusion per this long *unmeasured* |
| `MEGASLIME_HP_FACTOR` | 4: the megaslime's HP is this times the fused slimes' *unmeasured* |

- **When.** At the end of the enemies step, after despawn: if more than `SLIME_FUSE_COUNT` slimes (type `slime`, every generation) are alive and `game.lastFusion` is `null` or at least 60 ticks before `tickCount`, one fusion runs and `game.lastFusion` becomes `tickCount`. A flood above 100 therefore loses 11 enemies a second until it is back to 100.
- **Which.** The core is the slime with the most other slimes whose centres are within `SLIME_FUSE_RADIUS` of its centre (ties: the lower id). The `SLIME_FUSE_SIZE` slimes nearest the core, centre to centre, fuse: the core itself first, ties to the lower id. No random draws.
- **The megaslime.** The fused slimes leave the enemy list silently (no kill, no gem, no effect) and one megaslime is created at their centroid (the mean of their centres) and appended to the list: its tier the highest among them, its HP (and `maxHp`) `MEGASLIME_HP_FACTOR` × the sum of their HP left, its `xp` (its gem's value) the sum of their gems (§14), its radius, speed and sprite from its §8 row and its tier (§8.6), `flip` true when the tower is to its left. It starts on `megaslime.fuse` frame 0: while that plays (24 ticks) it does not walk, as a summoned skeleton (§8.4), but it collides and can be hit; then it walks at the tower on `megaslime.walk`.
- **Harmless.** Its contact DPS is 0, so it never damages the tower; it stops at contact range like any enemy (§7.2). It takes damage through the slime's resistances, mass 4 makes it hard to push, and it neither fuses again nor splits: it dies like any enemy with `megaslime.die`, counting as a kill and dropping its gem.
- A megaslime made otherwise (a test) has 1 HP and no gem.

### 8.10 Mega golem: poise, stagger, shove

The golem cannot be killed and a single hit does not move it, but enough force soon enough staggers it, so Force and the heavy hitters matter against it; and it shoves the tower aside when it reaches it. It shakes the screen (§5.1).

| Constant | Value |
|---|---|
| `GOLEM_POISE` | 60, the poise at which it first staggers *unmeasured* |
| `GOLEM_POISE_GROWTH` | 1.5: each stagger multiplies the poise the next one needs *unmeasured* |
| `GOLEM_POISE_DECAY` | 10 poise per second while not hit *unmeasured* |
| `GOLEM_STAGGER_DIST` | 40 px, the stagger's push *unmeasured* |
| `GOLEM_STAGGER_TIME` | 0.3 s (18 ticks), the push's length *unmeasured* |
| `GOLEM_STAGGER_HOLD` | 0.5 s (30 ticks) standing still after the push *unmeasured* |
| `GOLEM_SHOVE_DIST` | 30 px, the tower shove *unmeasured* |
| `GOLEM_SHOVE_INTERVAL` | 1 s (60 ticks) between shoves *unmeasured* |
| `GOLEM_STEP_RANGE` | 400 px from the dragon, within which a footstep shakes the screen *unmeasured* |

- **State.** The golem has `poise` (0), `poiseHit` (false), `staggers` (0, its staggers so far), `stagger` (0, the stagger ticks left), `staggerDx, staggerDy` (0, the push direction) and `shoveTimer` (0), set when it is created and part of the snapshot.
- **Poise.** Every hit on the golem reaches it through the damage function (§12.1) with the hit's knock after Force (§8.7). Outside a stagger the knock is added to `poise` and `poiseHit` is set; once `poise` reaches the poise its next stagger needs, `GOLEM_POISE × GOLEM_POISE_GROWTH^staggers` (60, 90, 135, …; `staggers` counts its staggers so far), the golem staggers at once. The growing threshold means a strong build can stop the golem several times but never hold it off for good. Hits with no knock add nothing; explosions and the bomb never touch it (§12, §14.2). So one bite (knock 30) is half a stagger, a right-claw slash (22) more than a third, a level-1 fireball (4) a fifteenth, and Force multiplies them all.
- **Decay.** First in the golem's enemies step: if `poiseHit` is set it is cleared, otherwise `poise` drops by `GOLEM_POISE_DECAY × DT`, never below 0. Poise decays on every tick that does not follow a hit, so chip damage slower than the decay never adds up to a stagger.
- **Stagger.** On the hit that reaches that threshold: `poise` goes back to 0, `poiseHit` is cleared, `staggers` goes up by 1, `stagger` is set to 48 (18 + 30 ticks), `(staggerDx, staggerDy)` is the unit direction from the dragon's centre to the golem's at that moment (`(0, 1)` if they coincide), and the shake event `stagger` is sent; `hit_golem` plays as for every hit. From the next enemies step, for 48 steps, the golem neither walks nor advances its anim. On stagger tick `k` (`k = 49 − stagger`, 1 to 18) it moves `GOLEM_STAGGER_DIST × (e(k / 18) − e((k − 1) / 18))` px along its direction, with the ease-out `e(p) = 1 − (1 − p)²`: exactly 40 px in all, fast at first. On ticks 19 to 48 it stands still. Each step `stagger` goes down by 1; on the step after it reaches 0 the golem walks again. Hits during a stagger add no poise. It stays immovable in separation (§8.1): the enemies it is pushed into are moved out of it by the usual rule.
- **Shove.** `shoveTimer` goes down by 1 in each of the golem's enemies steps while above 0. In step 8, enemy vs tower, after every enemy's contact damage of the tick (§7.2): a golem overlapping the tower whose `shoveTimer` is 0 moves the tower `GOLEM_SHOVE_DIST` px straight away from the golem's centre (`(0, 1)` if they coincide), sets `tower.moved`, and restarts `shoveTimer` at 60. So it shoves on its first touch and then once every second while it touches the tower. Shoved toward the dragon the tower simply stands nearer; shoved away it may end the tick beyond `TETHER_LENGTH` from the dragon, and on the next tick's step 3 the follow and then the tether (§7.1) drag it straight toward the dragon to exactly `TETHER_LENGTH`.
- **Footsteps.** In the enemies step, on the tick its walk anim reaches frame 3 or 6 of `golem.walk` (`GOLEM_STEP_FRAMES`: the frames where its body is lowest and a foot lands, twice a 42-tick cycle), when its centre is within `GOLEM_STEP_RANGE` of the dragon's, the shake event `step` is sent. Its anim advances also while it stands at the tower, so it keeps stamping there.
- **Arrival.** On the tick it spawns (§9) the shake event `spawn` is sent.
- The golem's rules draw no random numbers.

---

## 9. Spawning and the timeline

Enemies spawn on a ring just outside the view: pick a random angle and place the enemy at `camera centre + 560 px × (cos a, sin a)` (half the diagonal of 960×600 is about 566). The spawner keeps a budget: `budget += rate(t) × DT`; while `budget >= 1`, spawn one and subtract 1.

`rate(t)` and type weights come from the timeline table in `content.js`. `rate` is linearly interpolated between rows; weights switch at the row boundary.

The spawner uses `t` at the start of the tick. The weights are those of the last row with `row.t <= t`. Each spawn draws, from `game.rng`, its type from the weights, then its tier from the row's tier weights (§8.6) **only when the row has tier weights**, then its angle. A row without tier weights spawns tier 1 and draws no tier, so a timeline without tier weights draws exactly as it would without tiers; a row whose tier weights are all 0 draws one and spawns tier 1. A draw picks the first entry (types in column order, tiers 1 to 4) whose weight exceeds what is left of `rng × total weight`. The camera centre is the dragon's position.

| Time | Rate (enemies/s) | Knight | Skeleton | Slime | Mage | Ghost knight | Mounted knight | Plain | Bronze | Silver | Gold | Stampede |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0:00 | 0.3 | 100 | 0 | 0 | 0 | 0 | 0 | – | – | – | – | – |
| 0:30 | 0.5 | 70 | 30 | 0 | 0 | 0 | 0 | – | – | – | – | – |
| 1:00 | 0.6 | 45 | 30 | 25 | 0 | 0 | 0 | – | – | – | – | every 20 s, 5–6 |
| 2:00 | 2.5 | 40 | 25 | 20 | 15 | 0 | 0 | – | – | – | – | every 30 s, 5–7 |
| 2:30 | 6.25 | 39 | 25 | 20 | 15 | 0 | 1 | 90 | 10 | 0 | 0 | every 30 s, 5–7 |
| 3:00 | 10 | 28 | 23 | 17 | 10 | 20 | 2 | 70 | 30 | 0 | 0 | every 30 s, 6–8 |
| 3:30 | 13 | 28 | 23 | 17 | 10 | 20 | 2 | 65 | 30 | 5 | 0 | every 30 s, 6–8 |
| 4:00 | 16 | 26 | 25 | 18 | 10 | 18 | 3 | 60 | 25 | 15 | 0 | every 15 s, 8–12 |
| 5:00 | 18 + golem | 26 | 25 | 18 | 10 | 18 | 3 | 55 | 25 | 15 | 5 | every 15 s, 8–12 |

*unmeasured*. Plain, Bronze, Silver and Gold are the tier weights; `–` means the row has none. Stampede is the row's horse stampedes (§8.8): one every so many seconds, each of that many horses; `–` means none. Horses are not in the type weights: they come only in stampedes. Each stage's lead threat (§9.1) peaks in its own rows, the share of every type kept near the run's earlier mix so the stages change the threat more than the difficulty: slimes and the first stampedes in Ooze, mages in Arcana, ghost knights and bronze in Haunt, mounted knights, silver tiers and the biggest stampedes in Siege. Mounted knights are an elite, one to three in a hundred spawns: at a higher share they ended most bot runs at 2:30–3:00, and slime shares above about 30 at 1:00 ended many in Ooze. The 2:30 and 3:30 rows sit inside a stage: their rates are the ones interpolated between their neighbours, so the rate curve is the same as without them; 2:30 starts tiers and brings mounted knights, 3:30 changes only the tiers. With this table the stampedes come at 1:00, 1:20, 1:40, 2:00, 2:30, 3:00, 3:30, 4:00, then every 15 s. At 5:00 the mega golem spawns on the ring on the far side of the tower from the dragon and `ohno` plays: in the clock step of the first tick where `t >= 300` (the `t` of the timeline row marked `golem`; a timeline without such a row has no golem), once per run, at `dragon + 560 px × normalize(tower − dragon)`, or straight below the dragon if dragon and tower coincide. It ignores the cap. The timeline keeps running after 5:00 (rate stays at 18) until the tower falls.

### 9.1 Stages

The 5:00 run is five stages, each led by a threat that wants a different answer. A stage starts at a timeline row that names it (`stage` in `content.js`); stages are numbered from 1 in table order, and a banner shows at each start (§17). The golem at 5:00 is not a stage: it arrives with its own sound.

| Stage | Starts | Lead threat | Wants |
|---|---|---|---|
| 1 Muster | 0:00 | knights, skeletons | anything; physical shreds skeletons |
| 2 Ooze | 1:00 | slimes, the first horse stampedes | fire AOE, zoning |
| 3 Arcana | 2:00 | mages and their summons; mounted knights from 2:30 | single target, dodging, arcane against plate |
| 4 Haunt | 3:00 | ghost knights, then their ghosts; bronze tiers | arcane |
| 5 Siege | 4:00 | everything mixed, mounted knights, silver tiers, big stampedes | the build |

*unmeasured*. Stages are a label on the timeline: they change nothing in the sim beyond the rows' own weights, tiers and stampedes.

---

## 10. Weapons

The player has up to **4 weapon slots**. Each weapon has levels 1–5, except an evolution, which has one (§10.7); a weapon's top level is its number of levels. Weapons fire automatically on cooldown; there is no fire button. Stat buffs (§11) multiply the base values below.

`cooldown` is in seconds, `damage` is per hit, before resistances. Every weapon has a damage type (`type` in its `content.js` entry, §12.1): Fireball, Mini tower and Ring are fire, Laser is arcane, the claws, the bite and the saw blade are physical. Every weapon also has a `knock` (§8.7), the px one of its hits pushes an enemy of mass 1 before Force:

| Weapon | Knock px |
|---|---|
| Fireball | 4 |
| Laser | 2 |
| Mini tower (its shots) | 4 |
| Ring | 8 |
| Left claw | 14 |
| Right claw | 22 |
| Dual claw | 22 |
| Bite | 30 |
| Saw blade | 6 |

*unmeasured*. Explosions knock `EXPLODE_KNOCK` (§8.7). Projectiles live until they hit (unless they win a pierce roll, §12) or have travelled `range` px.

A weapon fires on the first weapons step after it is gained, then every `cooldown` (0.9 s = 54 ticks). Aimed weapons fire on cooldown whether or not there are enemies. Projectiles start at the dragon's position. In the collisions step a projectile hits the nearest live enemy it overlaps and has not hit before (ties to the lower id), at most one enemy per tick. No hit spawns an effect, from any weapon: explosions appear only from the Explode proc (§12).

### 10.1 Fireball (starting weapon, aimed, fires from the dragon)
Fires `count` fireballs in the aim direction in a fan of `spread` degrees. `spread` is the whole width of the fan: the shots are evenly spaced from −spread/2 to +spread/2 around the aim (3 shots at 20° go at −10°, 0°, +10°).

Amount (§11) adds shots and widens the fan by one step per shot: with `n = count + amount` shots the step is the level's own, `spread / (count − 1)`, or `spreadStep = 10°` (*unmeasured*) at a level that fires one, and the fan is `step × (n − 1)` wide, evenly spaced as above. Level 1 with Amount 2 fires 3 shots at −10°, 0°, +10°; level 3 with Amount 1 fires 3 at −15°, 0°, +15°.

| Level | cooldown | damage | count | spread | speed | range |
|---|---|---|---|---|---|---|
| 1 | 0.9 | 2 | 1 | 0 | 420 | 420 |
| 2 | 0.8 | 2 | 1 | 0 | 420 | 420 |
| 3 | 0.8 | 3 | 2 | 15 | 420 | 450 |
| 4 | 0.7 | 3 | 2 | 15 | 460 | 480 |
| 5 | 0.6 | 4 | 3 | 20 | 460 | 520 |

Sprite `fireball.anim`, `fireball.big` from level 4. Radius 6 px (8 when big). Sound `shoot01`.

### 10.2 Laser (aimed, fires from the dragon)
Fast, long range, lower damage. A laser stops at its first hit like a fireball; only the Pierce buff lets it fly on (§11).

| Level | cooldown | damage | count | speed | range |
|---|---|---|---|---|---|
| 1 | 1.4 | 1 | 1 | 700 | 600 |
| 2 | 1.3 | 1 | 1 | 700 | 600 |
| 3 | 1.2 | 2 | 1 | 750 | 650 |
| 4 | 1.1 | 2 | 2 | 750 | 650 |
| 5 | 1.0 | 3 | 2 | 800 | 700 |

`laser.dir` and `laser.bigdir` have 16 frames indexed counter-clockwise on screen starting from up: 0 = up, 4 = left, 8 = down, 12 = right. A laser's `dirFrame`, with `a = Math.atan2(dy, dx)` in screen coordinates (y down), is `(Math.round(-a / (2 * Math.PI) * 16) + 12 + 16) % 16`.

Sprite `laser.dir`, `laser.bigdir` from level 4. Radius 6 px (8 with `laser.bigdir`) *unmeasured*. Sound `laser01`.

There is no fan: the `n = count + amount` lasers (Amount, §11) fly parallel along the aim, 12 px apart perpendicular to it and centred on the dragon (*unmeasured*): laser `i` (from 0) starts at `dragon + 6 × (n − 1 − 2i) × (−aimY, aimX)`, so one laser starts at the dragon and two at ±6 px, the first at `dragon + 6 × (−aimY, aimX)`. Projectile kind `laser`. A laser rolls Pierce from its first level and Explode only at Explode L3; it never splits (§12).

### 10.3 Mini tower (auto-targeting, fires from the tower)
Every `cooldown` seconds the tower lobs a mini tower that lands 80 px toward the nearest enemy (random direction if none). A mini tower is a stationary turret alive for `duration` seconds that shoots a copy of the dragon's fireball at the nearest enemy within 300 px every `fireRate` seconds: the mini tower is an extension of the fireball, not a gun of its own. At most `maxActive` + Amount (§11) mini towers exist; the oldest is removed when exceeded. Duration (§11) lengthens their life.

| Level | cooldown | duration | fireRate | maxActive |
|---|---|---|---|---|
| 1 | 6 | 8 | 0.8 | 1 |
| 2 | 6 | 10 | 0.7 | 2 |
| 3 | 5 | 10 | 0.6 | 2 |
| 4 | 5 | 12 | 0.5 | 3 |
| 5 | 4 | 14 | 0.4 | 4 |

Sprite `castle` at 1× (30 px, half the real tower). The lob is a 0.5 s arc drawn as the sprite rising and falling 30 px. Mini towers cannot be damaged.

Precisely, in the weapons step:

- **Lob.** The weapon's `timer` works like the fireball's: a lob on the first weapons step after the weapon is gained, then every `cooldown` (× Haste). The direction is toward the live enemy whose centre is nearest the tower's (ties: lower id), `(0, 1)` if that enemy is at the tower's centre; with no enemies it is a random angle, one `game.rng()` draw × 2π. The mini tower lands at `tower + 80 × direction` and is added to `game.miniTowers` with `lobTicks` 30 and `life` = `duration` × Duration (§11) in ticks, rounded; if that would make more than `maxActive` + Amount, the oldest ones are removed first. The lob and the shots play no sound.
- **Mini towers** then step in list order, the one just lobbed included. In flight one only counts `lobTicks` down; the step that reaches 0 is its landing, so it is in the air for 30 steps. From the next step on it shoots, then counts `life` down and is removed when `life` reaches 0, so it stands for exactly `duration` seconds after landing.
- **Shots.** When its `timer` is 0 a landed mini tower fires at the live enemy whose centre is nearest its own and at most 300 px away (ties: lower id), found through the grid; with no such enemy it waits, `timer` stays 0 and it fires on the first step one is in range. A shot is one projectile of kind `fireball`, built exactly like one of the dragon's fireballs at the Fireball weapon's current level (§10.1) with the current buffs: that level's damage (× Might, rounded up), speed and range (both × Velocity), radius 6, or 8 from level 4 (× Area), the mini tower's knock (× Force), and sprite `fireball.anim`, or `fireball.big` from level 4. It is aimed at the target's centre (`(0, 1)` if they coincide) and starts at the mini tower. The fireball's `count` and `spread` do not apply: each shot is a single projectile. It plays no sound. Being a fireball, it has the fireball's procs (§12). The fireball is the starting weapon and cannot be lost, so its level always exists; a game built without it (only a test can make one) reads level 1. The next shot is `fireRate` × Haste later. Upgrading the mini tower changes later lobs and shots, upgrading the fireball changes later shots; mini towers already standing keep their `life`.
- Before the mini towers step, the grid is rebuilt when any of them has landed, because the enemies step's grid was built before its despawn pass.

### 10.4 Ring (not aimed, orbits the dragon)
`count` + Amount (§11) fireballs orbit the dragon at radius `orbit` px with angular speed `spin` degrees/s, evenly spaced. Each enemy can be hit by the ring at most once every `rehit` seconds. Ring damage does not trigger procs.

| Level | count | orbit | spin | damage | rehit |
|---|---|---|---|---|---|
| 1 | 2 | 60 | 180 | 2 | 0.5 |
| 2 | 3 | 60 | 180 | 2 | 0.5 |
| 3 | 3 | 70 | 220 | 3 | 0.4 |
| 4 | 4 | 70 | 220 | 3 | 0.4 |
| 5 | 5 | 80 | 260 | 4 | 0.3 |

Sprite `fireball.anim`, radius 6 px.

Precisely: in the weapons step the ring turns by `spin × DT` degrees (its `angle` starts at 0 and wraps at 2π) and places its `n = count + amount` fireballs at `dragon + orbit × area × (cos, sin)(angle + i × 2π / n)`, after the dragon has moved, in `balls`. In the collisions step, after the projectiles, every ball hits every live enemy whose circle overlaps its own (radius 6, not scaled by area) and whose `rehit` entry is absent or not after the current `tickCount`; a hit deals `damage` (× Might, rounded up) as fire damage with the ring's knock × Force through the damage function (§12.1), which pushes the enemy away from the ball (§8.7; the golem's poise instead, §8.10), and sets the entry to `tickCount + rehit` in ticks; it spawns no effect. Balls are checked in order and enemies in grid order, so two balls over one enemy hit it once. Expired entries are dropped in the weapons step, so ids of dead enemies do not pile up. The ring takes Might, Area, Amount and Force only: Haste and Velocity do not change `rehit` or `spin`. It rolls no procs and draws no random numbers.

### 10.5 Left claw (not aimed, slashes from the dragon)
Every `cooldown` the dragon slashes a rectangle `width × height` px on the side it faces (§6.3): from the dragon's centre, `width` px sideways, `height` px tall centred on the dragon. It hits every live enemy overlapping it once. With `sides` 2 it also slashes the other side 0.15 s later (`sideDelay`). Like the VS whip: close-range area, physical, high knock.

| Level | cooldown | damage | width | height | sides |
|---|---|---|---|---|---|
| 1 | 1.3 | 2 | 110 | 36 | 1 |
| 2 | 1.2 | 3 | 115 | 38 | 1 |
| 3 | 1.1 | 3 | 125 | 40 | 2 |
| 4 | 1.0 | 4 | 130 | 42 | 2 |
| 5 | 0.9 | 5 | 140 | 44 | 2 |

*unmeasured*. Sprite `claw.swipe` (§5). Sound `screech`. Might, Haste, Area (both sides of the rectangle), Force and Amount apply; Velocity and Duration do not; no procs (§12).

Claw slashes, precisely (all three claws):

- **Volley.** In the weapons step, on the cooldown pattern of §10 (Haste applies), the claw queues its slashes in `game.slashes`: first the rectangles, one per side (the facing side, `side` −1 when `dragon.flip` and 1 otherwise, then with `sides` 2 the other side at `sideDelay`), each side repeated once per point of Amount (§11), `repeatDelay = 0.1 s` apart; then the cone (§10.6). A slash's `delay` is its time after the volley in ticks, `round(seconds / DT)` (the other side 9 ticks, Amount's repeats 6, 12, 18 ticks after their side). Its damage (× Might, rounded up), knock (× Force), size (× Area) and side, and a cone's direction and `maxTargets`, are read when it is queued: a dragon that turns does not move a queued slash to the other side.
- **Delay.** At the start of every weapons step, before any weapon fires, each slash not yet struck with `delay` above 0 counts it down by one, so a slash queued with delay 0 strikes on the same tick and one with delay 9 nine ticks later.
- **Strike.** In the collisions step, after the ring, each slash not yet struck whose `delay` is 0 strikes, in list order, from the dragon's centre at that moment: it is marked `struck` with that point in `x, y`; each of its targets takes its damage as physical damage through the damage function (§12.1) with its knock and `source` the dragon's centre, so knockback pushes straight away from the dragon (§8.7), and its id goes in `hits`; then every brazier it overlaps breaks (§14.2); sound `screech` plays. A rectangle's targets are the live enemies whose circle overlaps it (the rectangle's nearest point is closer than `r`), in grid order (query at the rectangle's centre, radius half its longer side plus the largest radius, §15). The golem is hit like any enemy; the knock builds its poise (§8.10). A slash draws no random numbers.
- **Effect.** A struck slash plays its anim (3, 4, 5 ticks) in the effects step and is removed on the tick it finishes. A queued slash outlives its weapon: slashes queued before an evolution still strike.

### 10.6 Right claw (aimed, slashes from the dragon)
Every `cooldown` the dragon slashes a cone `angle` degrees wide and `reach` px long in the fire direction (§6.2), apex at its centre, and hits the `maxTargets` nearest live enemies in it: single target, short range, heavy damage, very high knock.

| Level | cooldown | damage | angle | reach | maxTargets |
|---|---|---|---|---|---|
| 1 | 1.1 | 4 | 60 | 80 | 1 |
| 2 | 1.0 | 5 | 60 | 85 | 1 |
| 3 | 0.9 | 6 | 65 | 90 | 2 |
| 4 | 0.8 | 8 | 70 | 95 | 2 |
| 5 | 0.7 | 9 | 75 | 100 | 3 |

*unmeasured*. Sprite `claw.cone` in 16 directions (§5). Sound `screech`. Might, Haste, Area (the reach, not the angle), Force and Amount (+1 `maxTargets` per point) apply; no procs.

Precisely: one cone slash per volley with delay 0, struck as in §10.5. An enemy is in the cone when its circle overlaps the sector: the apex is inside the circle, or its centre is closer than `reach + r` to the apex and within `angle / 2` of the direction, or the circle crosses one of the sector's two straight edges. The targets are the `maxTargets` such live enemies nearest the apex by centre distance, ties to the lower id, hit nearest first (query at the apex, radius `reach` plus the largest radius). With no enemy in the cone the slash still strikes (and still breaks braziers); the cooldown never waits.

### 10.7 Dual claw (evolution) and evolutions
The evolution of the two claws. Every `cooldown` it slashes both sides at once with the left claw's rectangle (`sides` 2, `sideDelay` 0) and the right claw's cone, all with the right claw's damage and knock.

| Level | cooldown | damage | width | height | sides | angle | reach | maxTargets |
|---|---|---|---|---|---|---|---|---|
| 1 | 0.7 | 9 | 140 | 44 | 2 | 75 | 100 | 3 |

*unmeasured*. One level only: it is gained at its top level. Sprites `claw.swipe` and `claw.cone`, sound `screech`, knock 22. The buffs apply as to the claws it joins: Amount repeats both rectangles 0.1 s apart and adds to `maxTargets`. Its slashes strike as in §10.5–10.6.

**Evolutions** are data: `EVOLUTIONS` in `content.js`, a list of `{ result, requires: [a, b] }`; today one entry, `{ result: 'dualClaw', requires: ['leftClaw', 'rightClaw'] }`.

- **Offer.** While the result is not owned and every weapon it requires is owned at its top level, the level-up pool holds its evolution card (§14.1). It needs no free slot.
- **Pick.** The required weapons leave `game.weapons` and the result takes the slot of the first of them (in slot order) at its top level, so a slot frees up. It fires on the next weapons step.
- An evolution result is never offered as a new weapon or an upgrade; it is gained only by evolving (or the debug grant, §19). While it is owned, the weapons it was made from are not offered either, so the freed slot takes another weapon.

### 10.8 Bite (not aimed, bites from the dragon)
Every `cooldown` the dragon bites the nearest live enemy within `reach`: one heavy hit, doubled against an enemy below 30% of its max HP (an execute), with a big knock. Single target, physical. With no enemy in reach there is no bite, and the cooldown waits.

| Level | cooldown | damage | reach |
|---|---|---|---|
| 1 | 1.6 | 8 | 50 |
| 2 | 1.5 | 10 | 54 |
| 3 | 1.3 | 13 | 57 |
| 4 | 1.2 | 15 | 60 |
| 5 | 1.0 | 18 | 64 |

*unmeasured*, as are `execute = 0.3` and `executeMult = 2`. Sprite `bite.jaws` on the target. Sound `megaslime_hit`. Might, Haste, Area (the reach), Force and Amount (+1 target per point) apply; Velocity and Duration do not; no procs (§12).

Precisely:

- **Cooldown.** In the weapons step the bite's `timer` counts down by `DT` while it is above 0; it never fires there. A new bite has `timer` 0.
- **Bite.** In the collisions step, after the claw slashes, a bite whose `timer` is 0 looks for its targets around the dragon's centre: the live enemies whose circle overlaps the reach circle (centre distance below `reach` × Area + `r`), the `1 + Amount` nearest by centre distance, ties to the lower id (grid query at the dragon, radius the reach plus the largest radius, §15). With none, nothing happens and the `timer` stays at 0, so it bites on the first tick an enemy is in reach. Otherwise, nearest first, each target: a `bite.jaws` effect at its position (mirrored when it is left of the dragon's centre), then its damage (× Might, rounded up), × `executeMult` when its `hp` is below `execute × maxHp` before this hit (an enemy at exactly 30% is not executed), as physical damage through the damage function (§12.1) with the bite's knock × Force and `source` the dragon's centre, so it is pushed straight away from the dragon (§8.7). Then every brazier the reach circle overlaps breaks (§14.2), sound `megaslime_hit` plays and `timer` grows by `cooldown` × Haste, so a bite that never waits keeps the period of §10. The golem is bitten like any enemy (it is never executed: it takes nothing, §12.1); the knock builds its poise (§8.10). A bite draws no random numbers.

### 10.9 Saw blade (fires from the tower along the tower → dragon line)
Every `cooldown` the tower launches `count` saw blades along the line from the tower **through the dragon**, so where the dragon stands relative to the tower aims it. A blade flies out `range` px at `speed`, spins in place for `dwell` s, then flies back to the tower and is gone. It hits every enemy it overlaps, each at most once per `rehit = 0.4 s` per blade, and never stops on a hit: a positional zoning weapon, physical.

| Level | cooldown | damage | count | r | range | speed | dwell |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 2 | 1 | 10 | 260 | 260 | 0.6 |
| 2 | 2.75 | 3 | 1 | 11 | 275 | 260 | 0.75 |
| 3 | 2.5 | 3 | 1 | 12 | 290 | 260 | 0.9 |
| 4 | 2.25 | 4 | 2 | 13 | 305 | 260 | 1.05 |
| 5 | 2 | 5 | 2 | 14 | 320 | 260 | 1.2 |

*unmeasured*, as are `rehit` and `fanStep = 12°`. Sprite `saw.spin`, no sound. Might, Haste, Area (`r`), Velocity (speed and range), Duration (`dwell`), Force and Amount (+1 blade per point) apply; no procs (§12).

Precisely:

- **Volley.** In the weapons step, on the cooldown pattern of §10 (Haste applies), the tower launches `n = count + Amount` blades from its centre (after the tether step has moved it). The launch direction is the unit vector from the tower's centre to the dragon's, or the dragon's aim (§6.2) when they coincide. With `n` above 1 the blades fan out `fanStep` degrees apart, evenly around that direction (2 blades at ±6°, 3 at −12°, 0°, +12°). Each blade's damage (× Might, rounded up), knock (× Force), `r` (× Area), speed and range (× Velocity) and `dwell` (× Duration, in ticks, rounded) are read at the launch.
- **Flight,** in step 7 after the projectiles: a blade `out` moves `speed × DT` along its direction, never past `range` (the last step is shortened); on the step its travel reaches `range` it starts to `dwell`. Dwelling, it stays put and counts `dwell` down, one per step; on the step it reaches 0 it turns `back`. Coming back, it moves `speed × DT` straight at the tower's current centre (the tower may have moved since the launch), and on the step that distance is at most `speed × DT` it is removed instead. Its anim loops every step; its expired `rehit` entries are dropped.
- **Hits,** in step 8 after the bite: every blade, in list order, hits every live enemy whose circle overlaps its own and whose `rehit` entry is absent or not after the current `tickCount` (grid query at the blade, radius `r` plus the largest radius), in grid order: its damage as physical damage through the damage function (§12.1) with its knock and `source` the blade's position, pushing the enemy away from the blade (§8.7), and the entry set to `tickCount + rehit` in ticks. Two blades over one enemy both hit it. A blade breaks the braziers its circle overlaps in step 8's brazier pass (§14.2). The golem is hit like any enemy; the knock builds its poise (§8.10). A blade draws no random numbers and spawns no effect.

---

## 11. Buffs

Up to **4 buff slots**, levels 1–3. Seven generic buffs reach every weapon where their stat exists; three chance buffs are rolled per projectile hit, by the projectile's damage type (§12).

| Buff | Icon | L1 | L2 | L3 | Applies to |
|---|---|---|---|---|---|
| Might | `icon.might` | +20% | +40% | +60% | all damage, rounded up |
| Haste | `icon.haste` | −10% | −20% | −30% | every weapon cooldown and the mini tower's fireRate |
| Area | `icon.nuke` | +20% | +40% | +60% | projectile radius, explosion radius, ring orbit, claw rectangles and cone reach, bite reach, saw blade radius |
| Velocity | `icon.speed` | +20% | +40% | +60% | projectile speed and range, saw blade speed and range |
| Duration | `icon.duration` | +25% | +50% | +75% | mini-tower life, pickup life (§14.2), saw blade dwell |
| Force | `icon.force` | +50% | +100% | +150% | the knock of every hit (§8.7) |
| Amount | `icon.amount` | +1 | +2 | +3 | fireballs and lasers per volley, ring fireballs, mini towers' maxActive, claw rectangles per side and cone targets, bite targets, saw blades per volley |
| Explode | `icon.explode` | 20% | 35% | 50% | fire projectiles; at L3 also arcane (lasers explode) |
| Split | `icon.split` | 20% | 35% | 50% | fire projectiles |
| Pierce | `icon.laser` | 20% | 35% | 50% | arcane projectiles; at L3 also fire (fireballs pierce) |

*unmeasured*.

Buff maths, with `m, h, a, v, u, f, n` the current Might, Haste (negative), Area, Velocity, Duration, Force and Amount values (0 when not owned):

- damage = `ceil(base × (1 + m))` for every weapon, the ring included (2 at +20% is 3);
- every weapon cooldown and the mini tower's `fireRate` × `(1 + h)`;
- projectile radius (fireball, laser, mini-tower shot), explosion radius, ring orbit, a claw rectangle's width and height, a claw cone's reach (not the cone's angle), the bite's reach and a saw blade's `r` × `(1 + a)`;
- projectile speed and range, and a saw blade's speed and range, × `(1 + v)`;
- mini-tower life, the life of a pickup when it drops (§14.2) and a saw blade's `dwell` × `(1 + u)`;
- every knock × `(1 + f)` (§8.7);
- `n` more fireballs per fireball volley (§10.1), lasers per laser volley (§10.2), ring fireballs (§10.4) and mini towers standing at once (§10.3); `n` more rectangles per side of a claw volley, 0.1 s apart, and `n` more claw cone targets (§10.5–10.7); `n` more bite targets (§10.8) and saw blades per volley (§10.9). A mini tower's shots stay single.

Stats are read when a projectile is fired, a mini tower lobbed, a claw slash queued, a bite made or a saw blade launched, so a buff gained later does not change projectiles already in flight. Buffs live in `game.buffs` in the order gained, which is also their HUD order.

---

## 12. Procs

Resolved in `projectiles.js` when a projectile hits an enemy, in this order: damage (with its knockback, §8.7), explode roll, split roll, pierce roll. Explosions and piercing are earned: without the Explode buff nothing explodes, and without the Pierce buff every projectile stops at its first hit.

**Affinity.** A chance buff applies to a projectile by the projectile's damage type (§12.1), from the buff level shown:

| Buff | fire | arcane |
|---|---|---|
| Explode | L1 | L3 |
| Split | L1 | never |
| Pierce | L3 | L1 |

So fireballs and mini-tower shots explode and split from L1 and pierce only at Pierce L3; lasers pierce from L1, explode only at Explode L3 and never split. Physical damage has no procs: the claws, the bite and the saw blade (§10.5–10.9) roll nothing and draw no random numbers.

- **Explode:** spawn an explosion at the hit point with radius `60 px × area`, damage equal to the projectile's damage, hitting every enemy in the circle once (the enemy already hit is excluded). Sprite `explosion.big` (fire) or `explosion.laser` (arcane) scaled to the radius. Explosions do not chain; an explosion is not a projectile. Sound `explosion01`.
- **Split:** spawn 2 fireballs from the hit point at ±45° from the projectile's direction, same damage, `gen + 1`. Projectiles with `gen >= 2` cannot split. Split children can still explode and pierce.
- **Pierce:** the projectile keeps flying and ignores the enemy it just hit. A projectile remembers the ids it has hit (small array, max 8).
- **Golem:** immune to all procs. Hits still build its poise (§8.10).
- **Merchant:** proc-immune too (§14.3): a projectile that hits him rolls nothing and is used up.

Precisely:

- **Rolls.** Each roll is `game.rng() < chance`, in the order explode, split, pierce, after the damage and the hit memory. A roll happens only when its chance buff is owned at a level that reaches the projectile's damage type in the affinity table, so a game without chance buffs, or with only buffs that do not reach that type, draws no extra numbers. A projectile with `gen >= 2` does not roll split. Against a proc-immune enemy (the golem) nothing is rolled at all, and any projectile that hits it is used up.
- **Explode.** The circle has radius `60 × area` around the projectile's position at the hit. Every live enemy whose circle overlaps it, except the one just hit, takes the projectile's damage, of the projectile's type, once (§12.1), and is pushed `EXPLODE_KNOCK × (1 + force)` (by its mass) away from the centre (§8.7); proc-immune enemies are not affected at all (no damage, no knockback). The effect is `explosion.big` with `scale = 2 × radius / (2 × 57 px)` for a fire explosion, or `explosion.laser` with `scale = 2 × radius / (2 × 45 px)` for an arcane one, the source width, so the sprite's diameter matches the circle. Explosion kills are ordinary kills in the deaths step.
- **Split.** The two children are `fireball` projectiles leaving the hit point at −45° then +45° from the parent's direction, with the parent's damage, knock, damage type, radius, speed and sprite, range = the parent's range minus the distance it has travelled, `gen + 1`, and the enemy just hit already in their `hits`. They join the projectile list at once but first move and collide on the next tick. The parent is removed unless it also pierces.
- **Pierce.** A projectile that wins the roll stays in the list and hits its next enemy on a later tick; one that loses it is removed. The roll is made again on every hit.

### 12.1 Damage types and resistances

Every hit on an enemy has a damage type: **fire**, **arcane** or **physical** (`DAMAGE_TYPES` in `content.js`). The type is data: each weapon has a `type`, each projectile carries one (`type`, given when it is fired; by default its kind's, `fireball` fire and `laser` arcane), and an explosion or a split child has its projectile's type.

| Source | Type |
|---|---|
| Fireball, mini-tower shots, ring, and their explosions | fire |
| Laser and its explosions (Explode L3) | arcane |
| Bomb pickup (§14.2) | fire |
| Left claw, right claw, dual claw, bite, saw blade | physical |

Each enemy type has a resistance `r` per damage type, in `[−0.5, 1]` (§8 table): `r < 0` is a weakness, `r > 0` a resistance, `r = 1` immunity.

**The damage function.** Every hit on an enemy, from every weapon, goes through one function, `dealDamage(game, enemy, amount, type, source, knock)` in `damage.js`: projectile hits (§10, §12), explosions (§12), the ring (§10.4), claw slashes (§10.5–10.7), the bite (§10.8) and saw blades (§10.9) today, and every later weapon. The player's hits on the merchant go through it too (§14.3), with his resistances and mass in place of an enemy type's. `amount` is the hit's damage after Might (§11) (and the bite's execute), `type` its damage type, `source` the hitter's position (the projectile, the ring fireball, the explosion centre, the dragon's centre for a claw or the bite, the blade for a saw blade), `knock` the hit's knock after Force (§8.7; 0 when left out). It:

1. against an unkillable enemy (the golem) deals nothing: its HP stays `GOLEM_HP`, `hit_golem` plays, and `knock` goes to its poise (§8.10), never a push; returns 0. Damage types do not affect the golem.
2. otherwise takes the effective resistance `r' = max(−0.5, r − shred[type])` and deals `0` when `r' ≥ 1`, else `max(1, ceil(amount × power[type] × (1 − r')))`, with `power` and `shred` from `game.meta` (§4.1; 1 and 0 without an armoury). Rounding up comes after every multiplier, so any hit that is not immune does at least 1.
3. takes that off the enemy's HP; if the enemy's HP is still above 0, pushes it `knock / mass` px straight away from `source` (§8.7); returns the damage (not capped at the HP the enemy had left). The enemy dies in the deaths step as before (§8), when its HP is 0 or below.

Might is rounded up when a projectile is fired or the ring hits (§11), then the damage function rounds again: a level-1 fireball (2) deals 3 to a slime (fire −0.5) and 2 to a ghost (fire 0.25: `ceil(1.5)`); a level-1 laser (1) deals 1 to a mage (arcane 0.5: `ceil(0.5)`) and 2 to a ghost (arcane −0.5). The damage function draws no random numbers. Mage orbs hit the dragon and the tower, not an enemy, and do not use it.

**Armoury.** `game.meta` (§4.1) holds the out-of-game upgrades per damage type: `power[type]` multiplies all damage of that type, `shred[type]` lowers every enemy's resistance to it, never below −0.5. Both are neutral (1 and 0) unless the `Game` is built with `meta`; the browser builds every `Game` with the meta of the armoury's ranks (§13.1).

---

## 13. Boss and run end

- At 5:00 the mega golem spawns (§9). It walks at the tower at 75 px/s (faster than any other enemy and than the following tower, slower than the dragon, so only a tower dragged on the tether outruns it) and deals 40 DPS on contact. It cannot die and is never despawned. A hit never pushes it, but hits build its poise, and enough of them soon enough stagger it: pushed 40 px away from the dragon and stopped for half a second, so Force and heavy hitters hold it back. On contact it also shoves the tower 30 px away once a second. Without a build that staggers it, the tower falls within seconds of its arrival unless the dragon drags it away. Its arrival, its footsteps near the dragon and its staggers shake the screen (§5.1). Hit sound `hit_golem`. Details in §8.4 and §8.10.
- The run ends when tower HP reaches 0. Play `castle.destroy` and `destroy_castle_sound`, freeze the sim for 2 s, then show the game-over screen: time survived, level reached, kills, and a **Retry** button (new seed).
- Score is `seconds survived + kills`, with seconds survived = `floor(t)` at the tick the tower fell. There is no win condition in the demo; surviving past 5:00 is the goal and the golem is what stops you.

**Screens** are the loop's business (`app.js`), drawn over the world:

- **Title:** shown at page load over a fresh, unticked game: the name, one line of goal, the controls, the purse's gold, a Start button and below it an Armoury button. U, gamepad Y or a click on the Armoury button opens the armoury (§13.1); any other click on the canvas, Enter or gamepad A starts the run. Start resumes the audio context and plays `start_game`.
- **Pause:** Esc, P or gamepad Start toggles it during a run (`'play'` or `'dying'`). It shows "Paused" and the controls; ticks stop. Window blur and a hidden tab also pause. Pause is ignored on the title and game-over screens.
- **Bestiary:** Tab or gamepad Back opens the enemy stats panel during a run, from play or from pause; ticks stop (§17.1).
- **Game over:** shown while the phase is `'over'`: time survived (`m:ss`), level reached, kills, score, the gold the run earned and the purse after it (`Gold   +N  (M in purse)`, §13.1), and a Retry button. A click anywhere on the canvas, Enter or gamepad A retries. Retry builds a new `Game` with a new random seed, or the same seed when the page has `?seed=N`, and the armoury's current ranks, skips the title and plays `start_game`.
- Without `?seed`, the seed is a random 32-bit integer from the browser (`Math.random` is allowed outside `src/sim/`).

### 13.1 Gold and the armoury

Out-of-game upgrades, bought between runs with gold. All numbers *unmeasured*.

- **Gold.** When a run's phase becomes `'over'`, the browser pays `floor(score / 20)` gold into the purse, once per run, and saves it. A run abandoned by closing the page pays nothing.
- **Tracks.** For each damage type (fire, arcane, physical, §12.1) two tracks of 5 ranks: **Power**, +8% damage of that type per rank, and **Shred**, −0.1 off every enemy's resistance to that type per rank (shown as `-10%`; a resistance never goes below −0.5, §12.1). Rank `n` costs `20 × n²` gold (20, 80, 180, 320, 500; 1100 for a whole track).
- **Into the run.** Ranks map to the sim's `meta` (§4.1): `power[type] = 1 + 0.08 × Power rank`, `shred[type] = 0.1 × Shred rank`. Every `Game` the page builds, the unticked title game, every run and every Retry, with or without `?seed`, gets the meta of the ranks owned when it is built; it is part of the setup and the snapshot, so a run is still determined by its seed, its meta and its intents. Leaving the armoury with changed ranks rebuilds the title game with the same seed. The sim never reads storage.
- **Screen** (`render/armoury.js`, 960×600 over the 60% black overlay, opened from the title only, ticks stopped): the title `ARMOURY` (32 px) centred at y 24 and `Gold N` at y 66; six cells of 290×150 px in a centred 3×2 grid from y 100 with 16 px gaps, Power on the first row and Shred on the second, columns fire, arcane, physical. A cell shows `<Type> <Track>` in the type's colour and `r/5`, five rank pips (yellow owned, dark not), what one rank does in one line (`+8% fire damage per rank`, `-10% enemy fire resist per rank`), what the owned ranks do (`Now +16% damage`, `Now -20% resist`, `Now none` at rank 0), and `Next rank: C gold` in green when affordable, red when not, or `Max rank` in gold. Below the grid at y 440 two 180×40 buttons with a 20 px gap, centred: **Reset** and **Back**; two hint lines at y 540 and 564. The selected item has a yellow frame.
- **Controls.** Move keys (WASD, arrows) or the d-pad move the selection one step per press: across and down the 3×2 grid, down from the first two columns to Reset and from the third to Back, left and right between Reset and Back, up from Reset to the first column and from Back to the third. Enter, gamepad A or a click on an item (which also selects it) activates the item: on a cell it buys the next rank when it is affordable and not at rank 5 (plays `powerup`; otherwise nothing happens); on Back it returns to the title. Esc, P, U, gamepad B, Y or Start return to the title too.
- **Reset** refunds every rank for what it cost and sets all ranks to 0, in two steps: the first activation arms it (the button reads `Confirm reset` and a line says how much it refunds), the second refunds (plays `pickup`). Moving the selection or buying disarms it. With no ranks owned it does not arm.
- **Storage.** The purse is saved in `localStorage` under the key `dragon-survivors.armoury.v1` as JSON `{ gold, ranks: { power: { fire, arcane, physical }, shred: { … } } }`, after every payout, purchase and reset, and read once at page load. Every read and write (and the access to `localStorage` itself) is wrapped in try/catch: unreadable, missing or malformed data gives an empty purse (0 gold, all ranks 0), gold is floored to a whole number, ranks are clamped to whole numbers in 0..5, and a failed write is ignored, so without storage the game plays with a purse that lasts until the page closes.

---

## 14. XP, gems, level-up

- Each enemy drops a gem worth its `XP` value times its tier's XP multiplier (§8.6) at its death position; a megaslime's gem is worth its `xp`, the sum of the gems of the slimes it fused (§8.9). Gems are static. A gem within `DRAGON_PICKUP_RADIUS` moves toward the dragon at 500 px/s and is collected on contact. Sound `pickup`. Gems never expire. `MAX_GEMS = 600`; when exceeded, the oldest gem's value is merged into the gem nearest to it.
- XP to next level: `xpToNext(level) = 3 + 3 × level` (level 1 needs 6, level 10 needs 33). *unmeasured*.
- On level-up the sim increments `game.pendingLevelUps`. The loop sees it and shows the level-up screen. Several pending level-ups are shown one after the other. A robbed merchant's chest adds a pending level-up without a level (§14.3).

Gems precisely:

- A gem is `{ id, x, y, value, homing }`, dropped in the deaths step before the death effect. Enemies worth no XP (the golem) drop nothing.
- When a drop would make more than `MAX_GEMS`, the oldest gem is removed and its value added to the remaining gem nearest to it (ties: lower id), the new one included. No XP is lost.
- In the gems step each gem whose centre is within `DRAGON_PICKUP_RADIUS` of the dragon starts homing and keeps homing until collected, even if the dragon walks away: it moves 500 px/s straight at the dragon (never past it). A gem whose centre is then within `GEM_COLLECT_RADIUS = 12` px (*unmeasured*) of the dragon is collected: its value is added to `xp`, it is removed, and sound `pickup` plays.
- After collecting, while `xp >= xpToNext(level)`: `xp` drops by that amount, `level` goes up by one and so does `pendingLevelUps`. The overflow carries over and several level-ups can queue in one tick. `level` is the level reached, so the HUD and the game-over screen already count queued level-ups.

Level-up flow, the only entry point being `tick(intent)`:

- Whenever `pendingLevelUps > 0`, `game.offers` holds the current cards, and `tick` does not advance the world: no step of §2.1 runs, `tickCount` is unchanged and `events` are still cleared.
- If `intent.reroll` is true and `game.rerolls` is above 0 (rerolls are bought from the merchant, §14.3), the offers are rolled again from the same build with `game.rng` (one draw per card, as below), `rerolls` drops by one, sound `powerup03` plays, and any `pick` in the same intent is not applied; the world does not advance. Without a reroll `intent.reroll` is ignored.
- Otherwise, if `intent.pick` is a valid index into `offers`, that card is applied, `pendingLevelUps` drops by one, sound `powerup` plays, and the next offers are rolled if level-ups remain (otherwise `offers` becomes empty). The tick that applies a pick does not advance the world either; it runs again on the next tick. Any other `pick` is ignored. So picks are part of the intent stream and a replay of the intents replays the run.
- Offers are rolled with `game.rng` when the first level-up is queued (end of the gems step) and after each pick, from the build at that moment; an empty roll ends the queue (§14.1). A pick sent on the tick that queues a level-up is not applied, since the offers did not exist when that tick began.
- If the tower falls on the tick a level-up is queued, the offers are dropped (`offers` empty, `pendingLevelUps` 0).
- The loop shows the level-up screen while the run is in `'play'` and `offers` is not empty, and keeps calling `tick` with the pick.

### 14.1 Card pool
Build the pool, then draw 3 distinct cards with weights:

| Card | Condition | Weight |
|---|---|---|
| New weapon X | X not owned, weapon slot free | 3 |
| Upgrade weapon X to L+1 | owned, L below its top level | 4 |
| Evolve into weapon E | E not owned, every weapon E requires owned at its top level (§10.7) | 10 |
| New buff Y | Y not owned, buff slot free | 3 |
| Upgrade buff Y to L+1 | owned, L < 3 | 3 |
| Repair tower +25 HP | while any other card is in the pool, or tower HP is below `REPAIR_OFFER_BELOW = 0.5` of max HP (*unmeasured*) | 1; it becomes the only card when the pool is otherwise empty |

A card shows the icon, name, level or NEW, and one line of effect text. Choose with mouse click, keys 1/2/3, or gamepad d-pad + A. Sound `powerup`.

Precisely:

- **Pool order** is fixed: the weapons in the order Fireball, Laser, Mini Tower, Ring, Left Claw, Right Claw, Bite, Saw Blade, then the evolutions in `EVOLUTIONS` order, then the buffs in the §11 table order, then Repair. A weapon or buff is either an upgrade (owned, below its cap), a new card (not owned, a slot free) or absent; an evolution result (Dual Claw) is never a weapon card, only an evolution card, and the weapons of an owned evolution are not offered again.
- **Drawing:** `min(3, pool size)` cards without replacement. Each card takes one `game.rng()`: `r = rng × total weight`, then the first card in pool order whose weight exceeds what is left of `r` (subtracting the weights passed). The chosen card leaves the pool before the next draw. Repair (weight 1) is in the pool whenever any other card is; once the build is full (every weapon slot and buff slot filled and at its cap) it is in the pool only while `hp < 0.5 × maxHp`, so a hurt full build is offered Repair alone and a healthy one is offered nothing.
- **Empty pool:** when the offers rolled for a pending level-up come out empty, no card is shown and every pending level-up passes at once (`pendingLevelUps` becomes 0, `offers` stays empty): the levels are still gained, no `rng` is drawn, no sound plays and the world keeps running. This happens when the first level-up is queued and after a pick (a Repair that lifts the tower to half HP or above ends the rest of the queue).
- **Card:** `{ kind: 'weapon' | 'evolve' | 'buff' | 'repair', id, level }`, `level` being the level after the pick (1 = new; an evolution card's `id` is its result and `level` the result's top level). A new weapon fires on the next weapons step; an upgrade keeps the weapon's timer and state. An evolution card evolves (§10.7). A new buff is appended to `game.buffs`. **Repair** restores 25 tower HP, capped at `maxHp`.
- **Names:** Fireball, Laser, Mini Tower, Ring, Left Claw, Right Claw, Dual Claw, Bite, Saw Blade; Might, Haste, Area, Velocity, Duration, Force, Amount, Explode, Split, Pierce; Repair.
- **Icons:** weapons as in §17, buffs as in §11, Repair the `castle` at 1×.
- **Tag:** `NEW` for level 1, `L<n>` for an upgrade, `EVOLVE` for an evolution, none for Repair.
- **Text:** a new weapon has a short description (Fireball "Aimed fireballs", Laser "Fast long-range aimed laser", Mini Tower "Lobs turrets that shoot your fireball", Ring "Fireballs orbit the dragon", Left Claw "Slashes the side you face", Right Claw "Aimed claw strikes the nearest foes", Bite "Bites the nearest foe; double on the weak", Saw Blade "Tower flings a saw blade past you and back"). A weapon upgrade lists the first three stats that change, in the order damage, count, sides, maxTargets, maxActive, duration, fireRate, cooldown, orbit, spin, rehit, spread, width, height, angle, reach, r, dwell, speed, range, labelled `dmg, count, sides, targets, max, life, rate, cd, orbit, spin, rehit, spread, width, height, angle, reach, size, dwell, speed, range`, as `dmg 1→2, cd 1.3→1.2, speed 700→750`. An evolution card names what it joins: `Evolve: Left + Right Claw → Dual Claw` (the required weapons' names, a last word they share said once). A buff shows its value at the new level (`+40% damage`, `-20% cooldowns`, `+40% area and orbit`, `+40% shot speed and range`, `+50% mini tower life`, `+100% knockback`, `+2 shots, ring balls, max mini towers`, `35% chance fireballs split in two`). Explode and Pierce name their crossover: below L3 `35% fireballs explode; L3: lasers too` and `35% lasers pierce; L3: fireballs too`, at L3 `50% chance to explode; lasers explode too` and `50% chance to pierce; fireballs pierce too`. Repair shows `Tower +25 HP`.

**Level-up screen** (`screens.js`, over a 60% black overlay): the title `LEVEL UP` at y 100, `<n> more to pick` below it when more level-ups wait, then the cards in a centred row, each 260×220 px with a 24 px gap, top at y 170. A card shows its key number (1–3) top left, its tag top right (green `NEW`, orange `EVOLVE`, yellow `L<n>`), the icon at 3× its icon scale, the name, and the effect text in the largest monospace size from 15 px down to 9 px that fits the card. The highlighted card has a yellow border. Below the row a hint names the controls, and while `game.rerolls` is above 0 a 220×36 button `Reroll (n)  R / X` centred 56 px under the cards.

**Picking** (`app.js`): keys 1/2/3 pick the card with that number if it is shown; a left click inside a card picks it (clicks elsewhere do nothing); gamepad d-pad left/right moves the highlight, clamped to the cards shown, and A picks the highlighted card. R, gamepad X or a click on the reroll button sends `reroll`. The highlight starts on the first card for every new set of offers. Pause works on the level-up screen as anywhere in a run.

### 14.2 Braziers and pickups

Breakable fires that appear just outside the view, so the player has to walk to them (pulling the tower along) and choose when. Each drops one pickup: a heart that heals the tower, a magnet that pulls every gem, or a bomb that blasts the screen.

| Constant | Value |
|---|---|
| `BRAZIER_INTERVAL` | 25 s between brazier attempts *unmeasured* |
| `BRAZIER_MIN_DIST`, `BRAZIER_MAX_DIST` | 250 and 450 px from the tower *unmeasured* |
| `BRAZIER_SPACING` | 120 px, never closer to another brazier *unmeasured* |
| `MAX_BRAZIERS` | 4 standing at once *unmeasured* |
| `BRAZIER_TRIES` | 12 candidate points per attempt |
| `BRAZIER_RADIUS` | 12 px, the hit circle; sprite `brazier.burn` (12×16) at 2× |
| `PICKUP_LIFE` | 30 s *unmeasured* |
| `PICKUP_BLINK` | 5 s, the pickup blinks for the last seconds of its life |
| `HEART_HP` | 20 tower HP *unmeasured* |
| `BOMB_DAMAGE` | 60 fire damage *unmeasured* |

| Pickup | Weight | Effect | Sprite | Sound |
|---|---|---|---|---|
| Heart | 60 | tower +`HEART_HP`, capped at max HP | `pickup.heart` | `powerup02` |
| Magnet | 25 | every gem on the ground starts homing (§14) | `pickup.magnet` | `powerup03` |
| Bomb | 15 | `BOMB_DAMAGE` fire to every enemy on screen | `pickup.bomb` | `explosion02` |

Weights *unmeasured*.

- **A brazier** is a stationary object in `game.braziers`, not an enemy: enemies ignore it and walk through it, it is not in the grid, the cap or the bestiary, it has no HP and breaking it is not a kill. It loops `brazier.burn` (advanced in the spawner step).
- **Timer.** `game.brazierTimer` starts at 1500 and goes down by one every spawner step (step 4, after the enemies); when it reaches 0 it restarts at 1500 and an attempt is made, so the first attempt is on tick 1500 (`t` = 25 s) and then one every 25 s of play. The timer counts steps, not `t`, so a debug jump (§19) neither skips nor adds attempts. An attempt with `MAX_BRAZIERS` standing does nothing and draws nothing.
- **Placement.** Up to `BRAZIER_TRIES` candidates, each drawing from `game.rng` its angle (`rng × 2π`) and then its distance from the tower (`BRAZIER_MIN_DIST + rng × 200`). A candidate closer than `BRAZIER_SPACING` to a standing brazier is rejected. The first other candidate whose whole sprite (24×32 px on screen) is outside the 960×600 view around the dragon, `|x − dragon.x| > 480 + 12` or `|y − dragon.y| > 300 + 16`, becomes the brazier and the tries stop. If no try gives one, the first spaced candidate inside the view is used; if none was spaced, no brazier appears. So an attempt draws between 2 and 24 numbers. Since the dragon is within the tether of the tower, nearly every brazier lands just outside the view, most often above or below it.
- **Far braziers.** In the spawner step, before the attempt, a brazier farther than `DESPAWN_DIST` (§8.3) from the tower is removed silently, so a walked-away player gets new ones.
- **Breaking,** in step 8 before projectile vs enemy: every projectile (any kind, list order), then every ring fireball, then every saw blade, breaks each brazier whose circle overlaps its own (`BRAZIER_RADIUS` + the projectile's `r`, the ring's 6 px or the blade's `r`). A projectile is not used up and does not record the brazier in its hits: braziers are not targets. An explosion (§12) breaks every brazier its circle overlaps, and a claw slash every brazier its rectangle or cone overlaps when it strikes (§10.5–10.6, the same overlap tests as for enemies with `BRAZIER_RADIUS`). A bite breaks every brazier its reach circle overlaps when it bites (§10.8; a bite needs an enemy in reach), and a saw blade, after the ring fireballs in the pass above, every brazier its circle overlaps (§10.9; not used up either). Later weapons break braziers with their hit shapes the same way. The bomb pickup does not break braziers. A brazier takes no damage numbers and plays no hit effect.
- **Drop.** A broken brazier is removed, a `brazier.break` effect plays where it stood, sound `dropping` plays, and one `game.rng()` draw picks the pickup by the weights above (first kind in the order heart, magnet, bomb whose weight exceeds what is left of `rng × 100`). The pickup lies at the brazier's position with `life` = `PICKUP_LIFE` × Duration (`1 + u`, §11) in ticks, rounded, read when it drops.
- **Pickups,** in step 8 after enemy shot vs dragon, in list order (the merchant's chest among them, §14.3): a pickup whose centre is within `GEM_COLLECT_RADIUS` (§14) of the dragon's is collected (removed, its effect applied and its sound played, in list order once the scan is done); any other advances its anim, counts `life` down by one and is removed when it reaches 0. Pickups never move or home; the dragon has to touch them. Collecting in step 8 means a bomb's kills die in the same tick's deaths step (with their gems and kill counts) and a magnet's gems start homing in the same tick's gems step.
- **Heart** adds `HEART_HP` to the tower, never above `maxHp`.
- **Magnet** sets `homing` on every gem, so all of them fly to the dragon at 500 px/s and are collected (§14).
- **Bomb:** `BOMB_DAMAGE` fire through the damage function (§12.1, resistances and the armoury apply, source the dragon's position) to every live enemy whose centre is within the view around the dragon (`|x − dragon.x| ≤ 480` and `|y − dragon.y| ≤ 300`), in enemy list order. Unkillable enemies (the golem) are skipped entirely: no knockback, no sound. It spawns an `explosion.big` effect at the dragon with `scale` 2 and sets `game.lastBomb` to the current `tickCount`. It draws no random numbers.
- **Random draws** of this section, all through `game.rng`: placement (angle, then distance, per try) in step 4 after the spawner's own draws, and one pickup draw per broken brazier at the moment it breaks in step 8.
- **Drawing** (render only): braziers and pickups at 2× (§5). A pickup with at most `PICKUP_BLINK` × 60 ticks of `life` left blinks: it is drawn only while `floor(life / 8)` is even. The bomb flashes the screen: after the world, a white rectangle over the whole view at alpha `0.6 × (1 − (age − 1) / 24)` while `age = tickCount − lastBomb` is between 1 and 24, and only while the world runs (phase `'play'` with no level-up offers open), since `tickCount` stops otherwise and the flash would freeze. Off-screen braziers and pickups get edge markers (§17). The bomb never touches the merchant (§14.3).

### 14.3 The merchant

Every 90 s a merchant crosses the field. Stand by him to **trade**: spend the XP banked towards the next level on a reroll, a card of your choice or a heal. Or **rob** him: he is tanky and runs from the dragon, and killed he drops a chest worth a free level-up pick. Walking to him pulls the tower out of position, and a stray shot ends the trade.

| Constant | Value |
|---|---|
| `MERCHANT_INTERVAL` | 90 s between merchants, the first at 1:30 *unmeasured* |
| `MERCHANT_LINE_OFFSET` | 200 px, his line passes at most this far from the tower *unmeasured* |
| `MERCHANT_FLEE_TIME` | 3 s of running after each hit *unmeasured* |
| `TRADE_RADIUS` | 40 px from the dragon's centre to his *unmeasured* |
| `TRADE_TIME` | 1.5 s standing by him opens the shop *unmeasured* |
| `SHOP_HEAL` | 30 tower HP *unmeasured* |

| Type | HP | Speed px/s | Flee px/s | Radius | Mass | Fire | Arcane | Physical | Sprite |
|---|---|---|---|---|---|---|---|---|---|
| Merchant | 80 | 50 | 90 | 12 | 3 | 0.5 | 0.5 | 0.5 | `merchant`, drawn at 2× |

| Offer | Price | Effect |
|---|---|---|
| Reroll | 10 XP | `game.rerolls` +1: a later level-up screen can roll its cards again (§14) |
| Any card | 25 XP | a card of the player's choice from the level-up pool (§14.1) without Repair, applied as a level-up card |
| Heal | 15 XP | tower +`SHOP_HEAL`, capped at max HP |

Stats and prices *unmeasured*.

- **Not an enemy.** A merchant lives in `game.merchants`: enemies ignore him (no targeting, separation or contact), he is not in the grid, the cap, `game.seen` or the bestiary, has no tier, and his death is not a kill and drops no gem. At most one is about at a time.
- **Timer.** `game.merchantTimer` starts at 5400 and goes down by one every spawner step (step 4, after the braziers); when it reaches 0 it restarts at 5400 and, unless a merchant is still about, one appears. So the first is due on tick 5400 (1:30) and then every 90 s of play; a due one while another is about is skipped and draws nothing. The timer counts steps, not `t`, so a debug jump (§19) neither skips nor adds merchants.
- **Route.** Two `game.rng` draws: the side `a = rng × 2π`, then the offset `o = (2 × rng − 1) × MERCHANT_LINE_OFFSET`. He appears on the spawn ring, `S = dragon + SPAWN_RING_RADIUS × (cos a, sin a)` (560 px, just outside the view), and his route is the unit vector from `S` to the point `tower + o × (−u.y, u.x)`, with `u` the unit vector from `S` to the tower (`(0, 1)` where a vector is zero): a straight line across the field that passes within 200 px of the tower. HP and max HP 80, `flee` and `trade` 0, `willTrade` true, `flip` when the route runs left.
- **Walk,** in step 5 after the enemies, in this order. *Fleeing* (`flee > 0`): `flee` drops by one and he moves 90 px/s straight away from the dragon (along his route if they coincide). *Trading:* else, while he will trade (`willTrade`) and the dragon's centre is within `TRADE_RADIUS`, he stands still on walk frame 0 facing the dragon and `trade` counts up, to at most 90 ticks. *Else* `trade` is 0 and he walks his route at 50 px/s. A walking or fleeing merchant plays `merchant.walk` and faces the way he moves. Then a merchant farther than `DESPAWN_DIST` from the tower (§8.3) is removed silently.
- **The shop opens** in step 12, after the game-over check and only while the phase is still `'play'`: the first merchant who will trade and has `trade` at 90 (1.5 s without a break) opens `game.shop = { merchant, page: 'main', cards: [] }`, sound `pickup`. That tick runs in full; from the next one the world is frozen like the level-up screen: while `game.shop` is set (and no level-up offers are open, which come first) no step of §2.1 runs, `tickCount` stays, `events` are still cleared, debug commands wait, and the choices travel in the intent.
- **Shop picks.** On the main page `pick` 0, 1, 2 is Reroll, Any card, Heal. An offer is taken only when `game.xp` (the XP banked towards the next level, §14) covers its price and it would do something: Any card needs the pool without Repair to be non-empty, Heal a tower below max HP; any other pick is ignored. Reroll and Heal take the price off `game.xp` (a level is never lost), apply, play `powerup` and close the shop. Any card opens `page: 'cards'` with `cards` the pool's cards (§14.1, pool order, Repair left out) at that moment, nothing paid yet; there `pick` i buys `cards[i]`: 25 XP off, the card applied as a level-up card (§14.1, no level used), `powerup`, the shop closes; `leave` goes back to the main page. On the main page `leave` closes the shop without a trade. Closing sets the merchant's `willTrade` false and `trade` 0: one trade per merchant, and after a trade or leaving he walks on. The shop draws no random numbers.
- **Rob.** The player's hits reach a merchant through the damage function (§12.1, his resistances 0.5 to every type and his mass 3 for the knock) in the same passes as enemies: a projectile hits the nearest live, not-yet-hit enemy **or merchant** it overlaps (he is proc-immune: it rolls nothing and is used up, §12); an explosion hits every merchant its circle overlaps (not the one just hit); a ring fireball and a saw blade hit a merchant they overlap, on their rehit maps; a claw slash hits a merchant its rectangle or cone overlaps when it strikes, besides its targets (he never takes a cone's target slot). The bite (it bites foes) and the bomb pickup never touch him. Every hit sets `flee` to 180 ticks (3 s, again on each hit), `trade` to 0 and `willTrade` false for good: hit once, he never trades.
- **Death,** in step 9 after the enemies' deaths: a merchant at 0 HP or below is removed, plays `merchant.die` where he stood (with his `flip`), sound `death02`, and leaves a **chest** there: a pickup (§14.2) `{ kind: 'chest' }` with the life of a pickup when it drops (`PICKUP_LIFE` × Duration), sprite `pickup.chest`.
- **Chest.** Collected like the other pickups (step 8, within `GEM_COLLECT_RADIUS`, it blinks out the same way). It is a free level-up pick: `pendingLevelUps` goes up by one with no level gained, and if no offers were open they are rolled now (§14, an empty pool passes it). Sound `win_level_2`.
- **Random draws:** the two route draws when one appears (step 4, after the braziers' draws). Trading, the shop, the hits, the flight and the chest draw nothing (the chest's offers are a level-up's).
- **Drawing** (render only): merchants after the pickups and before the enemies, `merchant.walk` at 2×, mirrored when `flip`. Above his sprite, from the bottom: a 24×3 px red HP bar once he is hurt, a gold trade bar filling to `trade` / 90 while he will trade and the dragon stands by him (each on a dark back, 3 px apart), and while he will trade the `merchant.bubble` above them, 8 px right of his centre. An off-screen merchant gets an edge marker (§17).
- **Shop screen** (`screens.js`, over a 60% black overlay, `app.js` shows it while the run is in `'play'`, the shop is open and no level-up offers are): the title `MERCHANT` at y 100, `Banked XP n  -  one trade` at y 140, the three offers as cards in the level-up layout (§14.1): key number top left, the price (`10 XP`) top right in yellow, the icon (`icon.reroll`, `icon.big`, `pickup.heart`) at 3×, the name (Reroll, Any card, Heal) and one line (`Bank a reroll for a level-up`, `Pick any card from the pool`, `Tower +30 HP`); an offer that is not available is drawn at 40% alpha. Under them a 180×40 `Leave  Esc / B` button and a hint. The cards page: `ANY CARD` at y 24, `25 XP of n banked` at y 66, the cards as 216×64 tiles, 4 a row 12 px apart, rows 8 px apart from y 100 (the largest pool, 19 cards, fits in 5 rows), each with its icon at 2×, name, tag (§14.1) and effect text fitted and cut with `…` if still too long; a 180×36 `Back  Esc / B` button at y 476 and a hint. The highlighted item has a yellow frame and starts on the first item of each page.
- **Shop controls** (`app.js`): keys 1/2/3 choose an offer on the main page; a left click on an offer, a tile or the button chooses it; the d-pad or the move keys move the highlight (main page: left and right along the offers and Leave, down to Leave, up from Leave to the middle offer; cards page: a tile left or right, a row up or down, down past the last row to Back, up from Back to the last tile) and Enter or gamepad A chooses it. Choosing Leave or Back, Esc or gamepad B send `leave`; P or Start pause. The choice reaches the sim in the next tick's intent.

---

## 15. Collision and the grid

`grid.js` is a spatial hash with 64 px cells keyed by packed integers. It is rebuilt from scratch every tick from the enemy list, which is cheap at 400 enemies. The query `nearby(x, y, radius)` returns candidate enemies.

Enemies are stored by their centre. The grid is built twice per tick: after enemies move (for separation) and at the start of the collisions step; a third time in the weapons step when a landed mini tower needs a target (§10.3). `nearby` returns every enemy whose centre lies in a cell touching the query square, a superset of those within `radius`, in a fixed order; callers do the circle test. Queries for circle overlaps add the largest radius among the stored enemies to their radius.

Checks per tick:
- projectile vs enemy: grid query at the projectile position, then a circle test.
- ring fireball vs enemy: same, with the per-enemy rehit timer map.
- saw blade vs enemy: same, with each blade's own rehit map.
- bite targets: grid query at the dragon within the reach plus the largest radius, then a circle test and the nearest.
- enemy vs tower: grid query within `TOWER_RADIUS + 60` of the tower, then a circle test.
- explosion vs enemy: grid query at the explosion centre within its radius plus the largest radius, then a circle test.
- mini tower target: grid query in a 300 px radius, pick the nearest.

Knockback (§8.7) moves enemies during the collisions step without rebuilding the grid: later queries that tick use the cells of the step's build and test circles at the enemies' current positions, so an enemy pushed into another cell can be missed until the next build.
- gem vs dragon: gems are not in the grid; a linear scan is fine at 600.
- player hit vs merchant (§14.3): a linear scan of `game.merchants` (at most one) after each pass's enemies.
- player hit vs brazier, pickup vs dragon, bomb vs enemy: linear scans (at most 4 braziers, a handful of pickups; the bomb runs once per pickup).
- enemy shot vs dragon: a linear scan of `game.enemyShots`, one circle test each.

---

## 16. Input

`input.js` produces an `Intent` each frame.

| Action | Keyboard and mouse | Gamepad |
|---|---|---|
| Move | WASD or arrows | left stick |
| Aim | mouse position relative to the dragon on screen | right stick, deadzone 0.25 |
| Pick card | 1/2/3 or click | d-pad left/right + A |
| Reroll the cards (§14) | R or the Reroll button | X |
| Shop (§14.3): choose, leave | 1/2/3, click, move keys + Enter; Esc | d-pad + A; B |
| Pause | Esc or P | Start |
| Bestiary (§17.1) | Tab | Back / Select |
| Retry | Enter or click | A |
| Armoury (§13.1), from the title | U or the Armoury button | Y |
| Armoury: select, buy, back | move keys; Enter or click; Esc, P or U | d-pad; A; B, Y or Start |

Mouse aim always sets `hasAim = true`. Gamepad aim sets `hasAim` only when the stick is outside the deadzone. The last device that produced input wins, so plugging in a controller just works.

Details:

- **Keyboard:** keys are read by `KeyboardEvent.code`, so the layout does not matter. The move vector is (right − left, down − up) normalised; opposite keys cancel. Enter (and keypad Enter) is `confirm`; Digit1–3 and Numpad1–3 are `pick` 0–2; Tab is `bestiary` (its browser default, moving focus, is suppressed). Esc also gives `leave` (the shop, §14.3) and R `reroll` (§14). Pause, bestiary, confirm, pick, leave and reroll are edges: one per press, never from auto-repeat.
- **Mouse:** the position is tracked over the whole window and converted from CSS pixels to internal pixels with the canvas's bounding rect (`x = (clientX − left) × 960 / width`, likewise y). The aim is the unit vector from the dragon's screen position (its centre) to the mouse; before the mouse has moved there is no mouse aim, and a mouse exactly on the dragon gives none. Only the left button counts as a click.
- **Gamepad:** the first connected pad in the browser's standard mapping. Both sticks use a radial deadzone of 0.25: inside it the stick reads zero, outside it the raw vector clamped to length 1 (the left stick is analog movement). Buttons: A (0) is `confirm`, Start (9) pauses, Back / Select (8) is `bestiary`, d-pad left/right (14/15) navigate the level-up cards, X (2) is `reroll` and B (1) also `leave`; all are edges against the previous frame.
- **Menus:** U and gamepad Y (3) give the `armoury` edge, gamepad B (1) the `back` edge. Every press of a move key and every new d-pad press (up 12, down 13, left 14, right 15) gives a one-step `menu` edge `{ x, y }`, read by the armoury and shop screens; the level-up cards keep reading the d-pad's left/right.
- **Last device:** a frame counts as keyboard-and-mouse activity when a key is held or pressed, or the mouse moved or clicked; as gamepad activity when a stick is outside its deadzone or a button was newly pressed. Move and aim come only from the current device. When both are active in the same frame the keyboard and mouse win.

---

## 17. HUD

Top centre: run timer `m:ss`. Top left: tower HP bar in red with the number. Bottom: XP bar across the full width with the level number at the left. Below the timer: owned weapon icons with level pips, then buff icons. Text uses the browser's monospace font at 2× pixel scale; the original `dragonfont` is a stretch goal.

| Element | Layout |
|---|---|
| Timer | `m:ss` of `floor(t)`, centred at the top (y 12) |
| Tower HP | bar 200×16 px at (12, 12) with a black border, red fill proportional to `hp / maxHp`; `ceil(hp)/maxHp` to its right |
| Icons | one 34 px slot per owned weapon (in slot order), a 16 px gap, then one per buff; the row is centred, icons at y 50 |
| Level pips | under each icon at y 72: one 4×4 px pip per level (a weapon's top level: 5, or 1 for an evolution; 3 for buffs), yellow up to the current level, dark after |
| XP bar | 14 px high across the bottom, blue fill proportional to `xp / xpToNext(level)`; `LV n` just above its left end |
| Stage banner | `Stage n: Name` (§9.1) in 32 px gold (`#ffd23f`) text, centred at y 92 under the icons, while the phase is `'play'` and `t` is less than `BANNER_TIME = 2` s past the start of the current stage; it fades out over the last `BANNER_FADE = 0.5` s (alpha = time left / 0.5). Driven by `t` and the timeline alone, so it needs no sim state; a debug jump past a stage's first 2 s shows no banner for it |

Text is 16 px monospace (32 px for screen titles) with a 2 px black drop shadow. All HUD numbers *unmeasured*.

**Edge markers** (§14.2, §14.3), drawn first, under the rest of the HUD, while the phase is `'play'`: for every merchant, then every brazier, then every pickup currently shown (not blinked off), whose sprite at 2× lies wholly off the 960×600 screen, a gold (`#ffbf00`) arrowhead with a 2 px maroon edge, 14 px long, at the point where the line from the screen centre to the thing's centre meets the screen edge inset by 26 px, pointing along that line; the thing's own current frame at 1× sits 20 px behind the arrow, toward the centre. *unmeasured*.

Weapon icons: fireball → frame 0 of `fireball.anim`; laser → frame 12 (facing right) of `laser.dir`; mini tower → `castle` at 1× (30 px); ring → `icon.ring`; left claw → `icon.leftclaw`; right claw → `icon.rightclaw`; dual claw → `icon.dualclaw`; bite → `icon.bite`; saw blade → `icon.saw`. Buff icons are the §11 icons. Icons draw at the standard 2× sprite scale unless stated.

The title and pause screens list the controls: move, aim, pause and the bestiary (`Foes  Tab  Back`).

### 17.1 Bestiary

An enemy stats panel, so a player can read the matchups (§12.1) at any time.

- **Open and close** (`app.js`): Tab or gamepad Back / Select opens it during a run, from play (the level-up screen included) or from pause, in `'play'` or `'dying'`; it is ignored on the title and game-over screens. While it is open the loop runs no ticks, as with pause. Tab, Back, Esc, P or Start closes it, back to the screen it was opened from (the run or pause). Window blur leaves it open.
- **Layout** (`render/bestiary.js`, 960×600 over a 60% black overlay): the title `BESTIARY` (32 px) centred at y 24; one card per enemy type, in the order of the §8 table, in two columns of 452 px cards with a 16 px gap, centred, filled row by row from y 72; each card is `min(110, floor((468 − 8 × (rows − 1)) / rows))` px high with 8 px between rows, so up to 10 types (all of them) fit above y 540; the tier legend at y 546; the hint `Tab or Esc to close` centred at y 568.
- **A card of a type met this run** (`game.seen`, §4.1): its walk anim, animated in real time at the sim's 60 Hz frame durations while the panel is open, centred in an 80 px box at the card's left, at the standard 2× (1× when 2× does not fit the box, as for the golem), with the type's alpha, raised when needed so it ends 1 px above the tier pips' black edge (the megaslime); its name (16 px); `HP n  XP n`, `SPD n  DPS n` and `MASS n` below (14 px, 18 px apart; the slime's HP lists its three sizes, `HP 3/2/1`, and the megaslime's line is `HP 4×sum  XP sum`, §8.9; the golem's HP is `∞`, and having no mass its third line is `POISE 60 · staggers 40 px`, its poise and stagger push, §8.10); and three resistance rows, Fire, Arcane and Physical: the name, a 52×10 px bar filled to `|r|` of its width (full at 100%), and a label in the bar's colour: `weak N%` in red for `r < 0`, `0%` in grey (a thin grey line instead of a fill) for `r = 0`, `resist N%` in blue for `0 < r < 1`, `immune` in gold for `r ≥ 1`, with `N = round(|r| × 100)`. The resistance shown is the effective one, after `game.meta`'s shred (§12.1). The golem shows `takes no damage` instead of the three rows. Under the sprite, 6 px from the card's bottom, a row of four 6×6 px tier pips 3 px apart with a 1 px black edge, centred in the box: a tier of this type met this run (`game.seenTiers`) in its colour (plain `#e8e8e8`, then the bronze, silver and gold outline colours of §3.3), one not met dark. The golem, always tier 1, has no pips.
- **Tier legend:** one 14 px line centred at y 546: `Tiers`, the four pips in their colours, then the multipliers of the tiers in that order, `HP ×1/2.5/6/15  DPS ×1/1.25/1.5/2  XP ×1/2/4/8  SPD ×1/1/0.9/0.8`, made from the §8.6 table.
- **A type not met yet:** frame 0 of its walk as a flat dark silhouette, the name `???`, no stats and no resistances.
- The panel reads the game and never writes it. All layout numbers *unmeasured*.

---

## 18. Audio

Web Audio API. All WAVs decoded at load. `audio.play(name, { volume })` with a cap of **16 simultaneous voices** and a per-sound minimum interval of 50 ms, so 40 fireball hits in one tick play one sound. Browsers require a user gesture to start audio, so the title screen's Start click resumes the context. No music in the demo.

A voice counts from its start until its buffer's duration has passed, on the audio context's clock. A sound that is throttled or over the cap is dropped, not queued. A sound that fails to load is skipped with a console warning. Every key press and click also tries to resume a suspended context (a gamepad button is not a user gesture in browsers). `start_game` plays once the context is running, on Start and on Retry. Master volume 0.6 *unmeasured*; `volume` defaults to 1.

---

## 19. Debug

Query parameter `?debug=1` exposes the App as `window.app` for the console (read it; only the loop calls `tick`) and enables: collision circles, tick time and entity counts, keys F1–F4 and F6–F10 to grant each weapon at its top level, F5 to jump to 4:50, `+` and `-` to change game speed. `?seed=N` fixes the RNG. (`?shake=0`, which turns the screen shake off, §5.1, works without `?debug`.)

Precisely:

- **Debug commands travel in the intent.** The page builds every `Game` with `{ debug: true }`; F1–F4 (fireball, laser, mini tower, ring), F6–F10 (left claw, right claw, dual claw, bite, saw blade) and F5 become `intent.debug = { grant: '<weapon id>' }` or `{ jumpTo: 290 }` on the next tick that runs, like `pick`. Presses queue in order and travel one per tick, so presses made in frames that run no tick are not lost. A `Game` built without `debug` ignores the field, so a normal run cannot be changed by it, and a replay of the same intents, debug commands included, gives the same digest. A malformed command is ignored. Commands are read only on a tick that advances the world (not while level-up offers or the merchant's shop are open, nor in `'dying'` or `'over'`), before step 1 of §2.1; the tick then runs as usual.
- **Grant** sets the weapon to its top level if owned; else, for an evolution result whose required weapons are all owned (at any level), evolves them (§10.7); else adds it at its top level when a weapon slot is free (it fires on that tick's weapons step). It does not use a level-up.
- **Jump** sets `tickCount` to `round(jumpTo / DT)` and `t` with it, only forward. Nothing in between is simulated: the spawner reads its rate and weights from the new `t`, its budget is unchanged, and the golem spawns at 5:00 as usual.
- **Game speed** is the loop's: `+` / `-` (also keypad) step through 0.25×, 0.5×, 1×, 2×, 4×. The accumulator adds `real time × speed`, and above 1× the cap of 4 ticks per frame scales with the speed (16 at 4×), so 4× runs 4 ticks per 60 Hz frame. The sim is untouched.
- **Overlay** (`render/debug.js`, drawn from game state and loop stats only): circles for enemies (`r`), the tower (`TOWER_RADIUS`), projectiles, enemy shots, ring fireballs, landed mini towers' 300 px target radius, braziers (`BRAZIER_RADIUS`), the hitbox of every struck claw slash where it struck (its rectangle, or its cone as a sector), saw blades (`r`), the bite's reach around the dragon (× Area) while a bite is owned, the dragon's hit circle (`DRAGON_RADIUS`) and its pickup radius, the golem's poise bar (60×5 px on a dark back, centred 6 px above its circle, yellow filled to `poise` over the poise its next stagger needs, full and red while it staggers, §8.10), all shaken with the world (§5.1); at the top right the average ms per tick (smoothed), ticks run in the last frame, the game speed, the counts of enemies, projectiles, enemy shots (`orbs`), gems, effects, braziers and pickups, `t` and the seed. With `debug`, the browser defaults of F1–F10, `+` and `-` are suppressed.

---

## 20. Testing

`npm test`. The sim has no DOM, so tests construct `new Game({ seed })` and call `tick(intent)` directly.

- **Determinism:** two games with the same seed and the same intent sequence produce identical state after 300 s of ticks (compare a JSON digest).
- **Tether:** inside the tether the tower follows the dragon and stops at `TOWER_REST_DIST`; while the dragon walks away the tower is dragged exactly `TETHER_LENGTH` behind it; `tower.moved` says whether it moved.
- **Dragon:** facing follows the horizontal move, then the aim, then the last facing; the walk frame holds at 0 while still and advances while moving.
- **Procs:** with `rng` stubbed to return 0, a fireball with explode chance L1 spawns an explosion that damages a second enemy in range. Affinity: at L1, L2 and L3 a fire and an arcane projectile roll exactly the procs of the §12 table, and nothing without the buff.
- **Buffs:** each buff's maths, Amount per weapon (fan, parallel lasers, ring fireballs, mini towers), Duration on mini-tower life, card names and texts.
- **Knockback:** a hit pushes `knock × (1 + force) / mass` straight away from its source (projectile, ring fireball, explosion centre); a killing hit pushes nothing; a hit never moves the golem.
- **Level-up:** the world is frozen while offers are open (the digest does not change on ticks without a pick); the same seed and the same intents, picks included, give the same digest.
- **Damage types:** every weapon's hits (projectile, explosion, split child, mini-tower shot, ring) carry their type; resistance maths with weakness, resistance, immunity and rounding; `meta` power and shred (floored at −0.5); the golem takes nothing from any type and its poise takes the knock; `game.seen` records types as they are first created; the bestiary's layout, bar styles and silhouettes, drawn under node without writing the game.
- **Armoury:** gold from score; rank costs; buying (affordable, unaffordable, maxed) and refunding; untrusted purse data clamped; the storage wrapper round trip and a throwing or blocked storage; ranks → `meta`; the App flow title ↔ armoury (keys, buttons, clicks), buying, Reset's confirm step, the game-over payout once, Retry and `?seed` runs using the ranks, a reload reading the purse back; the screen's layout and navigation; the input edges.
- **Claws:** the rectangle on the facing side, both sides from L3 with the other 9 ticks later, the side fixed at the volley; cone membership (edges, apex, reach + r) and the `maxTargets` nearest with ties to the lower id; physical damage through resistances (skeleton weak, slime resists) and the armoury; knockback straight away from the dragon by mass and Force; Might, Haste, Area, Force and Amount on each claw; no procs and no random draws; braziers broken by a slash; the evolution offered only with both claws at L5, never as a weapon card, replacing both in the first one's slot, and its card text; the debug grants; determinism and the snapshot; the renderer drawing struck slashes (scale, mirror, 16 directions) and the debug hitboxes without writing the game; the art's sizes and frames.
- **Bite and saw blade:** the bite takes the nearest enemy in reach (ties to the lower id), waits at 0 with none and bites on the first tick one comes in reach, executes below 30% of max HP and not at exactly 30%, takes the next-nearest with Amount, knocks straight away from the dragon by mass and Force, Area on the reach; the saw blade launches from the tower through the dragon (the aim when they coincide), flies out exactly `range`, dwells `dwell` ticks, flies back homing to a moved tower and is removed there, hits an enemy once per `rehit` per blade and never stops, fans with Amount, Duration, Velocity and Area scale it; both physical through resistances, no procs or random draws, braziers broken; the debug grants; determinism and the snapshot; the renderer drawing blades and jaws and the debug circles without writing the game; the art's sizes and frames.
- **Golem:** poise from each hit's knock after Force; the stagger at the growing threshold (`GOLEM_POISE × GOLEM_POISE_GROWTH^staggers`; a sustained full build stops staggering it and the tower falls) (poise reset, the eased 40 px push straight away from the dragon over 18 ticks, `(0, 1)` on the dragon, 30 ticks still, then walking); no poise during a stagger; decay only on ticks not after a hit; the shove once per 60 ticks while it overlaps the tower, away from the golem, and the tether bringing the tower back; the shake events at its spawn, at footsteps (the frames, the range) and at staggers, at most one per kind per tick; determinism and the snapshot; the screen shake's amplitude, linear decay, sum and cap, pattern and `?shake=0`, offsetting the world and not the HUD; the poise bar and the bestiary line; rendering writes nothing.
- **Slime split:** killing a gen-0 slime yields two gen-1 slimes, killing one of those two gen-2 slimes, and killing those none; each generation's HP, radius, walk, split or die and child offset; the tier through both splits; `maxHp`.
- **Slime fusion:** none at 100 slimes, one at 101; at most one per second; the 12 nearest the densest slime (ties to the lower id, the densest itself included), the centroid, HP and XP sums, `maxHp`, the highest tier; the fusion anim before it walks; contact DPS 0, so it never damages the tower; its death does not split; no random draws; determinism and `lastFusion` in the snapshot; every slime and megaslime anim's tier variants; the bestiary's 10 cards and slime lines.
- **Tiers:** the multipliers and the radius at every tier; the golem stays tier 1; children inherit the tier through a slime split, a ghost knight's burn and a mage's summon; gems and contact damage scale; a timeline without tier weights draws no extra random number (the same digest with and without tier rows before the first one); the draw order type, tier, angle; `game.seenTiers`; the manifest's tier expansion and every tier sprite in the committed atlas (the plain frames with the tier's ops, 2 px larger, the same ticks); the renderer drawing the tier sprite at the tier's scale; the bestiary's pips and legend.
- **Ghost:** killing a ghost knight yields a ghost after the burn effect finishes.
- **Braziers and pickups:** the first brazier on tick 1500 and one per 25 s up to the cap; placement bounds, spacing, the outside-the-view rule, the fallback and the draw order (scripted rng); far braziers dropped; breaking by a projectile (not used up), a ring fireball and an explosion, and by the dragon's own fireball in a full tick; the pickup weights by stubbed rng; collection radius and no homing; the heart's cap, the magnet's homing, the bomb through resistances and the armoury, its view rectangle, golem untouched and kills in the same tick; lifetime and blink; determinism and the snapshot; the renderer's order, blink and flash; the edge-marker maths and the HUD drawing without writing; the art's sizes and frames.
- **Merchant:** the first on tick 5400, one at a time, every 90 s of steps; the two route draws, the spawn ring and the line within 200 px of the tower (scripted rng); the walk, the despawn and enemies ignoring him; trading (stands, counts, resets, opens the shop at the end of the 90th tick, the frozen world, the offers greyed by price, pool and HP, reroll, heal, the cards page and its pick, leave, one trade, level-up offers before the shop); every weapon's hit through resistances (projectile used up without procs, explosion, ring, claw slash, saw blade), the bite and the bomb not; fleeing and walking on; the death, the chest and its free pick; the level-up reroll; determinism and the snapshot; the bots leaving the shop; the input edges, the App's shop flow and reroll, the shop screen's layout, hit tests and navigation, the merchant's drawing, bars, bubble and edge marker, rendering writes nothing; the art's sizes and frames.
- **Mage:** a mage starts casting 8 s after it spawns and has spawned 4 skeletons 1 s later, unless within 80 px of the tower.
- **Mage orbs:** a mage fires only within `MAGE_ORB_RANGE` of the dragon and never while casting, every 3 s from its spawn offset; an orb flies straight at where the dragon was; a hit removes it and takes `MAGE_ORB_DAMAGE` from the tower; a dodged orb expires after 400 px; a game without mages draws no extra random numbers.
- **Timeline:** at t = 300 s the golem exists; at t = 0 only knights spawn; the rate curve; each stage's row weights led by its threat; the stages and the banner's timing and fade.
- **Horses and mounted knights:** a horse runs in a straight line (no homing, through and past the tower), deals contact damage while crossing the tower and is despawned at `DESPAWN_DIST` without a refund; a stampede's schedule on the default table, its line geometry and size, its draw order (count, tier only with tier weights, angle), the cap, a debug jump skipping stampedes; determinism and the snapshot; the mounted knight's stats, resistances, mass and its 3×/4× screen scale; the new art's sizes and frames, and every new anim's tier variants; the bestiary fitting all types.
- **Soak:** run 5 minutes with a scripted dragon that circles the tower, on the default timeline with every rate from 3:00 on raised to at least 30/s. Assert no exceptions, the spawner never spawns above the cap (§8.2), and the tower eventually dies. The test holds the tower at full HP until the golem has spawned, so the run reaches 5:00 whatever the balance; the horde reaches the cap on the way (asserted), and the golem then ends the run. It stays in the default suite (a few seconds).
- **Atlas:** `build-atlas.mjs` run on the manifest produces every name the game asks for. `content.js` lists its required atlas names and the test cross-checks them.
- **Art:** the art parser (frames, key by name or hex, transparency, durations, every error with its file and line), the palette file and tool, the off-palette warning, the variants on synthetic frames (tint keeps luminance and its order, outline grows by 2 px and borders opaque pixels edge-on only, op order swap → tint → outline, frame-key suffixes), art and `from` entries built into an atlas, and the committed atlas holding every art file pixel for pixel. Every file under `art/` parses with no warning and is used by the manifest. None of these needs the pack.
- **Balance instrument:** `node tools/measure.mjs` plays headless runs over a pool of seeds (16 by default, a 420 s cap) and prints, per bot, median, min and max survival time, how many runs reached 5:00 and the cap, kills, level, what ended the fallen runs and how often the tower moved, as Markdown. A bot is a movement policy plus a pick rule, named `<policy>+<pick>`. The tower follows the dragon, so every policy is anchored to a fixed world point, home (the dragon's start), never to the tower. Policies: `idle` gives no input (stands on home, fires right, collects nothing, dodges nothing); `aim` stands on home and lets the tower come to rest; `kite` walks a circle of 80 px around home, inside the tether, so the tower keeps following on a smaller circle. `aim` and `kite` aim at the enemy nearest the tower; whenever a gem that is not yet homing lies within 300 px of home (`--gem-range` changes it) they fly to the one nearest the dragon instead; and a mage orb within 100 px that will pass within its radius + `DRAGON_RADIUS` + 4 px of the dragon overrides both: they step straight away from its path, the most imminent orb first (`--no-dodge` turns it off). Pick rules, used while level-up offers are open: `naive` takes card 0; `greedy` takes Repair when tower HP is below 40%, else an evolution, else a new weapon, else the upgrade of the highest-level weapon, else a buff upgrade, else a new buff (among buffs in the order Might, Haste, Amount, Explode, Split, Pierce, Area, Velocity, Force, Duration), else card 0. A fall's cause is the source (an enemy type's contact, or orbs) that took the most tower HP in the 30 s before it. `--timeline` adds tower HP, enemies alive, kills, spawned and level over time; `--causes` adds the tower HP lost by source per window and the HP repaired; `--set` runs a what-if (a timeline rate, the tower HP, an enemy field) without editing `content.js`; `--meta fire:P/S,arcane:P/S,physical:P/S` plays every run with those armoury ranks (Power/Shred, types left out 0/0), mapped to `meta` as the browser maps them (§13.1). Bots ignore the merchant: they never walk to him, and a shop that opens because one stood by him is left at once. Tests run one short seed per bot and pin the anchoring, the dodge and the damage split.
- **Damage calculator:** `node tools/dps.mjs` (`npm run dps`) answers what a build can kill at each point of the run, from formulas rather than bot runs ([tools/dps.md](../tools/dps.md) lists every model and assumption). Each weapon has a damage model, read from `content.js`, giving hits per second at a level and a buff loadout in a field of static enemies of a given density around the dragon: cadence (cooldown, Haste), damage (Might, the damage function's rounding, resistances), expected targets from the shape's area, procs by damage-type affinity, and each weapon's special rules. Per minute from 0:30 to 5:00 it prints the pressure (HP per second spawned, tiers, slime splits, ghosts and summons included), the enemies near the dragon it assumes (spawn rate × 6 s, at least 5, in a 350 px disk; `--near`, `--view-time`, `--radius` change it), the level (the naive bots' measured curve, `--levels` to override, and the level every gem would give), the floor (median of naive builds drawn from the real card pool) and the ceiling (the best build the same number of level-ups can buy: a beam search plus an exhaustive search of builds with every item at its top level) with their ratio to the pressure, flagging a ceiling below the pressure (unwinnable) or a floor above 3× (trivial); then a per-stage summary, the weapons ranked by single-target and crowd damage and a hits-to-kill table. `node tools/dps.mjs --check` measures every weapon in the real sim, at L1 and its top level with no buffs and with typical buff sets, against dummies (HP 10⁹, held in place, redrawn every few seconds) around a still dragon that aims at the nearest, and exits 1 when any model is off by more than 15%; it takes about a minute, so it is a manual command. The default suite runs the calculator on one minute and the check on one weapon.

---

## 21. Milestones

Each milestone is playable on its own.

1. **Skeleton.** Atlas build, loop, input, dragon walking over grass, camera, tower following on the tether.
2. **Horde.** Knights spawn, walk at the tower, damage it. Separation and grid. Fireball weapon auto-firing with aim. Death animations. Game over screen.
3. **Growth.** Gems, XP, level-up screen, all 4 weapons, all 10 buffs, procs.
4. **Roster.** Skeleton, slime, mage, ghost knight. Timeline table. Golem at 5:00.
5. **Polish.** Sounds, HUD icons, title screen, debug tools, soak test, and a balance pass that replaces the *unmeasured* numbers.

---

## 22. Out of scope

Unchanged from the design: meta progression beyond the armoury (§13.1), multiple levels or maps (the stages of §9.1 are parts of the one run), terrain, mobile, music, controller rumble, royals, fireball lob.

## 23. Open decisions

- **Enemy facing:** horizontal flip only. The original did not flip enemies; if it looks wrong, drop the flip.
- **Big fireball sprite** switches at level 4. If it reads as a different weapon, keep the small sprite and only scale the radius.
