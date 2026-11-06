# T-009: Balance instrument and early-game tuning

**Source:** T-003 report and the orchestrator's browser check (2026-11-06): with the spec's *unmeasured* numbers the tower falls at 0:12–0:15 when the player does not hunt knights, and a circling bot lasted 68 s. · **Model:** Opus · **Depends on:** T-003, T-004 (merged)

## Why

The first minute is unwinnable by design arithmetic, not by skill: a level-1 fireball kills at most ~0.55 knights/s (0.9 s cooldown, 2 hits per 3-HP knight) while knights spawn at 1.5/s from 0:00, each dealing 10 DPS to a 100-HP tower. A Vampire Survivors run starts gentle and ramps. We need an instrument first, then numbers from it.

## What

1. **Instrument** `tools/measure.mjs` (Node, no deps): plays headless `Game` runs with scripted bot policies over a pool of seeds and prints a Markdown table (median, min, max survival time; kills; level once growth exists). Options: `--policy`, `--seeds N`, `--max-seconds`, `--timeline`. Policies:
   - `idle`: no move, no aim (fires in the default direction).
   - `aim`: stationary, aims at the nearest enemy to the tower.
   - `kite`: circles the tower at 120 px and aims at the nearest enemy to the tower.
   - Level-up picks (once T-005 lands): pick card 0. Make the policy interface ready for it (`pick` in the intent when `game.offers?.length`), so T-006 can reuse it.
2. **Look before tuning:** run the three policies on the current numbers, at least 16 seeds each, and write the baseline into the report with a one-paragraph named cause.
3. **Tune the first two minutes only** (fireball L1, no growth yet), moving as few numbers as possible, in this order of preference: timeline `rate` for 0:00–1:00, knight contact DPS, tower HP, knight HP. Leave weapons alone (T-005 is adding growth on top of them).
4. **Targets** (judgement, mark them *unmeasured*-for-taste in the report; the owner may change them):
   - `idle` falls between 25 s and 60 s (median).
   - `aim` survives at least 75 s (median).
   - `kite` survives at least 120 s (median).
5. **Report** `reports/measurements/2026-11-06-early-balance.md` (frozen once written): method, seeds, baseline table, each number changed with its old → new value and a one-line reason, the after table.
6. **Spec + content:** change the numbers in `docs/demo-spec.md` tables and `src/sim/content.js` together (`test/content.test.mjs` cross-checks them). Changed numbers stay *unmeasured* in the spec until the owner has played them, except where the table header already says so.
7. A fast test that the instrument runs one short seed for each policy without throwing (keep it under 1 s).

## Constraints

- The instrument is one heavy local process at a time; keep a default run under ~60 s total. No CI.
- Do not change sim code except the content numbers; if you find a sim bug, file `docs/work/T-NEW-<slug>.md` and report it.
- Another agent is implementing T-005 (gems, level-up, weapons, buffs, procs) in parallel: do not touch `weapons.js`, `projectiles.js`, `gems.js`, `levelup.js`, or browser code. Keep edits to `content.js` to the numbers you tune.

## Done means

`npm run gate` green; the report exists with baseline and after tables meeting the targets; spec and content agree; commit `T-009: …` with `Closes: T-009`.
