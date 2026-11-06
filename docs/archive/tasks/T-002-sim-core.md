# T-002: Headless sim core

**Source:** [demo-spec.md](../../demo-spec.md) milestones 1–2 · **Model:** Opus · **Depends on:** nothing (runs in parallel with T-001)

## Why

Everything else (rendering, roster, growth) builds on the sim's state shape and tick order. This task fixes both, with knights and the fireball only, fully tested under `node --test`.

## What

Implement under `src/sim/` (no DOM, see the purity check in `tools/check.mjs`):

| File | Scope in this task |
|---|---|
| `rng.js` | mulberry32 |
| `content.js` | **every** table in the spec transcribed as data: constants (§6, §7, §8.2–8.3, §14), enemy table (all 7 types, §8), timeline (§9), all four weapon tables (§10), buffs (§11), `xpToNext`, and `ATLAS_NAMES` (every atlas name the game uses, §3.3). Later tasks only read these. |
| `grid.js` | spatial hash, 64 px cells, packed integer keys, `nearby(x, y, radius)` (§15) |
| `dragon.js` | movement, aim with fallbacks, 16-direction facing frame, bob (§6) |
| `tower.js` | tether clamp (§7.1), continuous contact damage (§7.2) |
| `enemies.js` | target tower, move, separation with the 6-neighbour cap and immovable golem (§8.1), despawn with budget refund (§8.3), generic death into an effect playing `<type>.die`. Specials (slime split, mage cast, ghost) are T-004; leave clear hook points. |
| `spawner.js` | ring spawn at 560 px around the camera centre (= dragon), budget, timeline interpolation, weights by row, `MAX_ENEMIES` (§8.2, §9). Implement the whole timeline generically; only the golem at 5:00 is left to T-004. |
| `weapons.js` | weapon slots, cooldowns, fireball at all 5 levels (§10.1). Laser, mini tower, ring are T-005. |
| `projectiles.js` | move, expire by range, hit enemy via grid, damage, `explosion.small` effect. Keep a `hits` array per projectile (§12) ready for procs; procs are T-005. |
| `effects.js` | one-shot animations; a shared anim helper that advances `frame`/`frameTicks` from `ANIMS` in `anims.js` and reports when a non-looping anim finishes |
| `game.js` | `Game` class, the tick order of §2.1 as one function per step (steps without content yet are empty functions with a comment naming the task that fills them), the clock, game over |

`src/sim/anims.js` already exists (generated; T-001 owns its generator). Read it, never edit it.

## Decisions already made (write the interface ones into the spec, see below)

- **RNG:** `game.rng` is a plain function returning a float in `[0, 1)`. Tests stub it as `game.rng = () => 0`. Every random draw in the sim calls `this.rng()`; never cache a reference to it at construction.
- **Units:** sim positions in world px, speeds in px/s, `DT = 1/60`. `game.t` is seconds, derived from an integer `game.tickCount` (`t = tickCount * DT`) so time never drifts.
- **Phases:** `game.phase` is `'play' | 'dying' | 'over'`. When tower HP reaches 0: phase becomes `'dying'`, a `castle.destroy` effect spawns at the tower, sound `destroy_castle_sound`. During `'dying'` only effects advance (rendering stays stateless) and after 2 s the phase becomes `'over'`. `tick()` in `'over'` does nothing. Title, pause and the level-up screen are the loop's business, not phases.
- **Events:** `game.events` is cleared at the start of every tick; systems push `{ type: 'sound', name }`. The browser plays them. Sounds this task emits: `shoot01` per fireball volley, `death01` on enemy death, `destroy_castle_sound` at tower death.
- **Entity shape** (renderer reads these, never writes): every drawable has `x, y, anim, frame, frameTicks`; enemies also `id, type, r, hp, flip, alpha`; projectiles `id, kind, x, y, dx, dy, speed, r, damage, range, travelled, hits, gen, dirFrame` (`dirFrame` for 16-direction sprites); effects `scale, alpha, done`. Ids come from one counter `game.nextId`.
- **Dragon** has `x, y, aimX, aimY, moveX, moveY, dirFrame, bob`; **tower** has `x, y, hp, maxHp`. The dragon starts at (0, 0); the tower starts at (0, 60), below the dragon.
- **Run counters:** `game.kills`, `game.level` (1), `game.xp` (0), `game.pendingLevelUps` (0), `game.weapons` (`[{ id: 'fireball', level: 1, timer }]`), `game.buffs` (`[]`), `game.score()` = seconds survived + kills.
- **Intent:** exactly spec §4. A missing or partial intent is treated as all zeros.
- **Digest:** `game.digest()` returns a short string hash (for example FNV-1a over a canonical JSON of the state, numbers rounded to 1e-6) used by the determinism test.
- **Spawn ring centre** is the dragon position (the camera follows the dragon).
- **Enemy facing:** `flip = true` when the enemy's x-velocity is negative (spec §5; open decision D-1 in [decisions.md](../../decisions.md) may remove it later).
- **Death:** a killed enemy is removed from `game.enemies` in the deaths step, `kills++`, and a non-colliding effect plays its `die` anim at its position with the same `flip`. Gems are T-005: leave a single function call point (`dropGem(enemy)`, empty for now).
- Removing entities: no `splice` in hot loops; compact arrays in place or rebuild.

## Spec edits this task makes

- New subsection **§4.1 Sim state** with the decided interface above (RNG function, phases, events, entity fields, digest) as plain spec text.
- Any gap you resolve under the [ambiguity protocol](../../process/ambiguity-protocol.md), in its own section.

## Spec sections to read (whole)

§1, §2 (all), §4, §5, §6, §7, §8, §9, §10 (intro and 10.1; skim the other tables to transcribe them), §11 (to transcribe), §12 (to know what the projectile must keep), §13, §14 (constants only), §15, §20.

## Tests

One file per module where it makes sense (`test/rng.test.mjs`, `test/grid.test.mjs`, `test/sim-core.test.mjs`, …). At least:

- rng: same seed gives the same sequence; values in `[0, 1)`.
- grid: `nearby` returns every enemy within the radius (compare with brute force on a random set).
- **Determinism** (§20): two games, same seed, same scripted intents, 300 s of ticks (the tower may die earlier; then compare at the end) → equal digests; a different seed → different digest.
- **Tether** (§20): moving the dragon 500 px right leaves the tower exactly `TETHER_LENGTH` behind; inside the tether the tower does not move.
- **Timeline** (§20, partial): during the first 30 s only knights spawn; spawned count over a window matches the integrated rate within 1.
- Enemy cap never exceeded under a forced high rate; despawn refunds the budget.
- Contact damage: one knight overlapping the tower for 1 s removes 10 HP (±1 tick).
- Fireball kills a knight in 2 hits at level 1 (3 HP, damage 2); aim fallback order (aim → last aim → movement → a default) holds.
- Game over: tower HP 0 → `'dying'`, `castle.destroy` effect, then `'over'` after 2 s; `tick()` in `'over'` changes nothing.
- Sim purity: covered by `npm run check`.

## Must not

Edit `docs/backlog.md`, merge, push `main`, add dependencies, touch `src/sim/anims.js`, write browser code (`src/*.js`, `src/render/` are T-003).

## Done means

`npm run gate` green; the spec has §4.1; the commit body follows [agent-workflow.md](../../process/agent-workflow.md) with `Closes: T-002`.
