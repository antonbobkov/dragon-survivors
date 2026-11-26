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
      screens.js          title, pause, level-up cards, game over
      armoury.js          armoury screen (§13.1)
      bestiary.js         enemy stats panel (§17.1)
      debug.js            debug overlay: collision circles, loop and entity stats (§19)
    sim/                  no DOM, no canvas, no Date. Pure state + tick.
      game.js             Game state, tick order, run timeline
      rng.js              seeded PRNG (mulberry32)
      content.js          data tables: enemies, weapons, buffs, timeline
      anims.js            generated: per-frame tick durations of every atlas anim
      dragon.js
      tower.js
      enemies.js          AI, movement, separation, death behaviours
    enemyShots.js       mage orbs: firing, movement, hits on the dragon
      spawner.js
      weapons.js          cooldowns, firing, ring, mini tower
      projectiles.js      movement, hits, procs
      damage.js           damage types, resistances, the damage function (§12.1)
      effects.js          one-shot animations (explosions, deaths)
      gems.js             XP gems, attraction, pickup
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
  test/
    *.test.mjs            node --test
  docs/
```

Serve with any static server (`python -m http.server` or `npx serve`). The only build step is `node tools/build-atlas.mjs`, which reads `E:\code\dragongame\assets` (path set in `manifest.json`) and this repo's `art/`, and writes into `assets/`, plus `node tools/copy-sounds.mjs` for the WAVs. `npm run build:assets` runs both. The outputs are committed, so the game and the tests never need the pack.

### 2.1 Tick order

`Game.tick(intent)` runs these in order, every tick (while level-up offers are open none of them runs, §14):

1. Apply intent: dragon velocity and aim direction.
2. Move the dragon.
3. Tower: follow the dragon, then the tether (§7.1).
4. Spawner: add enemies for this tick (§9).
5. Enemies: special timers (mage cast, mage orb, summon anim), AI target, move, separation, despawn.
6. Weapons: advance cooldowns, fire, spin the ring, run mini towers.
7. Projectiles, then enemy shots (mage orbs): move, expire by range.
8. Collisions: projectile vs enemy (with procs), ring vs enemy, enemy vs tower, enemy shot vs dragon. Every hit on an enemy goes through the damage function (§12.1).
9. Deaths: play death animations, drop gems, split slimes, start ghost knight burns.
10. Gems: attract and collect, add XP, queue level-ups and roll the offers.
11. Effects: advance one-shot animations, remove finished ones; a finished ghost burn becomes a ghost.
12. Clock: advance `t`, spawn the golem at 5:00, check tower HP for game over.

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
| `slime.walk`, `slime.die`, `slime.split` | `slime/slime_walk.txt`, `slime/slime_die.txt`, `slime/slime_reproduce.txt` | |
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
| `icon.laser`, `icon.explode`, `icon.split`, `icon.ring`, `icon.speed`, `icon.big`, `icon.multi`, `icon.nuke` | `bonus/bonuslaser1.bmp`, `bonus/bonusexplosion1.bmp`, `bonus/bonussplit1.bmp`, `bonus/bonusring1.bmp`, `bonus/bonusspeed1.bmp`, `bonus/bonusbig1.bmp`, `bonus/bonusmulti1.bmp`, `bonus/bonusnuke1.bmp` | level-up card icons, roughly 9px. `icon.big` and `icon.multi` are unused in the demo (Might and Haste have their own icons) but imported for later |
| `icon.might`, `icon.haste`, `icon.duration`, `icon.force`, `icon.amount` | `art/icons/might.txt`, `art/icons/haste.txt`, `art/icons/duration.txt`, `art/icons/force.txt`, `art/icons/amount.txt` | drawn for this game (§3.4), 9×9, the pack's bonus tray under a sword, a lightning bolt, an hourglass, a war hammer and three fireballs. Icons of the buffs Might, Haste, Duration, Force and Amount (§11) |
| Tier sprites (§8.6) | the manifest's `tiers` block | named `<anim>@t2`, `<anim>@t3` and `<anim>@t4` after every anim of every enemy type except the golem (walk, die, summon, split, spell, burn), recoloured and outlined per tier (§8.6): bronze tint `#c86428` at 0.6 with outline `#d8702c`, silver tint `#b0c8f0` at 0.6 with outline `#a0b4d8`, gold tint `#ffd000` at 0.7 with outline `#f8c000`. 2 px larger than the plain frame each way |
| `gem` | none, drawn procedurally | 6px diamond, two colours |

Sounds copied as-is from the pack root: `shoot01`, `laser01`, `explosion01`, `explosion02`, `death01`, `death02`, `pickup`, `powerup`, `hit_golem`, `megaslime_hit`, `slime_poke`, `destroy_castle_sound`, `start_game`, `ohno`, `win_level_2`.

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
- When pause is open, ticks stop; the renderer still draws. While the level-up screen is open the loop keeps calling `tick`, but the sim itself freezes the world (§14), so picks travel in the intent stream.
- Precisely: each animation frame adds the time since the previous frame to an accumulator and runs `floor(acc / (1000/60 ms))` ticks, keeping the remainder. If more than 4 are owed, 4 run and the rest are dropped (not banked), so a stall or a hidden tab never fast-forwards. The first frame runs none. While ticks are stopped (title, pause) no time is banked, and starting or resuming a run begins with an empty accumulator.
- Intents are built once per frame. The edge fields `confirm` and `pick` are held until the next tick runs and given to that tick only, so a frame that runs no tick (high refresh rates) loses no press. Every tick of a frame gets the frame's move and aim.
- After each tick the browser plays that tick's `game.events` sounds (they are cleared by the next tick).
- `Game.tick(intent)` is the only entry point into the sim. `intent` is `{ moveX, moveY, aimX, aimY, hasAim, confirm, pick }` with move and aim as unit vectors or zero, `pick` in `{0,1,2,-1}`, plus an optional `debug` command (§19).
- All randomness goes through `game.rng` (mulberry32, seed passed to the `Game` constructor). Tests pass a fixed seed.

### 4.1 Sim state

The sim's state is plain data on the `Game` object. The loop and the renderer read it and never write it (the loop only calls `tick`).

- **Construction:** `new Game({ seed, timeline, debug, meta })`. `timeline` defaults to the §9 table in `content.js`; tests may pass their own rows. `debug` (default false) makes the sim honour `intent.debug` (§19). `meta` is the out-of-game armoury's effect on the run (§13.1), per damage type: `{ power: { fire, arcane, physical }, shred: { fire, arcane, physical } }`, where `power` multiplies the damage of that type and `shred` is taken off every enemy's resistance to it (§12.1). Any part may be left out; a missing, non-finite, zero or negative power reads 1 (power is always positive, so the at-least-1 rule of §12.1 holds) and a missing or non-finite shred reads 0, so a run without `meta` is a run with neutral `meta`. It is stored normalised as `game.meta` (all six numbers present), never changes during a run, and is part of the snapshot.
- **RNG:** `game.rng` is a plain function returning a float in `[0, 1)`. Every random draw calls `game.rng()` at the point of use, never a reference cached at construction, so a test can replace it (`game.rng = () => 0`).
- **Units and clock:** positions in world px, speeds in px/s, `DT = 1/60`. `game.tickCount` is an integer and `game.t = tickCount × DT` seconds, so time never drifts.
- **Intent:** exactly the shape in §4. A missing, partial or non-finite field reads as 0, `false` or `-1` (`pick`). A move vector longer than 1 is normalised; a non-zero aim is normalised; `hasAim` is false when the aim is zero. The sim ignores `confirm`; `pick` is read only while level-up offers are open (§14). The loop turns a gamepad A press on the level-up screen into the `pick` of the highlighted card.
- **Phases:** `game.phase` is `'play' | 'dying' | 'over'`. In the clock step, when tower HP is 0, the phase becomes `'dying'`, a `castle.destroy` effect spawns at the tower and sound `destroy_castle_sound` plays. During `'dying'` only effects advance; the clock, enemies, dragon and weapons are frozen. After 2 s (120 ticks) the phase becomes `'over'`. `tick()` in `'over'` changes nothing except clearing `events`. Title, pause and the level-up screen are the loop's business, not phases.
- **Events:** `game.events` is cleared at the start of every tick. Systems push `{ type: 'sound', name }`, at most one per sound name per tick; the browser plays them. Events are output, not state.
- **Ids:** every enemy, projectile, enemy shot, effect, gem and mini tower gets its `id` from one counter, `game.nextId`.
- **Start:** the dragon at (0, 0), the tower at (0, `TOWER_REST_DIST`) = (0, 40), below the dragon and at rest (§7.1), so nothing moves before the first input.
- **Run counters:** `game.kills` (0), `game.level` (1), `game.xp` (0), `game.pendingLevelUps` (0), `game.offers` (`[]`, the level-up cards on show, §14), `game.weapons` (`[{ id: 'fireball', level: 1, timer: 0 }]`, `timer` = seconds until the weapon next fires), `game.buffs` (`[]`, entries `{ id, level }` in the order gained), `game.gems` (`[]`), `game.miniTowers` (`[]`), `game.enemyShots` (`[]`, mage orbs, §8.5), `game.spawner` (`{ budget, spawned, golem }`, `golem` true once the golem has spawned), `game.seen` (`[]`, the enemy types met this run in the order first met: a type is added when the first enemy of that type is created, by the spawner, a summon, a slime split, a rising ghost or the golem; read by the bestiary, §17.1), `game.seenTiers` (`{}`, per enemy type the tiers of it met this run, ascending, added as enemies are created, §8.6; read by the bestiary). `game.score()` = `floor(t) + kills`.

| Entity | Fields |
|---|---|
| every drawable | `x, y, anim, frame, frameTicks` |
| `game.dragon` | `aimX, aimY` (unit fire direction), `moveX, moveY`, `aimed` (an aim has ever been given), `flip` (facing left, §6.3); `anim` is `dragon.walk` |
| `game.tower` | `hp, maxHp`, `moved` (the tower moved this tick, §7.1); `anim` is `castle` |
| `game.enemies[]` | `id, type, tier, r, hp, gen, flip, alpha`. `tier` is 1–4 (§8.6). `type` is a key of `ENEMIES` in `content.js`: `knight`, `skeleton`, `slime`, `mage`, `ghostKnight`, `ghost`, `golem`. Mages also have `castTimer` (§8.4) and `orbTimer` (§8.5); the golem has `unkillable` and `procImmune` set to true and `hp = GOLEM_HP = 1e9`, a finite stand-in for ∞ |
| `game.projectiles[]` | `id, kind, type, dx, dy` (unit), `speed, r, damage, knock, range, travelled, hits` (ids of enemies hit, at most 8), `gen, dirFrame` (for 16-direction sprites). `kind` is `fireball` (mini-tower shots included, §10.3) or `laser`; `type` is its damage type (§12.1); `knock` its knock after Force (§8.7) |
| `game.enemyShots[]` | `id, kind, dx, dy` (unit), `speed, r, damage, range, travelled`. `kind` is `orb` (§8.5). Kept apart from `game.projectiles`: no player weapon touches them |
| `game.effects[]` | `id, scale, alpha, flip, tier, hold, life, done`. `scale` multiplies the standard 2× sprite scale; `tier` is the tier of the enemy whose death it shows (1 for every other effect), drawn as in §8.6; `life` (ticks, usually 0) is a minimum length: the effect holds its last frame until `life` ticks have passed |
| `game.gems[]` | `id, x, y, value, homing` (§14) |
| `game.miniTowers[]` | `id, x, y` (landing point), `fromX, fromY` (where the lob started), `lobTicks` (ticks of flight left), `life` (ticks left after landing), `timer` (seconds to the next shot) (§10.3) |
| ring weapon | also `angle` (radians), `balls` (`[{ x, y }]`, the fireball positions this tick), `rehit` (enemy id → `tickCount` from which it may be hit again), and its own `anim, frame, frameTicks` (§10.4) |

- **Animation:** `anim` is an atlas anim name, `frame` the frame index, `frameTicks` the ticks already spent on that frame; frame durations come from `ANIMS` in `anims.js`. Looping anims (walks, projectiles) wrap. A non-looping anim finishes once its last frame has been shown for its full duration and then stays on that frame. An effect is removed in the effects step of the tick its anim finishes, unless it has `hold` (the `castle.destroy` effect holds, so the ruin stays on screen).
- **Digest:** `game.digest()` is an 8-hex-digit FNV-1a hash of a canonical JSON of `game.snapshot()` (sorted keys, numbers rounded to 1e-6; events, the rng and the grid excluded). Same seed and same intents give the same digest.

---

## 5. World, camera, rendering

- **Internal resolution:** 960×600, matching the original. The canvas is scaled to fit the window with CSS (`image-rendering: pixelated`), keeping the aspect ratio: the scale is `min(windowW / 960, windowH / 600)`, rounded down to an integer when it is at least 1, fractional below 1. The page background is near-black and the canvas is centred.
- **Sprite scale:** every sprite is drawn at **2×** source size (a 16px knight is 32px on screen), except silver and gold enemies and their death effects at **3×** (§8.6); screen scales are always whole numbers. World coordinates are internal screen pixels, so all radii below are in those units.
- **World:** unbounded plane. No terrain in the demo. The camera is centred on the dragon: a world point is drawn at `world + offset` with `offset = (round(480 − dragon.x), round(300 − dragon.y))`, an integer so sprites do not shimmer. Sprites are drawn centred on the entity position, at integer screen pixels.
- **Background:** a 64×64 grass tile generated once at startup into an offscreen canvas (dark green base, 28 lighter or darker 2×2 px speckles), tiled with the camera offset. The speckles come from the tile's own `mulberry32` with a fixed seed, never from `game.rng`, so drawing cannot change a run. A faint darker ring (2 px, black at 18% alpha) of radius `TETHER_LENGTH` around the tower makes the tether rule readable.
- **Gem:** drawn procedurally as a 6×6 px diamond, a blue edge around a pale cyan core, at 2× (12 px on screen), centred on the gem.
- **Draw order:** background, gems, tower, mini towers, enemies sorted by y, ring fireballs, projectiles, enemy shots (mage orbs), dragon, effects, HUD, then any screen (title, pause, game over) over a 60% black overlay. Enemies are sorted by y then id in a copy owned by the renderer; the game's enemy list is never reordered, because its order is part of the sim.
- **Sprites:** `scale` and `alpha` of effects and enemies apply as given (`scale` multiplies the 2×). An enemy or effect of tier 2–4 draws its anim's tier sprite `<anim>@t<tier>` (the plain anim if the atlas has no such sprite) at the tier's screen scale over the standard 2× (tiers 3 and 4: 1.5, times an effect's `scale`), with the same `frame`; `flip` mirrors around the sprite's centre. Projectiles whose anim is a 16-direction sheet (`laser.dir`, `laser.bigdir`) draw frame `dirFrame`; others draw `frame`. Enemy shots draw `frame` of their anim. The dragon draws `frame` of `dragon.walk`, mirrored when `flip`. Ring fireballs draw the ring weapon's `frame` at each of its `balls`. A mini tower in flight is drawn on the straight line from `(fromX, fromY)` to `(x, y)` at progress `p = 1 − lobTicks / 30`, raised by `sin(p × π) × 30` px; a landed one at `(x, y)`.
- **Facing:** enemies flip horizontally when moving left (`ctx.scale(-1, 1)`). The dragon flips the same way when facing left (§6.3).
- `draw.js` reads the game state and never writes it. Animation indices live in the entity (`anim`, `frame`, `frameTicks`) and advance during the tick, so rendering is stateless.

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

So a dragon walking away faster than the follow speed opens the gap until the tether is tight and then drags the tower at its own speed; once the dragon stops, the tower walks up to the rest distance and stops. `tower.moved` is true on a tick when either step moved the tower, false otherwise. The tower never moves except toward the dragon.

### 7.2 Damage
Enemies whose circle overlaps the tower circle deal `contactDps × DT` each tick (continuous, not per hit), `contactDps` being the type's DPS times its tier's multiplier (§8.6). A mage orb that hits the dragon takes `MAGE_ORB_DAMAGE` from the tower at once (§8.5). When HP reaches 0 the run ends (§13). Tower HP does not regenerate; the Repair card restores 25. HP never goes below 0.

Circles overlap when the distance between centres is less than the sum of the radii. An enemy walking at the tower stops advancing once its centre is `r + TOWER_RADIUS − 1` px from the tower's (1 px inside contact range, *unmeasured*), so it keeps dealing damage without walking into the tower. Enemies never push the tower; when the tower follows or is dragged into enemies they simply overlap it.

### 7.3 Visual
Draw the castle with a 4 px HP bar above it: 40 px wide, 4 px above the sprite's top edge, red fill on a dark red back, proportional to `hp / maxHp`. Once the phase is `'dying'` the castle and its bar are not drawn; the `castle.destroy` effect takes their place. **Minion carriers:** while the tower is moving, the two tiny figures `royal.prince` and `royal.princess` (the pack has two) walk at its base, the minions carrying it: drawn at `tower + (∓14, 26)` px, flipped to face left when the dragon is left of the tower, each bobbing up 1 px on alternate 8-tick steps of `tickCount`, out of phase with each other. The tower counts as moving when `tower.moved` is true (§7.1), so the carriers show while it follows and while it is dragged. Visual only, derived from state by the renderer (*unmeasured*).

---

## 8. Enemies

All enemies target the **tower**: desired velocity = `normalize(tower − self) × speed`. Each enemy is a circle. They play `walk` while alive and `die` on death; a dying enemy becomes an effect and stops colliding.

An enemy whose HP drops to 0 or below stops being hit at once and is removed in the deaths step: `kills` goes up by one, sound `death01` plays, it drops its gem, and a non-colliding effect plays its `die` anim at its position with the same `flip` and `alpha`. The specials below replace the effect where they say so. The ghost's `die` anim is `ghost.die`.

`flip` is true while the enemy's x-velocity toward the tower is negative and keeps its last value when the enemy stands still.

| Type | HP | Speed px/s | Radius | Contact DPS | XP | Mass | Fire | Arcane | Physical | Sprite | Special |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Knight | 3 | 27.5 | 12 | 2 | 1 | 1 | 0 | 0 | 0.25 | `knight` | none |
| Skeleton | 1 | 45 | 10 | 6 | 1 | 0.7 | 0 | 0.25 | −0.5 | `skelly` | none (a summoned one first plays `skelly.summon`, §8.4) |
| Slime | 2 | 35 | 12 | 8 | 1 | 0.8 | −0.5 | 0 | 0.5 | `slime` | on death, if `gen == 0`, spawns 2 slimes with `gen = 1`, HP 1, radius 8, at ±20 px (§8.4). Parent plays `slime.split` instead of `die`. |
| Mage | 4 | 20 | 12 | 5 | 5 | 1 | 0 | 0.5 | −0.25 | `mage` | every `MAGE_CAST_INTERVAL = 8 s` since spawn it stops for 1 s (`spell` anim) and spawns 4 skeletons in a 40 px ring around itself, each playing `skelly.summon` once before walking. Will not cast within 80 px of the tower (§8.4). Fires a green orb at the dragon every 3 s while within 320 px of it (§8.5). |
| Ghost knight | 10 | 27.5 | 12 | 10 | 2 | 1 | 0 | 0 | 0.25 | `ghost.knight` | on death plays `ghost.burn` once (0.5 s, not collidable), then becomes a **Ghost** (§8.4). |
| Ghost | 2 | 36 | 10 | 8 | 1 | 0.6 | 0.25 | −0.5 | 0.75 | `ghost.ghost` | drawn at 60% alpha. Dies normally. |
| Mega golem | ∞ | 75 | 56 | 40 | none | none | 0 | 0 | 0 | `golem` | §13. Takes no damage. Every hit pushes it `GOLEM_KNOCKBACK = 1` px away from the hitter, whatever the weapon. Immune to procs. |

All numbers *unmeasured*. Fire, Arcane and Physical are the type's resistances to those damage types (§12.1): below 0 a weakness (−0.5 takes ×1.5), above 0 a resistance (0.5 takes half), 1 immune. A slime's row holds for both generations. The golem has no resistances; it takes no damage from any type. The table is tier 1; tiers scale HP, speed, radius, DPS and XP (§8.6). Mass divides the knockback of every hit (§8.7): below 1 an enemy is light and flies further, above 1 heavy; the golem has no mass and keeps its own rule (§8.4).

### 8.1 Separation
Enemies push apart so they do not stack. For each enemy, query the grid for neighbours within `r1 + r2` and move away by half the overlap along the separating axis. Cap at 6 neighbours per enemy per tick. The golem is immovable in separation; others move around it.

All enemies move first, then separation runs once over the enemy list in order, each enemy reading its neighbours' current positions. The 6 neighbours are the first 6 overlapping ones in grid order. Against an immovable neighbour an enemy moves the whole overlap, since the neighbour will not move its half. Two enemies at exactly the same point separate along x, the lower id to the left.

### 8.2 Cap
`MAX_ENEMIES = 400`. The spawner does not spawn above the cap, and a mage summons only as many skeletons as fit under it. Enemies that continue one that just died (the two slime children, the ghost after a burn) and the golem are always added, so the count can pass the cap by those; the spawner then waits until it is below again. The golem counts toward the cap like any enemy. The cap exists for performance, not design. While the cap is reached the budget does not bank up: it is clamped to at most 1, so freeing slots never releases a burst.

### 8.3 Despawn
An enemy farther than `DESPAWN_DIST = 1400 px` from the tower is removed silently and its spawn budget refunded, so kiting cannot starve the horde. The check runs at the end of the enemies step; the refund adds 1 to the budget, so the enemy reappears on the ring on the next spawner step. A despawn is not a kill and drops no gem. The golem is never despawned.

### 8.4 Specials

Specials run in the enemies step before the enemy walks; a busy enemy (a casting mage, a summoning skeleton) does not walk that tick but still takes part in separation and can be hit.

- **Slime split.** When a `gen == 0` slime dies it counts as a kill, plays `death01` and drops its gem like any enemy, but its effect is `slime.split` (with its `flip` and `alpha`) instead of `slime.die`. Two slimes with `gen = 1` and the parent's tier, HP 1 and radius 8 at tier 1 (scaled by the tier like any enemy's, §8.6), appear in the deaths step. With `u` the unit direction from the parent to the tower (`(0, 1)` if the parent is at the tower centre), the first appears at `parent + 20 × (−u.y, u.x)` and the second at `parent − 20 × (−u.y, u.x)`, so they flank its path. They inherit nothing else (the tier aside) and drop their own gems when killed. A `gen = 1` slime dies normally.
- **Mage cast.** A mage's `castTimer` counts enemies steps since it spawned, or since its last cast started. When it reaches `MAGE_CAST_INTERVAL` (480 ticks) the timer restarts at 0 and a cast starts, unless the mage's centre is less than 80 px from the tower's centre at that moment: then the cast is skipped and the mage walks on. A cast lasts 60 ticks (1 s) counting the tick it starts; the mage stands still and loops `mage.spell`. At the end of its last cast tick it returns to `mage.walk` and summons 4 skeletons of its own tier 40 px from its centre, at 45°, 135°, 225° and 315° from its direction toward the tower, so it walks on between the front two. Casts therefore start every 8 s; the 1 s cast is part of the 8 s. The summon has no sound (`death02` is not used).
- **Summoned skeletons** start on `skelly.summon` frame 0. They join the enemy list at once (separation, collisions, the cap) but first act on the next tick. While `skelly.summon` plays they do not walk; they can be hit and damaged and they do touch the tower. On the tick the anim ends they switch to `skelly.walk` and walk from the next tick on.
- **Ghost knight burn.** A dying ghost knight counts as a kill, plays `death01` and drops its gem; its effect is `ghost.burn` with its `flip`, `alpha` and tier and `life` 30 ticks (0.5 s): the anim is 22 ticks long and holds its last frame for the rest. The burn is an effect, so it is not hit and does not touch the tower. In the effects step of the tick it finishes, the burn is removed and a ghost appears at its position with its `flip` and tier, so the ghost has the ghost knight's tier. The ghost is added even when the cap is full. No ghost rises once the phase is no longer `'play'`.
- **Golem.** It spawns with `hp = GOLEM_HP` and `unkillable`; it never dies and never despawns. A hit takes nothing off its HP (the damage function deals it 0, §12.1), which stays `GOLEM_HP`; on every hit, whatever the hit's knock (§8.7), it moves `GOLEM_KNOCKBACK` (1 px) along the unit direction from the hitting projectile's position (for the ring, the ring fireball; for an explosion, its centre) to the golem's centre, `(0, 1)` if they coincide, and sound `hit_golem` plays. The knockback is applied at once, before the next separation. `procImmune` marks it as immune to procs (§12). It is immovable in separation (§8.1) and deals 40 DPS on contact (§7.2).

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

- **State.** Every enemy has `tier` (1–4), set when it is created and never changed. The spawner draws it from the timeline's tier weights (§9); a summoned skeleton has its mage's tier, a slime child its parent's, and a ghost the tier of the ghost knight it rose from (§8.4). The golem is always tier 1, whatever it is created with.
- **Multipliers** apply to the type's §8 numbers (a slime child's HP 1 and radius 8 included): HP is `ceil(HP × multiplier)` (a bronze knight has 8; every hit deals whole damage, §12.1, so rounding up kills on the same hit as the exact product), the speed and the radius are multiplied as they are, contact DPS is multiplied where it is dealt (§7.2), and the gem is worth the type's XP times the tier's (§14). Resistances, mage orbs (§8.5) and every timer are the same at every tier.
- **Sprites.** The tier sprites are generated from the plain ones at build time (§3.3, §3.5): each tier's tint (luminance-preserving, so the shading survives), then a 1 px outline in the tier's colour, which also fills thin sprites' gaps. `<anim>@t<tier>` exists for every anim of every enemy type but the golem, with the plain anim's frame durations, so `frame` and `frameTicks` mean the same at every tier. The sim keeps the plain anim names in `anim`; the renderer draws the tier's sprite at the tier's screen scale (§5), always a whole multiple of the source pixels. Death effects (`die`, `slime.split`, `ghost.burn`) carry the dying enemy's tier and are drawn the same way.
- **The bestiary** shows the tiers met per type and the multipliers (§17.1).

### 8.7 Knockback

Hits push enemies back, so a build can hold a crowd off the tower. Every weapon has a `knock` in px (§10), an explosion has `EXPLODE_KNOCK = 10`, and every enemy type a `mass` (§8 table).

- A hit with knock `k` pushes the enemy it hits `k × (1 + force) / mass` px, with `force` the Force buff's value (+50% per level, 0 without it, §11), straight away from the hit's source: the projectile's position, the ring fireball, or the explosion centre; along `(0, 1)` when the source is at the enemy's centre. A mass of 1 takes the knock as it is.
- The push is applied in the damage function (§12.1) right after the damage, at once. It is a displacement, not a velocity: one hit moves an enemy exactly that far, never more, and nothing carries over to later ticks. Separation (§8.1) sorts out any overlap on the next enemies step.
- A killing hit pushes nothing: the enemy dies, drops its gem and plays its death where it was hit.
- The knock is read with the other stats: a projectile carries `knock × (1 + force)` from the moment it is fired (§11), and its split children inherit it; the ring's and an explosion's are read at the hit.
- Mass is the type's at every tier (§8.6): a gold knight is pushed as far as a plain one.
- The golem has no mass and ignores knock: every hit moves it `GOLEM_KNOCKBACK` px (§8.4).
- Knockback draws no random numbers. Every knock and mass is *unmeasured*.

---

## 9. Spawning and the timeline

Enemies spawn on a ring just outside the view: pick a random angle and place the enemy at `camera centre + 560 px × (cos a, sin a)` (half the diagonal of 960×600 is about 566). The spawner keeps a budget: `budget += rate(t) × DT`; while `budget >= 1`, spawn one and subtract 1.

`rate(t)` and type weights come from the timeline table in `content.js`. `rate` is linearly interpolated between rows; weights switch at the row boundary.

The spawner uses `t` at the start of the tick. The weights are those of the last row with `row.t <= t`. Each spawn draws, from `game.rng`, its type from the weights, then its tier from the row's tier weights (§8.6) **only when the row has tier weights**, then its angle. A row without tier weights spawns tier 1 and draws no tier, so a timeline without tier weights draws exactly as it would without tiers; a row whose tier weights are all 0 draws one and spawns tier 1. A draw picks the first entry (types in column order, tiers 1 to 4) whose weight exceeds what is left of `rng × total weight`. The camera centre is the dragon's position.

| Time | Rate (enemies/s) | Knight | Skeleton | Slime | Mage | Ghost knight | Plain | Bronze | Silver | Gold |
|---|---|---|---|---|---|---|---|---|---|---|
| 0:00 | 0.3 | 100 | 0 | 0 | 0 | 0 | – | – | – | – |
| 0:30 | 0.5 | 70 | 30 | 0 | 0 | 0 | – | – | – | – |
| 1:00 | 0.6 | 50 | 30 | 20 | 0 | 0 | – | – | – | – |
| 2:00 | 2.5 | 40 | 25 | 25 | 10 | 0 | – | – | – | – |
| 2:30 | 6.25 | 40 | 25 | 25 | 10 | 0 | 90 | 10 | 0 | 0 |
| 3:00 | 10 | 30 | 25 | 20 | 10 | 15 | 85 | 15 | 0 | 0 |
| 3:30 | 13 | 30 | 25 | 20 | 10 | 15 | 80 | 15 | 5 | 0 |
| 4:00 | 16 | 25 | 25 | 20 | 10 | 20 | 75 | 17 | 8 | 0 |
| 5:00 | 18 + golem | 25 | 25 | 20 | 10 | 20 | 65 | 20 | 10 | 5 |

*unmeasured*. Plain, Bronze, Silver and Gold are the tier weights; `–` means the row has none. The 2:30 and 3:30 rows start tiers: their rates are the ones interpolated between their neighbours and their type weights are the row before's, so they change only the tiers. At 5:00 the mega golem spawns on the ring on the far side of the tower from the dragon and `ohno` plays: in the clock step of the first tick where `t >= 300` (the `t` of the timeline row marked `golem`; a timeline without such a row has no golem), once per run, at `dragon + 560 px × normalize(tower − dragon)`, or straight below the dragon if dragon and tower coincide. It ignores the cap. The timeline keeps running after 5:00 (rate stays at 18) until the tower falls.

---

## 10. Weapons

The player has up to **4 weapon slots**. Each weapon has levels 1–5. Weapons fire automatically on cooldown; there is no fire button. Stat buffs (§11) multiply the base values below.

`cooldown` is in seconds, `damage` is per hit, before resistances. Every weapon has a damage type (`type` in its `content.js` entry, §12.1): Fireball, Mini tower and Ring are fire, Laser is arcane. Every weapon also has a `knock` (§8.7), the px one of its hits pushes an enemy of mass 1 before Force:

| Weapon | Knock px |
|---|---|
| Fireball | 4 |
| Laser | 2 |
| Mini tower (its shots) | 4 |
| Ring | 8 |

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

Precisely: in the weapons step the ring turns by `spin × DT` degrees (its `angle` starts at 0 and wraps at 2π) and places its `n = count + amount` fireballs at `dragon + orbit × area × (cos, sin)(angle + i × 2π / n)`, after the dragon has moved, in `balls`. In the collisions step, after the projectiles, every ball hits every live enemy whose circle overlaps its own (radius 6, not scaled by area) and whose `rehit` entry is absent or not after the current `tickCount`; a hit deals `damage` (× Might, rounded up) as fire damage with the ring's knock × Force through the damage function (§12.1), which pushes the enemy away from the ball (§8.7; the golem by its own rule, §8.4), and sets the entry to `tickCount + rehit` in ticks; it spawns no effect. Balls are checked in order and enemies in grid order, so two balls over one enemy hit it once. Expired entries are dropped in the weapons step, so ids of dead enemies do not pile up. The ring takes Might, Area, Amount and Force only: Haste and Velocity do not change `rehit` or `spin`. It rolls no procs and draws no random numbers.

---

## 11. Buffs

Up to **4 buff slots**, levels 1–3. Seven generic buffs reach every weapon where their stat exists; three chance buffs are rolled per projectile hit, by the projectile's damage type (§12).

| Buff | Icon | L1 | L2 | L3 | Applies to |
|---|---|---|---|---|---|
| Might | `icon.might` | +20% | +40% | +60% | all damage, rounded up |
| Haste | `icon.haste` | −10% | −20% | −30% | every weapon cooldown and the mini tower's fireRate |
| Area | `icon.nuke` | +20% | +40% | +60% | projectile radius, explosion radius, ring orbit |
| Velocity | `icon.speed` | +20% | +40% | +60% | projectile speed and range |
| Duration | `icon.duration` | +25% | +50% | +75% | mini-tower life |
| Force | `icon.force` | +50% | +100% | +150% | the knock of every hit (§8.7) |
| Amount | `icon.amount` | +1 | +2 | +3 | fireballs and lasers per volley, ring fireballs, mini towers' maxActive |
| Explode | `icon.explode` | 20% | 35% | 50% | fire projectiles; at L3 also arcane (lasers explode) |
| Split | `icon.split` | 20% | 35% | 50% | fire projectiles |
| Pierce | `icon.laser` | 20% | 35% | 50% | arcane projectiles; at L3 also fire (fireballs pierce) |

*unmeasured*.

Buff maths, with `m, h, a, v, u, f, n` the current Might, Haste (negative), Area, Velocity, Duration, Force and Amount values (0 when not owned):

- damage = `ceil(base × (1 + m))` for every weapon, the ring included (2 at +20% is 3);
- every weapon cooldown and the mini tower's `fireRate` × `(1 + h)`;
- projectile radius (fireball, laser, mini-tower shot), explosion radius and ring orbit × `(1 + a)`;
- projectile speed and range × `(1 + v)`;
- mini-tower life × `(1 + u)`;
- every knock × `(1 + f)` (§8.7);
- `n` more fireballs per fireball volley (§10.1), lasers per laser volley (§10.2), ring fireballs (§10.4) and mini towers standing at once (§10.3). A mini tower's shots stay single.

Stats are read when a projectile is fired or a mini tower lobbed, so a buff gained later does not change projectiles already in flight. Buffs live in `game.buffs` in the order gained, which is also their HUD order.

---

## 12. Procs

Resolved in `projectiles.js` when a projectile hits an enemy, in this order: damage (with its knockback, §8.7), explode roll, split roll, pierce roll. Explosions and piercing are earned: without the Explode buff nothing explodes, and without the Pierce buff every projectile stops at its first hit.

**Affinity.** A chance buff applies to a projectile by the projectile's damage type (§12.1), from the buff level shown:

| Buff | fire | arcane |
|---|---|---|
| Explode | L1 | L3 |
| Split | L1 | never |
| Pierce | L3 | L1 |

So fireballs and mini-tower shots explode and split from L1 and pierce only at Pierce L3; lasers pierce from L1, explode only at Explode L3 and never split. Physical projectiles (none yet) have no procs.

- **Explode:** spawn an explosion at the hit point with radius `60 px × area`, damage equal to the projectile's damage, hitting every enemy in the circle once (the enemy already hit is excluded). Sprite `explosion.big` (fire) or `explosion.laser` (arcane) scaled to the radius. Explosions do not chain; an explosion is not a projectile. Sound `explosion01`.
- **Split:** spawn 2 fireballs from the hit point at ±45° from the projectile's direction, same damage, `gen + 1`. Projectiles with `gen >= 2` cannot split. Split children can still explode and pierce.
- **Pierce:** the projectile keeps flying and ignores the enemy it just hit. A projectile remembers the ids it has hit (small array, max 8).
- **Golem:** immune to all procs. Hits still knock it back.

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
| Nothing yet (claws, bite and saw blade will be) | physical |

Each enemy type has a resistance `r` per damage type, in `[−0.5, 1]` (§8 table): `r < 0` is a weakness, `r > 0` a resistance, `r = 1` immunity.

**The damage function.** Every hit on an enemy, from every weapon, goes through one function, `dealDamage(game, enemy, amount, type, source, knock)` in `damage.js`: projectile hits (§10, §12), explosions (§12) and the ring (§10.4) today, and every later weapon. `amount` is the hit's damage after Might (§11), `type` its damage type, `source` the hitter's position (the projectile, the ring fireball or the explosion centre), `knock` the hit's knock after Force (§8.7; 0 when left out). It:

1. against an unkillable enemy (the golem) deals nothing: its HP stays `GOLEM_HP`, it is knocked back `GOLEM_KNOCKBACK` from `source` whatever the `knock` and `hit_golem` plays (§8.4); returns 0. Damage types do not affect the golem.
2. otherwise takes the effective resistance `r' = max(−0.5, r − shred[type])` and deals `0` when `r' ≥ 1`, else `max(1, ceil(amount × power[type] × (1 − r')))`, with `power` and `shred` from `game.meta` (§4.1; 1 and 0 without an armoury). Rounding up comes after every multiplier, so any hit that is not immune does at least 1.
3. takes that off the enemy's HP; if the enemy's HP is still above 0, pushes it `knock / mass` px straight away from `source` (§8.7); returns the damage (not capped at the HP the enemy had left). The enemy dies in the deaths step as before (§8), when its HP is 0 or below.

Might is rounded up when a projectile is fired or the ring hits (§11), then the damage function rounds again: a level-1 fireball (2) deals 3 to a slime (fire −0.5) and 2 to a ghost (fire 0.25: `ceil(1.5)`); a level-1 laser (1) deals 1 to a mage (arcane 0.5: `ceil(0.5)`) and 2 to a ghost (arcane −0.5). The damage function draws no random numbers. Mage orbs hit the dragon and the tower, not an enemy, and do not use it.

**Armoury.** `game.meta` (§4.1) holds the out-of-game upgrades per damage type: `power[type]` multiplies all damage of that type, `shred[type]` lowers every enemy's resistance to it, never below −0.5. Both are neutral (1 and 0) unless the `Game` is built with `meta`; the browser builds every `Game` with the meta of the armoury's ranks (§13.1).

---

## 13. Boss and run end

- At 5:00 the mega golem spawns (§9). It walks at the tower at 75 px/s (faster than any other enemy and than the following tower, slower than the dragon, so only a tower dragged on the tether outruns it) and deals 40 DPS on contact. It cannot die and is never despawned. Each hit knocks it back 1 px away from the hitter, so a strong build slows it but cannot hold it off: once it arrives the tower falls within seconds unless the dragon drags it away. Hit sound `hit_golem`. Details in §8.4.
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

- Each enemy drops a gem worth its `XP` value times its tier's XP multiplier (§8.6) at its death position. Gems are static. A gem within `DRAGON_PICKUP_RADIUS` moves toward the dragon at 500 px/s and is collected on contact. Sound `pickup`. Gems never expire. `MAX_GEMS = 600`; when exceeded, the oldest gem's value is merged into the gem nearest to it.
- XP to next level: `xpToNext(level) = 3 + 3 × level` (level 1 needs 6, level 10 needs 33). *unmeasured*.
- On level-up the sim increments `game.pendingLevelUps`. The loop sees it and shows the level-up screen. Several pending level-ups are shown one after the other.

Gems precisely:

- A gem is `{ id, x, y, value, homing }`, dropped in the deaths step before the death effect. Enemies worth no XP (the golem) drop nothing.
- When a drop would make more than `MAX_GEMS`, the oldest gem is removed and its value added to the remaining gem nearest to it (ties: lower id), the new one included. No XP is lost.
- In the gems step each gem whose centre is within `DRAGON_PICKUP_RADIUS` of the dragon starts homing and keeps homing until collected, even if the dragon walks away: it moves 500 px/s straight at the dragon (never past it). A gem whose centre is then within `GEM_COLLECT_RADIUS = 12` px (*unmeasured*) of the dragon is collected: its value is added to `xp`, it is removed, and sound `pickup` plays.
- After collecting, while `xp >= xpToNext(level)`: `xp` drops by that amount, `level` goes up by one and so does `pendingLevelUps`. The overflow carries over and several level-ups can queue in one tick. `level` is the level reached, so the HUD and the game-over screen already count queued level-ups.

Level-up flow, the only entry point being `tick(intent)`:

- Whenever `pendingLevelUps > 0`, `game.offers` holds the current cards, and `tick` does not advance the world: no step of §2.1 runs, `tickCount` is unchanged and `events` are still cleared.
- If `intent.pick` is a valid index into `offers`, that card is applied, `pendingLevelUps` drops by one, sound `powerup` plays, and the next offers are rolled if level-ups remain (otherwise `offers` becomes empty). The tick that applies a pick does not advance the world either; it runs again on the next tick. Any other `pick` is ignored. So picks are part of the intent stream and a replay of the intents replays the run.
- Offers are rolled with `game.rng` when the first level-up is queued (end of the gems step) and after each pick, from the build at that moment; an empty roll ends the queue (§14.1). A pick sent on the tick that queues a level-up is not applied, since the offers did not exist when that tick began.
- If the tower falls on the tick a level-up is queued, the offers are dropped (`offers` empty, `pendingLevelUps` 0).
- The loop shows the level-up screen while the run is in `'play'` and `offers` is not empty, and keeps calling `tick` with the pick.

### 14.1 Card pool
Build the pool, then draw 3 distinct cards with weights:

| Card | Condition | Weight |
|---|---|---|
| New weapon X | X not owned, weapon slot free | 3 |
| Upgrade weapon X to L+1 | owned, L < 5 | 4 |
| New buff Y | Y not owned, buff slot free | 3 |
| Upgrade buff Y to L+1 | owned, L < 3 | 3 |
| Repair tower +25 HP | while any other card is in the pool, or tower HP is below `REPAIR_OFFER_BELOW = 0.5` of max HP (*unmeasured*) | 1; it becomes the only card when the pool is otherwise empty |

A card shows the icon, name, level or NEW, and one line of effect text. Choose with mouse click, keys 1/2/3, or gamepad d-pad + A. Sound `powerup`.

Precisely:

- **Pool order** is fixed: the weapons in the order Fireball, Laser, Mini Tower, Ring, then the buffs in the §11 table order, then Repair. A weapon or buff is either an upgrade (owned, below its cap), a new card (not owned, a slot free) or absent.
- **Drawing:** `min(3, pool size)` cards without replacement. Each card takes one `game.rng()`: `r = rng × total weight`, then the first card in pool order whose weight exceeds what is left of `r` (subtracting the weights passed). The chosen card leaves the pool before the next draw. Repair (weight 1) is in the pool whenever any other card is; once the build is full (every weapon slot and buff slot filled and at its cap) it is in the pool only while `hp < 0.5 × maxHp`, so a hurt full build is offered Repair alone and a healthy one is offered nothing.
- **Empty pool:** when the offers rolled for a pending level-up come out empty, no card is shown and every pending level-up passes at once (`pendingLevelUps` becomes 0, `offers` stays empty): the levels are still gained, no `rng` is drawn, no sound plays and the world keeps running. This happens when the first level-up is queued and after a pick (a Repair that lifts the tower to half HP or above ends the rest of the queue).
- **Card:** `{ kind: 'weapon' | 'buff' | 'repair', id, level }`, `level` being the level after the pick (1 = new). A new weapon fires on the next weapons step; an upgrade keeps the weapon's timer and state. A new buff is appended to `game.buffs`. **Repair** restores 25 tower HP, capped at `maxHp`.
- **Names:** Fireball, Laser, Mini Tower, Ring; Might, Haste, Area, Velocity, Duration, Force, Amount, Explode, Split, Pierce; Repair.
- **Icons:** weapons as in §17, buffs as in §11, Repair the `castle` at 1×.
- **Tag:** `NEW` for level 1, `L<n>` for an upgrade, none for Repair.
- **Text:** a new weapon has a short description (Fireball "Aimed fireballs", Laser "Fast long-range aimed laser", Mini Tower "Lobs turrets that shoot your fireball", Ring "Fireballs orbit the dragon"). A weapon upgrade lists the first three stats that change, in the order damage, count, maxActive, duration, fireRate, cooldown, orbit, spin, rehit, spread, speed, range, labelled `dmg, count, max, life, rate, cd, orbit, spin, rehit, spread, speed, range`, as `dmg 1→2, cd 1.3→1.2, speed 700→750`. A buff shows its value at the new level (`+40% damage`, `-20% cooldowns`, `+40% area and orbit`, `+40% shot speed and range`, `+50% mini tower life`, `+100% knockback`, `+2 shots, ring balls, max mini towers`, `35% chance fireballs split in two`). Explode and Pierce name their crossover: below L3 `35% fireballs explode; L3: lasers too` and `35% lasers pierce; L3: fireballs too`, at L3 `50% chance to explode; lasers explode too` and `50% chance to pierce; fireballs pierce too`. Repair shows `Tower +25 HP`.

**Level-up screen** (`screens.js`, over a 60% black overlay): the title `LEVEL UP` at y 100, `<n> more to pick` below it when more level-ups wait, then the cards in a centred row, each 260×220 px with a 24 px gap, top at y 170. A card shows its key number (1–3) top left, its tag top right (green `NEW`, yellow `L<n>`), the icon at 3× its icon scale, the name, and the effect text in the largest monospace size from 15 px down to 9 px that fits the card. The highlighted card has a yellow border. Below the row a hint names the controls.

**Picking** (`app.js`): keys 1/2/3 pick the card with that number if it is shown; a left click inside a card picks it (clicks elsewhere do nothing); gamepad d-pad left/right moves the highlight, clamped to the cards shown, and A picks the highlighted card. The highlight starts on the first card for every new set of offers. Pause works on the level-up screen as anywhere in a run.

---

## 15. Collision and the grid

`grid.js` is a spatial hash with 64 px cells keyed by packed integers. It is rebuilt from scratch every tick from the enemy list, which is cheap at 400 enemies. The query `nearby(x, y, radius)` returns candidate enemies.

Enemies are stored by their centre. The grid is built twice per tick: after enemies move (for separation) and at the start of the collisions step; a third time in the weapons step when a landed mini tower needs a target (§10.3). `nearby` returns every enemy whose centre lies in a cell touching the query square, a superset of those within `radius`, in a fixed order; callers do the circle test. Queries for circle overlaps add the largest radius among the stored enemies to their radius.

Checks per tick:
- projectile vs enemy: grid query at the projectile position, then a circle test.
- ring fireball vs enemy: same, with the per-enemy rehit timer map.
- enemy vs tower: grid query within `TOWER_RADIUS + 60` of the tower, then a circle test.
- explosion vs enemy: grid query at the explosion centre within its radius plus the largest radius, then a circle test.
- mini tower target: grid query in a 300 px radius, pick the nearest.

Knockback (§8.7) moves enemies during the collisions step without rebuilding the grid: later queries that tick use the cells of the step's build and test circles at the enemies' current positions, so an enemy pushed into another cell can be missed until the next build.
- gem vs dragon: gems are not in the grid; a linear scan is fine at 600.
- enemy shot vs dragon: a linear scan of `game.enemyShots`, one circle test each.

---

## 16. Input

`input.js` produces an `Intent` each frame.

| Action | Keyboard and mouse | Gamepad |
|---|---|---|
| Move | WASD or arrows | left stick |
| Aim | mouse position relative to the dragon on screen | right stick, deadzone 0.25 |
| Pick card | 1/2/3 or click | d-pad left/right + A |
| Pause | Esc or P | Start |
| Bestiary (§17.1) | Tab | Back / Select |
| Retry | Enter or click | A |
| Armoury (§13.1), from the title | U or the Armoury button | Y |
| Armoury: select, buy, back | move keys; Enter or click; Esc, P or U | d-pad; A; B, Y or Start |

Mouse aim always sets `hasAim = true`. Gamepad aim sets `hasAim` only when the stick is outside the deadzone. The last device that produced input wins, so plugging in a controller just works.

Details:

- **Keyboard:** keys are read by `KeyboardEvent.code`, so the layout does not matter. The move vector is (right − left, down − up) normalised; opposite keys cancel. Enter (and keypad Enter) is `confirm`; Digit1–3 and Numpad1–3 are `pick` 0–2; Tab is `bestiary` (its browser default, moving focus, is suppressed). Pause, bestiary, confirm and pick are edges: one per press, never from auto-repeat.
- **Mouse:** the position is tracked over the whole window and converted from CSS pixels to internal pixels with the canvas's bounding rect (`x = (clientX − left) × 960 / width`, likewise y). The aim is the unit vector from the dragon's screen position (its centre) to the mouse; before the mouse has moved there is no mouse aim, and a mouse exactly on the dragon gives none. Only the left button counts as a click.
- **Gamepad:** the first connected pad in the browser's standard mapping. Both sticks use a radial deadzone of 0.25: inside it the stick reads zero, outside it the raw vector clamped to length 1 (the left stick is analog movement). Buttons: A (0) is `confirm`, Start (9) pauses, Back / Select (8) is `bestiary`, d-pad left/right (14/15) navigate the level-up cards; all are edges against the previous frame.
- **Menus:** U and gamepad Y (3) give the `armoury` edge, gamepad B (1) the `back` edge. Every press of a move key and every new d-pad press (up 12, down 13, left 14, right 15) gives a one-step `menu` edge `{ x, y }`, read only by the armoury screen; the level-up cards keep reading the d-pad's left/right.
- **Last device:** a frame counts as keyboard-and-mouse activity when a key is held or pressed, or the mouse moved or clicked; as gamepad activity when a stick is outside its deadzone or a button was newly pressed. Move and aim come only from the current device. When both are active in the same frame the keyboard and mouse win.

---

## 17. HUD

Top centre: run timer `m:ss`. Top left: tower HP bar in red with the number. Bottom: XP bar across the full width with the level number at the left. Below the timer: owned weapon icons with level pips, then buff icons. Text uses the browser's monospace font at 2× pixel scale; the original `dragonfont` is a stretch goal.

| Element | Layout |
|---|---|
| Timer | `m:ss` of `floor(t)`, centred at the top (y 12) |
| Tower HP | bar 200×16 px at (12, 12) with a black border, red fill proportional to `hp / maxHp`; `ceil(hp)/maxHp` to its right |
| Icons | one 34 px slot per owned weapon (in slot order), a 16 px gap, then one per buff; the row is centred, icons at y 50 |
| Level pips | under each icon at y 72: one 4×4 px pip per level (5 for weapons, 3 for buffs), yellow up to the current level, dark after |
| XP bar | 14 px high across the bottom, blue fill proportional to `xp / xpToNext(level)`; `LV n` just above its left end |

Text is 16 px monospace (32 px for screen titles) with a 2 px black drop shadow. All HUD numbers *unmeasured*.

Weapon icons: fireball → frame 0 of `fireball.anim`; laser → frame 12 (facing right) of `laser.dir`; mini tower → `castle` at 1× (30 px); ring → `icon.ring`. Buff icons are the §11 icons. Icons draw at the standard 2× sprite scale unless stated.

The title and pause screens list the controls: move, aim, pause and the bestiary (`Foes  Tab  Back`).

### 17.1 Bestiary

An enemy stats panel, so a player can read the matchups (§12.1) at any time.

- **Open and close** (`app.js`): Tab or gamepad Back / Select opens it during a run, from play (the level-up screen included) or from pause, in `'play'` or `'dying'`; it is ignored on the title and game-over screens. While it is open the loop runs no ticks, as with pause. Tab, Back, Esc, P or Start closes it, back to the screen it was opened from (the run or pause). Window blur leaves it open.
- **Layout** (`render/bestiary.js`, 960×600 over a 60% black overlay): the title `BESTIARY` (32 px) centred at y 24; one card per enemy type, in the order of the §8 table, in two columns of 452 px cards with a 16 px gap, centred, filled row by row from y 72; each card is `min(110, floor((468 − 8 × (rows − 1)) / rows))` px high with 8 px between rows, so up to 10 types fit above y 540; the tier legend at y 546; the hint `Tab or Esc to close` centred at y 568.
- **A card of a type met this run** (`game.seen`, §4.1): its walk anim, animated in real time at the sim's 60 Hz frame durations while the panel is open, centred in an 80 px box at the card's left, at the standard 2× (1× when 2× does not fit the box, as for the golem), with the type's alpha; its name (16 px); `HP n  XP n`, `SPD n  DPS n` and `MASS n` below (14 px, 18 px apart; the golem's HP is `∞`, and having no mass its third line is `KNOCKBACK 1`, its fixed push per hit, §8.7); and three resistance rows, Fire, Arcane and Physical: the name, a 52×10 px bar filled to `|r|` of its width (full at 100%), and a label in the bar's colour: `weak N%` in red for `r < 0`, `0%` in grey (a thin grey line instead of a fill) for `r = 0`, `resist N%` in blue for `0 < r < 1`, `immune` in gold for `r ≥ 1`, with `N = round(|r| × 100)`. The resistance shown is the effective one, after `game.meta`'s shred (§12.1). The golem shows `takes no damage` instead of the three rows. Under the sprite, 6 px from the card's bottom, a row of four 6×6 px tier pips 3 px apart with a 1 px black edge, centred in the box: a tier of this type met this run (`game.seenTiers`) in its colour (plain `#e8e8e8`, then the bronze, silver and gold outline colours of §3.3), one not met dark. The golem, always tier 1, has no pips.
- **Tier legend:** one 14 px line centred at y 546: `Tiers`, the four pips in their colours, then the multipliers of the tiers in that order, `HP ×1/2.5/6/15  DPS ×1/1.25/1.5/2  XP ×1/2/4/8  SPD ×1/1/0.9/0.8`, made from the §8.6 table.
- **A type not met yet:** frame 0 of its walk as a flat dark silhouette, the name `???`, no stats and no resistances.
- The panel reads the game and never writes it. All layout numbers *unmeasured*.

---

## 18. Audio

Web Audio API. All WAVs decoded at load. `audio.play(name, { volume })` with a cap of **16 simultaneous voices** and a per-sound minimum interval of 50 ms, so 40 fireball hits in one tick play one sound. Browsers require a user gesture to start audio, so the title screen's Start click resumes the context. No music in the demo.

A voice counts from its start until its buffer's duration has passed, on the audio context's clock. A sound that is throttled or over the cap is dropped, not queued. A sound that fails to load is skipped with a console warning. Every key press and click also tries to resume a suspended context (a gamepad button is not a user gesture in browsers). `start_game` plays once the context is running, on Start and on Retry. Master volume 0.6 *unmeasured*; `volume` defaults to 1.

---

## 19. Debug

Query parameter `?debug=1` exposes the App as `window.app` for the console (read it; only the loop calls `tick`) and enables: collision circles, tick time and entity counts, keys F1–F4 to grant each weapon at level 5, F5 to jump to 4:50, `+` and `-` to change game speed. `?seed=N` fixes the RNG.

Precisely:

- **Debug commands travel in the intent.** The page builds every `Game` with `{ debug: true }`; F1–F4 (fireball, laser, mini tower, ring) and F5 become `intent.debug = { grant: '<weapon id>' }` or `{ jumpTo: 290 }` on the next tick that runs, like `pick`. Presses queue in order and travel one per tick, so presses made in frames that run no tick are not lost. A `Game` built without `debug` ignores the field, so a normal run cannot be changed by it, and a replay of the same intents, debug commands included, gives the same digest. A malformed command is ignored. Commands are read only on a tick that advances the world (not while level-up offers are open, nor in `'dying'` or `'over'`), before step 1 of §2.1; the tick then runs as usual.
- **Grant** sets the weapon to level 5 if owned, else adds it at level 5 when a weapon slot is free (it fires on that tick's weapons step). It does not use a level-up.
- **Jump** sets `tickCount` to `round(jumpTo / DT)` and `t` with it, only forward. Nothing in between is simulated: the spawner reads its rate and weights from the new `t`, its budget is unchanged, and the golem spawns at 5:00 as usual.
- **Game speed** is the loop's: `+` / `-` (also keypad) step through 0.25×, 0.5×, 1×, 2×, 4×. The accumulator adds `real time × speed`, and above 1× the cap of 4 ticks per frame scales with the speed (16 at 4×), so 4× runs 4 ticks per 60 Hz frame. The sim is untouched.
- **Overlay** (`render/debug.js`, drawn from game state and loop stats only): circles for enemies (`r`), the tower (`TOWER_RADIUS`), projectiles, enemy shots, ring fireballs, landed mini towers' 300 px target radius, the dragon's hit circle (`DRAGON_RADIUS`) and its pickup radius; at the top right the average ms per tick (smoothed), ticks run in the last frame, the game speed, the counts of enemies, projectiles, enemy shots (`orbs`), gems and effects, `t` and the seed. With `debug`, the browser defaults of F1–F5, `+` and `-` are suppressed.

---

## 20. Testing

`npm test`. The sim has no DOM, so tests construct `new Game({ seed })` and call `tick(intent)` directly.

- **Determinism:** two games with the same seed and the same intent sequence produce identical state after 300 s of ticks (compare a JSON digest).
- **Tether:** inside the tether the tower follows the dragon and stops at `TOWER_REST_DIST`; while the dragon walks away the tower is dragged exactly `TETHER_LENGTH` behind it; `tower.moved` says whether it moved.
- **Dragon:** facing follows the horizontal move, then the aim, then the last facing; the walk frame holds at 0 while still and advances while moving.
- **Procs:** with `rng` stubbed to return 0, a fireball with explode chance L1 spawns an explosion that damages a second enemy in range. Affinity: at L1, L2 and L3 a fire and an arcane projectile roll exactly the procs of the §12 table, and nothing without the buff.
- **Buffs:** each buff's maths, Amount per weapon (fan, parallel lasers, ring fireballs, mini towers), Duration on mini-tower life, card names and texts.
- **Knockback:** a hit pushes `knock × (1 + force) / mass` straight away from its source (projectile, ring fireball, explosion centre); a killing hit pushes nothing; the golem still moves exactly `GOLEM_KNOCKBACK`.
- **Level-up:** the world is frozen while offers are open (the digest does not change on ticks without a pick); the same seed and the same intents, picks included, give the same digest.
- **Damage types:** every weapon's hits (projectile, explosion, split child, mini-tower shot, ring) carry their type; resistance maths with weakness, resistance, immunity and rounding; `meta` power and shred (floored at −0.5); the golem takes nothing from any type and is still knocked back; `game.seen` records types as they are first created; the bestiary's layout, bar styles and silhouettes, drawn under node without writing the game.
- **Armoury:** gold from score; rank costs; buying (affordable, unaffordable, maxed) and refunding; untrusted purse data clamped; the storage wrapper round trip and a throwing or blocked storage; ranks → `meta`; the App flow title ↔ armoury (keys, buttons, clicks), buying, Reset's confirm step, the game-over payout once, Retry and `?seed` runs using the ranks, a reload reading the purse back; the screen's layout and navigation; the input edges.
- **Slime split:** killing a gen-0 slime yields two gen-1 slimes; killing those yields none.
- **Tiers:** the multipliers and the radius at every tier; the golem stays tier 1; children inherit the tier through a slime split, a ghost knight's burn and a mage's summon; gems and contact damage scale; a timeline without tier weights draws no extra random number (the same digest with and without tier rows before the first one); the draw order type, tier, angle; `game.seenTiers`; the manifest's tier expansion and every tier sprite in the committed atlas (the plain frames with the tier's ops, 2 px larger, the same ticks); the renderer drawing the tier sprite at the tier's scale; the bestiary's pips and legend.
- **Ghost:** killing a ghost knight yields a ghost after the burn effect finishes.
- **Mage:** a mage starts casting 8 s after it spawns and has spawned 4 skeletons 1 s later, unless within 80 px of the tower.
- **Mage orbs:** a mage fires only within `MAGE_ORB_RANGE` of the dragon and never while casting, every 3 s from its spawn offset; an orb flies straight at where the dragon was; a hit removes it and takes `MAGE_ORB_DAMAGE` from the tower; a dodged orb expires after 400 px; a game without mages draws no extra random numbers.
- **Timeline:** at t = 300 s the golem exists; at t = 0 only knights spawn.
- **Soak:** run 5 minutes with a scripted dragon that circles the tower, on the default timeline with every rate from 3:00 on raised to at least 30/s. Assert no exceptions, the spawner never spawns above the cap (§8.2), and the tower eventually dies. The test holds the tower at full HP until the golem has spawned, so the run reaches 5:00 whatever the balance; the horde reaches the cap on the way (asserted), and the golem then ends the run. It stays in the default suite (a few seconds).
- **Atlas:** `build-atlas.mjs` run on the manifest produces every name the game asks for. `content.js` lists its required atlas names and the test cross-checks them.
- **Art:** the art parser (frames, key by name or hex, transparency, durations, every error with its file and line), the palette file and tool, the off-palette warning, the variants on synthetic frames (tint keeps luminance and its order, outline grows by 2 px and borders opaque pixels edge-on only, op order swap → tint → outline, frame-key suffixes), art and `from` entries built into an atlas, and the committed atlas holding every art file pixel for pixel. Every file under `art/` parses with no warning and is used by the manifest. None of these needs the pack.
- **Balance instrument:** `node tools/measure.mjs` plays headless runs over a pool of seeds (16 by default, a 420 s cap) and prints, per bot, median, min and max survival time, how many runs reached 5:00 and the cap, kills, level, what ended the fallen runs and how often the tower moved, as Markdown. A bot is a movement policy plus a pick rule, named `<policy>+<pick>`. The tower follows the dragon, so every policy is anchored to a fixed world point, home (the dragon's start), never to the tower. Policies: `idle` gives no input (stands on home, fires right, collects nothing, dodges nothing); `aim` stands on home and lets the tower come to rest; `kite` walks a circle of 80 px around home, inside the tether, so the tower keeps following on a smaller circle. `aim` and `kite` aim at the enemy nearest the tower; whenever a gem that is not yet homing lies within 300 px of home (`--gem-range` changes it) they fly to the one nearest the dragon instead; and a mage orb within 100 px that will pass within its radius + `DRAGON_RADIUS` + 4 px of the dragon overrides both: they step straight away from its path, the most imminent orb first (`--no-dodge` turns it off). Pick rules, used while level-up offers are open: `naive` takes card 0; `greedy` takes Repair when tower HP is below 40%, else a new weapon, else the upgrade of the highest-level weapon, else a buff upgrade, else a new buff (among buffs in the order Might, Haste, Amount, Explode, Split, Pierce, Area, Velocity, Force, Duration), else card 0. A fall's cause is the source (an enemy type's contact, or orbs) that took the most tower HP in the 30 s before it. `--timeline` adds tower HP, enemies alive, kills, spawned and level over time; `--causes` adds the tower HP lost by source per window and the HP repaired; `--set` runs a what-if (a timeline rate, the tower HP, an enemy field) without editing `content.js`; `--meta fire:P/S,arcane:P/S,physical:P/S` plays every run with those armoury ranks (Power/Shred, types left out 0/0), mapped to `meta` as the browser maps them (§13.1). Tests run one short seed per bot and pin the anchoring, the dodge and the damage split.

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

Unchanged from the design: meta progression beyond the armoury (§13.1), multiple stages, evolutions, terrain, mobile, music, controller rumble, merchants, royals, fireball lob, claw.

## 23. Open decisions

- **Enemy facing:** horizontal flip only. The original did not flip enemies; if it looks wrong, drop the flip.
- **Big fireball sprite** switches at level 4. If it reads as a different weapon, keep the small sprite and only scale the radius.
