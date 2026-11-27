# T-039: Damage calculator: fixes from the T-020 review

**Source:** [T-020 review](../../../reports/reviews/2026-11-26-T-020-review.md) · **Model:** Opus · **Depends on:** — (must land before T-029)

## What

1. **Hit allocation:** spread hits over bodies by arrival rate × hits-to-kill (per body type, after resistances and tiers, per weapon's damage per hit), not by HP; overkill stays lost. Re-derive the effective DPS / pressure; prove the 1:30 ceiling case from the review (expected ≈ 0.91, flagged unwinnable) and one mixed minute by hand in a test.
2. **Floor = median** of the naive builds as spec §20 says (fix the index; even count → mean of the two middle builds or the upper-middle; document which).
3. **`--check` robustness:** a weapon without a model fails up front with the same clear error as the default mode, before running any sim case.
4. **Tests that bite:** extend `test/dps.test.mjs` (keep it under ~2 s) so these mutations fail: pressure without stampedes / tier HP / slime bodies / ghost / summons; no overkill; no pierce; no split; explosions ×2; ring ×2; saw ×2; bite cap; cone cap; claw sides halved; exhaustive search disabled; beam `maxMoves` removed; floor = minimum; naive takes the last card; `LEVEL_CURVE` changed; unwinnable flag removed; `--check` exit forced to 0 (run a cheap fixture check). Use small fixtures where the real numbers would be slow.
5. **New report** `reports/measurements/2026-11-26-damage-calculator-2.md` (the first is frozen): the corrected per-minute table, the corrected weapon ranking, and the imbalance list restated only where it still holds (say which earlier claims fell and why).

## Must not

Change game numbers. Other agents (T-031 princess, T-032 prince) work in `src/` in parallel: no overlap expected. Do not edit `docs/backlog.md`, merge into main or push. Commit only when `npm run gate` exits 0.

## Done means

`npm run gate` green; `node tools/dps.mjs` and `--check` pass; the new report exists; commit `T-039: …` with `Closes: T-039`.
