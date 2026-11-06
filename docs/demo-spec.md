# Dragon Survivors demo: implementation spec

**Written:** 2026-11-06 · **Builds on:** [demo-design.md](00-vision/demo-design.md) · **Engine:** plain JavaScript, HTML canvas, no framework

This document is the authority for the demo. If code and spec disagree, the code is wrong. Numbers marked *unmeasured* were set by judgement and may change after play-testing; change the spec when you change the number.

---

## 1. Goals and constraints

- A 5-minute run that feels like Vampire Survivors with the dragon-and-tower twist.
- Runs in a desktop browser from static files. No bundler, no framework, no npm runtime dependencies. ES modules loaded by `index.html`.
- Reuses the dragongame sprites and sounds unchanged, converted once by a build script.
- Keyboard + mouse and gamepad both work from day one.
- Game logic is headless and deterministic so it can run under `node --test` without a DOM.

Change from the high-level design: the dragon does **not** body-block enemies. It flies above them and never collides with them. The player's job is to kill, kite, and collect gems. The tower is the only thing enemies touch.

---

## 2. Project layout

```
dragon-survivors/
  index.html              canvas + script tag, nothing else
  src/
    main.js               load assets, build Game, start the loop
    loop.js               fixed-step loop (tick) + render on requestAnimationFrame
    input.js              keyboard, mouse, gamepad -> Intent
    assets.js             atlas image + atlas.json + decoded sounds
    audio.js              Web Audio playback with a voice cap
    render/
      draw.js             world rendering (background, entities, effects)
      hud.js              timer, tower HP bar, XP bar, weapon/buff icons
      screens.js          title, level-up cards, game over
    sim/                  no DOM, no canvas, no Date. Pure state + tick.
      game.js             Game state, tick order, run timeline
      rng.js              seeded PRNG (mulberry32)
      content.js          data tables: enemies, weapons, buffs, timeline
      anims.js            generated: per-frame tick durations of every atlas anim
      dragon.js
      tower.js
      enemies.js          AI, movement, separation, death behaviours
      spawner.js
      weapons.js          cooldowns, firing, ring, mini tower
      projectiles.js      movement, hits, procs
      effects.js          one-shot animations (explosions, deaths)
      gems.js             XP gems, attraction, pickup
      levelup.js          card pool, offers, applying picks
      grid.js             spatial hash
  assets/
    atlas.png, atlas.json
    sounds/*.wav
  tools/
    build-atlas.mjs       BMP -> atlas.png + atlas.json (Node, no deps)
    manifest.json         which dragongame sequences to import, under which names
    copy-sounds.mjs
  test/
    *.test.mjs            node --test
  docs/
```

Serve with any static server (`python -m http.server` or `npx serve`). The only build step is `node tools/build-atlas.mjs`, which reads `E:\code\dragongame\assets` (path set in `manifest.json`) and writes into `assets/`.

### 2.1 Tick order

`Game.tick(intent)` runs these in order, every tick:

1. Apply intent: dragon velocity and aim direction.
2. Move the dragon.
3. Tether: move the tower if needed (§7.1).
4. Spawner: add enemies for this tick (§9).
5. Enemies: AI target, move, separation, special timers (mage cast, ghost transition).
6. Weapons: advance cooldowns, fire, spin the ring, run mini towers.
7. Projectiles: move, expire by range.
8. Collisions: projectile vs enemy, ring vs enemy, enemy vs tower.
9. Deaths: play death animations, drop gems, split slimes, turn ghost knights into ghosts.
10. Gems: attract and collect, add XP, queue level-ups.
11. Effects: advance one-shot animations, remove finished ones.
12. Clock: advance `t`, spawn the golem at 5:00, check tower HP for game over.

---

## 3. Asset pipeline

### 3.1 Source format

- Sprites are `.bmp`, 24-bit or 8-bit palette, bottom-up rows. Transparency key is pure black `(0,0,0)`, as in the original (`AddTransparent(Color(0,0,0))`).
- A sequence is a `.txt` file listing one bmp filename per line (paths relative to the txt). The optional first line `FANCY` switches to `filename N` where N is the frame's duration in game ticks at 30 ticks per second.
- A few files list several names on one line separated by spaces (`dragon/fly.txt`). Split on whitespace.

### 3.2 Build script

`tools/build-atlas.mjs`:

1. Reads `manifest.json`: a list of entries like `{ "name": "knight.walk", "list": "knight/knight.txt" }` for sequences and `{ "name": "castle", "file": "castle/castle0000.bmp" }` for single frames.
2. Decodes each BMP with its own decoder (handles `biBitCount` 8 and 24, bottom-up rows, 4-byte row padding) and sets the key colour to alpha 0.
3. Packs all unique frames into one PNG with a shelf packer and 1px padding. Writes the PNG using Node's built-in `zlib` (no library).
4. Writes `atlas.json`:

```json
{
  "frames": { "knight/knight0000.bmp": { "x": 0, "y": 0, "w": 16, "h": 16 } },
  "anims":  { "knight.walk": { "frames": ["knight/knight0000.bmp", "knight/knight0001.bmp"], "ticks": [6, 6] } }
}
```

`ticks` are per-frame durations in **60 Hz ticks** (the sim rate, §4). Plain lists get a default of 6 ticks per frame (the original advanced most animations every 3 of its 30 Hz ticks). FANCY durations are doubled. Single-frame entries get `ticks: [6]`.

5. Writes `src/sim/anims.js`, `export const ANIMS = { name: { ticks: [...] } }`, sorted by name: the same `ticks` as `atlas.json`, so the sim can advance and finish animations without reading files. It is generated and committed; never edit it by hand.

### 3.3 Manifest (what the demo imports)

| Atlas name | Source | Notes |
|---|---|---|
| `dragon.dir` | `dragon_fly/fly.txt` | **16 facing directions, not an animation.** See §6.3. 25px. |
| `knight.walk`, `knight.die` | `knight/knight.txt`, `knight/die.txt` | 16px |
| `skelly.walk`, `skelly.die`, `skelly.summon` | `skelly/skelly.txt`, `skelly/die.txt`, `skelly/summon.txt` | summon plays when a mage spawns them |
| `slime.walk`, `slime.die`, `slime.split` | `slime/slime_walk.txt`, `slime/slime_die.txt`, `slime/slime_reproduce.txt` | |
| `mage.walk`, `mage.die`, `mage.spell` | `mage/mage.txt`, `mage/die.txt`, `mage/spell.txt` | |
| `ghost.knight`, `ghost.burn`, `ghost.ghost` | `ghostnight/ghost_knight.txt`, `ghostnight/ghost_knight_burn.txt`, `ghostnight/ghost.txt` | burn = death-to-ghost transition |
| `golem.walk`, `golem.die` | `golem/golem.txt`, `golem/golem_death.txt` | 64px. `die` unused in the demo (golem is unkillable) but imported for later |
| `fireball.anim` | `fireball/fireball.txt` | 8px, 8-frame looping animation |
| `fireball.big` | `fireball/big_fireball.txt` | 12px |
| `laser.dir` | `fireball/laser.txt` | 8px, **16 directions** |
| `laser.bigdir` | `fireball/laser_15.txt` | 12px, 16 directions |
| `castle` | `castle/castle0000.bmp` | 30px. Tower and mini tower |
| `castle.destroy` | `castle/destroy_castle.txt` | tower death |
| `explosion.small`, `explosion.big` | `explosion/explosion.txt`, `explosion/explosion_big0000..0005.bmp` | 30px, 57px |
| `explosion.laser`, `explosion.laserbig` | `explosion/laser_explosion0000..0005.bmp`, `explosion/laser_explosion_even_bigger_good_with_sparks0000..0005.bmp` | 45px, 64px |
| `burn` | `burn/burn.txt` | 16px, reserved |
| `icon.laser`, `icon.explode`, `icon.split`, `icon.ring`, `icon.speed`, `icon.big`, `icon.multi`, `icon.nuke` | `bonus/bonuslaser1.bmp`, `bonus/bonusexplosion1.bmp`, `bonus/bonussplit1.bmp`, `bonus/bonusring1.bmp`, `bonus/bonusspeed1.bmp`, `bonus/bonusbig1.bmp`, `bonus/bonusmulti1.bmp`, `bonus/bonusnuke1.bmp` | level-up card icons, roughly 9px |
| `gem` | none, drawn procedurally | 6px diamond, two colours |

Sounds copied as-is from the pack root: `shoot01`, `laser01`, `explosion01`, `explosion02`, `death01`, `death02`, `pickup`, `powerup`, `hit_golem`, `megaslime_hit`, `slime_poke`, `destroy_castle_sound`, `start_game`, `ohno`, `win_level_2`.

---

## 4. Loop and timing

- **Sim tick:** fixed 60 Hz (`DT = 1/60`). All speeds in this spec are world pixels per second; the sim multiplies by `DT`.
- `loop.js` accumulates real time, runs up to 4 ticks per frame (clamps if the tab was hidden), then renders. No interpolation in the demo.
- When the level-up screen or pause is open, ticks stop; the renderer still draws.
- `Game.tick(intent)` is the only entry point into the sim. `intent` is `{ moveX, moveY, aimX, aimY, hasAim, confirm, pick }` with move and aim as unit vectors or zero, `pick` in `{0,1,2,-1}`.
- All randomness goes through `game.rng` (mulberry32, seed passed to the `Game` constructor). Tests pass a fixed seed.

---

## 5. World, camera, rendering

- **Internal resolution:** 960×600, matching the original. The canvas is scaled to fit the window with CSS (`image-rendering: pixelated`), keeping the aspect ratio, integer scale when possible.
- **Sprite scale:** every sprite is drawn at **2×** source size (a 16px knight is 32px on screen). World coordinates are internal screen pixels, so all radii below are in those units.
- **World:** unbounded plane. No terrain in the demo. The camera is centred on the dragon.
- **Background:** a 64×64 grass tile generated once at startup into an offscreen canvas (dark green base, a few lighter speckles from the seeded RNG), tiled with the camera offset. A faint darker ring at tether length around the tower makes the tether rule readable.
- **Draw order:** background, gems, tower, mini towers, enemies sorted by y, ring fireballs, projectiles, dragon, effects, HUD.
- **Facing:** enemies flip horizontally when moving left (`ctx.scale(-1, 1)`). The dragon uses its 16-direction sheet (§6.3).
- `draw.js` reads the game state and never writes it. Animation indices live in the entity (`anim`, `frame`, `frameTicks`) and advance during the tick, so rendering is stateless.

---

## 6. Dragon

| Constant | Value |
|---|---|
| `DRAGON_SPEED` | 260 px/s *unmeasured* |
| `DRAGON_PICKUP_RADIUS` | 48 px *unmeasured* |
| Collision with enemies | none |
| HP | none (cannot die) |

### 6.1 Movement
Velocity = `move × DRAGON_SPEED`. Instant acceleration.

### 6.2 Aim
`aim` comes from the right stick, or from the mouse position relative to the dragon on screen. When `hasAim` is false (stick centred), aimed weapons fire in the **last aim direction**, and if there never was one, in the movement direction. Aimed weapons never stall for lack of input.

### 6.3 Facing sprite
`dragon.dir` has 16 frames indexed counter-clockwise on screen starting from up: 0 = up, 4 = left, 8 = down, 12 = right. With `a = Math.atan2(dy, dx)` in screen coordinates (y down):

```js
frame = (Math.round(-a / (2 * Math.PI) * 16) + 12 + 16) % 16
```

The dragon faces the aim direction. A flying bob is faked by offsetting y by ±1 px on a 20-tick cycle.

---

## 7. Tower and tether

| Constant | Value |
|---|---|
| `TOWER_HP` | 100 *unmeasured* |
| `TETHER_LENGTH` | 150 px *unmeasured* |
| `TOWER_SPEED` | 200 px/s *unmeasured*, below dragon speed so it lags |
| `TOWER_RADIUS` | 26 px, collision circle for enemies |
| Sprite | `castle` at 2× = 60 px |

### 7.1 Tether rule
Each tick, if `dist(tower, dragon) > TETHER_LENGTH`, the tower moves toward the dragon at `TOWER_SPEED` until the distance is exactly `TETHER_LENGTH` (clamp, never overshoot). Otherwise it stays put. The tower never moves on its own.

### 7.2 Damage
Enemies whose circle overlaps the tower circle deal `contactDps × DT` each tick (continuous, not per hit). When HP reaches 0 the run ends (§13). Tower HP does not regenerate; the Repair card restores 25.

### 7.3 Visual
Draw the castle with a 4 px HP bar above it. Stretch goal: three tiny figures (`castle/royal_figure_*`) walking at the base of the tower while it moves, the minions carrying it.

---

## 8. Enemies

All enemies target the **tower**: desired velocity = `normalize(tower − self) × speed`. Each enemy is a circle. They play `walk` while alive and `die` on death; a dying enemy becomes an effect and stops colliding.

| Type | HP | Speed px/s | Radius | Contact DPS | XP | Sprite | Special |
|---|---|---|---|---|---|---|---|
| Knight | 3 | 55 | 12 | 10 | 1 | `knight` | none |
| Skeleton | 1 | 90 | 10 | 6 | 1 | `skelly` | none |
| Slime | 2 | 70 | 12 | 8 | 1 | `slime` | on death, if `gen == 0`, spawns 2 slimes with `gen = 1`, HP 1, radius 8, at ±20 px. Parent plays `slime.split` instead of `die`. |
| Mage | 4 | 40 | 12 | 5 | 5 | `mage` | every `MAGE_CAST_INTERVAL = 8 s` since spawn it stops for 1 s (`spell` anim) and spawns 4 skeletons in a 40 px ring around itself, each playing `skelly.summon` once before walking. Will not cast within 80 px of the tower. |
| Ghost knight | 3 | 55 | 12 | 10 | 2 | `ghost.knight` | on death plays `ghost.burn` once (0.5 s, not collidable), then becomes a **Ghost**. |
| Ghost | 2 | 72 | 10 | 8 | 1 | `ghost.ghost` | drawn at 60% alpha. Dies normally. |
| Mega golem | ∞ | 30 | 56 | 40 | none | `golem` | §13. Every hit pushes it 6 px away from the hitter. Immune to procs. |

All numbers *unmeasured*.

### 8.1 Separation
Enemies push apart so they do not stack. For each enemy, query the grid for neighbours within `r1 + r2` and move away by half the overlap along the separating axis. Cap at 6 neighbours per enemy per tick. The golem is immovable in separation; others move around it.

### 8.2 Cap
`MAX_ENEMIES = 400`. The spawner does not spawn above the cap. The cap exists for performance, not design.

### 8.3 Despawn
An enemy farther than `DESPAWN_DIST = 1400 px` from the tower is removed silently and its spawn budget refunded, so kiting cannot starve the horde.

---

## 9. Spawning and the timeline

Enemies spawn on a ring just outside the view: pick a random angle and place the enemy at `camera centre + 560 px × (cos a, sin a)` (half the diagonal of 960×600 is about 566). The spawner keeps a budget: `budget += rate(t) × DT`; while `budget >= 1`, spawn one and subtract 1.

`rate(t)` and type weights come from the timeline table in `content.js`. `rate` is linearly interpolated between rows; weights switch at the row boundary.

| Time | Rate (enemies/s) | Knight | Skeleton | Slime | Mage | Ghost knight |
|---|---|---|---|---|---|---|
| 0:00 | 1.5 | 100 | 0 | 0 | 0 | 0 |
| 0:30 | 2.5 | 70 | 30 | 0 | 0 | 0 |
| 1:00 | 3.5 | 50 | 30 | 20 | 0 | 0 |
| 2:00 | 5 | 40 | 25 | 25 | 10 | 0 |
| 3:00 | 7 | 30 | 25 | 20 | 10 | 15 |
| 4:00 | 10 | 25 | 25 | 20 | 10 | 20 |
| 5:00 | 12 + golem | 25 | 25 | 20 | 10 | 20 |

*unmeasured*. At 5:00 the mega golem spawns on the ring on the far side of the tower from the dragon and `ohno` plays. The timeline keeps running after 5:00 (rate stays at 12) until the tower falls.

---

## 10. Weapons

The player has up to **4 weapon slots**. Each weapon has levels 1–5. Weapons fire automatically on cooldown; there is no fire button. Stat buffs (§11) multiply the base values below.

`cooldown` is in seconds, `damage` is per hit. Projectiles live until they hit (unless they pierce) or have travelled `range` px.

### 10.1 Fireball (starting weapon, aimed, fires from the dragon)
Fires `count` fireballs in the aim direction in a fan of `spread` degrees.

| Level | cooldown | damage | count | spread | speed | range |
|---|---|---|---|---|---|---|
| 1 | 0.9 | 2 | 1 | 0 | 420 | 420 |
| 2 | 0.8 | 2 | 1 | 0 | 420 | 420 |
| 3 | 0.8 | 3 | 2 | 15 | 420 | 450 |
| 4 | 0.7 | 3 | 2 | 15 | 460 | 480 |
| 5 | 0.6 | 4 | 3 | 20 | 460 | 520 |

Sprite `fireball.anim`, `fireball.big` from level 4. Radius 6 px (8 when big). Spawns `explosion.small` on hit. Sound `shoot01`.

### 10.2 Laser (aimed, fires from the dragon)
Fast, piercing, lower damage. The laser always passes through enemies up to `maxHits`; the pierce buff adds hits instead of a chance (§11).

| Level | cooldown | damage | count | speed | range | maxHits |
|---|---|---|---|---|---|---|
| 1 | 1.4 | 1 | 1 | 700 | 600 | 3 |
| 2 | 1.3 | 1 | 1 | 700 | 600 | 4 |
| 3 | 1.2 | 2 | 1 | 750 | 650 | 5 |
| 4 | 1.1 | 2 | 2 | 750 | 650 | 6 |
| 5 | 1.0 | 3 | 2 | 800 | 700 | 8 |

Sprite `laser.dir` using the same 16-direction formula as the dragon, `laser.bigdir` from level 4. Spawns `explosion.laser` on each hit. Sound `laser01`.

### 10.3 Mini tower (auto-targeting, fires from the tower)
Every `cooldown` seconds the tower lobs a mini tower that lands 80 px toward the nearest enemy (random direction if none). A mini tower is a stationary turret alive for `duration` seconds that shoots a fireball (damage `damage`, speed 380, range 300) at the nearest enemy within 300 px every `fireRate` seconds. At most `maxActive` mini towers exist; the oldest is removed when exceeded.

| Level | cooldown | duration | fireRate | damage | maxActive |
|---|---|---|---|---|---|
| 1 | 6 | 8 | 0.8 | 2 | 1 |
| 2 | 6 | 10 | 0.7 | 2 | 2 |
| 3 | 5 | 10 | 0.6 | 3 | 2 |
| 4 | 5 | 12 | 0.5 | 3 | 3 |
| 5 | 4 | 14 | 0.4 | 4 | 4 |

Sprite `castle` at 1× (30 px, half the real tower). The lob is a 0.5 s arc drawn as the sprite rising and falling 30 px. Mini towers cannot be damaged.

### 10.4 Ring (not aimed, orbits the dragon)
`count` fireballs orbit the dragon at radius `orbit` px with angular speed `spin` degrees/s, evenly spaced. Each enemy can be hit by the ring at most once every `rehit` seconds. Ring damage does not trigger procs.

| Level | count | orbit | spin | damage | rehit |
|---|---|---|---|---|---|
| 1 | 2 | 60 | 180 | 2 | 0.5 |
| 2 | 3 | 60 | 180 | 2 | 0.5 |
| 3 | 3 | 70 | 220 | 3 | 0.4 |
| 4 | 4 | 70 | 220 | 3 | 0.4 |
| 5 | 5 | 80 | 260 | 4 | 0.3 |

Sprite `fireball.anim`, radius 6 px.

---

## 11. Buffs

Up to **4 buff slots**, levels 1–3. Stat buffs multiply every weapon. Chance buffs are rolled per projectile hit.

| Buff | Icon | L1 | L2 | L3 | Applies to |
|---|---|---|---|---|---|
| Damage | `icon.big` | +25% | +50% | +80% | all damage, rounded up |
| Cooldown | `icon.multi` | −10% | −20% | −30% | all cooldowns and fireRate |
| Area | `icon.nuke` | +20% | +40% | +60% | projectile radius, explosion radius, ring orbit |
| Projectile speed | `icon.speed` | +20% | +40% | +60% | projectile speed and range |
| Explode chance | `icon.explode` | 20% | 35% | 50% | fireball, laser, mini-tower shots |
| Split chance | `icon.split` | 20% | 35% | 50% | fireball, mini-tower shots |
| Pierce chance | `icon.laser` | 20% | 35% | 50% | fireball, mini-tower shots: survive the hit. Laser: +1/+2/+3 maxHits instead |

*unmeasured*.

---

## 12. Procs

Resolved in `projectiles.js` when a projectile hits an enemy, in this order: damage, explode roll, split roll, pierce roll.

- **Explode:** spawn an explosion at the hit point with radius `60 px × area`, damage equal to the projectile's damage, hitting every enemy in the circle once (the enemy already hit is excluded). Sprite `explosion.big` scaled to the radius, or `explosion.laserbig` for lasers. Explosions do not chain; an explosion is not a projectile. Sound `explosion01`.
- **Split:** spawn 2 fireballs from the hit point at ±45° from the projectile's direction, same damage, `gen + 1`. Projectiles with `gen >= 2` cannot split. Split children can still explode and pierce.
- **Pierce:** the projectile keeps flying and ignores the enemy it just hit. A projectile remembers the ids it has hit (small array, max 8).
- **Golem:** immune to all procs. Hits still knock it back.

---

## 13. Boss and run end

- At 5:00 the mega golem spawns (§9). It walks at the tower at 30 px/s and deals 40 DPS on contact. It cannot die. Each hit knocks it back 6 px, so a strong build can hold it off for a while. Hit sound `hit_golem`.
- The run ends when tower HP reaches 0. Play `castle.destroy` and `destroy_castle_sound`, freeze the sim for 2 s, then show the game-over screen: time survived, level reached, kills, and a **Retry** button (new seed).
- Score is `seconds survived + kills`. There is no win condition in the demo; surviving past 5:00 is the goal and the golem is what stops you.

---

## 14. XP, gems, level-up

- Each enemy drops a gem worth its `XP` value at its death position. Gems are static. A gem within `DRAGON_PICKUP_RADIUS` moves toward the dragon at 500 px/s and is collected on contact. Sound `pickup`. Gems never expire. `MAX_GEMS = 600`; when exceeded, the oldest gem's value is merged into the gem nearest to it.
- XP to next level: `xpToNext(level) = 5 + 3 × level` (level 1 needs 8, level 10 needs 35). *unmeasured*.
- On level-up the sim increments `game.pendingLevelUps`. The loop sees it, stops ticking, and shows the level-up screen. Several pending level-ups are shown one after the other.

### 14.1 Card pool
Build the pool, then draw 3 distinct cards with weights:

| Card | Condition | Weight |
|---|---|---|
| New weapon X | X not owned, weapon slot free | 3 |
| Upgrade weapon X to L+1 | owned, L < 5 | 4 |
| New buff Y | Y not owned, buff slot free | 3 |
| Upgrade buff Y to L+1 | owned, L < 3 | 3 |
| Repair tower +25 HP | always | 1; it becomes the only card when the pool is otherwise empty |

A card shows the icon, name, level or NEW, and one line of effect text. Choose with mouse click, keys 1/2/3, or gamepad d-pad + A. Sound `powerup`.

---

## 15. Collision and the grid

`grid.js` is a spatial hash with 64 px cells keyed by packed integers. It is rebuilt from scratch every tick from the enemy list, which is cheap at 400 enemies. The query `nearby(x, y, radius)` returns candidate enemies.

Checks per tick:
- projectile vs enemy: grid query at the projectile position, then a circle test.
- ring fireball vs enemy: same, with the per-enemy rehit timer map.
- enemy vs tower: grid query within `TOWER_RADIUS + 60` of the tower, then a circle test.
- mini tower target: grid query in a 300 px radius, pick the nearest.
- gem vs dragon: gems are not in the grid; a linear scan is fine at 600.

---

## 16. Input

`input.js` produces an `Intent` each frame.

| Action | Keyboard and mouse | Gamepad |
|---|---|---|
| Move | WASD or arrows | left stick |
| Aim | mouse position relative to the dragon on screen | right stick, deadzone 0.25 |
| Pick card | 1/2/3 or click | d-pad left/right + A |
| Pause | Esc or P | Start |
| Retry | Enter or click | A |

Mouse aim always sets `hasAim = true`. Gamepad aim sets `hasAim` only when the stick is outside the deadzone. The last device that produced input wins, so plugging in a controller just works.

---

## 17. HUD

Top centre: run timer `m:ss`. Top left: tower HP bar in red with the number. Bottom: XP bar across the full width with the level number at the left. Below the timer: owned weapon icons with level pips, then buff icons. Text uses the browser's monospace font at 2× pixel scale; the original `dragonfont` is a stretch goal.

---

## 18. Audio

Web Audio API. All WAVs decoded at load. `audio.play(name, { volume })` with a cap of **16 simultaneous voices** and a per-sound minimum interval of 50 ms, so 40 fireball hits in one tick play one sound. Browsers require a user gesture to start audio, so the title screen's Start click resumes the context. No music in the demo.

---

## 19. Debug

Query parameter `?debug=1` enables: collision circles, tick time and entity counts, keys F1–F4 to grant each weapon at level 5, F5 to jump to 4:50, `+` and `-` to change game speed. `?seed=N` fixes the RNG.

---

## 20. Testing

`npm test`. The sim has no DOM, so tests construct `new Game({ seed })` and call `tick(intent)` directly.

- **Determinism:** two games with the same seed and the same intent sequence produce identical state after 300 s of ticks (compare a JSON digest).
- **Tether:** moving the dragon 500 px to the right leaves the tower exactly `TETHER_LENGTH` behind it.
- **Procs:** with `rng` stubbed to return 0, a fireball with explode chance L1 spawns an explosion that damages a second enemy in range.
- **Slime split:** killing a gen-0 slime yields two gen-1 slimes; killing those yields none.
- **Ghost:** killing a ghost knight yields a ghost after the burn effect finishes.
- **Mage:** after 8 s a mage has spawned 4 skeletons unless within 80 px of the tower.
- **Timeline:** at t = 300 s the golem exists; at t = 0 only knights spawn.
- **Soak:** run 5 minutes with a scripted dragon that circles the tower. Assert no exceptions, enemy count never exceeds the cap, and the tower eventually dies.
- **Atlas:** `build-atlas.mjs` run on the manifest produces every name the game asks for. `content.js` lists its required atlas names and the test cross-checks them.

---

## 21. Milestones

Each milestone is playable on its own.

1. **Skeleton.** Atlas build, loop, input, dragon flying over grass with the 16-direction sprite, camera, tower following on the tether.
2. **Horde.** Knights spawn, walk at the tower, damage it. Separation and grid. Fireball weapon auto-firing with aim. Death animations. Game over screen.
3. **Growth.** Gems, XP, level-up screen, all 4 weapons, all 7 buffs, procs.
4. **Roster.** Skeleton, slime, mage, ghost knight. Timeline table. Golem at 5:00.
5. **Polish.** Sounds, HUD icons, title screen, debug tools, soak test, and a balance pass that replaces the *unmeasured* numbers.

---

## 22. Out of scope

Unchanged from the design: meta progression, multiple stages, evolutions, elements, terrain, mobile, music, controller rumble, merchants, royals, fireball lob, claw.

## 23. Open decisions

- **Minion carriers** for the tower are a stretch goal in milestone 5, visual only.
- **Enemy facing:** horizontal flip only. The original did not flip enemies; if it looks wrong, drop the flip.
- **Big fireball sprite** switches at level 4. If it reads as a different weapon, keep the small sprite and only scale the radius.
