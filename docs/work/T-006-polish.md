# T-006: Polish: debug tools, soak test, full-run balance

**Source:** [demo-spec.md](../demo-spec.md) milestone 5, §19, §20 (soak); [early-balance report](../../reports/measurements/2026-11-06-early-balance.md) (kite target deferred here) · **Model:** Opus · **Depends on:** T-005 merged

## Why

The demo is feature-complete after T-005, but it has no debug tools for play-testing, no soak test, and only the first minute has been measured. The run should feel like Vampire Survivors: a gentle start, a build that snowballs, chaos by minute 4, and the golem as the wall.

## What

1. **Debug tools** (§19), active only with `?debug=1`: collision circles; overlay with tick time (ms), ticks per frame, entity counts (enemies, projectiles, gems, effects); F1–F4 grant fireball / laser / mini tower / ring at level 5; F5 jumps to 4:50; `+` / `-` change game speed (0.25× to 4×, the loop runs more or fewer ticks per frame, the sim is untouched).
2. **Soak test** (§20): 5 minutes with a scripted dragon circling the tower: no exceptions, the spawner never spawns above the cap, the tower eventually dies (after the golem arrives). Keep it under ~5 s of test time; if it cannot be, put it behind an env var (`SOAK=1`) and run it in the gate script explicitly.
3. **Full-run balance** with `tools/measure.mjs`:
   - Add a `greedy` level-up policy (for example: take a new weapon while a slot is free, else upgrade the highest-level weapon, else a buff; repair when tower HP < 40%). Keep `pick 0` as `naive`.
   - Measure first (baseline report section), name the causes, then tune.
   - **Targets** (judgement, the owner may change them): `idle` + naive falls between 25 s and 90 s; `aim` + greedy reaches a median of 3:00; `kite` + greedy reaches 5:00 (golem) in at least half the seeds; every policy's tower falls by 7:00 (the golem must end runs). Pooled over at least 16 seeds.
   - Tuning preference: timeline rates and weights first, then enemy HP/DPS, then XP curve, then weapon numbers. Keep the roster coherent (knights are the basic enemy; check the contact DPS ordering T-009 left: knight 2 < skeleton 6 < slime 8 looks inverted).
   - New dated report `reports/measurements/2026-11-06-full-run-balance.md` (frozen): method, baseline, each change old → new with a reason, after table.
4. **Small polish**, if time allows and the gate stays green: minion carriers (§7.3 stretch: two `castle/royal_figure_*` sprites walking under the tower while it moves; add them to the manifest and rebuild the atlas with `npm run build:assets`).

## Decisions already made

- **Debug commands through the intent:** the browser sends `intent.debug = { grant: '<weaponId>' } | { jumpTo: 290 }`; the sim honours it only when the `Game` was built with `{ debug: true }`. `tick` stays the only entry point, and a replay with the same intents stays deterministic. Jumping sets the clock (`tickCount`) and the spawner's row; it does not simulate the skipped time.
- **Game speed** lives in the loop (`src/loop.js` / `src/app.js`), never in the sim.
- Debug overlay and circles are drawn by `src/render/` from game state and loop stats only.

## Spec sections to read (whole)

§4, §4.1, §8, §9, §10, §13, §14, §19, §20, and the two measurement reports.

## Tests

Debug intents are ignored without `{ debug: true }` and applied with it; jump lands on 4:50 and the golem spawns at 5:00; soak (above); measure instrument runs each policy for one short seed; game-speed scaling in the loop (fake timestamps).

## Must not

Edit `docs/backlog.md`, merge, push `main`. Another agent may be adding tests for the roster (T-010, tests only) in parallel.

## Done means

`npm run gate` green; debug tools work in the browser; the balance report meets the targets or explains exactly which target is missed and why; spec and content agree; commit `T-006: …` with `Closes: T-006`.

## What T-005 and T-009 left you

- `tools/measure.mjs` (T-009) already sends `pick` when offers are open, but its bots never fly to gems, so every run stays at level 1. The full-run policies must collect gems (see the `bot` helper in `test/growth.test.mjs`): for example, steer toward the nearest gem when one is within some range of the tower, else follow the policy's movement.
- T-005's probe: a gem-collecting bot with an invincible tower reached level 42–44 by 5:30 with a full L5 build, and the horde thinned to ~50 enemies. Expect late game to be too easy and the 1:00–2:00 ramp to be too steep (T-009); measure both.
- Debug keys F1–F5 were not built in T-005; `window.app` exists with `?debug=1`.
- Level-up: `level` rises when queued; a pick on the queuing tick is ignored; the pick tick does not advance the world.
- Fun features to keep while tuning: [fun-features.md](../fun-features.md) (split fireworks, gem comet tail).
