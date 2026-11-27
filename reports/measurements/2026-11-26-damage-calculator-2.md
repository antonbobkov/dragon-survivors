# Damage calculator, corrected: floor, ceiling and pressure per minute

Date: 2026-11-26 · Task: T-039 (fixes from the [T-020 review](../reviews/2026-11-26-T-020-review.md)) · Instrument: [`tools/dps.mjs`](../../tools/dps.mjs) ([how it works](../../tools/dps.md)) · Code: main at `17b38f2` plus T-039 (no game numbers changed) · Replaces the tables of [the first report](2026-11-26-damage-calculator.md) · Frozen: a re-run is a new dated report.

## What changed in the tool

1. **Hit allocation.** The first report spread hits over bodies by spawn rate × HP. But when bodies die as they arrive, each one takes exactly its hits to kill. So hits land in proportion to spawn rate × hits to kill, and a hit removes `Σ rate·hp / Σ rate·k`. A build's DPS / pressure is now the share of the arriving bodies its hits can kill. Where every body dies in one hit, it is simply hits per second ÷ bodies per second. The old weighting gave too much credit to hits on high-HP bodies, which are the ones a hit cannot finish. With mixed enemies it overstated effective DPS by 8–24%.
2. **Floor = median.** The floor was the lower-middle of the 64 naive builds. It is now their median, as spec §20 says: with an even count, the mean of the two middle builds. Under the old allocation this moved the 5:00 floor from 377.0 to 392.8 DPS. Under the new one it moves it from 0.91 to 0.92 of the pressure.
3. **`--check`** stops up front with `no damage model for weapon "ID"` when a checked weapon has no model, as the default mode does. Before, it crashed after running that weapon's earlier cases. New options: `--warm S` and `--tolerance X`.
4. **Tests.** `test/dps.test.mjs` went from 7 to 14 tests (about 0.9 s). It now kills 35 of 35 mutations of the tool: the review's 30, plus the old allocation, the mix by presence, the lower-middle floor, the tolerance ignored and the up-front model check removed. Before, it killed 1 of 30. The new tests prove the allocation by hand on fixture mixes, and check the identity "DPS = Σ stream share × pressure" on real minutes. They also cover the review's 1:30 case: fireball 1, mini tower 1, Might 1, Amount 1 gives 0.91 of the pressure, not 1.11.

## Summary

From 1:00 on, the ceiling ratios fall 13–16% and the floor ratios 10–19%. At 0:30, with only knights and skeletons, they fall 1.5%. Of the first report's five claims:

| # | First report | Now |
|---|---|---|
| 1 | Proc stacking decides the late game; every ceiling from 3:00 is the proc build, at 9–12× the pressure | **Holds**, at 7.9–10.0× |
| 2 | Mini tower L5 out-shoots the fireball it copies; the ceiling's first pick from 1:30 to 2:30 | **Holds** (single target unchanged: 35 DPS). The ceiling picks it at 2:00 and 2:30. At 1:30 it takes the mini tower at L1 plus a laser |
| 3 | The laser is the weakest weapon at every level and in every role | **Fell.** The left claw L5 is lower on a single target (5.6 vs 6.0). In crowds the laser L5 beats every melee L5 and the ring and saw L5 from 0:30 to 1:30, and the bite L5 at every minute |
| 4 | Ooze is the wall; at level 1 even the best build is below the pressure at 1:00 | **Holds, and is worse.** The floor covers 0.35–0.54 of the pressure. At the bots' levels both Ooze minutes are now unwinnable even for the best build: 0.54 at 1:00, and 0.97 at 1:30 (was 1.11) |
| 5 | From 3:30 even a naive build covers 1.06–1.38× of the pressure; the late game is trivial | **Fell in part.** The median naive build covers 1.08–1.13× from 3:30 to 4:30 and falls below the pressure at 5:00 (0.92). It is at par, not comfortably above. The trivial flag (floor above 3×) is never raised. That level-ups run out still holds |

## `--check`: models against the sim

`node tools/dps.mjs --check` (seed 1, 300 s counted per case): **57 of 57 within ±15%**. The model column is identical to the first report's, case by case, because the check compares raw damage, which the allocation does not touch. Only the proc cases' measured values moved, by a few percent: sim changes merged since `6e6be02` shift the proc rolls' random draws. The first report said "the fireball's proc cases sit 4–10% under the model on every seed tried". That no longer holds on seed 1: fireball L1 proc +5.6%, fireball L5 with the ceiling loadout +0.2%.

| Weapon | L | Buffs | Field | Dummy | Model DPS | Measured DPS | Error | OK |
|---|---|---|---|---|---|---|---|---|
| fireball | 1 | none | crowd | horse | 2.22 | 2.19 | -1.5% | yes |
| fireball | 1 | stat | crowd | horse | 7.41 | 7.54 | 1.9% | yes |
| fireball | 1 | proc | crowd | horse | 58.49 | 61.76 | 5.6% | yes |
| fireball | 1 | none | sparse | horse | 2.22 | 2.20 | -1.2% | yes |
| fireball | 5 | none | crowd | horse | 20.00 | 19.91 | -0.5% | yes |
| fireball | 5 | stat | crowd | horse | 44.44 | 44.37 | -0.2% | yes |
| fireball | 5 | proc | crowd | horse | 559.52 | 543.10 | -2.9% | yes |
| fireball | 5 | none | sparse | horse | 18.92 | 19.60 | 3.6% | yes |
| laser | 1 | none | crowd | horse | 0.71 | 0.71 | -0.3% | yes |
| laser | 1 | stat | crowd | horse | 3.17 | 3.15 | -0.9% | yes |
| laser | 1 | proc | crowd | horse | 5.16 | 5.08 | -1.7% | yes |
| laser | 1 | none | sparse | horse | 0.71 | 0.72 | 0.3% | yes |
| laser | 5 | none | crowd | horse | 6.00 | 6.00 | -0.0% | yes |
| laser | 5 | stat | crowd | horse | 16.67 | 16.52 | -0.9% | yes |
| laser | 5 | proc | crowd | horse | 43.93 | 42.64 | -2.9% | yes |
| laser | 5 | none | sparse | horse | 6.00 | 6.08 | 1.3% | yes |
| miniTower | 1 | none | crowd | horse | 2.33 | 2.31 | -1.1% | yes |
| miniTower | 1 | stat | crowd | horse | 6.67 | 6.76 | 1.3% | yes |
| miniTower | 1 | proc | crowd | horse | 61.13 | 58.34 | -4.6% | yes |
| miniTower | 1 | none | sparse | horse | 2.33 | 2.40 | 2.9% | yes |
| miniTower | 1 | reach | crowd | horse | 2.92 | 2.98 | 2.2% | yes |
| miniTower | 5 | none | crowd | horse | 17.50 | 17.43 | -0.4% | yes |
| miniTower | 5 | stat | crowd | horse | 32.50 | 32.81 | 1.0% | yes |
| miniTower | 5 | proc | crowd | horse | 458.49 | 440.51 | -3.9% | yes |
| miniTower | 5 | none | sparse | horse | 17.50 | 17.75 | 1.4% | yes |
| miniTower | 5 | reach | crowd | horse | 24.38 | 24.44 | 0.3% | yes |
| ring | 1 | none | crowd | horse | 9.67 | 9.76 | 0.9% | yes |
| ring | 1 | stat | crowd | horse | 26.10 | 25.85 | -1.0% | yes |
| ring | 5 | none | crowd | horse | 69.70 | 67.81 | -2.7% | yes |
| ring | 5 | stat | crowd | horse | 103.41 | 103.41 | 0.0% | yes |
| leftClaw | 1 | none | crowd | horse | 4.84 | 5.15 | 6.3% | yes |
| leftClaw | 1 | stat | crowd | horse | 20.95 | 22.93 | 9.5% | yes |
| leftClaw | 5 | none | crowd | horse | 45.12 | 48.02 | 6.4% | yes |
| leftClaw | 5 | stat | crowd | horse | 188.00 | 197.29 | 4.9% | yes |
| rightClaw | 1 | none | crowd | horse | 3.64 | 3.65 | 0.3% | yes |
| rightClaw | 1 | stat | crowd | horse | 11.88 | 11.66 | -1.9% | yes |
| rightClaw | 5 | none | crowd | horse | 37.23 | 36.86 | -1.0% | yes |
| rightClaw | 5 | stat | crowd | horse | 80.05 | 79.36 | -0.9% | yes |
| dualClaw | 1 | none | crowd | horse | 141.64 | 140.15 | -1.1% | yes |
| dualClaw | 1 | stat | crowd | horse | 528.95 | 515.55 | -2.5% | yes |
| bite | 1 | none | crowd | horse | 4.95 | 5.08 | 2.8% | yes |
| bite | 1 | stat | crowd | horse | 16.52 | 16.77 | 1.5% | yes |
| bite | 5 | none | crowd | horse | 17.98 | 17.96 | -0.1% | yes |
| bite | 5 | stat | crowd | horse | 57.75 | 57.60 | -0.3% | yes |
| saw | 1 | none | crowd | horse | 6.21 | 6.40 | 3.1% | yes |
| saw | 1 | stat | crowd | horse | 23.13 | 23.31 | 0.8% | yes |
| saw | 1 | reach | crowd | horse | 13.34 | 13.51 | 1.2% | yes |
| saw | 5 | none | crowd | horse | 75.03 | 77.11 | 2.8% | yes |
| saw | 5 | stat | crowd | horse | 195.57 | 199.64 | 2.1% | yes |
| saw | 5 | reach | crowd | horse | 153.21 | 152.13 | -0.7% | yes |
| fireball | 5 | ceiling | crowd | horse | 1913.75 | 1917.17 | 0.2% | yes |
| fireball | 5 | ceiling | sparse | horse | 125.28 | 123.77 | -1.2% | yes |
| miniTower | 5 | ceiling | crowd | horse | 1528.12 | 1507.17 | -1.4% | yes |
| miniTower | 5 | ceiling | sparse | horse | 94.60 | 91.27 | -3.5% | yes |
| fireball | 1 | none | crowd | slime | 3.33 | 3.28 | -1.5% | yes |
| laser | 1 | none | crowd | mage | 0.71 | 0.71 | -0.3% | yes |
| leftClaw | 1 | none | crowd | knight | 5.24 | 5.66 | 8.0% | yes |

## Per minute

`node tools/dps.mjs` (defaults, about 11 s). Levels are the naive bots' measured curve (1, 1, 4, 9, 14, 23, 32, 41, 49, 60).

| t | Stage | Spawn/s | Pressure HP/s | Near | Level (XP bound) | Floor DPS | Ceiling DPS | Floor / P | Ceiling / P | Flag | Ceiling build |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0:30 | Muster | 0.50 | 1.2 | 5.0 | 1 (2) | 1.6 | 1.6 | 1.31 | 1.31 |  | fireball 1 |
| 1:00 | Ooze | 0.60 | 3.2 | 5.0 | 1 (4) | 1.7 | 1.7 | 0.54 | 0.54 | unwinnable | fireball 1 |
| 1:30 | Ooze | 1.55 | 7.4 | 9.3 | 4 (8) | 2.6 | 7.2 | 0.35 | 0.97 | unwinnable | fireball 1, miniTower 1, laser 1 · amount 1 |
| 2:00 | Arcana | 2.50 | 12.5 | 15.0 | 9 (13) | 5.7 | 24.1 | 0.45 | 1.93 |  | fireball 1, miniTower 5 · amount 1, haste 2 |
| 2:30 | Arcana | 6.25 | 38.0 | 37.5 | 14 (21) | 14.3 | 79.8 | 0.38 | 2.10 |  | fireball 1, miniTower 5 · amount 1, explode 1, split 3, haste 3 |
| 3:00 | Haunt | 10.00 | 101.0 | 60.0 | 23 (32) | 55.9 | 794.6 | 0.55 | 7.86 |  | fireball 5, miniTower 5, ring 1 · split 3, explode 3, area 3, pierce 3 |
| 3:30 | Haunt | 13.00 | 153.2 | 78.0 | 32 (45) | 172.9 | 1445.6 | 1.13 | 9.44 |  | fireball 5, laser 5, miniTower 5, ring 5 · area 3, explode 3, split 3, pierce 3 (exhaustive) |
| 4:00 | Siege | 16.00 | 240.0 | 96.0 | 41 (59) | 260.7 | 2330.8 | 1.09 | 9.71 |  | fireball 5, miniTower 5, ring 5, dualClaw 1 · area 3, explode 3, split 3, pierce 3 (exhaustive) |
| 4:30 | Siege | 17.00 | 254.9 | 102.0 | 49 (73) | 274.9 | 2550.9 | 1.08 | 10.01 |  | fireball 5, miniTower 5, ring 5, dualClaw 1 · area 3, explode 3, split 3, pierce 3 (exhaustive) |
| 5:00 | Siege | 18.00 | 357.2 | 108.0 | 60 (86) | 328.6 | 3096.6 | 0.92 | 8.67 |  | fireball 5, miniTower 5, ring 5, dualClaw 1 · area 3, explode 3, split 3, pierce 3 (exhaustive) |

Floor / pressure and ceiling / pressure, first report → now:

| t | Floor / P | Ceiling / P |
|---|---|---|
| 0:30 | 1.33 → 1.31 | 1.33 → 1.31 |
| 1:00 | 0.62 → 0.54 | 0.62 → 0.54 |
| 1:30 | 0.39 → 0.35 | 1.11 → **0.97 (unwinnable)** |
| 2:00 | 0.53 → 0.45 | 2.22 → 1.93 |
| 2:30 | 0.45 → 0.38 | 2.49 → 2.10 |
| 3:00 | 0.68 → 0.55 | 9.20 → 7.86 |
| 3:30 | 1.38 → 1.13 | 11.03 → 9.44 |
| 4:00 | 1.31 → 1.09 | 11.39 → 9.71 |
| 4:30 | 1.30 → 1.08 | 11.74 → 10.01 |
| 5:00 | 1.06 → **0.92** | 9.93 → 8.67 |

Almost all of the change is the allocation. The old floor column was the lower-middle build, but the median moves the floor by under 1% at 3:00 and 5:00 (0.551 → 0.553 and 0.910 → 0.920). The review's 0.52 and 0.83 re-weighted the builds that the old ordering picked.

## Per stage

| Stage | Minutes | Pressure HP/s | Worst floor / P | Worst ceiling / P | Ceiling DPS by weapon (last minute) |
|---|---|---|---|---|---|
| Muster | 0:30 | 1.2 | 1.31 | 1.31 | fireball 2 |
| Ooze | 1:00, 1:30 | 3.2, 7.4 | 0.35 | 0.54 | fireball 3, miniTower 3, laser 1 |
| Arcana | 2:00, 2:30 | 12.5, 38.0 | 0.38 | 1.93 | miniTower 67, fireball 12 |
| Haunt | 3:00, 3:30 | 101.0, 153.2 | 0.55 | 7.86 | miniTower 867, fireball 499, ring 42, laser 38 |
| Siege | 4:00, 4:30, 5:00 | 240.0, 254.9, 357.2 | 0.92 | 8.67 | miniTower 1855, fireball 1065, dualClaw 99, ring 78 |

### Sensitivity

Floor / pressure and ceiling / pressure under the two assumptions most open to question.

| t | Default | Crowd twice as dense (`--view-time 12`) | Levels at the XP bound (`--levels 2,4,8,13,21,32,45,59,73,86`) |
|---|---|---|---|
| 0:30 | 1.31 / 1.31 | 1.31 / 1.31 | 1.45 / 2.61 |
| 1:00 | 0.54 / 0.54 | 0.54 / 0.54 | 0.75 / 2.03 |
| 1:30 | 0.35 / 0.97 | 0.38 / 1.00 | 0.60 / 2.91 |
| 2:00 | 0.45 / 1.93 | 0.54 / 2.09 | 0.65 / 3.41 |
| 2:30 | 0.38 / 2.10 | 0.54 / 3.83 | 0.72 / 5.86 |
| 3:00 | 0.55 / 7.86 | 0.85 / 23.81 | 1.29 / 8.35 |
| 3:30 | 1.13 / 9.44 | 1.73 / 26.17 | 1.32 / 9.57 |
| 4:00 | 1.09 / 9.71 | 1.85 / 24.51 | 1.09 / 9.71 |
| 4:30 | 1.08 / 10.01 | 1.82 / 24.74 | 1.08 / 10.01 |
| 5:00 | 0.92 / 8.67 | 1.47 / 20.73 | 0.92 / 8.67 |

A denser crowd still helps every area weapon, and the proc build above all. At 1:30 it lifts the ceiling to the pressure but not above it (1.00, still flagged). Levels at the XP bound make both Ooze minutes winnable for the best build (2.03 and 2.91), but the naive floor stays at 0.60–0.75.

## Weapons per role (no buffs)

Single target: one knight-sized target where the weapon reaches it best, raw damage (unchanged). Crowd: effective DPS in each stage's mid-minute field.

| Weapon | L | Single target DPS | Crowd Muster (0:30) | Crowd Ooze (1:30) | Crowd Arcana (2:30) | Crowd Haunt (3:30) | Crowd Siege (4:30) |
|---|---|---|---|---|---|---|---|
| dualClaw | 1 | 25.7 | 2.5 | 3.1 | 11.5 | 33.3 | 46.7 |
| ring | 5 | 11.7 | 1.5 | 1.9 | 8.9 | 28.9 | 45.3 |
| miniTower | 5 | 35.0 | 19.9 | 15.5 | 17.5 | 24.8 | 26.7 |
| saw | 5 | 10.0 | 1.3 | 1.6 | 7.3 | 22.5 | 34.0 |
| fireball | 5 | 20.0 | 8.3 | 6.4 | 9.9 | 14.2 | 15.3 |
| leftClaw | 5 | 5.6 | 0.8 | 1.0 | 4.5 | 13.4 | 19.7 |
| rightClaw | 5 | 12.9 | 1.6 | 1.9 | 5.5 | 12.0 | 14.3 |
| ring | 1 | 2.0 | 0.2 | 0.4 | 1.9 | 5.3 | 7.8 |
| laser | 5 | 6.0 | 4.8 | 3.6 | 3.7 | 4.9 | 5.2 |
| bite | 5 | 18.0 | 0.5 | 0.6 | 1.7 | 4.0 | 4.6 |
| saw | 1 | 1.3 | 0.2 | 0.2 | 0.9 | 2.4 | 3.4 |
| miniTower | 1 | 2.3 | 1.6 | 1.8 | 1.9 | 2.2 | 2.3 |
| fireball | 1 | 2.2 | 1.6 | 1.7 | 1.8 | 2.1 | 2.2 |
| leftClaw | 1 | 1.5 | 0.2 | 0.3 | 0.9 | 2.0 | 2.6 |
| rightClaw | 1 | 3.6 | 0.6 | 0.7 | 1.5 | 1.8 | 1.9 |
| bite | 1 | 5.0 | 0.2 | 0.3 | 0.9 | 1.8 | 2.0 |
| laser | 1 | 0.7 | 0.7 | 0.7 | 0.7 | 0.8 | 0.8 |

Ranked per role at the top level:

- **Single target** (unchanged): mini tower 35, dual claw 25.7, fireball 20, bite 18, right claw 12.9, ring 11.7, saw 10, laser 6, left claw 5.6.
- **Crowd at Siege:** dual claw 46.7, ring 45.3, saw 34.0, mini tower 26.7, left claw 19.7, fireball 15.3, right claw 14.3, laser 5.2, bite 4.6.

The bite fell furthest: 7.4 → 4.6 at Siege. Its 18 damage is mostly overkill on 1–3 HP bodies, and the old weighting hid that. It is now the weakest top-level weapon in every crowd column, below the laser.

## Hits to kill (plain tier, no buffs)

Unchanged. The slime column is the whole family (1 + 2 + 4 bodies).

| Weapon | L | Damage | Knight | Skeleton | Slime | Mage | Ghost knight | Ghost | Horse | Mounted knight |
|---|---|---|---|---|---|---|---|---|---|---|
| fireball | 1 | 2 fire | 2 | 1 | 7 | 2 | 5 | 1 | 1 | 15 |
| fireball | 5 | 4 fire | 1 | 1 | 7 | 1 | 3 | 1 | 1 | 10 |
| laser | 1 | 1 arcane | 3 | 1 | 11 | 4 | 10 | 1 | 2 | 15 |
| laser | 5 | 3 arcane | 1 | 1 | 7 | 2 | 4 | 1 | 1 | 8 |
| miniTower (fireball L1 shots) | 1 | 2 fire | 2 | 1 | 7 | 2 | 5 | 1 | 1 | 15 |
| miniTower (fireball L5 shots) | 5 | 4 fire | 1 | 1 | 7 | 1 | 3 | 1 | 1 | 10 |
| ring | 1 | 2 fire | 2 | 1 | 7 | 2 | 5 | 1 | 1 | 15 |
| ring | 5 | 4 fire | 1 | 1 | 7 | 1 | 3 | 1 | 1 | 10 |
| leftClaw | 1 | 2 physical | 2 | 1 | 11 | 2 | 5 | 2 | 1 | 30 |
| leftClaw | 5 | 5 physical | 1 | 1 | 7 | 1 | 3 | 1 | 1 | 10 |
| rightClaw | 1 | 4 physical | 1 | 1 | 8 | 1 | 4 | 2 | 1 | 15 |
| rightClaw | 5 | 9 physical | 1 | 1 | 7 | 1 | 2 | 1 | 1 | 6 |
| dualClaw | 1 | 9 physical | 1 | 1 | 7 | 1 | 2 | 1 | 1 | 6 |
| bite | 1 | 8 physical | 1 | 1 | 7 | 1 | 2 | 1 | 1 | 7 |
| bite | 5 | 18 physical | 1 | 1 | 7 | 1 | 1 | 1 | 1 | 4 |
| saw | 1 | 2 physical | 2 | 1 | 11 | 2 | 5 | 2 | 1 | 30 |
| saw | 5 | 5 physical | 1 | 1 | 7 | 1 | 3 | 1 | 1 | 10 |

## The imbalances, restated (for T-029)

Each point is restated only as far as it still holds. None was changed here.

1. **Proc stacking is multiplicative and decides the late game.**
   - The measurement is unchanged: Explode 3, Split 3, Pierce 3 and Area 3 take a level-5 fireball from 20 to about 1,800–1,900 DPS in the check's dense crowd (×90), and to about 124 in the sparse field (×6).
   - Every ceiling from 3:00 on is fireball 5 + mini tower 5 + those four buffs, at 7.9–10.0× the pressure.
   - The floor and the ceiling are still 8–14× apart from 3:00: 14.2× at 3:00, 8.4–9.4× after.
   - Levers as before: Split's recursion, the explosion radius under Area, Pierce's fire crossover.
2. **Mini tower L5 shoots faster than the fireball it copies.**
   - Unchanged: 8.75 shots/s against the fireball L5's 5/s. It is the top single-target weapon (35 DPS with a level-5 fireball).
   - It is the ceiling's pick at 2:00 and 2:30, and half of every late ceiling's damage (1,855 of 3,097 DPS at 5:00).
   - Levers: `fireRate`, `maxActive` or `duration` at L4–5.
3. **The laser is weak, but not the weakest.**
   - On a single target the laser L5 (6.0) is above only the left claw L5 (5.6). The bite (18), right claw (12.9) and fireball (20) beat it 2–3×.
   - In crowds it is mid-table early: its two parallel beams hit at range while melee reach is empty. At 0:30–1:30 it beats every top-level weapon but the mini tower and fireball. From 2:30 it is above only the bite.
   - Arcane against plate still does not close the gap on mounted knights (8 hits against the bite's 4).
   - Levers as before, but less urgent than the bite's crowd damage (see below).
4. **Ooze is a wall that levels reach too late, and it is higher than the first report said.**
   - The pressure almost triples from 0:30 to 1:00 (1.2 → 3.2 HP/s), mostly slimes: 7 bodies and at least 7 hits per spawn.
   - At the bots' levels the floor covers 0.35–0.54 of the pressure. The best build covers 0.54 at 1:00 and 0.97 at 1:30: **both Ooze minutes are unwinnable at the measured levels**, not only 1:00.
   - With every gem collected (the XP bound) the best build would cover 2.0–2.9×, but a naive one only 0.60–0.75×. Gem pickup is the bigger lever for a naive player.
   - Levers as before: the slime's weight or HP at 1:00, the XP curve's first levels, a pickup radius or gem drift.
5. **The late game is at par, not trivial, for a naive build; level-ups still run out.**
   - From 3:30 the median naive build covers 1.08–1.13× of the pressure, and 0.92 at 5:00 (1.47–1.85× in a denser crowd). The first report's 1.06–1.38 overstated it, and the trivial flag is never raised.
   - A full build still costs 31 level-ups (level 32), reached by the bots' survivors by about 3:30. The XP bound reaches 86 by 5:00, so the last 90 s of level-ups are Repair only.
   - The gap is build quality, not pressure: the ceiling is 8.7–10× the pressure while a naive build is at par. T-016's bimodal outcome fits: a run that found the procs takes almost no damage until the golem.
   - Levers: a steeper XP curve after level ~20, later or heavier silver/gold tiers, Siege spawn rates. Raise the pressure only together with the proc levers, or the naive floor falls below par from 3:30.

Also notable:

- **Melee and area weapons.** The dual claw (46.7) and the ring L5 (45.3) are now level as the best crowd weapons without procs at Siege (they were 60.8 and 53), then the saw L5 (34.0).
- **The bite** is a single-target weapon (18 DPS) with the lowest crowd damage of any top-level weapon (0.5–4.6). Most of its damage is overkill on small bodies.

## Limits

As in the first report: a static crowd (no knockback, so the ring, claw and bite models are upper bounds), the near-the-dragon assumption, the thin level curve after 2:30, a ceiling "as if every card were offered", and no mage orbs, braziers, pickups or golem.

The steady-state allocation adds one more: it assumes every arriving body is killed, the regime where DPS / pressure ≥ 1. Below par, bodies pile up. The crowd then holds more high-HP bodies than their arrival rates suggest, so a ratio below 1 is a share killed, not a time to fall.
