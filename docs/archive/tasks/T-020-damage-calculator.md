# T-020: Damage calculator

**Source:** [strategy-depth design](../../../reports/designs/2026-11-26-strategy-depth-design.md) §11; owner notes 2 ("determine weapon damage floor and ceiling at different points of the game … a formula based on area, proc chance etc.") · **Model:** Opus · **Depends on:** T-018, T-019, T-021–T-027 — all merged

## Why

Balancing by bot runs alone is noisy (T-019/T-023 found build divergence and heavy-tailed seeds). The owner wants a calculator that says what a build can kill at each point of the run, from formulas, checked against the real sim.

## What

`tools/dps.mjs` (Node, no deps), data-driven from `src/sim/content.js` so a new weapon needs only a model entry:

1. **Per-weapon model** at a given level and buff loadout: hits per second (cooldown, Haste, count/Amount, sides/repeats) × damage per hit (Might, `ceil`) × expected targets per hit (shape area with Area, × enemy density, capped by `maxTargets`); proc expectations (Explode: chance × explosion area × density × damage, with D-7 affinity; Split: chance × children's expected hits; Pierce: extra hits); resistance against an enemy mix (per-type `resist`, tiers' HP multipliers); special rules (bite execute, saw corridor and dwell, ring rehit, mini towers' uptime and fire rate, mage-orb irrelevance). Document each model's assumptions in the file and in a short `tools/dps.md`.
2. **Density and mix per minute** from the timeline (rate, type weights, tier weights, stampedes), with a configurable "enemies near the dragon" assumption; print the assumption.
3. **Floor and ceiling per minute (0:30, 1:00 … 5:00):** floor = what a naive player has by then (weapons and levels from `tools/measure.mjs` naive runs' median level curve, or a documented fallback curve); ceiling = the best allocation of the same number of level-ups (search over weapon/buff picks within slot limits; greedy plus a small exhaustive check is fine).
4. **Pressure:** incoming HP per second per minute (spawn rate × mean HP × tier multipliers, after the mix's resistances to the build's damage types) and the ratio DPS / pressure; print a table per minute and per stage; flag minutes where the ceiling is below pressure (unwinnable) or the floor far above (trivial).
5. **Ground truth `--check`:** for each weapon at L1 and L5 with no buffs and with a typical buff set, place dummy enemies (a type, HP large, not moving) at a given density around the dragon/tower in the real sim, run 30 s, measure damage dealt, and compare with the model; fail (exit 1) when any model is off by more than 15% and print which. Make the models pass.
6. **Report:** run it on the current game and write `reports/measurements/2026-11-26-damage-calculator.md` (frozen): per-minute floor/ceiling/pressure table, weapons ranked by DPS per role (single target, crowd), the `--check` table, and the five most striking imbalances it shows (for T-029).
7. A fast test that the calculator runs and `--check` passes for one weapon (under ~2 s); the full `--check` stays out of the default suite (document the command).

## Must not

Change game numbers (T-029 does). Another agent (tests-only tasks T-033–T-036) works in `test/` and `tools/build-atlas.mjs`: no overlap expected. Do not edit `docs/backlog.md`, merge into main or push. When reverting experiments, restore from your own backup copy, not `git checkout`.

## Done means

`npm run gate` green; `node tools/dps.mjs` and `node tools/dps.mjs --check` run and pass; the report exists; spec §20 mentions the tool (plain text); commit `T-020: …` with `Closes: T-020`.
