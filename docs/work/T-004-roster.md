# T-004: Roster: skeleton, slime, mage, ghost knight, golem

**Source:** [demo-spec.md](../demo-spec.md) milestone 4 · **Model:** Opus · **Depends on:** T-002 (sim core)

## Why

The run needs its full cast: the timeline already spawns every type by weight, but only knights behave correctly. The golem at 5:00 is the wall that ends a run.

## What

Sim only (`src/sim/`), using the hook points T-002 left (read `game.js`, `enemies.js` and the T-002 commit body first):

1. **Skeleton:** no special; confirm the generic path covers it.
2. **Slime split:** on death a `gen == 0` slime spawns two `gen = 1` slimes (HP 1, radius 8) at ±20 px and plays `slime.split` instead of `slime.die`. Gen-1 slimes die normally.
3. **Mage cast:** every `MAGE_CAST_INTERVAL` since spawn, stop for 1 s playing `mage.spell`, then spawn 4 skeletons on a 40 px ring around the mage. Each summoned skeleton plays `skelly.summon` once before it starts walking.
4. **Ghost knight:** on death plays `ghost.burn` for 0.5 s (not collidable, not a target), then a **ghost** enemy appears at that spot. Ghost drawn at `alpha 0.6`, dies normally.
5. **Mega golem at 5:00:** spawns once, on the spawn ring on the far side of the tower from the dragon; sound `ohno`. Unkillable, knocked back 6 px away from the hitter on every hit (sound `hit_golem`), immune to procs (set a flag T-005 will honour), immovable in separation, contact 40 DPS.

## Decisions already made

- **Slime offsets:** the two children are placed at ±20 px **perpendicular** to the parent's direction toward the tower (so they flank it rather than stack on its path). They inherit nothing else. Each child drops its own XP when killed; the parent also drops its XP when it splits.
- **Mage near the tower:** "will not cast within 80 px of the tower" means centre-to-centre distance < 80 px at the moment the cast would start. That cast is skipped and the 8 s timer starts again. A mage keeps walking while not casting; during its 1 s cast it does not move. Skeletons spawn at the end of the cast, sound `death02` is **not** used; no sound for the summon.
- **Summoned skeletons** do not move while `skelly.summon` plays; they can be hit and damaged during it and do collide with the tower. They count toward `MAX_ENEMIES`; if the cap is full, the surplus is not spawned.
- **Ghost burn:** an effect (not an enemy) that holds the last burn frame until 0.5 s has passed, then creates the ghost. The ghost counts toward the cap; if the cap is full the ghost still spawns (it is the second half of one enemy).
- **Golem spawn point:** `dragon + 560 px × normalize(tower − dragon)`; if dragon and tower coincide, use direction (0, 1). The golem is never despawned by §8.3 and ignores `MAX_ENEMIES`. `hp` stays finite in state (use a large sentinel, flag `unkillable: true`) so `digest()` stays well defined.
- **Knockback direction:** away from the projectile's position at the hit (for the ring, away from the ring fireball). Applied after damage, before separation of the next tick.
- **Golem time:** spawns on the first tick where `t >= 300`.

Put each of these into the spec's §8 or §13 as plain spec text.

## Spec sections to read (whole)

§2.1, §4.1 (sim state, written by T-002), §8 (all), §9, §12 (golem line), §13, §20.

## Tests

The §20 tests for slime split, ghost, mage, timeline (`t = 300` golem exists) and, in addition:
- mage within 80 px of the tower never casts; summoned skeletons stand still until their summon anim ends;
- a golem hit moves it 6 px away from the projectile and does not lower its effective HP; the golem is never despawned;
- determinism test from T-002 still passes (its digest may change; record that under `Expectations changed`).

## Must not

Edit `docs/backlog.md`, merge, push `main`, touch browser code (`src/*.js` outside `src/sim/`, `src/render/`), or implement gems/procs/other weapons (T-005).

## Done means

`npm run gate` green; spec §8/§13 updated; commit `T-004: …` with `Closes: T-004`.

## What T-002 left you

- Hooks (empty today): `enemySpecial(game, e)` in `enemies.js` (return true when busy and must not walk, e.g. a casting mage or a summoning skeleton); `onEnemyHit(game, e, source)` (golem knockback); `onEnemyDeath(game, e)` (return true to skip the generic die effect: slime split, ghost-knight burn); `onEffectDone(game, fx)` in `effects.js` (burn → ghost); `spawnGolemIfDue(game)` in `spawner.js`, already called from the clock step.
- Enemy type keys: `knight, skeleton, slime, mage, ghostKnight, ghost, golem`. `enemy.gen` exists. Effects have `hold` (keep the last frame).
- `ghost.die` (the ghost's own death, `ghostnight/ghost_burn.txt`) is now in the atlas.
- **Ghost burn length:** the `ghost.burn` anim is 11 frames × 2 ticks = 0.37 s; the spec's 0.5 s stands: hold the last frame until 0.5 s (decided above).
- A projectile hits at most one enemy per tick; the grid stores enemy centres and queries add the largest radius.
- A full 300 s run at the 400 cap takes about 4 s (mostly separation): keep long runs out of the default suite or make them cheap.
